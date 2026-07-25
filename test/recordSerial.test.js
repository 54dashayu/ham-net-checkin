import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assignMissingRecordSerials,
  getNextRecordSerial,
  hasRecordSerial,
  normalizeRecordSerial
} from '../src/services/recordSerial.js'

test('legacy records receive stable serials from the configured start', () => {
  const records = assignMissingRecordSerials([{ id: 'a' }, { id: 'b' }], 22)
  assert.deepEqual(records.map((record) => record.serial), [22, 23])
})

test('existing serial gaps are preserved', () => {
  const records = assignMissingRecordSerials(
    [{ id: 'a', serial: 23 }, { id: 'b', serial: 27 }],
    1
  )
  assert.deepEqual(records.map((record) => record.serial), [23, 27])
})

test('configured next serial can jump from 23 directly to 27', () => {
  const records = Array.from({ length: 23 }, (_, index) => ({ serial: index + 1 }))
  assert.equal(getNextRecordSerial(records, 27), 27)
  assert.equal(hasRecordSerial(records, 27), false)
})

test('deleting records does not renumber survivors or move the cursor back', () => {
  const records = [{ serial: 23 }, { serial: 27 }]
  const remaining = records.filter((record) => record.serial !== 23)
  assert.deepEqual(remaining.map((record) => record.serial), [27])
  assert.equal(getNextRecordSerial(remaining, 28), 28)
})

test('serial validation accepts only positive integers', () => {
  assert.equal(normalizeRecordSerial('27'), 27)
  assert.equal(normalizeRecordSerial('0'), null)
  assert.equal(normalizeRecordSerial('-1'), null)
  assert.equal(normalizeRecordSerial('27.5'), null)
})
