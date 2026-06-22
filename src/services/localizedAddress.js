const COUNTRY_MAP = {
  Argentina: '阿根廷',
  Australia: '澳大利亚',
  Austria: '奥地利',
  Belgium: '比利时',
  Brazil: '巴西',
  Canada: '加拿大',
  Chile: '智利',
  China: '中国',
  Colombia: '哥伦比亚',
  Denmark: '丹麦',
  Finland: '芬兰',
  France: '法国',
  Germany: '德国',
  Greece: '希腊',
  Hungary: '匈牙利',
  India: '印度',
  Indonesia: '印度尼西亚',
  Ireland: '爱尔兰',
  Italy: '意大利',
  Japan: '日本',
  Korea: '韩国',
  Malaysia: '马来西亚',
  Mexico: '墨西哥',
  Netherlands: '荷兰',
  Norway: '挪威',
  Philippines: '菲律宾',
  Poland: '波兰',
  Portugal: '葡萄牙',
  Russia: '俄罗斯',
  Singapore: '新加坡',
  'South Korea': '韩国',
  Spain: '西班牙',
  Sweden: '瑞典',
  Switzerland: '瑞士',
  Thailand: '泰国',
  Turkey: '土耳其',
  Ukraine: '乌克兰',
  'United Kingdom': '英国',
  'United States': '美国',
  USA: '美国'
}

const US_STATE_MAP = {
  AL: '阿拉巴马州',
  AK: '阿拉斯加州',
  AZ: '亚利桑那州',
  AR: '阿肯色州',
  CA: '加利福尼亚州',
  CO: '科罗拉多州',
  CT: '康涅狄格州',
  DE: '特拉华州',
  FL: '佛罗里达州',
  GA: '佐治亚州',
  HI: '夏威夷州',
  ID: '爱达荷州',
  IL: '伊利诺伊州',
  IN: '印第安纳州',
  IA: '艾奥瓦州',
  KS: '堪萨斯州',
  KY: '肯塔基州',
  LA: '路易斯安那州',
  ME: '缅因州',
  MD: '马里兰州',
  MA: '马萨诸塞州',
  MI: '密歇根州',
  MN: '明尼苏达州',
  MS: '密西西比州',
  MO: '密苏里州',
  MT: '蒙大拿州',
  NE: '内布拉斯加州',
  NV: '内华达州',
  NH: '新罕布什尔州',
  NJ: '新泽西州',
  NM: '新墨西哥州',
  NY: '纽约州',
  NC: '北卡罗来纳州',
  ND: '北达科他州',
  OH: '俄亥俄州',
  OK: '俄克拉荷马州',
  OR: '俄勒冈州',
  PA: '宾夕法尼亚州',
  RI: '罗得岛州',
  SC: '南卡罗来纳州',
  SD: '南达科他州',
  TN: '田纳西州',
  TX: '得克萨斯州',
  UT: '犹他州',
  VT: '佛蒙特州',
  VA: '弗吉尼亚州',
  WA: '华盛顿州',
  WV: '西弗吉尼亚州',
  WI: '威斯康星州',
  WY: '怀俄明州',
  DC: '华盛顿特区'
}

const CITY_MAP = {
  BOGOTA: '波哥大',
  Bangkok: '曼谷',
  Berlin: '柏林',
  London: '伦敦',
  Madrid: '马德里',
  Moscow: '莫斯科',
  Paris: '巴黎',
  Rome: '罗马',
  Seoul: '首尔',
  Singapore: '新加坡',
  Sydney: '悉尼',
  Tokyo: '东京',
  Jakarta: '雅加达',
  Ozark: '奥扎克'
}

const CHINA_PROVINCE_MAP = {
  Anhui: '安徽省',
  Beijing: '北京市',
  Chongqing: '重庆市',
  Fujian: '福建省',
  Gansu: '甘肃省',
  Guangdong: '广东省',
  Guangxi: '广西壮族自治区',
  Guizhou: '贵州省',
  Hainan: '海南省',
  Hebei: '河北省',
  Heilongjiang: '黑龙江省',
  Henan: '河南省',
  Hubei: '湖北省',
  Hunan: '湖南省',
  Jiangsu: '江苏省',
  Jiangxi: '江西省',
  Jilin: '吉林省',
  Liaoning: '辽宁省',
  Neimenggu: '内蒙古自治区',
  'Nei Mongol': '内蒙古自治区',
  Ningxia: '宁夏回族自治区',
  Qinghai: '青海省',
  Shaanxi: '陕西省',
  Shandong: '山东省',
  Shanghai: '上海市',
  Shanxi: '山西省',
  Sichuan: '四川省',
  Tianjin: '天津市',
  Xinjiang: '新疆维吾尔自治区',
  Xizang: '西藏自治区',
  Tibet: '西藏自治区',
  Yunnan: '云南省',
  Zhejiang: '浙江省'
}

const CHINA_CITY_MAP = {
  Anqing: '安庆市',
  Baoding: '保定市',
  Baoji: '宝鸡市',
  Baotou: '包头市',
  Beijing: '北京市',
  Changchun: '长春市',
  Changsha: '长沙市',
  Changzhou: '常州市',
  Chengdu: '成都市',
  Chongqing: '重庆市',
  Dalian: '大连市',
  Dongguan: '东莞市',
  Foshan: '佛山市',
  Fuzhou: '福州市',
  Guangzhou: '广州市',
  Guiyang: '贵阳市',
  Haerbin: '哈尔滨市',
  Harbin: '哈尔滨市',
  Haikou: '海口市',
  Hangzhou: '杭州市',
  Hefei: '合肥市',
  Hohhot: '呼和浩特市',
  Huizhou: '惠州市',
  Jinan: '济南市',
  Kunming: '昆明市',
  Lanzhou: '兰州市',
  Lhasa: '拉萨市',
  Luoyang: '洛阳市',
  Nanchang: '南昌市',
  Nanjing: '南京市',
  Nanning: '南宁市',
  Nantong: '南通市',
  Ningbo: '宁波市',
  Qingdao: '青岛市',
  Shanghai: '上海市',
  Shenyang: '沈阳市',
  Shenzhen: '深圳市',
  Shijiazhuang: '石家庄市',
  Suzhou: '苏州市',
  Taiyuan: '太原市',
  Taizhou: '泰州市',
  Tianjin: '天津市',
  Urumqi: '乌鲁木齐市',
  Wuxi: '无锡市',
  Xiamen: '厦门市',
  Xian: '西安市',
  "Xi'an": '西安市',
  Xuzhou: '徐州市',
  Yangzhou: '扬州市',
  Yinchuan: '银川市',
  Zhengzhou: '郑州市',
  Zhongshan: '中山市',
  Zhuhai: '珠海市'
}

const normalizePart = (value) => String(value || '').trim().replace(/\s+/g, ' ')

const titleKey = (value) =>
  normalizePart(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase())

const localizeCity = (value) => CITY_MAP[value] || CITY_MAP[titleKey(value)] || value

const isGridLike = (value) => /^[A-R]{2}\d{2}/i.test(value)

const isChineseCallsign = (callsign) => /^B[A-Z0-9]/i.test(String(callsign || '').trim())

const stripChinaTokens = (parts) =>
  parts.filter((part) => !/^(china|cn|prc|p\.r\.china|people'?s republic of china)$/i.test(part))

const localizeChinaQth = (value) => {
  const text = normalizePart(value).replace(/,/g, ' ')
  if (!text) return ''
  const parts = stripChinaTokens(text.split(/\s+/).map(normalizePart).filter(Boolean))
  const localized = parts
    .map((part) => {
      const key = titleKey(part)
      return CHINA_PROVINCE_MAP[key] || CHINA_CITY_MAP[key] || part
    })
    .filter(Boolean)

  const province = localized.find((part) => /省|市|自治区$/.test(part) && Object.values(CHINA_PROVINCE_MAP).includes(part))
  const city = localized.find((part) => /市$/.test(part) && part !== province)
  if (province && city) return `${province} ${city}`
  if (localized.length) return localized.join(' ')
  return text
}

export function localizeBmQth(value, callsign = '') {
  const text = normalizePart(value)
  if (!text) return ''
  if (isChineseCallsign(callsign) || /\b(china|cn|prc)\b/i.test(text)) {
    return localizeChinaQth(text)
  }
  const commaParts = text.split(',').map(normalizePart).filter(Boolean)
  if (commaParts.length >= 2) {
    const city = localizeCity(commaParts[0])
    if (isGridLike(commaParts[1])) {
      const country = commaParts[0].toUpperCase() === 'BOGOTA' ? '哥伦比亚' : ''
      return [country, city].filter(Boolean).join(' ')
    }
    if (COUNTRY_MAP[commaParts[1]] && !commaParts[2]) {
      return [COUNTRY_MAP[commaParts[1]], city].filter(Boolean).join(' ')
    }
    const state = US_STATE_MAP[commaParts[1]] || commaParts[1]
    const country = COUNTRY_MAP[commaParts[2]] || commaParts[2] || ''
    return [country, state, city].filter(Boolean).join(' ')
  }

  const spaceParts = text.split(' ').filter(Boolean)
  const last = spaceParts.at(-1)
  if (US_STATE_MAP[last]) {
    return ['美国', US_STATE_MAP[last], localizeCity(spaceParts.slice(0, -1).join(' '))]
      .filter(Boolean)
      .join(' ')
  }
  if (COUNTRY_MAP[last]) {
    return [COUNTRY_MAP[last], localizeCity(spaceParts.slice(0, -1).join(' '))]
      .filter(Boolean)
      .join(' ')
  }
  return CITY_MAP[text] || text
}
