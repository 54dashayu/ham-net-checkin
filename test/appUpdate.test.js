import test from 'node:test'
import assert from 'node:assert/strict'
import { isNewerVersion } from '../src/services/appUpdate.js'
test('compares update versions numerically and rejects malformed versions', () => {
  assert.equal(isNewerVersion('1.4.10', '1.4.1'), true)
  assert.equal(isNewerVersion('1.4.1', '1.4.1'), false)
  assert.equal(isNewerVersion('1.3.9', '1.4.1'), false)
  assert.equal(isNewerVersion('invalid', '1.4.1'), false)
})
