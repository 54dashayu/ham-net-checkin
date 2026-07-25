const ALL_EXCEL_COLUMNS = [
  { key: 'sn', header: '序号', width: 8 },
  { key: 'callsign', header: '呼号', width: 15 },
  { key: 'qth', header: 'QTH', width: 25 },
  { key: 'device', header: '设备', width: 24 },
  { key: 'antenna', header: '天线', width: 16, option: 'antenna' },
  { key: 'power', header: '功率', width: 8, option: 'power' },
  { key: 'mode', header: '方式', width: 11, option: 'mode' },
  { key: 'time', header: '通联时间 (BJT)', width: 18 }
]

export const getExcelColumns = (options = {}) => {
  const included = {
    antenna: options.antenna !== false,
    power: options.power !== false,
    mode: options.mode !== false
  }
  return ALL_EXCEL_COLUMNS.filter((column) => !column.option || included[column.option])
}
