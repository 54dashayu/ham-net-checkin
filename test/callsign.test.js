import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalizeMonitoredCallsign, inferMonitoredMode } from '../src/services/callsign.js'

test('device markers determine mode before callsign cleanup', () => {
  assert.equal(inferMonitoredMode('M.BH1JSS'), 'M5（ESP32）')
  assert.equal(inferMonitoredMode('p.bg9huf'), 'Passport')
  assert.equal(inferMonitoredMode('BG9JFQ.R'), 'RedDV')
  assert.equal(inferMonitoredMode('Ｐ．ＢＩ３ＳＣＯ'), 'Passport')
  assert.equal(inferMonitoredMode('BH1JSS'), '')
})

test('extracts a normal callsign from device prefixes and suffixes', () => {
  assert.equal(canonicalizeMonitoredCallsign('AI-BH1JSS'), 'BH1JSS')
  assert.equal(canonicalizeMonitoredCallsign('P.BG9HUF'), 'BG9HUF')
  assert.equal(canonicalizeMonitoredCallsign('P.BG4LDO'), 'BG4LDO')
  assert.equal(canonicalizeMonitoredCallsign('BG9JFQ.R'), 'BG9JFQ')
})

test('keeps ordinary callsigns and handles full-width device punctuation', () => {
  assert.equal(canonicalizeMonitoredCallsign('BG9JXB'), 'BG9JXB')
  assert.equal(canonicalizeMonitoredCallsign('Ｐ．ＢＩ３ＳＣＯ'), 'BI3SCO')
  assert.equal(canonicalizeMonitoredCallsign('W1AW/P'), 'W1AW')
})

test('rejects monitor labels that do not contain a callsign', () => {
  assert.equal(canonicalizeMonitoredCallsign('AI CONTROL'), '')
  assert.equal(canonicalizeMonitoredCallsign('P.'), '')
})

