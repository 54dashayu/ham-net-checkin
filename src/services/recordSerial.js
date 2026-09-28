export const normalizeRecordSerial = (value) => {
  const serial = Number(value)
  return Number.isInteger(serial) && serial > 0 ? serial : null
}

export const assignMissingRecordSerials = (records, serialStart = 1) => {
  const used = new Set(
    records.map((record) => normalizeRecordSerial(record.serial)).filter(Boolean)
  )
  let candidate = normalizeRecordSerial(serialStart) || 1

  return records.map((record) => {
    const existing = normalizeRecordSerial(record.serial)
    if (existing) return existing === record.serial ? record : { ...record, serial: existing }

    while (used.has(candidate)) candidate += 1
    const normalized = { ...record, serial: candidate }
    used.add(candidate)
    candidate += 1
    return normalized
  })
}

export const getNextRecordSerial = (records, configuredNextSerial) => {
  const configured = normalizeRecordSerial(configuredNextSerial)
  if (configured) return configured

  const highest = records.reduce(
    (max, record) => Math.max(max, normalizeRecordSerial(record.serial) || 0),
    0
  )
  return highest + 1
}

export const hasRecordSerial = (records, serial) => {
  const normalized = normalizeRecordSerial(serial)
  return Boolean(
    normalized &&
    records.some((record) => normalizeRecordSerial(record.serial) === normalized)
  )
}

export const reorderRecordSequence = (displayedRecords, sourceId, targetId, sequenceEnd) => {
  const reordered = [...displayedRecords]
  const sourceIndex = reordered.findIndex((record) => record.id === sourceId)
  const targetIndex = reordered.findIndex((record) => record.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return reordered

  const [movedRecord] = reordered.splice(sourceIndex, 1)
  reordered.splice(targetIndex, 0, movedRecord)
  const lastSerial = Math.max(normalizeRecordSerial(sequenceEnd) || reordered.length, reordered.length)
  return reordered.map((record, index) => ({ ...record, serial: lastSerial - index }))
}
