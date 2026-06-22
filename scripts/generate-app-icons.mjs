import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const sizes = [16, 24, 32, 48, 64, 128, 256]

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

function strokeCircle(data, size, cx, cy, radius, thickness, rgba, mask = () => true) {
  for (let py = Math.floor(cy - radius - thickness); py <= Math.ceil(cy + radius + thickness); py += 1) {
    for (let px = Math.floor(cx - radius - thickness); px <= Math.ceil(cx + radius + thickness); px += 1) {
      if (!mask(px + 0.5, py + 0.5)) continue
      const distance = Math.abs(Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - radius) - thickness / 2
      blendPixel(data, size, px, py, rgba, Math.max(0, Math.min(1, 0.5 - distance)))
    }
  }
}

function fillCircle(data, size, cx, cy, radius, rgba) {
  for (let py = Math.floor(cy - radius - 1); py <= Math.ceil(cy + radius + 1); py += 1) {
    for (let px = Math.floor(cx - radius - 1); px <= Math.ceil(cx + radius + 1); px += 1) {
      const distance = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - radius
      blendPixel(data, size, px, py, rgba, Math.max(0, Math.min(1, 0.5 - distance)))
    }
  }
}

function generateIcon(size) {
  const data = new Uint8ClampedArray(size * size * 4)
  const scale = size / 256
  const background = color('#e8fff1')
  const border = color('#91d7a8')
  const dark = color('#07883a')
  const mid = color('#19a653')
  const light = color('#ffffff')

  fillRoundedRect(data, size, 10 * scale, 10 * scale, 236 * scale, 236 * scale, 40 * scale, background)
  fillRoundedRect(data, size, 10 * scale, 10 * scale, 236 * scale, 236 * scale, 40 * scale, border)
  fillRoundedRect(data, size, 17 * scale, 17 * scale, 222 * scale, 222 * scale, 34 * scale, background)

  fillRoundedRect(data, size, 112 * scale, 86 * scale, 32 * scale, 92 * scale, 16 * scale, dark)
  fillCircle(data, size, 128 * scale, 76 * scale, 18 * scale, dark)
  fillCircle(data, size, 128 * scale, 76 * scale, 7 * scale, light)

  const rightMask = (x) => x >= 128 * scale
  const leftMask = (x) => x <= 128 * scale
  ;[44, 70].forEach((radius, index) => {
    strokeCircle(data, size, 128 * scale, 86 * scale, radius * scale, 10 * scale, index ? mid : dark, rightMask)
    strokeCircle(data, size, 128 * scale, 86 * scale, radius * scale, 10 * scale, index ? mid : dark, leftMask)
  })

  fillRoundedRect(data, size, 76 * scale, 176 * scale, 104 * scale, 22 * scale, 11 * scale, dark)
  fillRoundedRect(data, size, 92 * scale, 202 * scale, 72 * scale, 18 * scale, 9 * scale, mid)
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
