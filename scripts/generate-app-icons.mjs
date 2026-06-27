import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c >>> 0
}

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function writePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (width * 4 + 1)
    raw[rawOffset] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, rawOffset + 1)
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function color(hex, alpha = 255) {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    alpha
  ]
}

function blendPixel(data, width, x, y, rgba, amount = 1) {
  if (x < 0 || y < 0 || x >= width || y >= width || amount <= 0) return
  const index = (y * width + x) * 4
  const sourceAlpha = (rgba[3] / 255) * Math.min(1, amount)
  const targetAlpha = data[index + 3] / 255
  const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha)
  if (outAlpha <= 0) return
  for (let i = 0; i < 3; i += 1) {
    data[index + i] =
      (rgba[i] * sourceAlpha + data[index + i] * targetAlpha * (1 - sourceAlpha)) / outAlpha
  }
  data[index + 3] = outAlpha * 255
}

function signedRoundedRectDistance(px, py, x, y, w, h, r) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r)
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function fillRoundedRect(data, size, x, y, w, h, r, rgba) {
  for (let py = Math.floor(y - 2); py <= Math.ceil(y + h + 2); py += 1) {
    for (let px = Math.floor(x - 2); px <= Math.ceil(x + w + 2); px += 1) {
      const distance = signedRoundedRectDistance(px + 0.5, py + 0.5, x, y, w, h, r)
      blendPixel(data, size, px, py, rgba, Math.max(0, Math.min(1, 0.5 - distance)))
    }
  }
}

function insidePolygon(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0]
    const yi = points[i][1]
    const xj = points[j][0]
    const yj = points[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function fillPolygon(data, size, points, rgba) {
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  for (let py = Math.floor(Math.min(...ys) - 2); py <= Math.ceil(Math.max(...ys) + 2); py += 1) {
    for (let px = Math.floor(Math.min(...xs) - 2); px <= Math.ceil(Math.max(...xs) + 2); px += 1) {
      const sampleX = px + 0.5
      const sampleY = py + 0.5
      let edgeDistance = Infinity
      for (let index = 0; index < points.length; index += 1) {
        const next = (index + 1) % points.length
        edgeDistance = Math.min(
          edgeDistance,
          distanceToSegment(
            sampleX,
            sampleY,
            points[index][0],
            points[index][1],
            points[next][0],
            points[next][1]
          )
        )
      }
      const inside = insidePolygon(sampleX, sampleY, points)
      const amount = inside ? 1 : Math.max(0, 0.5 - edgeDistance)
      blendPixel(data, size, px, py, rgba, amount)
    }
  }
}

function strokeArc(data, size, cx, cy, radius, start, end, thickness, rgba) {
  for (let py = Math.floor(cy - radius - thickness); py <= Math.ceil(cy + radius + thickness); py += 1) {
    for (let px = Math.floor(cx - radius - thickness); px <= Math.ceil(cx + radius + thickness); px += 1) {
      const angle = Math.atan2(py + 0.5 - cy, px + 0.5 - cx)
      if (angle < start || angle > end) continue
      const distance = Math.abs(Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - radius) - thickness / 2
      blendPixel(data, size, px, py, rgba, Math.max(0, Math.min(1, 0.5 - distance)))
    }
  }
}

function scalePoints(points, scale) {
  return points.map(([x, y]) => [x * scale, y * scale])
}

function generateIcon(size) {
  const data = new Uint8ClampedArray(size * size * 4)
  const scale = size / 512
  const background = color('#eafff1')
  const border = color('#8bd8a6')
  const dark = color('#07883a')
  const mid = color('#2fae62', 175)
  const bolt = color('#7f36ff')
  const highlight = color('#42c6ff', 120)
  const white = color('#ffffff', 120)
  const shadow = color('#123820', 70)

  fillRoundedRect(data, size, 24 * scale, 24 * scale, 464 * scale, 464 * scale, 92 * scale, border)
  fillRoundedRect(data, size, 40 * scale, 40 * scale, 432 * scale, 432 * scale, 78 * scale, background)

  ;[72, 118, 164].forEach((radius, index) => {
    const thickness = (index === 0 ? 18 : 14) * scale
    const arcColor = index === 2 ? color('#07883a', 110) : mid
    strokeArc(data, size, 258 * scale, 262 * scale, radius * scale, -2.55, -0.62, thickness, arcColor)
    strokeArc(data, size, 258 * scale, 262 * scale, radius * scale, 0.62, 2.55, thickness, arcColor)
  })

  const boltPoints = scalePoints(
    [
      [282, 52],
      [128, 52],
      [70, 204],
      [194, 204],
      [150, 458],
      [386, 178],
      [270, 178],
      [342, 52]
    ],
    scale
  )
  const shadowPoints = boltPoints.map(([x, y]) => [x + 10 * scale, y + 12 * scale])
  fillPolygon(data, size, shadowPoints, shadow)
  fillPolygon(data, size, boltPoints, bolt)

  fillPolygon(
    data,
    size,
    scalePoints(
      [
        [292, 68],
        [246, 180],
        [342, 180],
        [216, 332],
        [248, 214],
        [132, 214],
        [186, 68]
      ],
      scale
    ),
    highlight
  )
  fillPolygon(
    data,
    size,
    scalePoints(
      [
        [166, 76],
        [120, 184],
        [156, 184],
        [202, 76]
      ],
      scale
    ),
    white
  )

  strokeArc(data, size, 258 * scale, 262 * scale, 196 * scale, -2.5, 2.5, 10 * scale, color('#07883a', 55))
  return writePng(size, size, data)
}

function writeIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + pngs.length * 16
  for (const item of pngs) {
    const entry = Buffer.alloc(16)
    entry[0] = item.size >= 256 ? 0 : item.size
    entry[1] = item.size >= 256 ? 0 : item.size
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(item.png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += item.png.length
  }
  return Buffer.concat([header, ...entries, ...pngs.map((item) => item.png)])
}

await mkdir(path.join(rootDir, 'build'), { recursive: true })
await mkdir(path.join(rootDir, 'public'), { recursive: true })

const pngs = sizes.map((size) => ({ size, png: generateIcon(size) }))
await writeFile(path.join(rootDir, 'build', 'icon.ico'), writeIco(pngs))
await writeFile(path.join(rootDir, 'build', 'icon.png'), pngs.at(-1).png)
await writeFile(path.join(rootDir, 'public', 'favicon.png'), pngs.find((item) => item.size === 64).png)
