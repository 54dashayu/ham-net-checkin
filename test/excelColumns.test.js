import test from 'node:test'
import assert from 'node:assert/strict'

import { getExcelColumns } from '../src/services/excelColumns.js'

test('automatic Excel configuration keeps every existing column', () => {
  assert.deepEqual(
    getExcelColumns().map((column) => column.header),
    ['序号', '呼号', 'QTH', '设备', '天线', '功率', '方式', '通联时间 (BJT)']
  )
})

test('manual Excel configuration removes only unchecked optional columns', () => {
  assert.deepEqual(
    getExcelColumns({ antenna: false, power: true, mode: false }).map((column) => column.header),
    ['序号', '呼号', 'QTH', '设备', '功率', '通联时间 (BJT)']
  )
})
