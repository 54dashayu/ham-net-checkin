<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  BookOpen,
  Download,
  FileSpreadsheet,
  FilePlus2,
  Info,
  Languages,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  Wifi
} from '@lucide/vue'
import ExcelJS from 'exceljs'
import initSqlJs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import {
  FmoClient,
  FmoEventsClient,
  getAddressWarning,
  getProtocolFromAddress,
  isValidHostAddress,
  normalizeHost
} from './services/fmoClient'
import { gridToAddressText, isMaidenheadGrid } from './services/gridAddress'
import { fetchHamboxLastHeard } from './services/hamboxClient'
import { localizeBmQth } from './services/localizedAddress'
import { fetchMmdvmLastHeard } from './services/mmdvmClient'

const STORAGE_KEY = 'ham-net-checkin-records-v1'
const PROFILE_KEY = 'ham-net-checkin-profiles-v1'
const PROFILE_DIRTY_KEY = 'ham-net-checkin-profile-dirty-v1'
const PROFILE_SYNC_CONFIG_KEY = 'ham-net-checkin-profile-sync-v1'
const FMO_CONFIG_KEY = 'ham-net-checkin-fmo-config-v1'
const ACTIVITY_CONFIG_KEY = 'ham-net-checkin-activity-config-v1'
const LANGUAGE_KEY = 'ham-net-checkin-language-v1'
const CONTROL_TX_STALE_MS = {
  bm: 1200,
  hambox: 1200,
  mmdvm: 1500,
  default: 1200
}
const PUBLIC_WEB_LIMITS = {
  durationMs: 75 * 60 * 1000,
  resetWindowMs: 24 * 60 * 60 * 1000,
  maxRecords: 60,
  maxDownloads: 1
}
const PUBLIC_WEB_SESSION_KEY = 'ham-net-checkin-public-session-v1'
const initialActivityId = new URLSearchParams(window.location.search).get('activity') || ''
const currentActivityId = ref(initialActivityId)
const scopedKey = (key) => (currentActivityId.value ? `${key}:${currentActivityId.value}` : key)
const serverBasePath = window.location.pathname.startsWith('/checkin') ? '/checkin' : ''
const serverApiPath = (path) => `${serverBasePath}${path}`
const getDefaultSharedProfileApiBase = () => {
  const hostname = window.location.hostname
  if ((hostname === '127.0.0.1' || hostname === 'localhost') && window.location.port === '5173') {
    return 'http://127.0.0.1:37173'
  }
  return 'https://fmo.bh1jss.net/checkin'
}
const sharedProfileApiBase = import.meta.env.VITE_SHARED_PROFILE_API_BASE || getDefaultSharedProfileApiBase()
const sharedProfileApiPath = (path) =>
  isPublicWebVersion.value ? serverApiPath(path) : `${sharedProfileApiBase}${path}`
const authorQrCodeUrl = `${serverBasePath}/author-wechat-qrcode.jpg`
const appVersion = 'V0.9.01'

const i18nMessages = {
  zh: {
    appTitle: '台网点名主控台',
    localVersionContact: '本地版请联系作者',
    recorded: '已记录',
    nextRecord: '下条',
    setRecordedTitle: '点击设置已记录数量，下一条序号自动 +1',
    activityName: '台网活动名称',
    controlCallsign: '主控呼号',
    controlQth: '主控 QTH',
    controlDevice: '主控设备',
    controlAntenna: '主控天线',
    controlPower: '主控功率',
    openManual: '打开使用说明书',
    switchLanguage: '切换语言',
    saveCurrent: '保存当前点名表格',
    saving: '保存中',
    save: '保存',
    autoSave: '自动保存',
    newActivity: '新建',
    editRecord: '编辑记录',
    cancelEdit: '取消编辑',
    prefix: '前缀',
    number: '数字',
    callsignRequired: '呼号 *',
    clearPrefix: '清空前缀',
    clearCallsign: '清空呼号',
    sync: '同步',
    syncing: '同步中',
    register: '注册',
    waitingConfirm: '等待确认区',
    deviceName: '使用设备名称',
    mode: '模式',
    power: '功率',
    signal: '信号报告',
    antenna: '天线',
    remarks: '备注',
    clearField: '清空',
    saveChanges: '保存修改',
    addRecord: '添加记录',
    searchRecords: '搜索已记录呼号、QTH、设备、备注',
    clearSearch: '清空搜索',
    exportExcel: '导出 Excel',
    selectAll: '全选',
    cancelSelect: '取消',
    deleteSelected: '删除选中',
    serial: '序号',
    callsign: '呼号',
    time: '时间',
    device: '设备',
    selected: '选',
    noRecords: '暂无记录',
    monitorSource: '监听源',
    protocol: '协议',
    auto: '自动',
    refresh: '刷新',
    noRecentQso: '暂无最近通联',
    controlTx: '主控发射',
    transmitting: '正在发射！',
    waitingControl: '等待监听到主控呼号',
    setRecordedCount: '设置已记录数量',
    recordedCount: '已记录数量',
    close: '关闭',
    cancel: '取消',
    saveSetting: '保存设置',
    serialHint: '保存后，下一条记录序号自动从已记录数量 +1 开始。',
    sharedProfileRegister: '共享呼号资料库注册',
    registrationCallsign: '注册呼号',
    cracCertificate: 'CRAC 操作证书号',
    registrationQth: '常用 QTH',
    registrationRepeater: '常用服务器',
    submitReview: '提交审核',
    wechatContact: '微信联系',
    importProfileKey: '导入验证密钥',
    exportProfileKey: '导出验证密钥',
    enableSync: '开启同步',
    registerHint: '提交后需等待作者在后台审核，通过后获得验证密钥文件。导入验证密钥后，即可开启共享呼号资料库同步。',
    aboutTitle: '关于台网点名主控台',
    aboutText1: '台网点名主控台用于业余无线电台网活动记录，支持从 FMO、MMDVM、HAMBOX、BM DMR 等监听源选取友台，快速登记呼号、QTH、设备、功率、模式和信号报告，并导出 Excel 台网日志。',
    aboutText2: '本软件由 BH1JSS 机婶婶贡献。网络版仅提供 BM DMR 模式测试，完整监听和本地设备接入建议使用本地版。',
    githubProject: 'GitHub 项目',
    contactAuthor: '联系作者',
    footerCredit: '台网点名主控台 由 BH1JSS 机婶婶 贡献',
    profileEnabled: '已启用呼号数据库',
    profileDisabled: '启用呼号数据库',
    languageNotice: '已切换到中文界面。',
    qthPlaceholder: '北京海淀 / OM89...',
    devicePlaceholder: '如意通 6900DMR',
    antennaPlaceholder: '车载 / GP / 八木',
    remarksPlaceholder: '热点 / 直频 / 首次参加',
    controlQthPlaceholder: '北京 海淀',
    controlDevicePlaceholder: 'MMDVM / 车台 / 手台',
    controlAntennaPlaceholder: 'GP / 车载 / 八木',
    controlPowerPlaceholder: 'L / 25W',
    repeaterPlaceholder: 'DMR TG组/反射器 / 本地中继 / FMO服务器',
    sourceFieldLabels: {
      fmo: 'FMO 地址',
      mmdvm: 'MMDVM 地址',
      hambox: 'HAMBOX 地址',
      bm: 'BM 通话组',
      ysf: 'YSF 反射器',
      fcs: 'FCS 反射器',
      dstar: 'D-Star / XLX 反射器',
      p25: 'P25 反射器',
      nxdn: 'NXDN 反射器'
    },
    sourcePending: '监听功能待开放'
  },
  en: {
    appTitle: 'Net Check-in Console',
    localVersionContact: 'Contact author for desktop app',
    recorded: 'Logged',
    nextRecord: 'Next',
    setRecordedTitle: 'Set logged count; next serial number adds 1',
    activityName: 'Net Activity',
    controlCallsign: 'OP Call',
    controlQth: 'OP QTH',
    controlDevice: 'OP Rig',
    controlAntenna: 'OP Ant.',
    controlPower: 'OP Power',
    openManual: 'Open user manual',
    switchLanguage: 'Switch language',
    saveCurrent: 'Save current log',
    saving: 'Saving',
    save: 'Save',
    autoSave: 'Auto Save',
    newActivity: 'New',
    editRecord: 'Edit Record',
    cancelEdit: 'Cancel edit',
    prefix: 'Prefix',
    number: 'Number',
    callsignRequired: 'Callsign *',
    clearPrefix: 'Clear prefix',
    clearCallsign: 'Clear callsign',
    sync: 'Sync',
    syncing: 'Syncing',
    register: 'Register',
    waitingConfirm: 'Waiting Queue',
    deviceName: 'Radio / Device',
    mode: 'Mode',
    power: 'Power',
    signal: 'Report',
    antenna: 'Antenna',
    remarks: 'Notes',
    clearField: 'Clear',
    saveChanges: 'Save Changes',
    addRecord: 'Add Record',
    searchRecords: 'Search callsign, QTH, device, notes',
    clearSearch: 'Clear search',
    exportExcel: 'Export Excel',
    selectAll: 'Select All',
    cancelSelect: 'Cancel',
    deleteSelected: 'Delete selected',
    serial: 'No.',
    callsign: 'Callsign',
    time: 'Time',
    device: 'Device',
    selected: 'Sel.',
    noRecords: 'No records',
    monitorSource: 'Source',
    protocol: 'Protocol',
    auto: 'Auto',
    refresh: 'Refresh',
    noRecentQso: 'No recent QSOs',
    controlTx: 'OP TX',
    transmitting: 'Transmitting!',
    waitingControl: 'Waiting for OP callsign',
    setRecordedCount: 'Set Logged Count',
    recordedCount: 'Logged Count',
    close: 'Close',
    cancel: 'Cancel',
    saveSetting: 'Save Setting',
    serialHint: 'After saving, the next serial number starts from logged count + 1.',
    sharedProfileRegister: 'Shared Callsign DB Registration',
    registrationCallsign: 'Registration Callsign',
    cracCertificate: 'CRAC Certificate No.',
    registrationQth: 'Common QTH',
    registrationRepeater: 'Common Server',
    submitReview: 'Submit',
    wechatContact: 'WeChat',
    importProfileKey: 'Import Key',
    exportProfileKey: 'Export Key',
    enableSync: 'Enable Sync',
    registerHint: 'Submit for author review. After approval, import the verification key to enable shared callsign database sync.',
    aboutTitle: 'About Net Check-in Console',
    aboutText1: 'HAM Net Check-in Console helps OP stations record amateur radio check-ins. It can pick candidates from FMO, MMDVM, HAMBOX and BM DMR, then export an Excel net log.',
    aboutText2: 'Contributed by BH1JSS. The web version is mainly for BM DMR testing. Use the desktop app for full local device monitoring.',
    githubProject: 'GitHub',
    contactAuthor: 'Contact',
    footerCredit: 'HAM Net Check-in Console by BH1JSS',
    profileEnabled: 'Callsign DB enabled',
    profileDisabled: 'Enable callsign DB',
    languageNotice: 'Switched to English interface.',
    qthPlaceholder: 'Beijing / OM89...',
    devicePlaceholder: 'Radio model',
    antennaPlaceholder: 'Mobile / GP / Yagi',
    remarksPlaceholder: 'Hotspot / Simplex / First check-in',
    controlQthPlaceholder: 'Beijing',
    controlDevicePlaceholder: 'MMDVM / Mobile / HT',
    controlAntennaPlaceholder: 'GP / Mobile / Yagi',
    controlPowerPlaceholder: 'L / 25W',
    repeaterPlaceholder: 'DMR TG / reflector / repeater / FMO server',
    sourceFieldLabels: {
      fmo: 'FMO Host',
      mmdvm: 'MMDVM Host',
      hambox: 'HAMBOX Host',
      bm: 'BM Talkgroup',
      ysf: 'YSF Reflector',
      fcs: 'FCS Reflector',
      dstar: 'D-Star / XLX Reflector',
      p25: 'P25 Reflector',
      nxdn: 'NXDN Reflector'
    },
    sourcePending: 'Monitoring not available yet'
  }
}

const language = ref(localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'zh')
const t = (key) => i18nMessages[language.value]?.[key] ?? i18nMessages.zh[key] ?? key
const userManualUrl = computed(() =>
  `${serverBasePath}/${language.value === 'en' ? 'ham-checkin-v0.9.01-user-manual-en.html' : 'ham-checkin-v0.9.01-user-manual.html'}`
)
const sourceFieldLabel = (source) =>
  i18nMessages[language.value]?.sourceFieldLabels?.[source.value] || source.fieldLabel
const sourcePlaceholder = (source) =>
  source.addressKind === 'network' ? t('sourcePending') : source.placeholder

const formatLocalDate = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatSystemClock = (date = new Date()) => {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${formatLocalDate(date)} ${hours}:${minutes}:${seconds}`
}

const getDefaultActivityName = () => `台网活动 ${formatLocalDate()}`

const nowForInput = () => {
  const date = new Date()
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const emptyForm = () => ({
  prefix: '',
  callsign: '',
  time: nowForInput(),
  qth: '',
  device: '',
  antenna: '',
  power: '',
  mode: 'FM',
  signal: '59',
  remarks: ''
})

const records = ref([])
const profiles = ref([])
const dirtyProfileCallsigns = ref([])
const form = reactive(emptyForm())
const editingId = ref(null)
const searchText = ref('')
const selectedRecordIds = ref([])
const recordEditorOpen = ref(false)
const editingRecordId = ref('')
const editDraft = reactive(emptyForm())
const autoSaveEnabled = ref(false)
const excelFileHandle = ref(null)
const excelSaving = ref(false)
const autoSaveTimer = ref(null)
const serverSaveAvailable = ref(false)
const authorQrOpen = ref(false)
const aboutOpen = ref(false)
const profileRegistrationOpen = ref(false)
const systemClock = ref(new Date())
const systemClockTimer = ref(null)
const serialEditorOpen = ref(false)
const serialEditorDraft = ref('')
const publicSession = reactive({
  startedAt: Date.now(),
  activityId: initialActivityId || 'default',
  downloads: 0
})
const profileSyncConfig = reactive({
  enabled: false,
  registrationCallsign: '',
  cracCertificate: '',
  registrationQth: '',
  registrationRepeater: '',
  verificationCode: '',
  profileKey: '',
  lastPulledAt: '',
  lastPushedAt: ''
})
const profileSyncStatus = ref('')
const profileSyncBusy = ref(false)
const profileSyncTimer = ref(null)
const profileSyncDebounceTimer = ref(null)
const publicSessionTimer = ref(null)
const authorQrTitle = ref('联系作者')
const authorQrHint = ref('请使用微信扫码')
const fileInput = ref(null)
const dbFileInput = ref(null)
const profileKeyFileInput = ref(null)
const notice = ref('')
const noticePosition = ref('bottom')
const fmoCandidates = ref([])
const fmoLogCandidates = ref([])
const fmoSpeakingHistory = ref([])
const fmoStatus = ref('未连接')
const currentRelayName = ref('当前中继/服务器')
const controlTxInfo = ref(null)
const controlTxClearTimer = ref(null)
const lastTopControlCandidateKey = ref('')
const fmoRefreshing = ref(false)
const fmoClient = ref(null)
const fmoEventsClient = ref(null)
const fmoApiWarningShownAt = ref(0)
const bmSocket = ref(null)
const fmoRefreshTimer = ref(null)
const monitorRestartTimer = ref(null)
const monitorRequestId = ref(0)
const currentLiveCallsign = ref('')
const previousMonitorSource = ref('fmo')
const bmDeviceCache = new Map()
const fmoConfig = reactive({
  source: 'fmo',
  host: '',
  mmdvmHost: '192.168.3.65',
  hamboxHost: '192.168.31.120',
  bmTalkgroup: '46001',
  networkTarget: '',
  protocol: 'ws',
  fromCallsign: '',
  autoRefresh: false
})
const activityConfig = reactive({
  name: getDefaultActivityName(),
  controlCallsign: '',
  controlQth: '',
  controlDevice: '',
  controlAntenna: '',
  controlPower: '',
  serialStart: 1
})

const modeOptions = ['FM', 'SSB', 'CW', 'DMR', 'C4FM', 'D-STAR', 'FT8']
const quickPowerOptions = ['5W', '10W', '25W', '50W']
const FIRST_TIME_REMARK = '首次参与'
const monitorSourceOptions = [
  {
    value: 'fmo',
    label: 'FMO',
    fieldLabel: 'FMO 地址',
    placeholder: '192.168.40.3',
    addressKind: 'fmo'
  },
  {
    value: 'mmdvm',
    label: 'MMDVM',
    fieldLabel: 'MMDVM 地址',
    placeholder: '192.168.3.65',
    addressKind: 'mmdvm'
  },
  {
    value: 'hambox',
    label: 'HAMBOX',
    fieldLabel: 'HAMBOX 地址',
    placeholder: '192.168.31.120',
    addressKind: 'hambox'
  },
  {
    value: 'bm',
    label: 'BM DMR',
    webLabel: '*BM DMR',
    fieldLabel: 'BM 通话组',
    placeholder: '46001',
    addressKind: 'bm',
    emphasized: true
  },
  {
    value: 'ysf',
    label: 'YSF',
    fieldLabel: 'YSF 反射器',
    placeholder: '监听功能待开放',
    addressKind: 'network'
  },
  {
    value: 'fcs',
    label: 'FCS',
    fieldLabel: 'FCS 反射器',
    placeholder: '监听功能待开放',
    addressKind: 'network'
  },
  {
    value: 'dstar',
    label: 'D-Star / XLX',
    fieldLabel: 'D-Star / XLX 反射器',
    placeholder: '监听功能待开放',
    addressKind: 'network'
  },
  {
    value: 'p25',
    label: 'P25',
    fieldLabel: 'P25 反射器',
    placeholder: '监听功能待开放',
    addressKind: 'network'
  },
  {
    value: 'nxdn',
    label: 'NXDN',
    fieldLabel: 'NXDN 反射器',
    placeholder: '监听功能待开放',
    addressKind: 'network'
  }
]
const monitorSourceByValue = Object.fromEntries(
  monitorSourceOptions.map((option) => [option.value, option])
)

const toHalfWidth = (value) =>
  String(value || '')
    .replace(/[\uff01-\uff5e]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')

const sanitizeCallsignInput = (value, { allowSlash = false } = {}) => {
  const pattern = allowSlash ? /[^A-Z0-9/]/g : /[^A-Z0-9]/g
  return toHalfWidth(value).toUpperCase().replace(pattern, '')
}

const normalizeCallsign = (value) => sanitizeCallsignInput(value, { allowSlash: true })

const getCoreCallsign = (value) => {
  const normalized = normalizeCallsign(value)
  const parts = normalized.split('/').filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0]
  const candidates = parts.filter((part) => part.length >= 4 && /[A-Z]/.test(part) && /\d/.test(part))
  return candidates.sort((a, b) => b.length - a.length)[0] || parts.at(-1) || normalized
}

const isSameCoreCallsign = (left, right) => {
  const leftCore = getCoreCallsign(left)
  const rightCore = getCoreCallsign(right)
  return Boolean(leftCore && rightCore && leftCore === rightCore)
}

const normalizePrefix = (value) => {
  const prefix = sanitizeCallsignInput(value).replace(/\/+$/g, '')
  if (/^\d+$/.test(prefix)) return `B${prefix}`
  return prefix
}

const buildCallsignFromParts = (prefixValue, callsignValue) => {
  const prefix = normalizePrefix(prefixValue)
  const callsign = normalizeCallsign(callsignValue).replace(/^\/+/g, '')
  if (!prefix) return callsign
  return callsign ? `${prefix}/${callsign}` : ''
}

const buildRecordCallsign = () => buildCallsignFromParts(form.prefix, form.callsign)

const normalizeCallsignField = (target, key, options = {}) => {
  target[key] = sanitizeCallsignInput(target[key], options)
}

const handleCallsignInput = (event, target, key, options = {}) => {
  if (event?.isComposing) return
  normalizeCallsignField(target, key, options)
}

const handleCallsignCompositionEnd = (target, key, options = {}) => {
  normalizeCallsignField(target, key, options)
}

const clearCallsignField = (target = form) => {
  target.callsign = ''
}

const clearField = (target, key) => {
  if (!target || !key) return
  target[key] = ''
}

const splitRecordCallsign = (value) => {
  const normalized = normalizeCallsign(value)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length >= 2) {
    return {
      prefix: parts.slice(0, -1).join('/'),
      callsign: parts.at(-1)
    }
  }
  return { prefix: '', callsign: normalized }
}

const formatDisplayTime = (value) => {
  if (!value) return ''
  return value.replace('T', ' ')
}

const formatClock = (value) => {
  const display = formatDisplayTime(value)
  return display ? display.slice(11, 16) : '-'
}

const formatFullDateTime = (value) => {
  const display = formatDisplayTime(value)
  if (!display) return '-'
  const normalized = display.length >= 19 ? display.slice(0, 19) : display
  return normalized.replace('T', ' ')
}

const formatDuration = (seconds) => {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return '-'
  const minutes = Math.floor(value / 60)
  const rest = Math.floor(value % 60)
  return minutes > 0 ? `${minutes}分${String(rest).padStart(2, '0')}秒` : `${rest}秒`
}

const parseLegacyTime = (value) => {
  if (!value) return nowForInput()
  const match = String(value).match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{1,2})/)
  if (match) {
    const [, year, month, day, hour, minute] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
  }
  if (String(value).includes('T')) return String(value).slice(0, 16)
  return nowForInput()
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) return nowForInput()
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return nowForInput()
  const ms = value > 100000000000 ? value : value * 1000
  const date = new Date(ms)
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const parseMmdvmTime = (value) => {
  const text = String(value || '').trim()
  if (!text) return nowForInput()
  const today = new Date().toISOString().slice(0, 10)
  const timeMatch = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (timeMatch && !/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) {
    return `${today}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
  }
  const dateMatch = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2}).*?(\d{1,2}):(\d{2})/)
  if (dateMatch) {
    const [, year, month, day, hour, minute] = dateMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}`
  }
  return nowForInput()
}

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || ''

const extractDeviceFromComment = (comment) => {
  const text = String(comment || '').trim()
  if (!text) return ''
  const patterns = [
    /(?:设备|电台|机器|手台|车台|Rig|Radio|Device)[:：\s]+([^/，,;；]+)/i,
    /(?:使用|用)[:：\s]*([^/，,;；]*(?:DMR|D878|PDC|MD-|UV-|R7|G36|NX-|TH-|FT-|IC-|ID-)[^/，,;；]*)/i
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

const sortedRecords = computed(() =>
  [...records.value].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
)

const displayRecords = computed(() =>
  [...records.value].sort((a, b) => {
    const aTime = new Date(a.createdAt || a.time || 0).getTime()
    const bTime = new Date(b.createdAt || b.time || 0).getTime()
    return bTime - aTime
  })
)

const filteredRecords = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  if (!keyword) return displayRecords.value
  return displayRecords.value.filter((record) =>
    [
      record.callsign,
      record.operatorName,
      record.qth,
      record.device,
      record.antenna,
      record.power,
      record.frequency,
      record.mode,
      record.signal,
      record.remarks
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  )
})

const allFilteredSelected = computed(
  () =>
    filteredRecords.value.length > 0 &&
    filteredRecords.value.every((record) => selectedRecordIds.value.includes(record.id))
)

const stats = computed(() => {
  const qthSet = new Set(records.value.map((record) => record.qth).filter(Boolean))
  const totalPower = records.value.reduce((sum, record) => {
    const match = String(record.power || '').match(/\d+(\.\d+)?/)
    return sum + (match ? Number(match[0]) : 0)
  }, 0)
  const last = sortedRecords.value.at(-1)
  return {
    total: records.value.length,
    qthCount: qthSet.size,
    totalPower,
    lastTime: last ? formatDisplayTime(last.time) : '暂无'
  }
})

const duplicateCallsign = computed(() => {
  const callsign = buildRecordCallsign()
  if (!callsign) return false
  return records.value.some((record) => record.callsign === callsign && record.id !== editingId.value)
})

const profileByCallsign = computed(() => {
  const map = new Map()
  profiles.value.forEach((profile) => {
    const normalized = normalizeProfile(profile)
    if (normalized.callsign) map.set(normalized.callsign, normalized)
  })
  sortedRecords.value.forEach((record) => {
    if (record.callsign) map.set(record.callsign, mergeProfileEntry(map.get(record.callsign), record))
  })
  return map
})

const currentProfile = computed(() => {
  const exactCallsign = buildRecordCallsign()
  const plainCallsign = normalizeCallsign(form.callsign)
  const coreCallsign = getCoreCallsign(exactCallsign || plainCallsign)
  const exactProfile =
    profileByCallsign.value.get(exactCallsign) ||
    profileByCallsign.value.get(plainCallsign)
  if (!coreCallsign) return exactProfile || null

  const matchingProfiles = [...profileByCallsign.value.values()].filter((profile) =>
    isSameCoreCallsign(profile.callsign, coreCallsign)
  )
  const orderedProfiles = [
    exactProfile,
    ...matchingProfiles.filter((profile) => profile.callsign !== exactProfile?.callsign)
  ].filter(Boolean)
  const mergedProfile = orderedProfiles.reduce(
    (merged, profile) => mergeProfileEntry(merged, profile, { preferIncoming: !merged }),
    null
  )
  return mergedProfile ? { ...mergedProfile, callsign: exactCallsign || plainCallsign || coreCallsign } : null
})

const previousCheckinCount = computed(() => {
  const callsign = buildRecordCallsign()
  if (!callsign) return 0
  return records.value.filter((record) => record.callsign === callsign && record.id !== editingId.value).length
})

const profileParticipationCount = computed(() => {
  const callsign = buildRecordCallsign()
  const coreCallsign = getCoreCallsign(callsign)
  if (!coreCallsign) return 0
  const currentSessionCount = records.value.filter((record) =>
    isSameCoreCallsign(record.callsign, coreCallsign)
  ).length
  return Math.max(Number(currentProfile.value?.checkinCount || 0), currentSessionCount)
})

const normalizeSerialStart = (value) => Math.max(1, Number.parseInt(value, 10) || 1)
const recordSerialStart = computed(() => normalizeSerialStart(activityConfig.serialStart))
const nextRecordSerial = computed(() => recordSerialStart.value + sortedRecords.value.length)
const displayedRecordedCount = computed(() => Math.max(0, nextRecordSerial.value - 1))

const getDisplaySerial = (record) => {
  const index = sortedRecords.value.findIndex((item) => item.id === record.id)
  return index >= 0 ? recordSerialStart.value + index : ''
}

const profileFields = ['qth', 'device', 'antenna', 'power', 'mode', 'signal']

const uniqueRecentValues = (values, limit = 12) => {
  const seen = new Set()
  const result = []
  values
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .forEach((value) => {
      const key = toHalfWidth(value).toLowerCase().replace(/\s+/g, '')
      if (seen.has(key)) return
      seen.add(key)
      result.push(value)
    })
  return result.slice(0, limit)
}

const profileHistoryValues = (profile, key, limit = 12) => {
  const history = profile?.history?.[key]
  const values = Array.isArray(history) ? history : []
  return uniqueRecentValues([profile?.[key], ...values], limit)
}

const collectKnownValues = (key) =>
  [
    ...records.value.map((record) => record[key]),
    ...profiles.value.flatMap((profile) => [profile[key], ...(profile.history?.[key] || [])])
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)

const filterValuesByInput = (values, keyword, limit = 24) => {
  const normalizedKeyword = toHalfWidth(keyword).toLowerCase().replace(/\s+/g, '')
  const uniqueValues = uniqueRecentValues(values, values.length || limit)
  const filtered = normalizedKeyword
    ? uniqueValues.filter((value) =>
        toHalfWidth(value).toLowerCase().replace(/\s+/g, '').includes(normalizedKeyword)
      )
    : uniqueValues
  return filtered.slice(0, limit)
}

const collectKnownCallsigns = () =>
  [
    ...records.value.map((record) => record.callsign),
    ...profiles.value.map((profile) => profile.callsign)
  ]
    .map(normalizeCallsign)
    .map(getCoreCallsign)
    .filter(Boolean)

const callsignSuggestions = computed(() => {
  const keyword = toHalfWidth(form.callsign).toUpperCase().replace(/\s+/g, '')
  const uniqueCallsigns = uniqueRecentValues(collectKnownCallsigns(), collectKnownCallsigns().length || 400)
  if (!keyword) return uniqueCallsigns.slice(0, 24)
  return uniqueCallsigns
    .filter((callsign) => callsign.includes(keyword))
    .sort((a, b) => {
      const aStarts = a.startsWith(keyword)
      const bStarts = b.startsWith(keyword)
      if (aStarts !== bStarts) return aStarts ? -1 : 1
      return a.localeCompare(b)
    })
    .slice(0, 24)
})

const knownValues = computed(() => {
  const valuesFor = (key) => uniqueRecentValues(collectKnownValues(key), 80).reverse()

  return {
    qth: valuesFor('qth'),
    device: valuesFor('device'),
    antenna: valuesFor('antenna'),
    mode: valuesFor('mode'),
    power: valuesFor('power'),
    signal: valuesFor('signal')
  }
})

const currentKnownValues = computed(() => {
  const profile = currentProfile.value
  return Object.fromEntries(
    profileFields.map((key) => {
      const profileValues = profileHistoryValues(profile, key, 16)
      return [key, profileValues]
    })
  )
})

const getSearchableKnownValues = (key, target = form) => {
  const currentValues = currentKnownValues.value[key] || []
  const globalValues = collectKnownValues(key)
  const keyword = target[key]
  const hasKeyword = Boolean(toHalfWidth(keyword).trim())
  const currentMatches = filterValuesByInput(currentValues, keyword, 24)
  const globalMatches = filterValuesByInput(globalValues, keyword, 120)
  if (buildRecordCallsign() && !hasKeyword) return currentMatches
  if (buildRecordCallsign()) return uniqueRecentValues([...currentMatches, ...globalMatches], 24)
  return globalMatches.slice(0, 24)
}

const searchableKnownValues = computed(() =>
  Object.fromEntries(profileFields.map((key) => [key, getSearchableKnownValues(key, form)]))
)

const recordStatusText = computed(() => {
  if (duplicateCallsign.value && profileParticipationCount.value) {
    return `本次已记录 · 历史 x${profileParticipationCount.value}`
  }
  if (duplicateCallsign.value) return '本次已记录'
  if (profileParticipationCount.value) return `历史 x${profileParticipationCount.value}`
  if (form.callsign && !currentProfile.value) return '首次参与'
  return ''
})

const rankedFmoCandidates = computed(() =>
  [...fmoCandidates.value].sort((a, b) => {
    if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1
    return new Date(b.time).getTime() - new Date(a.time).getTime()
  })
)

const featuredFmoCandidates = computed(() => rankedFmoCandidates.value.slice(0, 4))
const recentFmoCandidates = computed(() => rankedFmoCandidates.value.slice(0, 20))
const currentMonitorSource = computed(
  () => monitorSourceByValue[fmoConfig.source] || monitorSourceByValue.fmo
)

const activeMonitorAddress = computed(() => {
  if (fmoConfig.source === 'bm') return String(fmoConfig.bmTalkgroup || '').trim()
  if (fmoConfig.source === 'mmdvm') return normalizeHost(fmoConfig.mmdvmHost)
  if (fmoConfig.source === 'hambox') return normalizeHost(fmoConfig.hamboxHost)
  if (currentMonitorSource.value.addressKind === 'network') {
    return String(fmoConfig.networkTarget || '').trim()
  }
  return normalizeHost(fmoConfig.host)
})

const isLocalWebOrigin = () => {
  const hostname = window.location.hostname.toLowerCase()
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  )
}

const isPublicWebVersion = computed(
  () => window.location.protocol !== 'file:' && !isLocalWebOrigin() && serverBasePath === '/checkin'
)
const isLocalProfileTestMode = () =>
  window.location.protocol !== 'file:' &&
  (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') &&
  !serverBasePath
const publicElapsedMs = ref(0)
const publicTimeRemainingText = computed(() => {
  const remaining = Math.max(0, PUBLIC_WEB_LIMITS.durationMs - publicElapsedMs.value)
  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})
const hasProfileSyncRegistration = computed(
  () =>
    (Boolean(normalizeCallsign(profileSyncConfig.registrationCallsign)) &&
      String(profileSyncConfig.profileKey || '').trim().length >= 32) ||
    (Boolean(normalizeCallsign(profileSyncConfig.registrationCallsign)) &&
      String(profileSyncConfig.cracCertificate || '').trim().length >= 4 &&
      String(profileSyncConfig.registrationQth || '').trim().length >= 2 &&
      String(profileSyncConfig.registrationRepeater || '').trim().length >= 2 &&
      String(profileSyncConfig.verificationCode || '').trim().length >= 4)
)
const profileSyncLabel = computed(() => (profileSyncConfig.enabled ? t('profileEnabled') : t('profileDisabled')))
const profileKeyPayload = () => ({
  app: 'HAM 台网点名主控台',
  type: 'shared-profile-access-key',
  version: 1,
  callsign: normalizeCallsign(profileSyncConfig.registrationCallsign),
  key: String(profileSyncConfig.profileKey || '').trim(),
  issuedAt: new Date().toISOString()
})
const publicWebExpired = computed(
  () => isPublicWebVersion.value && publicElapsedMs.value >= PUBLIC_WEB_LIMITS.durationMs
)
const publicWebLimitText = computed(() =>
  language.value === 'en'
    ? `*Web version is mainly for BM DMR testing; each IP can test once per 24h: 1h15m, 1 log file, up to 60 records, 1 Excel download. Remaining ${publicTimeRemainingText.value}`
    : `*网络版仅提供 BM DMR 模式测试；同一 IP 每 24 小时可测试 1 次：时长 1 小时 15 分钟、1 个日志文件、最多 60 条记录、Excel 下载 1 次。剩余 ${publicTimeRemainingText.value}`
)

const isPrivateLanAddress = (address) => {
  const host = normalizeHost(address).replace(/:\d+$/g, '').toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return true
  const parts = host.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false
  const [a, b] = parts
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

const publicNetworkWarning = computed(() => {
  if (!isPublicWebVersion.value) return ''
  if (fmoConfig.source !== 'bm') return '网络版仅支持 BM DMR 网络监听，当前监听源请使用本地版。'
  return ''
})

const fmoAddressWarning = computed(() =>
  publicNetworkWarning.value ||
  (fmoConfig.source === 'fmo' && activeMonitorAddress.value
    ? getAddressWarning(activeMonitorAddress.value, fmoConfig.protocol)
    : '')
)

const showNotice = (message, position = 'bottom') => {
  noticePosition.value = position
  notice.value = message
  window.clearTimeout(showNotice.timer)
  showNotice.timer = window.setTimeout(() => {
    notice.value = ''
    noticePosition.value = 'bottom'
  }, 2600)
}

const loadPublicSession = () => {
  if (!isPublicWebVersion.value) return
  try {
    const saved = JSON.parse(localStorage.getItem(PUBLIC_WEB_SESSION_KEY) || '{}')
    if (saved && Number(saved.startedAt) && Date.now() - Number(saved.startedAt) < PUBLIC_WEB_LIMITS.resetWindowMs) {
      publicSession.startedAt = Number(saved.startedAt)
      publicSession.activityId = saved.activityId || currentActivityId.value || 'default'
      publicSession.downloads = Number(saved.downloads || 0)
    } else {
      publicSession.startedAt = Date.now()
      publicSession.activityId = currentActivityId.value || 'default'
      publicSession.downloads = 0
    }
  } catch {
    publicSession.startedAt = Date.now()
    publicSession.activityId = currentActivityId.value || 'default'
    publicSession.downloads = 0
  }
  publicElapsedMs.value = Date.now() - publicSession.startedAt
  persistPublicSession()
}

const persistPublicSession = () => {
  if (!isPublicWebVersion.value) return
  localStorage.setItem(
    PUBLIC_WEB_SESSION_KEY,
    JSON.stringify({
      startedAt: publicSession.startedAt,
      activityId: publicSession.activityId,
      downloads: publicSession.downloads
    })
  )
}

const assertPublicWebAllowed = (action) => {
  if (!isPublicWebVersion.value) return true
  publicElapsedMs.value = Date.now() - publicSession.startedAt
  if (publicWebExpired.value) {
    showNotice('网络版测试已超过 1 小时 15 分钟，本地版请联系作者微信。', 'top')
    authorQrOpen.value = true
    return false
  }
  if (action === 'add-record' && records.value.length >= PUBLIC_WEB_LIMITS.maxRecords) {
    showNotice('网络版测试最多记录 60 个友台，本地版请联系作者微信。', 'top')
    authorQrOpen.value = true
    return false
  }
  if (action === 'save' && records.value.length > PUBLIC_WEB_LIMITS.maxRecords) {
    showNotice('网络版测试最多保存 60 条记录，本地版请联系作者微信。', 'top')
    authorQrOpen.value = true
    return false
  }
  if (action === 'new-activity' && publicSession.activityId) {
    showNotice('网络版测试仅允许 1 个日志文件，本地版请联系作者微信。', 'top')
    authorQrOpen.value = true
    return false
  }
  if (action === 'download' && publicSession.downloads >= PUBLIC_WEB_LIMITS.maxDownloads) {
    showNotice('网络版测试仅允许下载 1 次 Excel，本地版请联系作者微信。', 'top')
    authorQrOpen.value = true
    return false
  }
  return true
}

const resetForm = () => {
  Object.assign(form, emptyForm())
  editingId.value = null
}

const persist = () => {
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(records.value))
}

const persistProfiles = () => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles.value))
}

const persistDirtyProfiles = () => {
  localStorage.setItem(PROFILE_DIRTY_KEY, JSON.stringify(dirtyProfileCallsigns.value))
}

const persistProfileSyncConfig = () => {
  localStorage.setItem(PROFILE_SYNC_CONFIG_KEY, JSON.stringify(profileSyncConfig))
}

const persistFmoConfig = () => {
  localStorage.setItem(FMO_CONFIG_KEY, JSON.stringify(fmoConfig))
}

const persistActivityConfig = () => {
  localStorage.setItem(scopedKey(ACTIVITY_CONFIG_KEY), JSON.stringify(activityConfig))
}

const loadRecords = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEY)) || '[]')
    records.value = Array.isArray(saved) ? saved : []
  } catch {
    records.value = []
  }
}

const loadProfiles = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || '[]')
    profiles.value = Array.isArray(saved) ? saved.map(normalizeProfile).filter((profile) => profile.callsign) : []
  } catch {
    profiles.value = []
  }
}

const loadDirtyProfiles = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_DIRTY_KEY) || '[]')
    dirtyProfileCallsigns.value = Array.isArray(saved)
      ? [...new Set(saved.map(normalizeCallsign).filter(Boolean))]
      : []
  } catch {
    dirtyProfileCallsigns.value = []
  }
}

const loadProfileSyncConfig = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_SYNC_CONFIG_KEY) || '{}')
    Object.assign(profileSyncConfig, {
      enabled: Boolean(
        saved.enabled &&
          saved.registrationCallsign &&
          (saved.profileKey || (saved.cracCertificate && saved.verificationCode))
      ),
      registrationCallsign: normalizeCallsign(saved.registrationCallsign || ''),
      cracCertificate: String(saved.cracCertificate || '').trim(),
      registrationQth: String(saved.registrationQth || '').trim(),
      registrationRepeater: String(saved.registrationRepeater || '').trim(),
      verificationCode: String(saved.verificationCode || '').trim(),
      profileKey: String(saved.profileKey || '').trim(),
      lastPulledAt: saved.lastPulledAt || '',
      lastPushedAt: saved.lastPushedAt || ''
    })
  } catch {
    Object.assign(profileSyncConfig, {
      enabled: false,
      registrationCallsign: '',
      cracCertificate: '',
      registrationQth: '',
      registrationRepeater: '',
      verificationCode: '',
      profileKey: '',
      lastPulledAt: '',
      lastPushedAt: ''
    })
  }
}

const loadFmoConfig = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(FMO_CONFIG_KEY) || '{}')
    const savedSource = monitorSourceByValue[saved.source] ? saved.source : 'fmo'
    Object.assign(fmoConfig, {
      source: savedSource,
      host: saved.host || '',
      mmdvmHost: saved.mmdvmHost || '192.168.3.65',
      hamboxHost: saved.hamboxHost || '192.168.31.120',
      bmTalkgroup: saved.bmTalkgroup || '46001',
      networkTarget: saved.networkTarget || '',
      protocol: saved.protocol || getProtocolFromAddress(saved.host, 'ws'),
      fromCallsign: saved.fromCallsign || '',
      autoRefresh: !!saved.autoRefresh
    })
    previousMonitorSource.value = savedSource
  } catch {
    Object.assign(fmoConfig, {
      source: 'fmo',
      host: '',
      mmdvmHost: '192.168.3.65',
      hamboxHost: '192.168.31.120',
      bmTalkgroup: '46001',
      networkTarget: '',
      protocol: 'ws',
      fromCallsign: '',
      autoRefresh: false
    })
    previousMonitorSource.value = 'fmo'
  }
}

const loadActivityConfig = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(scopedKey(ACTIVITY_CONFIG_KEY)) || '{}')
    Object.assign(activityConfig, {
      name: saved.name || activityConfig.name,
      controlCallsign: saved.controlCallsign || '',
      controlQth: saved.controlQth || '',
      controlDevice: saved.controlDevice || '',
      controlAntenna: saved.controlAntenna || '',
      controlPower: saved.controlPower || '',
      serialStart: normalizeSerialStart(saved.serialStart)
    })
  } catch {
    /* keep defaults */
  }
}

const applyProfile = (profile, overwrite = false) => {
  if (!profile) return
  const fields = ['qth', 'device', 'antenna', 'power', 'mode', 'signal']
  fields.forEach((key) => {
    if (overwrite || !form[key]) form[key] = profile[key] || form[key]
  })
}

const chooseFmoCandidate = (candidate) => {
  if (!candidate?.callsign) return
  const { prefix, callsign } = splitRecordCallsign(candidate.callsign)
  form.prefix = prefix
  form.callsign = callsign
  form.qth = ''
  form.device = ''
  form.antenna = ''
  form.power = ''
  form.mode = 'FM'
  form.signal = '59'
  form.remarks = ''

  applyProfile(currentProfile.value, true)
  if (candidate.qth) form.qth = candidate.qth
  if (candidate.device) form.device = candidate.device
  if (candidate.antenna) form.antenna = candidate.antenna
  if (candidate.power) form.power = candidate.power
  if (candidate.mode) form.mode = candidate.mode
  if (candidate.signal) form.signal = candidate.signal
  const relayText = candidate.relayName ? `中继 ${candidate.relayName}` : ''
  const firstTimeRemark =
    !profileParticipationCount.value && !currentProfile.value ? FIRST_TIME_REMARK : ''
  form.remarks = [firstTimeRemark, candidate.sourceLabel, relayText, candidate.comment]
    .filter(Boolean)
    .join(' / ')
  showNotice(`已选取 ${candidate.callsign}`)
}

const pickKnownValue = (event, key, target = form) => {
  const value = event.target.value
  if (value) target[key] = value
  event.target.value = ''
}

const normalizeProfile = (profile) => {
  const callsign = normalizeCallsign(profile?.callsign || '')
  const history = Object.fromEntries(
    profileFields.map((key) => [key, profileHistoryValues(profile, key, 24)])
  )
  return {
    callsign,
    qth: profile?.qth || history.qth[0] || '',
    device: profile?.device || history.device[0] || '',
    antenna: profile?.antenna || history.antenna[0] || '',
    power: profile?.power || history.power[0] || '',
    mode: profile?.mode || history.mode[0] || '',
    signal: profile?.signal || history.signal[0] || '',
    remarks: profile?.remarks || '',
    checkinCount: Number(profile?.checkinCount || profile?.count || 0),
    lastCheckinAt: profile?.lastCheckinAt || profile?.time || '',
    updatedAt: profile?.updatedAt || new Date().toISOString(),
    history
  }
}

const mergeProfileEntry = (baseProfile, entry, { preferIncoming = true } = {}) => {
  const base = normalizeProfile(baseProfile || {})
  const callsign = normalizeCallsign(entry?.callsign || base.callsign || '')
  if (!callsign) return null
  const history = { ...base.history }
  profileFields.forEach((key) => {
    const incomingValues = [entry?.[key], ...(entry?.history?.[key] || [])]
    const baseValues = [base[key], ...(base.history?.[key] || [])]
    history[key] = uniqueRecentValues(
      preferIncoming ? [...incomingValues, ...baseValues] : [...baseValues, ...incomingValues],
      24
    )
  })
  const shouldCountCheckin = Boolean(entry?.time || entry?.lastCheckinAt) && !entry?.history
  return {
    ...base,
    callsign,
    qth: preferIncoming ? entry?.qth || base.qth || history.qth[0] || '' : base.qth || entry?.qth || history.qth[0] || '',
    device: preferIncoming ? entry?.device || base.device || history.device[0] || '' : base.device || entry?.device || history.device[0] || '',
    antenna: preferIncoming ? entry?.antenna || base.antenna || history.antenna[0] || '' : base.antenna || entry?.antenna || history.antenna[0] || '',
    power: preferIncoming ? entry?.power || base.power || history.power[0] || '' : base.power || entry?.power || history.power[0] || '',
    mode: preferIncoming ? entry?.mode || base.mode || history.mode[0] || '' : base.mode || entry?.mode || history.mode[0] || '',
    signal: preferIncoming ? entry?.signal || base.signal || history.signal[0] || '' : base.signal || entry?.signal || history.signal[0] || '',
    remarks: preferIncoming ? entry?.remarks || base.remarks || '' : base.remarks || entry?.remarks || '',
    checkinCount: Math.max(Number(base.checkinCount || 0), Number(entry?.checkinCount || 0)) + (shouldCountCheckin ? 1 : 0),
    lastCheckinAt: preferIncoming
      ? entry?.lastCheckinAt || entry?.time || base.lastCheckinAt || ''
      : base.lastCheckinAt || entry?.lastCheckinAt || entry?.time || '',
    updatedAt: new Date().toISOString(),
    history
  }
}

const updateProfile = (record, { markDirty = true } = {}) => {
  const callsign = normalizeCallsign(record.callsign || '')
  if (!callsign) return
  const profileMap = new Map(
    profiles.value
      .map(normalizeProfile)
      .filter((profile) => profile.callsign)
      .map((profile) => [profile.callsign, profile])
  )
  profileMap.set(callsign, mergeProfileEntry(profileMap.get(callsign), record))
  profiles.value = [...profileMap.values()]
  if (markDirty) {
    markProfileDirty([callsign])
    scheduleSharedProfileSync()
  }
}

const mergeProfiles = (nextProfiles, options = {}) => {
  const profileMap = new Map(
    profiles.value
      .map(normalizeProfile)
      .filter((profile) => profile.callsign)
      .map((profile) => [profile.callsign, profile])
  )
  nextProfiles.forEach((profile) => {
    const callsign = normalizeCallsign(profile.callsign || '')
    if (callsign) profileMap.set(callsign, mergeProfileEntry(profileMap.get(callsign), profile, options))
  })
  profiles.value = [...profileMap.values()]
}

const markProfileDirty = (callsigns) => {
  const next = new Set(dirtyProfileCallsigns.value)
  callsigns.map(normalizeCallsign).filter(Boolean).forEach((callsign) => next.add(callsign))
  dirtyProfileCallsigns.value = [...next]
  persistDirtyProfiles()
}

const clearDirtyProfiles = (callsigns) => {
  const removed = new Set(callsigns.map(normalizeCallsign).filter(Boolean))
  dirtyProfileCallsigns.value = dirtyProfileCallsigns.value.filter((callsign) => !removed.has(callsign))
  persistDirtyProfiles()
}

const sharedProfilePayload = (profile) => {
  const normalized = normalizeProfile(profile)
  const history = Object.fromEntries(
    profileFields.map((key) => [
      key,
      uniqueRecentValues([normalized[key], ...(normalized.history?.[key] || [])], 24)
    ])
  )
  return {
    callsign: normalized.callsign,
    qth: history.qth[0] || '',
    device: history.device[0] || '',
    antenna: history.antenna[0] || '',
    power: history.power[0] || '',
    mode: history.mode[0] || '',
    signal: history.signal[0] || '',
    checkinCount: Number(normalized.checkinCount || 0),
    lastCheckinAt: normalized.lastCheckinAt || '',
    updatedAt: normalized.updatedAt || new Date().toISOString(),
    history
  }
}

const getDirtyProfilesForSync = () => {
  const dirtySet = new Set(dirtyProfileCallsigns.value)
  return profiles.value
    .map(normalizeProfile)
    .filter((profile) => profile.callsign && dirtySet.has(profile.callsign))
    .map(sharedProfilePayload)
}

const encodeProfileHeader = (value) => encodeURIComponent(String(value || '').trim())

const sharedProfileAuthHeaders = () => {
  const profileKey = String(profileSyncConfig.profileKey || '').trim()
  if (profileKey) return { 'x-ham-profile-key': profileKey }
  return {
    'x-ham-callsign': normalizeCallsign(profileSyncConfig.registrationCallsign),
    'x-ham-crac-certificate': String(profileSyncConfig.cracCertificate || '').trim(),
    'x-ham-registration-qth': encodeProfileHeader(profileSyncConfig.registrationQth),
    'x-ham-registration-repeater': encodeProfileHeader(profileSyncConfig.registrationRepeater),
    'x-ham-profile-code': String(profileSyncConfig.verificationCode || '').trim()
  }
}

const applyProfileKeyPayload = (payload) => {
  const callsign = normalizeCallsign(payload?.callsign || payload?.registrationCallsign || '')
  const profileKey = String(payload?.key || payload?.profileKey || '').trim()
  const cracCertificate = String(payload?.cracCertificate || payload?.certificate || '').trim()
  const qth = String(payload?.qth || payload?.registrationQth || '').trim()
  const repeater = String(payload?.repeater || payload?.registrationRepeater || '').trim()
  const verificationCode = String(payload?.verificationCode || payload?.code || '').trim()
  if (profileKey) {
    if (!callsign) throw new Error('密钥文件内容不完整')
    Object.assign(profileSyncConfig, {
      enabled: true,
      registrationCallsign: callsign,
      cracCertificate,
      registrationQth: qth,
      registrationRepeater: repeater,
      verificationCode: '',
      profileKey
    })
    persistProfileSyncConfig()
    return
  }
  if (!callsign || cracCertificate.length < 4 || qth.length < 2 || repeater.length < 2 || verificationCode.length < 4) {
    throw new Error('密钥文件内容不完整')
  }
  Object.assign(profileSyncConfig, {
    enabled: true,
    registrationCallsign: callsign,
    cracCertificate,
    registrationQth: qth,
    registrationRepeater: repeater,
    verificationCode,
    profileKey: ''
  })
  persistProfileSyncConfig()
}

const exportProfileKey = () => {
  if (!String(profileSyncConfig.profileKey || '').trim()) {
    showNotice('请先导入作者发放的验证密钥')
    return
  }
  const payload = profileKeyPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8'
  })
  downloadBlob(blob, `HAM呼号库验证密钥-${payload.callsign || 'CALLSIGN'}.json`)
  showNotice('验证密钥已导出，请妥善保存')
}

const importProfileKey = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const payload = JSON.parse(await file.text())
    applyProfileKeyPayload(payload)
    profileRegistrationOpen.value = false
    profileSyncStatus.value = '已启用呼号数据库'
    showNotice('验证密钥已导入')
    await syncSharedProfiles({ silent: false })
  } catch (error) {
    profileSyncStatus.value = '验证密钥导入失败'
    showNotice(error?.message || '验证密钥导入失败')
  } finally {
    event.target.value = ''
  }
}

const requestProfileRegistration = async () => {
  const callsign = normalizeCallsign(profileSyncConfig.registrationCallsign || activityConfig.controlCallsign)
  const cracCertificate = String(profileSyncConfig.cracCertificate || '').trim()
  const qth = String(profileSyncConfig.registrationQth || '').trim()
  const repeater = String(profileSyncConfig.registrationRepeater || '').trim()
  if (!callsign || cracCertificate.length < 4 || qth.length < 2 || repeater.length < 2) {
    profileRegistrationOpen.value = true
    profileSyncStatus.value = '请完整填写注册资料'
    return
  }
  profileSyncConfig.registrationCallsign = callsign
  profileSyncBusy.value = true
  profileSyncStatus.value = '提交审核中'
  try {
    const response = await fetch(sharedProfileApiPath('/api/profiles/register'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        callsign,
        cracCertificate,
        qth,
        repeater
      })
    })
    const data = await response.json()
    if (!response.ok || !data?.ok) throw new Error(data?.error || '注册申请提交失败')
    profileSyncStatus.value = data.status === 'approved' ? '已审核，请导入验证密钥后同步' : '已提交，等待作者审核'
    showNotice(profileSyncStatus.value)
  } catch (error) {
    profileSyncStatus.value = '注册申请提交失败'
    showNotice(error?.message || '注册申请提交失败')
  } finally {
    profileSyncBusy.value = false
  }
}

const ensureProfileSyncAuthorized = () => {
  if (isLocalProfileTestMode()) return true
  if (hasProfileSyncRegistration.value) return true
  profileSyncConfig.enabled = false
  profileSyncStatus.value = '呼号数据库需导入验证密钥'
  authorQrTitle.value = '注册共享呼号资料库'
  authorQrHint.value = '请使用微信扫码'
  authorQrOpen.value = true
  return false
}

const pullLocalBaseProfilesForTesting = async ({ silent = false } = {}) => {
  if (!profileSyncConfig.enabled) return null
  const response = await fetch('./data/profiles/base-profiles.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`本地基础库加载失败：HTTP ${response.status}`)
  const data = await response.json()
  const baseProfiles = Array.isArray(data.profiles) ? data.profiles : []
  if (baseProfiles.length) mergeProfiles(baseProfiles, { preferIncoming: false })
  profileSyncConfig.lastPulledAt = new Date().toISOString()
  profileSyncStatus.value = `本地测试基础库 ${baseProfiles.length} 条`
  persistProfileSyncConfig()
  if (!silent) showNotice(`本地基础库已启用 ${baseProfiles.length} 条`)
  return {
    ok: true,
    count: baseProfiles.length,
    baseCount: baseProfiles.length,
    sharedCount: 0,
    profiles: baseProfiles
  }
}

const pullSharedProfiles = async ({ silent = false } = {}) => {
  if (!profileSyncConfig.enabled) return null
  if (isLocalProfileTestMode()) return pullLocalBaseProfilesForTesting({ silent })
  if (!ensureProfileSyncAuthorized()) return null
  const response = await fetch(sharedProfileApiPath('/api/profiles/pull'), {
    cache: 'no-store',
    headers: sharedProfileAuthHeaders()
  })
  const data = await response.json()
  if (!response.ok || !data?.ok) throw new Error(data?.error || `共享库拉取失败：HTTP ${response.status}`)
  const sharedProfiles = Array.isArray(data.profiles) ? data.profiles : []
  if (sharedProfiles.length) mergeProfiles(sharedProfiles, { preferIncoming: false })
  profileSyncConfig.lastPulledAt = new Date().toISOString()
  persistProfileSyncConfig()
  if (!silent) showNotice(`呼号数据库已同步 ${sharedProfiles.length} 条`)
  return data
}

const pushSharedProfiles = async () => {
  if (!profileSyncConfig.enabled) return null
  if (isLocalProfileTestMode()) return null
  if (!ensureProfileSyncAuthorized()) return null
  const dirtyProfiles = getDirtyProfilesForSync()
  if (!dirtyProfiles.length) return null
  const response = await fetch(sharedProfileApiPath('/api/profiles/push'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...sharedProfileAuthHeaders() },
    body: JSON.stringify({
      profiles: dirtyProfiles,
      client: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        pushedAt: new Date().toISOString()
      }
    })
  })
  const data = await response.json()
  if (!response.ok || !data?.ok) throw new Error(data?.error || `共享库回馈失败：HTTP ${response.status}`)
  clearDirtyProfiles(Array.isArray(data.callsigns) ? data.callsigns : dirtyProfiles.map((profile) => profile.callsign))
  profileSyncConfig.lastPushedAt = new Date().toISOString()
  persistProfileSyncConfig()
  return data
}

const syncSharedProfiles = async ({ silent = false } = {}) => {
  if (!profileSyncConfig.enabled || profileSyncBusy.value) return
  if (!ensureProfileSyncAuthorized()) return
  profileSyncBusy.value = true
  profileSyncStatus.value = silent ? profileSyncStatus.value : '同步中'
  try {
    const pushed = await pushSharedProfiles()
    const pulled = await pullSharedProfiles({ silent: true })
    const pushedCount = pushed?.merged || 0
    const pulledCount = pulled?.count || 0
    profileSyncStatus.value = `共享 ${pulledCount} 条，新增 ${pushedCount} 条`
    if (!silent) showNotice('呼号数据库已同步')
  } catch (error) {
    profileSyncStatus.value = '共享库同步失败'
    if (!silent) showNotice(error?.message || '共享库同步失败')
  } finally {
    profileSyncBusy.value = false
  }
}

const scheduleSharedProfileSync = () => {
  if (!profileSyncConfig.enabled) return
  window.clearTimeout(profileSyncDebounceTimer.value)
  profileSyncDebounceTimer.value = window.setTimeout(() => {
    syncSharedProfiles({ silent: true })
  }, 1800)
}

const toggleProfileSync = () => {
  persistProfileSyncConfig()
  if (profileSyncConfig.enabled) {
    if (!ensureProfileSyncAuthorized()) {
      persistProfileSyncConfig()
      return
    }
    syncSharedProfiles({ silent: false })
  }
}

const enableLocalBaseProfilesForTesting = () => {
  if (!isLocalProfileTestMode()) return
  profileSyncConfig.enabled = true
  profileSyncStatus.value = '本地测试基础库加载中'
  persistProfileSyncConfig()
  pullLocalBaseProfilesForTesting({ silent: true }).catch((error) => {
    console.error(error)
    profileSyncStatus.value = '本地测试基础库加载失败'
  })
}

const getProfileStatsSnapshot = () => {
  const normalizedProfiles = profiles.value.map(normalizeProfile).filter((profile) => profile.callsign)
  const callsigns = new Set()
  const qths = new Set()
  const devices = new Set()
  let historyEntries = 0

  normalizedProfiles.forEach((profile) => {
    callsigns.add(profile.callsign)
    profileFields.forEach((key) => {
      const values = uniqueRecentValues([profile[key], ...(profile.history?.[key] || [])], 100)
      historyEntries += values.length
      if (key === 'qth') values.forEach((value) => qths.add(value))
      if (key === 'device') values.forEach((value) => devices.add(value))
    })
  })

  return {
    entries: historyEntries,
    callsigns: callsigns.size,
    qths: qths.size,
    devices: devices.size,
    capturedAt: new Date().toISOString()
  }
}

const stopControlTxSpeaking = (time = nowForInput()) => {
  window.clearTimeout(controlTxClearTimer.value)
  lastTopControlCandidateKey.value = ''
  if (!controlTxInfo.value) return
  controlTxInfo.value = {
    ...controlTxInfo.value,
    isSpeaking: false,
    time
  }
}

const getCandidateActivityKey = (candidate) =>
  [
    getCoreCallsign(candidate?.callsign || ''),
    candidate?.time || '',
    candidate?.durationSeconds ?? '',
    candidate?.liveStartedAt ?? '',
    candidate?.sourceLabel || '',
    candidate?.raw?.Event || candidate?.raw?.event || '',
    candidate?.raw?.status || '',
    candidate?.raw?.duration || ''
  ].join('|')

const scheduleControlTxStaleStop = (candidate, activityKey) => {
  window.clearTimeout(controlTxClearTimer.value)
  if (fmoConfig.source === 'fmo' || !candidate?.isSpeaking) return
  const timeoutMs = CONTROL_TX_STALE_MS[fmoConfig.source] || CONTROL_TX_STALE_MS.default
  controlTxClearTimer.value = window.setTimeout(() => {
    const stillSameTop = lastTopControlCandidateKey.value === activityKey
    const stillSameControl = isSameCoreCallsign(controlTxInfo.value?.callsign, activityConfig.controlCallsign)
    if (stillSameTop && stillSameControl) stopControlTxSpeaking()
  }, timeoutMs)
}

const updateControlTxInfo = (candidate) => {
  const controlCallsign = normalizeCallsign(activityConfig.controlCallsign)
  const isHost = !!(candidate?.isHost || candidate?.raw?.isHost)
  const isControlCallsign = controlCallsign && isSameCoreCallsign(candidate?.callsign, controlCallsign)
  if (!candidate?.callsign || (!isHost && !isControlCallsign)) return
  window.clearTimeout(controlTxClearTimer.value)
  controlTxInfo.value = {
    callsign: candidate.callsign,
    time: candidate.time || nowForInput(),
    source: candidate.sourceLabel || fmoConfig.source.toUpperCase(),
    relayName: candidate.relayName || currentRelayName.value,
    mode: candidate.mode || '',
    qth: candidate.qth || candidate.grid || '',
    isSpeaking: !!candidate.isSpeaking
  }
}

const syncControlTxFromTopCandidate = () => {
  const topCandidate = rankedFmoCandidates.value[0]
  const controlCallsign = normalizeCallsign(activityConfig.controlCallsign)
  if (!topCandidate?.callsign || !controlCallsign || !isSameCoreCallsign(topCandidate.callsign, controlCallsign)) {
    stopControlTxSpeaking()
    return
  }

  const eventName = String(topCandidate?.raw?.Event || topCandidate?.raw?.event || '').toLowerCase()
  const isStopEvent = /stop|end|term|timeout/.test(eventName)
  const isStartupHistory = topCandidate.sourceLabel === 'BM最近通联'
  const hasExplicitEnd = !!(topCandidate.endTime || topCandidate.raw?.endTime)
  const activityKey = getCandidateActivityKey(topCandidate)
  let isSpeaking = !isStopEvent && !isStartupHistory && !hasExplicitEnd
  if (fmoConfig.source === 'bm') {
    isSpeaking = topCandidate.raw?.Event === 'Session-Start'
  } else if (fmoConfig.source === 'hambox') {
    isSpeaking = !!topCandidate.isSpeaking
  } else if (fmoConfig.source === 'fmo') {
    const isRealtimeSource = /实时|正在/.test(String(topCandidate.sourceLabel || ''))
    isSpeaking = isSpeaking && (!!topCandidate.isSpeaking || isRealtimeSource || !!topCandidate.isHost)
  }

  lastTopControlCandidateKey.value = activityKey
  const nextControlTx = { ...topCandidate, isSpeaking }
  updateControlTxInfo(nextControlTx)
  scheduleControlTxStaleStop(nextControlTx, activityKey)
}

const upsertFmoCandidate = (candidate) => {
  if (!candidate.callsign) return
  fmoCandidates.value = [
    candidate,
    ...fmoCandidates.value.filter((item) => item.callsign !== candidate.callsign)
  ].slice(0, 20)
  syncControlTxFromTopCandidate()
  resolveCandidateGrid(candidate)
}

const mergeFmoLogCandidates = (logCandidates) => {
  fmoLogCandidates.value = logCandidates.filter(Boolean).slice(0, 20)
  rebuildFmoCandidatesFromDashboardModel()
}

const findMatchingFmoLog = (speakingRecord) => {
  const speakingTime = Math.floor((speakingRecord.startTime || 0) / 1000)
  return fmoLogCandidates.value.find((record) => {
    if (record.callsign !== speakingRecord.callsign) return false
    const recordTime = Math.floor(new Date(record.time || 0).getTime() / 1000)
    return speakingTime && recordTime && Math.abs(recordTime - speakingTime) < 90
  })
}

const rebuildFmoCandidatesFromDashboardModel = () => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  const liveRows = fmoSpeakingHistory.value
    .filter((item) => item.callsign && (item.endTime || item.startTime) > oneHourAgo)
    .map((item) => {
      const matchedLog = findMatchingFmoLog(item)
      const startedAt = item.startTime || Date.now()
      const timestamp = Math.floor(startedAt / 1000)
      const qth = matchedLog?.qth || (isMaidenheadGrid(item.grid) ? '' : item.qth || '')
      const grid = item.grid || matchedLog?.grid || ''
      return {
        ...(matchedLog || {}),
        id: `fmo-live-${item.callsign}-${startedAt}`,
        callsign: item.callsign,
        time: formatTimestamp(timestamp),
        durationSeconds: Math.max(
          1,
          Math.floor(((item.endTime || Date.now()) - startedAt) / 1000)
        ),
        liveStartedAt: startedAt,
        qth,
        grid,
        device: matchedLog?.device || '',
        power: matchedLog?.power || '',
        mode: matchedLog?.mode || 'FMO',
        comment: item.endTime ? matchedLog?.comment || '最近发言' : '正在发言',
        relayName: item.serverName || matchedLog?.relayName || currentRelayName.value,
        sourceLabel: item.endTime ? '最近发言' : '正在通联',
        isSpeaking: !item.endTime,
        isHost: !!item.isHost,
        raw: item
      }
    })

  const combined = [...liveRows, ...fmoLogCandidates.value]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  const seen = new Set()
  const deduped = []
  for (const item of combined) {
    if (!item.callsign || seen.has(item.callsign)) continue
    seen.add(item.callsign)
    deduped.push(item)
    if (deduped.length >= 20) break
  }

  fmoCandidates.value = deduped
  syncControlTxFromTopCandidate()
  fmoCandidates.value.forEach(resolveCandidateGrid)
}

const resolveCandidateGrid = async (candidate) => {
  const grid = candidate.grid || (isMaidenheadGrid(candidate.qth) ? candidate.qth : '')
  if (!grid) return
  try {
    const address = await gridToAddressText(grid)
    if (!address) return
    fmoCandidates.value = fmoCandidates.value.map((item) =>
      item.callsign === candidate.callsign ? { ...item, qth: address, grid } : item
    )
  } catch (error) {
    console.warn('Grid 地址解析失败:', grid, error)
  }
}

const normalizeFmoQso = (item, sourceLabel = '最近通联') => {
  const callsign = normalizeCallsign(item.toCallsign || item.callsign || item.fromCallsign || '')
  if (!callsign) return null
  const profile = profileByCallsign.value.get(callsign)
  const comment = firstValue(item.toComment, item.comment, item.app_fmo_comment_utf8, item.remark)
  const grid = firstValue(item.toGrid, item.grid, item.gridsquare)
  const mode = item.mode || item.app_fmo_mode || 'FMO'
  const rawQth = firstValue(
    item.qth,
    item.toQth,
    item.address,
    item.location,
    item.toAddress,
    item.city,
    item.province,
    profile?.qth,
    grid
  )
  const qth = isMaidenheadGrid(rawQth) ? '' : rawQth
  const device = firstValue(
    item.device,
    item.rig,
    item.radio,
    item.equipment,
    item.terminal,
    item.userDevice,
    item.stationDevice,
    extractDeviceFromComment(comment),
    profile?.device
  )
  return {
    id: `${sourceLabel}-${item.logId || item.timestamp || Date.now()}-${callsign}`,
    callsign,
    time: formatTimestamp(item.timestamp || item.startTime),
    durationSeconds: Number(firstValue(item.duration, item.durationSeconds, item.talkingSeconds, item.elapsedSeconds, item.endTime && item.startTime ? Math.max(0, (Number(item.endTime) - Number(item.startTime)) / 1000) : '')) || 0,
    liveStartedAt: item.liveStartedAt || 0,
    qth,
    grid,
    device,
    power: firstValue(item.power, item.txPower, profile?.power),
    mode,
    comment,
    relayName: firstValue(item.relayName, item.serverName, item.stationName),
    sourceLabel,
    isSpeaking: sourceLabel === '正在通联',
    raw: item
  }
}

const normalizeMmdvmQso = (item, index, targetName = '') => {
  const callsign = normalizeCallsign(item.callsign || '')
  if (!callsign) return null
  const profile = profileByCallsign.value.get(callsign)
  return {
    id: `mmdvm-${item.timeText || index}-${callsign}`,
    callsign,
    time: parseMmdvmTime(item.timeText),
    durationSeconds: Number(String(item.duration || '').match(/\d+/)?.[0] || 0),
    liveStartedAt: 0,
    qth: profile?.qth || '',
    grid: '',
    device: profile?.device || '',
    power: profile?.power || '',
    mode: item.mode || profile?.mode || 'MMDVM',
    comment: item.target || targetName || item.rawText || '',
    relayName: targetName,
    sourceLabel: 'MMDVM',
    isSpeaking: false,
    raw: item
  }
}

const normalizeHamboxQso = (item, index, targetName = '') => {
  const callsign = normalizeCallsign(item.from || item.srcCall || '')
  if (!callsign || /^\d+$/.test(callsign)) return null
  const profile = profileByCallsign.value.get(callsign)
  const rawQth = [item.country, item.state, item.city].filter(Boolean).join(' ')
  const qth = localizeBmQth(rawQth, callsign) || profile?.qth || ''
  const target = [item.to || item.dstCall, item.via, item.via2].filter(Boolean).join('/')
  const status = String(item.status || '').toLowerCase()
  const timestamp = Number(item.timestamp || 0)
  return {
    id: `hambox-${timestamp || index}-${callsign}-${item.type || ''}`,
    callsign,
    time: formatTimestamp(timestamp || Date.now()),
    durationSeconds: Number(item.duration || 0) || 0,
    liveStartedAt: status === 'transmitting' ? timestamp || Date.now() : 0,
    qth,
    grid: '',
    device: profile?.device || '',
    power: profile?.power || '',
    mode: item.mode || profile?.mode || 'HAMBOX',
    comment: [target, item.name, item.type].filter(Boolean).join(' / '),
    relayName: targetName || target,
    sourceLabel: status === 'transmitting' ? 'HAMBOX 实时' : 'HAMBOX',
    isSpeaking: status === 'transmitting',
    raw: item
  }
}

const normalizeBmQso = (item, index, targetName = '') => {
  const callsign = normalizeCallsign(item.SourceCall || item.callsign || '')
  if (!callsign) return null
  const profile = profileByCallsign.value.get(callsign)
  const start = Number(item.Start || item.start || 0)
  const stop = Number(item.Stop || item.stop || 0)
  const sessionId = item.SessionID || `${item.SourceID || callsign}-${item.DestinationID || ''}-${start || index}`
  return {
    id: `bm-${sessionId}`,
    callsign,
    bmSessionId: sessionId,
    sourceId: item.SourceID || '',
    time: formatTimestamp(start || Date.now()),
    durationSeconds: stop && start ? Math.max(0, stop - start) : 0,
    liveStartedAt: 0,
    qth: profile?.qth || '',
    grid: '',
    device: profile?.device || '',
    power: profile?.power || '',
    mode: 'DMR',
    comment: [
      item.SourceName,
      item.DestinationName,
      item.Event,
      item.SourceID ? `ID ${item.SourceID}` : ''
    ]
      .filter(Boolean)
      .join(' / '),
    relayName: targetName || `BrandMeister TG${item.DestinationID || fmoConfig.bmTalkgroup}`,
    sourceLabel: 'BM网络',
    isSpeaking: item.Event === 'Session-Start',
    raw: item
  }
}

const upsertBmCandidate = (candidate) => {
  if (!candidate?.callsign) return
  const candidateTime = new Date(candidate.time).getTime()
  fmoCandidates.value = [
    candidate,
    ...fmoCandidates.value.filter((item) => {
      if (item.id === candidate.id || item.bmSessionId === candidate.bmSessionId) return false
      if (item.sourceLabel?.startsWith('BM') && item.callsign === candidate.callsign) {
        const itemTime = new Date(item.time).getTime()
        if (Number.isFinite(itemTime) && Number.isFinite(candidateTime)) {
          return Math.abs(candidateTime - itemTime) > 60 * 1000
        }
      }
      return true
    })
  ].slice(0, 20)
  syncControlTxFromTopCandidate()
}

const formatBmDeviceQth = (device, callsign = '') =>
  localizeBmQth([device.city, device.country].filter(Boolean).join(', '), callsign || device.callsign)

const enrichBmCandidate = async (candidate) => {
  const id = String(candidate?.sourceId || candidate?.raw?.SourceID || '').replace(/\D+/g, '')
  if (!id) return
  try {
    let device = bmDeviceCache.get(id)
    if (device === undefined) {
      const response = await fetch(serverApiPath(`/api/brandmeister/device?id=${encodeURIComponent(id)}`))
      const result = await response.json()
      device = result?.device || null
      bmDeviceCache.set(id, device)
    }
    if (!device) return
    const qth = formatBmDeviceQth(device, candidate.callsign)
    const next = {
      qth,
      device: [device.hardware, device.firmware].filter(Boolean).join(' / '),
      power: device.pep ? `${device.pep}W` : '',
      comment: [
        candidate.comment,
        device.website,
        device.lat && device.lng ? `${device.lat},${device.lng}` : ''
      ]
        .filter(Boolean)
        .join(' / ')
    }
    fmoCandidates.value = fmoCandidates.value.map((item) =>
      item.id === candidate.id
        ? {
            ...item,
            qth: item.qth || next.qth,
            device: item.device || next.device,
            power: item.power || next.power,
            comment: next.comment
          }
        : item
    )
  } catch (error) {
    console.warn('BM 设备资料读取失败:', id, error)
  }
}

const handleBmPacket = (packet, talkgroup) => {
  if (packet.startsWith('0')) {
    bmSocket.value?.send('40')
    return
  }
  if (packet === '2') {
    bmSocket.value?.send('3')
    return
  }
  if (packet.startsWith('40')) {
    bmSocket.value?.send(`42["join","dst_${talkgroup}"]`)
    bmSocket.value?.send(
      `42["searchMongo",${JSON.stringify({ query: `DestinationID = ${talkgroup}`, amount: 80 })}]`
    )
    currentRelayName.value = `BrandMeister TG${talkgroup}`
    fmoStatus.value = `BM 实时监听中 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
    return
  }
  if (!packet.startsWith('42')) return
  let eventPayload
  try {
    eventPayload = JSON.parse(packet.slice(2))
  } catch {
    return
  }
  if (eventPayload?.[0] !== 'mqtt') return
  let call
  try {
    call = JSON.parse(eventPayload?.[1]?.payload || '{}')
  } catch {
    return
  }
  if (String(call.DestinationID || '') !== talkgroup) return
  const candidate = normalizeBmQso(call, fmoCandidates.value.length, `BrandMeister TG${talkgroup}`)
  if (!candidate) return
  const isStartupHistory = eventPayload?.[1]?.topic === 'LH-Startup'
  candidate.sourceLabel = isStartupHistory ? 'BM最近通联' : 'BM实时'
  if (isStartupHistory) candidate.isSpeaking = false
  upsertBmCandidate(candidate)
  enrichBmCandidate(candidate)
  fmoStatus.value = `BM ${candidate.callsign} ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
}

const handleFmoEvent = (message) => {
  if (message?.type !== 'qso' || message?.subType !== 'callsign') return
  const data = message?.data || {}
  const now = Date.now()
  const callsign = normalizeCallsign(data.callsign || data.toCallsign || '')
  const relayName = firstValue(data.relayName, data.serverName, data.stationName)
  const isHost = !!data.isHost
  const eventName = String(data.Event || data.event || data.status || data.state || '').toLowerCase()
  const isStartEvent =
    data.isSpeaking === true ||
    data.speaking === true ||
    data.transmitting === true ||
    /start|begin|tx|transmit|talk|speaking/.test(eventName)
  if (relayName) currentRelayName.value = relayName

  if (isStartEvent && callsign) {
    const grid = firstValue(data.grid, data.toGrid, data.gridsquare)
    const qth = firstValue(data.qth, data.address, data.location)
    const previousHistory = fmoSpeakingHistory.value.map((item) =>
      item.endTime ? item : { ...item, endTime: now }
    )
    const withoutCurrent = previousHistory.filter((item) => item.callsign !== callsign)
    fmoSpeakingHistory.value = [
      {
        callsign,
        grid,
        qth,
        startTime: now,
        endTime: null,
        serverName: relayName || currentRelayName.value,
        serverUid: data.serverUid || data.uid || '',
        isHost
      },
      ...withoutCurrent
    ].slice(0, 40)
    currentLiveCallsign.value = callsign
    rebuildFmoCandidatesFromDashboardModel()
    fmoStatus.value = `实时 ${callsign}`
    return
  }

  const endedCallsign = callsign || currentLiveCallsign.value
  if (!endedCallsign) {
    fmoSpeakingHistory.value = fmoSpeakingHistory.value.map((item) =>
      item.endTime ? item : { ...item, endTime: now }
    )
    if (controlTxInfo.value?.isSpeaking && isSameCoreCallsign(currentLiveCallsign.value, controlTxInfo.value.callsign)) {
      stopControlTxSpeaking(formatTimestamp(Math.floor(now / 1000)))
    }
    currentLiveCallsign.value = ''
    rebuildFmoCandidatesFromDashboardModel()
    return
  }
  fmoSpeakingHistory.value = fmoSpeakingHistory.value.map((item) =>
    item.callsign === endedCallsign
      ? {
          ...item,
          endTime: item.endTime || now
        }
      : item
  )
  if (
    isSameCoreCallsign(endedCallsign, activityConfig.controlCallsign) ||
    isSameCoreCallsign(endedCallsign, controlTxInfo.value?.callsign) ||
    isHost
  ) {
    stopControlTxSpeaking(formatTimestamp(Math.floor(now / 1000)))
  }
  rebuildFmoCandidatesFromDashboardModel()
  if (currentLiveCallsign.value === endedCallsign) currentLiveCallsign.value = ''
}

const closeFmoClient = () => {
  if (bmSocket.value) {
    try {
      bmSocket.value.close()
    } catch {
      /* ignore close errors */
    }
    bmSocket.value = null
  }
  if (fmoEventsClient.value) {
    fmoEventsClient.value.close()
    fmoEventsClient.value = null
  }
  if (fmoClient.value) {
    fmoClient.value.close()
    fmoClient.value = null
  }
}

const nextMonitorRequestId = () => {
  monitorRequestId.value += 1
  return monitorRequestId.value
}

const isCurrentMonitorRequest = (requestId, source = fmoConfig.source) =>
  monitorRequestId.value === requestId && fmoConfig.source === source

const refreshCurrentRelayName = async (client = fmoClient.value) => {
  if (!client) return
  try {
    const current = await client.getCurrentStation()
    currentRelayName.value =
      current?.name || current?.relayName || current?.serverName || currentRelayName.value
  } catch (error) {
    console.warn('FMO 当前中继读取失败:', error)
  }
}

const getFmoEventSocketState = () => fmoEventsClient.value?.socket?.readyState

const hasActiveFmoEventsClient = () => {
  const state = getFmoEventSocketState()
  return state === WebSocket.OPEN || state === WebSocket.CONNECTING
}

const connectFmoEvents = async (host) => {
  if (fmoEventsClient.value) {
    const isSameTarget =
      fmoEventsClient.value.host === host && fmoEventsClient.value.protocol === fmoConfig.protocol
    if (isSameTarget) {
      await fmoEventsClient.value.connect()
      return fmoEventsClient.value
    }
    fmoEventsClient.value.close()
    fmoEventsClient.value = null
  }

  const eventsClient = new FmoEventsClient({
    host,
    protocol: fmoConfig.protocol,
    onEvent(message) {
      if (fmoConfig.source === 'fmo') handleFmoEvent(message)
    },
    onStatus(status) {
      if (fmoConfig.source !== 'fmo') return
      if (status === 'connected') {
        fmoStatus.value = currentLiveCallsign.value ? fmoStatus.value : '实时事件已连接'
      }
      if (status === 'reconnecting') fmoStatus.value = '实时事件重连中'
      if (status === 'disconnected') fmoStatus.value = '实时事件已断开'
    }
  })

  fmoEventsClient.value = eventsClient
  try {
    await eventsClient.connect()
    return eventsClient
  } catch (error) {
    if (fmoEventsClient.value === eventsClient) fmoEventsClient.value = null
    eventsClient.close()
    throw error
  }
}

const connectFmoApi = async (host) => {
  const isSameTarget =
    fmoClient.value?.host === host && fmoClient.value?.protocol === fmoConfig.protocol
  if (isSameTarget && fmoClient.value?.socket?.readyState === WebSocket.OPEN) return fmoClient.value
  if (fmoClient.value && !isSameTarget) {
    fmoClient.value.close()
    fmoClient.value = null
  }

  const apiClient = new FmoClient({ host, protocol: fmoConfig.protocol })
  await apiClient.connect()
  fmoClient.value = apiClient
  await refreshCurrentRelayName(apiClient)
  return apiClient
}

const showFmoApiFallbackNotice = (message) => {
  const now = Date.now()
  if (now - fmoApiWarningShownAt.value < 30000) return
  fmoApiWarningShownAt.value = now
  showNotice(message)
}

const connectFmo = async () => {
  const host = normalizeHost(fmoConfig.host)
  if (!isValidHostAddress(host)) {
    showNotice('请输入有效的 FMO 地址')
    return null
  }

  fmoStatus.value = '连接 FMO 实时事件'
  let eventsClient = null
  let eventError = null

  try {
    eventsClient = await connectFmoEvents(host)
  } catch (error) {
    eventError = error
    console.warn('FMO 实时事件不可用:', error)
    fmoStatus.value = '实时事件不可用'
  }

  try {
    const apiClient = await connectFmoApi(host)
    if (fmoConfig.source === 'fmo') {
      fmoStatus.value = `FMO 已连接 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
    }
    return apiClient
  } catch (error) {
    console.warn('FMO 控制接口不可用:', error)
    if (eventsClient || hasActiveFmoEventsClient()) {
      if (fmoConfig.source === 'fmo') {
        fmoStatus.value = `实时监听中 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
        showFmoApiFallbackNotice('FMO 控制接口超时，已使用实时监听')
      }
      return null
    }
    throw eventError || error
  }
}

const refreshFmoCandidates = async () => {
  if (publicNetworkWarning.value) {
    showNotice(publicNetworkWarning.value)
    fmoStatus.value = '当前网络环境不能直连 FMO'
    return
  }
  const host = normalizeHost(fmoConfig.host)
  if (!isValidHostAddress(host)) {
    showNotice('请输入有效的 FMO 地址')
    return
  }

  const requestId = nextMonitorRequestId()
  fmoRefreshing.value = true
  try {
    let client = fmoClient.value || (await connectFmo())
    if (!isCurrentMonitorRequest(requestId, 'fmo')) return
    if (client) await refreshCurrentRelayName(client)
    if (!isCurrentMonitorRequest(requestId, 'fmo')) return
    if (!currentLiveCallsign.value) {
      fmoStatus.value = `实时监听中 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
    }
  } catch (error) {
    console.error(error)
    closeFmoClient()
    fmoStatus.value = '连接失败'
    showNotice(error?.message || 'FMO 连接失败')
  } finally {
    if (isCurrentMonitorRequest(requestId, 'fmo')) fmoRefreshing.value = false
  }
}

const refreshMmdvmCandidates = async () => {
  if (publicNetworkWarning.value) {
    showNotice(publicNetworkWarning.value)
    fmoStatus.value = '当前网络环境不能直连 MMDVM'
    return
  }
  const host = normalizeHost(fmoConfig.mmdvmHost)
  if (!isValidHostAddress(host)) {
    showNotice('请输入有效的 MMDVM 地址')
    return
  }

  const requestId = nextMonitorRequestId()
  closeFmoClient()
  fmoRefreshing.value = true
  try {
    fmoStatus.value = '读取 MMDVM Last Heard'
    const result = await fetchMmdvmLastHeard(host)
    if (!isCurrentMonitorRequest(requestId, 'mmdvm')) return
    currentRelayName.value = result.target || result.rows[0]?.target || 'MMDVM Last Heard'
    fmoCandidates.value = result.rows
      .map((row, index) => normalizeMmdvmQso(row, index, result.target || result.rows[0]?.target))
      .filter(Boolean)
      .slice(0, 20)
    syncControlTxFromTopCandidate()
    fmoStatus.value = `MMDVM 已刷新 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
  } catch (error) {
    if (!isCurrentMonitorRequest(requestId, 'mmdvm')) return
    console.error(error)
    fmoStatus.value = 'MMDVM 读取失败'
    showNotice(error?.message || 'MMDVM 页面读取失败')
  } finally {
    if (isCurrentMonitorRequest(requestId, 'mmdvm')) fmoRefreshing.value = false
  }
}

const refreshHamboxCandidates = async () => {
  if (publicNetworkWarning.value) {
    showNotice(publicNetworkWarning.value)
    fmoStatus.value = '当前网络环境不能直连 HAMBOX'
    return
  }
  const host = normalizeHost(fmoConfig.hamboxHost)
  if (!isValidHostAddress(host)) {
    showNotice('请输入有效的 HAMBOX 地址')
    return
  }

  const requestId = nextMonitorRequestId()
  closeFmoClient()
  fmoRefreshing.value = true
  try {
    fmoStatus.value = '读取 HAMBOX Last Heard'
    const result = await fetchHamboxLastHeard(host)
    if (!isCurrentMonitorRequest(requestId, 'hambox')) return
    currentRelayName.value = result.target || 'HAMBOX'
    fmoCandidates.value = result.rows
      .map((row, index) => normalizeHamboxQso(row, index, result.target))
      .filter(Boolean)
      .slice(0, 20)
    syncControlTxFromTopCandidate()
    fmoStatus.value = `HAMBOX 已刷新 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
  } catch (error) {
    if (!isCurrentMonitorRequest(requestId, 'hambox')) return
    console.error(error)
    fmoStatus.value = 'HAMBOX 读取失败'
    showNotice(error?.message || 'HAMBOX 数据读取失败')
  } finally {
    if (isCurrentMonitorRequest(requestId, 'hambox')) fmoRefreshing.value = false
  }
}

const refreshBrandmeisterCandidates = async () => {
  const talkgroup = String(fmoConfig.bmTalkgroup || '').replace(/\D+/g, '')
  if (!talkgroup) {
    showNotice('请填写 BrandMeister 通话组 ID')
    return
  }

  const requestId = nextMonitorRequestId()
  closeFmoClient()
  fmoRefreshing.value = true
  fmoStatus.value = `连接 BM TG${talkgroup}`
  currentRelayName.value = `BrandMeister TG${talkgroup}`

  const socket = new WebSocket('wss://api.brandmeister.network/lh/socket.io/?EIO=4&transport=websocket')
  bmSocket.value = socket
  socket.addEventListener('open', () => {
    if (!isCurrentMonitorRequest(requestId, 'bm')) return
    fmoRefreshing.value = false
  })
  socket.addEventListener('message', (event) => {
    if (bmSocket.value !== socket || !isCurrentMonitorRequest(requestId, 'bm')) return
    handleBmPacket(String(event.data || ''), talkgroup)
  })
  socket.addEventListener('error', () => {
    if (bmSocket.value !== socket || !isCurrentMonitorRequest(requestId, 'bm')) return
    fmoRefreshing.value = false
    fmoStatus.value = 'BM 网络连接失败'
    showNotice('BM 网络连接失败，请稍后重试')
  })
  socket.addEventListener('close', () => {
    if (bmSocket.value !== socket || !isCurrentMonitorRequest(requestId, 'bm')) return
    bmSocket.value = null
    fmoRefreshing.value = false
    fmoStatus.value = 'BM 网络已断开'
  })
}

const refreshNetworkModePlaceholder = () => {
  const source = currentMonitorSource.value
  const target = activeMonitorAddress.value
  closeFmoClient()
  fmoCandidates.value = []
  fmoLogCandidates.value = []
  fmoSpeakingHistory.value = []
  currentLiveCallsign.value = ''
  currentRelayName.value = target ? `${source.label} ${target}` : source.label
  fmoStatus.value = `${source.label} 网络监听入口已添加，接口适配待接入`
  showNotice(`${source.label} 选项已添加，下一步接入网络监听接口`)
}

const refreshMonitorCandidates = () => {
  if (fmoConfig.source === 'bm') return refreshBrandmeisterCandidates()
  if (fmoConfig.source === 'mmdvm') return refreshMmdvmCandidates()
  if (fmoConfig.source === 'hambox') return refreshHamboxCandidates()
  if (currentMonitorSource.value.addressKind === 'network') return refreshNetworkModePlaceholder()
  return refreshFmoCandidates()
}

const startFmoAutoRefresh = () => {
  window.clearInterval(fmoRefreshTimer.value)
  if (!fmoConfig.autoRefresh || !activeMonitorAddress.value) return
  refreshMonitorCandidates()
  if (fmoConfig.source === 'bm' || currentMonitorSource.value.addressKind === 'network') return
  const refreshMs = fmoConfig.source === 'hambox' ? 3000 : fmoConfig.source === 'mmdvm' ? 8000 : 10000
  fmoRefreshTimer.value = window.setInterval(refreshMonitorCandidates, refreshMs)
}

const resetMonitorRuntimeState = () => {
  window.clearInterval(fmoRefreshTimer.value)
  closeFmoClient()
  fmoRefreshing.value = false
  fmoCandidates.value = []
  fmoLogCandidates.value = []
  fmoSpeakingHistory.value = []
  controlTxInfo.value = null
  lastTopControlCandidateKey.value = ''
  currentLiveCallsign.value = ''
}

const restartMonitor = ({ immediate = false } = {}) => {
  nextMonitorRequestId()
  window.clearTimeout(monitorRestartTimer.value)
  const run = () => {
    resetMonitorRuntimeState()
    currentRelayName.value =
      fmoConfig.source === 'mmdvm'
        ? 'MMDVM Last Heard'
        : fmoConfig.source === 'hambox'
          ? 'HAMBOX Last Heard'
        : fmoConfig.source === 'bm'
          ? `BrandMeister TG${fmoConfig.bmTalkgroup || ''}`
          : currentMonitorSource.value.addressKind === 'network'
            ? currentMonitorSource.value.label
            : '当前中继/服务器'
    startFmoAutoRefresh()
  }
  if (immediate) {
    run()
    return
  }
  monitorRestartTimer.value = window.setTimeout(run, 150)
}

const changeMonitorSource = (event) => {
  const nextSource = event.target.value
  const oldSource = previousMonitorSource.value
  if (nextSource === oldSource) return
  const hasStarted = records.value.length > 0 || fmoConfig.autoRefresh || fmoCandidates.value.length > 0
  if (hasStarted) {
    showNotice('点名活动进行中已切换监听源，当前候选将重新连接获取', 'top')
  }
  nextMonitorRequestId()
  resetMonitorRuntimeState()
  fmoConfig.source = nextSource
  previousMonitorSource.value = nextSource
}

const submitRecord = () => {
  if (!editingId.value && !assertPublicWebAllowed('add-record')) return
  const callsign = buildRecordCallsign()
  if (!callsign) {
    showNotice('请先填写呼号')
    return
  }

  const payload = {
    ...form,
    callsign,
    time: editingId.value ? form.time || nowForInput() : nowForInput(),
    activityName: activityConfig.name,
    controlCallsign: normalizeCallsign(activityConfig.controlCallsign),
    controlQth: activityConfig.controlQth,
    controlDevice: activityConfig.controlDevice,
    controlAntenna: activityConfig.controlAntenna,
    updatedAt: new Date().toISOString()
  }

  if (editingId.value) {
    records.value = records.value.map((record) =>
      record.id === editingId.value ? { ...record, ...payload } : record
    )
    showNotice('记录已更新')
  } else {
    records.value = [
      ...records.value,
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...payload
      }
    ]
    showNotice('已加入点名记录')
  }

  updateProfile(payload)
  resetForm()
}

const fillDraftFromRecord = (target, record) => {
  const callsignParts = splitRecordCallsign(record.callsign)
  Object.assign(target, {
    prefix: callsignParts.prefix,
    callsign: callsignParts.callsign,
    time: record.time || nowForInput(),
    qth: record.qth || '',
    device: record.device || '',
    antenna: record.antenna || '',
    power: record.power || '',
    mode: record.mode || 'FM',
    signal: record.signal || '',
    remarks: record.remarks || ''
  })
}

const editRecord = (record) => {
  fillDraftFromRecord(form, record)
  editingId.value = record.id
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const openRecordEditor = (record) => {
  editingRecordId.value = record.id
  fillDraftFromRecord(editDraft, record)
  recordEditorOpen.value = true
}

const closeRecordEditor = () => {
  recordEditorOpen.value = false
  editingRecordId.value = ''
}

const saveRecordEditor = () => {
  const callsign = buildCallsignFromParts(editDraft.prefix, editDraft.callsign)
  if (!callsign) {
    showNotice('请填写呼号')
    return
  }
  const existing = records.value.find((record) => record.id === editingRecordId.value)
  if (!existing) {
    closeRecordEditor()
    return
  }
  const payload = {
    ...existing,
    callsign,
    time: editDraft.time || existing.time || nowForInput(),
    qth: editDraft.qth,
    device: editDraft.device,
    antenna: editDraft.antenna,
    power: editDraft.power,
    mode: editDraft.mode,
    signal: editDraft.signal,
    remarks: editDraft.remarks,
    updatedAt: new Date().toISOString()
  }
  records.value = records.value.map((record) =>
    record.id === editingRecordId.value ? payload : record
  )
  updateProfile(payload)
  closeRecordEditor()
  showNotice('记录已修改')
}

const removeRecord = (id) => {
  records.value = records.value.filter((record) => record.id !== id)
  selectedRecordIds.value = selectedRecordIds.value.filter((recordId) => recordId !== id)
  if (editingId.value === id) resetForm()
  if (editingRecordId.value === id) closeRecordEditor()
  showNotice('记录已删除')
}

const toggleAllFilteredRecords = () => {
  if (allFilteredSelected.value) {
    const filteredIds = new Set(filteredRecords.value.map((record) => record.id))
    selectedRecordIds.value = selectedRecordIds.value.filter((id) => !filteredIds.has(id))
    return
  }
  selectedRecordIds.value = [
    ...new Set([...selectedRecordIds.value, ...filteredRecords.value.map((record) => record.id)])
  ]
}

const removeSelectedRecords = () => {
  if (!selectedRecordIds.value.length) return
  const selected = new Set(selectedRecordIds.value)
  records.value = records.value.filter((record) => !selected.has(record.id))
  selectedRecordIds.value = []
  showNotice('已删除选中记录')
}

const clearAll = () => {
  if (!records.value.length) return
  const confirmed = window.confirm('确认清空本次点名记录？建议先导出 Excel 或 JSON 备份。')
  if (!confirmed) return
  records.value = []
  resetForm()
  showNotice('已清空记录')
}

const openSerialEditor = () => {
  serialEditorDraft.value = String(displayedRecordedCount.value)
  serialEditorOpen.value = true
}

const closeSerialEditor = () => {
  serialEditorOpen.value = false
}

const applySerialEditor = () => {
  const recordedCount = Number.parseInt(String(serialEditorDraft.value).trim(), 10)
  if (!Number.isInteger(recordedCount) || recordedCount < 0) {
    showNotice('已记录数量需要填写 0 或正整数')
    return
  }
  activityConfig.serialStart = Math.max(1, recordedCount - sortedRecords.value.length + 1)
  closeSerialEditor()
  showNotice(`下一条记录序号将从 ${nextRecordSerial.value} 开始`)
}

const makeRows = () =>
  sortedRecords.value.map((record, index) => ({
    序号: recordSerialStart.value + index,
    呼号: record.callsign,
    QTH: record.qth,
    设备: record.device,
    天线: record.antenna,
    功率: record.power,
    方式: record.mode || record.remarks,
    '通联时间 (BJT)': formatClock(record.time)
  }))

const getExportTimeRange = () => {
  if (!sortedRecords.value.length) return ''
  const first = formatClock(sortedRecords.value[0].time)
  const last = formatClock(sortedRecords.value.at(-1).time)
  return first && last ? `${first}--${last}` : first || last
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const downloadBlob = (blob, filename) => {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

const getExcelFilename = () => {
  const exportTitle = activityConfig.name || getDefaultActivityName()
  const safeTitle = String(exportTitle).replace(/[\\\\/:*?"<>|\\s]+/g, '').slice(0, 40)
  return `${safeTitle || 'HAM台网点名记录'}.xlsx`
}

const buildExcelWorkbook = () => {
  const rows = makeRows()
  const headers = ['序号', '呼号', 'QTH', '设备', '天线', '功率', '方式', '通联时间 (BJT)']
  const exportTitle = activityConfig.name || getDefaultActivityName()
  const exportTimeRange = getExportTimeRange()
  const controlCallsign = normalizeCallsign(activityConfig.controlCallsign)
  const controlPower = activityConfig.controlPower || ''
  const controlLine = [
    controlCallsign,
    activityConfig.controlQth,
    activityConfig.controlDevice,
    activityConfig.controlAntenna,
    controlPower,
    exportTimeRange
  ]
    .filter(Boolean)
    .join('  ')

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'HAM台网点名主控台'
  workbook.created = new Date()
  const worksheet = workbook.addWorksheet('台网日志', {
    views: [{ showGridLines: true }]
  })
  worksheet.columns = [
    { key: 'sn', width: 8 },
    { key: 'callsign', width: 15 },
    { key: 'qth', width: 25 },
    { key: 'device', width: 24 },
    { key: 'antenna', width: 16 },
    { key: 'power', width: 8 },
    { key: 'mode', width: 11 },
    { key: 'time', width: 18 }
  ]
  worksheet.mergeCells('A1:H1')
  worksheet.mergeCells('A2:H2')
  worksheet.getCell('A1').value = exportTitle
  worksheet.getCell('A2').value = controlLine
  worksheet.addRow(headers)
  worksheet.addRow([
    '主控',
    controlCallsign,
    activityConfig.controlQth,
    activityConfig.controlDevice,
    activityConfig.controlAntenna,
    controlPower,
    '',
    exportTimeRange
  ])
  rows.forEach((row) => {
    worksheet.addRow(headers.map((header) => row[header] || ''))
  })
  worksheet.addRow(['本日志由 HAM台网点名主控台 自动生成，技术支持BH1JSS'])
  worksheet.mergeCells(`A${worksheet.rowCount}:H${worksheet.rowCount}`)

  const thinBorder = { style: 'thin', color: { argb: 'FF000000' } }
  worksheet.eachRow((row, rowNumber) => {
    row.height = rowNumber === 1 ? 30 : 21
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.numFmt = '@'
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.font = {
        name: 'Microsoft YaHei',
        size: rowNumber === 1 ? 18 : 11,
        bold: rowNumber === 1 || rowNumber === 3 || rowNumber === 4
      }
      if (rowNumber >= 3 && rowNumber < worksheet.rowCount) {
        cell.border = {
          top: thinBorder,
          left: thinBorder,
          bottom: thinBorder,
          right: thinBorder
        }
      }
      if (rowNumber === 3) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
      }
      if (rowNumber === 4) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
      }
    })
  })
  worksheet.getCell('A2').alignment = { horizontal: 'right', vertical: 'middle' }
  const foot = worksheet.getRow(worksheet.rowCount)
  foot.getCell(1).font = {
    name: 'Microsoft YaHei',
    size: 10,
    italic: true,
    color: { argb: 'FF008000' }
  }
  foot.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' }
  return workbook
}

const createExcelBlob = async () => {
  const buffer = await buildExcelWorkbook().xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

const exportExcel = async () => {
  if (!assertPublicWebAllowed('download')) return
  downloadBlob(await createExcelBlob(), getExcelFilename())
  if (isPublicWebVersion.value) {
    publicSession.downloads += 1
    persistPublicSession()
  }
  showNotice('Excel 已导出')
}

const writeBlobToHandle = async (handle, blob) => {
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

const saveLocalExcelFile = async ({ silent = false, allowPicker = true } = {}) => {
  if (!allowPicker && !excelFileHandle.value) return false
  const blob = await createExcelBlob()
  const filename = getExcelFilename()
  if (window.showSaveFilePicker) {
    if (!excelFileHandle.value) {
      if (!allowPicker) return false
      excelFileHandle.value = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Excel 表格',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
            }
          }
        ]
      })
    }
    await writeBlobToHandle(excelFileHandle.value, blob)
    return true
  }
  if (!allowPicker) return false
  if (isPublicWebVersion.value && !assertPublicWebAllowed('download')) return false
  downloadBlob(blob, filename)
  if (isPublicWebVersion.value) {
    publicSession.downloads += 1
    persistPublicSession()
  }
  if (!silent) showNotice('浏览器已下载点名表格')
  return true
}

const saveCheckinToServer = async ({ silent = false } = {}) => {
  if (!assertPublicWebAllowed('save')) throw new Error('网络版测试限制')
  const response = await fetch(serverApiPath('/api/checkins'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      activityId: currentActivityId.value || 'default',
      activityConfig,
      records: records.value,
      profileStats: getProfileStatsSnapshot(),
      client: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        savedAt: new Date().toISOString()
      }
    })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error || `服务器保存失败：HTTP ${response.status}`)
  if (!data?.ok) throw new Error(data?.error || '服务器保存失败')
  if (isPublicWebVersion.value) {
    publicSession.activityId = currentActivityId.value || 'default'
    persistPublicSession()
  }
  serverSaveAvailable.value = true
  autoSaveEnabled.value = true
  if (!silent) showNotice(`服务器已保存 ${data.recordCount ?? records.value.length} 条记录`)
  return data
}

const saveExcelFile = async ({ silent = false, allowPicker = true } = {}) => {
  if (excelSaving.value) return
  if (!allowPicker && !excelFileHandle.value && !serverSaveAvailable.value) return
  excelSaving.value = true
  let serverSaved = false
  let localSaved = false
  try {
    try {
      await saveCheckinToServer({ silent })
      serverSaved = true
    } catch (serverError) {
      if (isPublicWebVersion.value) throw serverError
      if (serverSaveAvailable.value || silent || !allowPicker) throw serverError
    }

    try {
      localSaved = await saveLocalExcelFile({ silent, allowPicker })
    } catch (localError) {
      if (!serverSaved || localError?.name !== 'AbortError') throw localError
    }
    if (!silent) autoSaveEnabled.value = true
    if (!silent && serverSaved && localSaved) showNotice('服务器与本地 Excel 已保存')
    else if (!silent && serverSaved) showNotice('服务器已保存')
    else if (!silent && localSaved) showNotice('本地 Excel 已保存')
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error(error)
      showNotice(error?.message || '保存失败，请重试')
    }
    throw error
  } finally {
    excelSaving.value = false
  }
}

const openUserManual = () => {
  window.open(userManualUrl.value, '_blank', 'noopener,noreferrer')
}

const toggleLanguage = () => {
  language.value = language.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem(LANGUAGE_KEY, language.value)
  showNotice(t('languageNotice'), 'top')
}

const scheduleAutoSave = () => {
  window.clearTimeout(autoSaveTimer.value)
  if (!autoSaveEnabled.value || (!excelFileHandle.value && !serverSaveAvailable.value)) return
  autoSaveTimer.value = window.setTimeout(() => {
    saveExcelFile({ silent: true, allowPicker: false }).catch(() => {
      autoSaveEnabled.value = false
    })
  }, 900)
}

const toggleAutoSave = async () => {
  if (!autoSaveEnabled.value) {
    window.clearTimeout(autoSaveTimer.value)
    return
  }
  try {
    await saveExcelFile({ allowPicker: true })
  } catch {
    autoSaveEnabled.value = false
  }
}

const createNewActivity = () => {
  if (!assertPublicWebAllowed('new-activity')) return
  if (
    records.value.length &&
    !window.confirm('当前点名记录会保留在本地历史中。是否新建一个空白点名日志？')
  ) {
    return
  }

  const nextActivityId = crypto.randomUUID()
  currentActivityId.value = nextActivityId
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set('activity', nextActivityId)
  window.history.replaceState(null, '', nextUrl.toString())

  records.value = []
  selectedRecordIds.value = []
  searchText.value = ''
  excelFileHandle.value = null
  serverSaveAvailable.value = false
  autoSaveEnabled.value = false
  window.clearTimeout(autoSaveTimer.value)
  resetForm()
  Object.assign(activityConfig, {
    ...activityConfig,
    name: getDefaultActivityName(),
    serialStart: 1
  })
  persist()
  persistActivityConfig()
  showNotice('已新建空白点名日志')
}

const exportJson = () => {
  if (!records.value.length) {
    showNotice('暂无记录可备份')
    return
  }
  const blob = new Blob([JSON.stringify(records.value, null, 2)], {
    type: 'application/json;charset=utf-8'
  })
  downloadBlob(blob, `HAM台网点名备份-${new Date().toISOString().slice(0, 10)}.json`)
  showNotice('JSON 备份已导出')
}

const importJson = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const imported = JSON.parse(text)
    if (!Array.isArray(imported)) throw new Error('invalid')
    const normalized = imported.map((record) => ({
      ...emptyForm(),
      ...record,
      id: record.id || crypto.randomUUID(),
      callsign: normalizeCallsign(record.callsign || ''),
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }))
    records.value = normalized.filter((record) => record.callsign)
    mergeProfiles(records.value.map((record) => ({ ...record, lastCheckinAt: record.time })))
    markProfileDirty(records.value.map((record) => record.callsign))
    scheduleSharedProfileSync()
    showNotice('JSON 备份已导入')
  } catch {
    showNotice('导入失败，请确认是本软件导出的 JSON 文件')
  } finally {
    event.target.value = ''
  }
}

const tableRows = (db, tableName) => {
  const exists = db.exec(`select name from sqlite_master where type='table' and name='${tableName}'`)
  if (!exists.length || !exists[0].values.length) return []
  const result = db.exec(`select * from ${tableName}`)
  if (!result.length) return []
  const columns = result[0].columns
  return result[0].values.map((values) =>
    Object.fromEntries(columns.map((column, index) => [column, values[index]]))
  )
}

const importDb3 = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl })
    const buffer = await file.arrayBuffer()
    const db = new SQL.Database(new Uint8Array(buffer))
    const qsoRows = tableRows(db, 'qsolog')
    const qthRows = tableRows(db, 'qth')
    const importedRecords = qsoRows
      .sort((a, b) => Number(a.ID || 0) - Number(b.ID || 0))
      .map((row) => {
      const rx = row.rst || ''
      const tx = row.rst1 || ''
      const signal = rx || tx ? `RX ${rx || '-'} / TX ${tx || '-'}` : ''
      return {
        id: `legacy-${file.name}-${row.ID || crypto.randomUUID()}`,
        callsign: normalizeCallsign(row.callsign || ''),
        operatorName: '',
        time: parseLegacyTime(row.qsotime),
        qth: row.qth || '',
        device: row.rig || '',
        antenna: row.ant || '',
        power: row.power || '',
        frequency: row.freq || '',
        mode: row.modal || '',
        signal,
        remarks: [row.linetype, row.lineother, row.op ? `主控 ${row.op}` : '', row.fwq].filter(Boolean).join(' / '),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    })

    const qthProfiles = qthRows.map((row) => ({
      callsign: normalizeCallsign(row.callsign || ''),
      qth: row.qth || '',
      updatedAt: new Date().toISOString()
    }))
    const recordProfiles = importedRecords.map((record) => ({
      ...record,
      lastCheckinAt: record.time
    }))

    const profileEntries = [...qthProfiles, ...recordProfiles].filter((profile) => profile.callsign)
    mergeProfiles(profileEntries)
    markProfileDirty(profileEntries.map((profile) => profile.callsign))
    scheduleSharedProfileSync()
    db.close()
    const callsignCount = new Set(profileEntries.map((profile) => profile.callsign).filter(Boolean)).size
    showNotice(`已导入 ${importedRecords.length} 条旧库资料，更新 ${callsignCount} 个呼号画像`)
  } catch (error) {
    console.error(error)
    showNotice('DB3 导入失败，请确认是该点名软件的数据库文件')
  } finally {
    event.target.value = ''
  }
}

watch(
  records,
  () => {
    persist()
    scheduleAutoSave()
  },
  { deep: true }
)
watch(profiles, persistProfiles, { deep: true })
watch(profileSyncConfig, persistProfileSyncConfig, { deep: true })
watch(fmoConfig, persistFmoConfig, { deep: true })
watch(
  activityConfig,
  () => {
    persistActivityConfig()
    scheduleAutoSave()
  },
  { deep: true }
)
watch(
  () => activityConfig.controlCallsign,
  () => {
    controlTxInfo.value = null
    lastTopControlCandidateKey.value = ''
  }
)
watch(
  () => fmoConfig.host,
  (host) => {
    if (!/^(wss?|https?):\/\//i.test(String(host || ''))) return
    const nextProtocol = getProtocolFromAddress(host, fmoConfig.protocol)
    if (nextProtocol !== fmoConfig.protocol) fmoConfig.protocol = nextProtocol
  }
)
watch(
  () => [
    fmoConfig.source,
    fmoConfig.host,
    fmoConfig.mmdvmHost,
    fmoConfig.hamboxHost,
    fmoConfig.bmTalkgroup,
    fmoConfig.networkTarget,
    fmoConfig.protocol,
    fmoConfig.autoRefresh,
    fmoConfig.fromCallsign
  ],
  ([source], [previousSource] = []) => {
    if ((source === 'mmdvm' || source === 'hambox' || source === 'bm') && !fmoConfig.autoRefresh) {
      fmoConfig.autoRefresh = true
      return
    }
    window.clearInterval(fmoRefreshTimer.value)
    closeFmoClient()
    restartMonitor({ immediate: Boolean(previousSource && source !== previousSource) })
  }
)
watch(
  currentProfile,
  (profile) => {
    if (editingId.value) return
    applyProfile(profile)
  }
)
watch(
  () => [form.prefix, form.callsign, profileParticipationCount.value],
  () => {
    if (editingId.value) return
    if (!form.callsign) {
      if (form.remarks === FIRST_TIME_REMARK) form.remarks = ''
      return
    }
    if (!profileParticipationCount.value && !currentProfile.value) {
      if (!form.remarks) form.remarks = FIRST_TIME_REMARK
      return
    }
    if (form.remarks === FIRST_TIME_REMARK) form.remarks = ''
  }
)

onMounted(() => {
  loadPublicSession()
  loadRecords()
  loadProfileSyncConfig()
  loadDirtyProfiles()
  loadProfiles()
  enableLocalBaseProfilesForTesting()
  if (!isLocalProfileTestMode() && profileSyncConfig.enabled) syncSharedProfiles({ silent: true })
  loadFmoConfig()
  loadActivityConfig()
  publicSessionTimer.value = window.setInterval(() => {
    if (isPublicWebVersion.value) publicElapsedMs.value = Date.now() - publicSession.startedAt
  }, 1000)
  profileSyncTimer.value = window.setInterval(() => {
    if (profileSyncConfig.enabled) syncSharedProfiles({ silent: true })
  }, 10 * 60 * 1000)
  systemClockTimer.value = window.setInterval(() => {
    systemClock.value = new Date()
  }, 1000)
  startFmoAutoRefresh()
})

onUnmounted(() => {
  window.clearInterval(fmoRefreshTimer.value)
  window.clearInterval(publicSessionTimer.value)
  window.clearInterval(profileSyncTimer.value)
  window.clearTimeout(monitorRestartTimer.value)
  window.clearTimeout(controlTxClearTimer.value)
  window.clearTimeout(autoSaveTimer.value)
  window.clearTimeout(profileSyncDebounceTimer.value)
  window.clearInterval(systemClockTimer.value)
  closeFmoClient()
})
</script>

<template>
  <main class="app-shell" :class="{ 'has-public-bar': isPublicWebVersion }">
    <div v-if="isPublicWebVersion" class="public-limit-bar">
      <span>{{ publicWebLimitText }}</span>
      <button type="button" @click="authorQrOpen = true">{{ t('localVersionContact') }}</button>
    </div>
    <section class="activity-band">
      <div class="brand-block">
        <div class="brand-mark" aria-hidden="true">
          <Radio :size="26" />
        </div>
        <div>
          <p class="eyebrow">HAM Net Check-in</p>
          <h1>{{ t('appTitle') }}</h1>
          <p class="system-clock">{{ formatSystemClock(systemClock) }}</p>
        </div>
      </div>

      <button
        type="button"
        class="record-counter"
        :title="t('setRecordedTitle')"
        @click="openSerialEditor"
      >
        <span>{{ t('recorded') }}</span>
        <strong>{{ displayedRecordedCount }}</strong>
        <em>{{ t('nextRecord') }} {{ nextRecordSerial }}</em>
      </button>

      <div class="activity-fields">
        <label class="field">
          <span>{{ t('activityName') }}</span>
          <input v-model="activityConfig.name" />
        </label>
        <label class="field">
          <span>{{ t('controlCallsign') }}</span>
          <input v-model="activityConfig.controlCallsign" placeholder="BH1JSS" />
        </label>
        <label class="field">
          <span>{{ t('controlQth') }}</span>
          <input v-model="activityConfig.controlQth" :placeholder="t('controlQthPlaceholder')" />
        </label>
        <label class="field">
          <span>{{ t('controlDevice') }}</span>
          <input v-model="activityConfig.controlDevice" :placeholder="t('controlDevicePlaceholder')" />
        </label>
        <label class="field">
          <span>{{ t('controlAntenna') }}</span>
          <input v-model="activityConfig.controlAntenna" :placeholder="t('controlAntennaPlaceholder')" />
        </label>
        <label class="field">
          <span>{{ t('controlPower') }}</span>
          <input v-model="activityConfig.controlPower" :placeholder="t('controlPowerPlaceholder')" />
        </label>
      </div>

      <div class="activity-actions">
        <div class="corner-actions" :aria-label="t('switchLanguage')">
          <button
            type="button"
            class="corner-button manual-button"
            :title="t('openManual')"
            :aria-label="t('openManual')"
            @click="openUserManual"
          >
            <BookOpen :size="17" />
          </button>
          <button
            type="button"
            class="corner-button language-button"
            :title="t('switchLanguage')"
            :aria-label="t('switchLanguage')"
            @click="toggleLanguage"
          >
            <Languages :size="17" />
          </button>
        </div>
        <button
          type="button"
          class="tool-button"
          :disabled="excelSaving"
          :title="t('saveCurrent')"
          @click="saveExcelFile()"
        >
          <Save :size="18" />
          <span>{{ excelSaving ? t('saving') : t('save') }}</span>
        </button>
        <label class="autosave-toggle">
          <input v-model="autoSaveEnabled" type="checkbox" @change="toggleAutoSave" />
          <span>{{ t('autoSave') }}</span>
        </label>
        <button type="button" class="tool-button" :title="t('newActivity')" @click="createNewActivity">
          <FilePlus2 :size="18" />
          <span>{{ t('newActivity') }}</span>
        </button>
      </div>
    </section>

    <section class="workspace-grid">
      <section class="left-workbench">
        <form class="entry-panel" @submit.prevent="submitRecord">
          <div v-if="editingId" class="panel-heading">
            <h2>{{ t('editRecord') }}</h2>
            <button v-if="editingId" type="button" class="icon-button" :title="t('cancelEdit')" @click="resetForm">
              <RotateCcw :size="18" />
            </button>
          </div>

          <div class="callsign-row">
            <label class="field prefix-field">
              <span>{{ t('prefix') }}</span>
              <div class="clearable-input">
                <input
                  v-model="form.prefix"
                  autocomplete="off"
                  :placeholder="t('number')"
                  inputmode="numeric"
                  @input="handleCallsignInput($event, form, 'prefix')"
                  @compositionend="handleCallsignCompositionEnd(form, 'prefix')"
                  @blur="form.prefix = normalizePrefix(form.prefix)"
                />
                <button
                  type="button"
                  class="input-clear-button"
                  :disabled="!form.prefix"
                  :title="t('clearPrefix')"
                  @click="clearField(form, 'prefix')"
                >
                  X
                </button>
              </div>
            </label>
            <label class="field call-field">
              <span>{{ t('callsignRequired') }}</span>
              <div class="clearable-input">
                <input
                  v-model="form.callsign"
                  list="callsign-options"
                  placeholder="BH1ABC"
                  autocomplete="off"
                  autocapitalize="characters"
                  spellcheck="false"
                  @input="handleCallsignInput($event, form, 'callsign')"
                  @compositionend="handleCallsignCompositionEnd(form, 'callsign')"
                />
                <button
                  type="button"
                  class="input-clear-button"
                  :disabled="!form.callsign"
                  :title="t('clearCallsign')"
                  @click="clearCallsignField(form)"
                >
                  X
                </button>
              </div>
              <datalist id="callsign-options">
                <option v-for="callsign in callsignSuggestions" :key="callsign" :value="callsign" />
              </datalist>
            </label>
            <div class="entry-sync-row">
              <label class="profile-sync-control">
                <input v-model="profileSyncConfig.enabled" type="checkbox" @change="toggleProfileSync" />
                <span>{{ profileSyncLabel }}</span>
              </label>
              <button
                type="button"
                class="profile-sync-button"
                :disabled="profileSyncBusy || !profileSyncConfig.enabled || !hasProfileSyncRegistration"
                @click="syncSharedProfiles({ silent: false })"
              >
                {{ profileSyncBusy ? t('syncing') : t('sync') }}
              </button>
              <button
                type="button"
                class="profile-sync-button profile-register-button"
                @click="profileRegistrationOpen = true"
              >
                {{ t('register') }}
              </button>
              <span v-if="profileSyncStatus" class="profile-sync-status">{{ profileSyncStatus }}</span>
            </div>
          </div>

        <div class="inline-featured-grid">
          <button
            v-for="candidate in featuredFmoCandidates"
            :key="candidate.id"
            type="button"
            class="inline-featured-card"
            :class="{ live: candidate.isSpeaking }"
            @click="chooseFmoCandidate(candidate)"
          >
            <strong>{{ candidate.callsign }}</strong>
            <span>{{ candidate.qth || candidate.grid || '-' }}</span>
          </button>
          <div v-if="!featuredFmoCandidates.length" class="inline-featured-empty">{{ t('waitingConfirm') }}</div>
        </div>

          <div class="status-lines">
            <p v-if="recordStatusText">{{ recordStatusText }}</p>
          </div>

          <div class="field-row">
            <label class="field">
              <span>QTH</span>
              <div class="clearable-input">
                <input v-model="form.qth" list="qth-options" :placeholder="t('qthPlaceholder')" />
                <button
                  type="button"
                  class="input-clear-button"
                  :disabled="!form.qth"
                  :title="`${t('clearField')} QTH`"
                  @click="clearField(form, 'qth')"
                >
                  X
                </button>
              </div>
            </label>
            <label class="field">
              <span>{{ t('deviceName') }}</span>
              <div class="clearable-input">
                <input v-model="form.device" list="device-options" :placeholder="t('devicePlaceholder')" />
                <button
                  type="button"
                  class="input-clear-button"
                  :disabled="!form.device"
                  :title="`${t('clearField')} ${t('device')}`"
                  @click="clearField(form, 'device')"
                >
                  X
                </button>
              </div>
            </label>
          </div>
          <datalist id="qth-options">
            <option v-for="value in searchableKnownValues.qth" :key="value" :value="value" />
          </datalist>
          <datalist id="device-options">
            <option v-for="value in searchableKnownValues.device" :key="value" :value="value" />
          </datalist>
          <div class="field-row compact">
            <label class="field">
              <span>{{ t('mode') }}</span>
              <div class="clearable-input">
                <input v-model="form.mode" list="mode-options" placeholder="FM / DMR" />
                <button
                  type="button"
                  class="input-clear-button"
                  :disabled="!form.mode"
                  :title="`${t('clearField')} ${t('mode')}`"
                  @click="clearField(form, 'mode')"
                >
                  X
                </button>
              </div>
            </label>
            <label class="field">
              <span>{{ t('power') }}</span>
              <div class="clearable-input">
                <input v-model="form.power" list="power-options" placeholder="L / 25W" />
                <button
                  type="button"
                  class="input-clear-button"
                  :disabled="!form.power"
                  :title="`${t('clearField')} ${t('power')}`"
                  @click="clearField(form, 'power')"
                >
                  X
                </button>
              </div>
            </label>
            <label class="field">
              <span>{{ t('signal') }}</span>
              <div class="clearable-input">
                <input v-model="form.signal" list="signal-options" placeholder="59" />
                <button
                  type="button"
                  class="input-clear-button"
                  :disabled="!form.signal"
                  :title="`${t('clearField')} ${t('signal')}`"
                  @click="clearField(form, 'signal')"
                >
                  X
                </button>
              </div>
            </label>
          </div>
          <datalist id="mode-options">
            <option v-for="value in [...new Set([...searchableKnownValues.mode, ...modeOptions])]" :key="value" :value="value" />
          </datalist>
          <datalist id="power-options">
            <option v-for="value in searchableKnownValues.power" :key="value" :value="value" />
          </datalist>
          <datalist id="signal-options">
            <option v-for="value in searchableKnownValues.signal" :key="value" :value="value" />
          </datalist>
          <div class="remark-action-row">
            <label class="field">
              <span>{{ t('antenna') }}</span>
              <div class="clearable-input">
                <input v-model="form.antenna" list="antenna-options" :placeholder="t('antennaPlaceholder')" />
                <button
                  type="button"
                  class="input-clear-button"
                  :disabled="!form.antenna"
                  :title="`${t('clearField')} ${t('antenna')}`"
                  @click="clearField(form, 'antenna')"
                >
                  X
                </button>
              </div>
            </label>
            <datalist id="antenna-options">
              <option v-for="value in searchableKnownValues.antenna" :key="value" :value="value" />
            </datalist>
            <label class="field">
              <span>{{ t('remarks') }}</span>
              <div class="clearable-input">
                <input v-model="form.remarks" :placeholder="t('remarksPlaceholder')" />
                <button
                  type="button"
                  class="input-clear-button"
                  :disabled="!form.remarks"
                  :title="`${t('clearField')} ${t('remarks')}`"
                  @click="clearField(form, 'remarks')"
                >
                  X
                </button>
              </div>
            </label>
            <button class="primary-action" type="submit">
              <Save v-if="editingId" :size="18" />
              <Plus v-else :size="18" />
              {{ editingId ? t('saveChanges') : t('addRecord') }}
            </button>
          </div>
        </form>

        <section class="log-panel">
          <div class="toolbar">
            <label class="search-box">
              <Search :size="18" />
              <input v-model="searchText" :placeholder="t('searchRecords')" />
              <button
                type="button"
                class="input-clear-button search-clear-button"
                :disabled="!searchText"
                :title="t('clearSearch')"
                @click="searchText = ''"
              >
                X
              </button>
            </label>
            <div class="toolbar-actions">
              <button type="button" class="tool-button" :title="t('exportExcel')" @click="exportExcel">
                <FileSpreadsheet :size="18" />
                <span>Excel</span>
              </button>
              <button type="button" class="tool-button" :title="t('selectAll')" @click="toggleAllFilteredRecords">
                <span>{{ allFilteredSelected ? t('cancelSelect') : t('selectAll') }}</span>
              </button>
              <button type="button" class="icon-button danger" :title="t('deleteSelected')" @click="removeSelectedRecords">
                <Trash2 :size="18" />
              </button>
              <input ref="fileInput" class="hidden-input" type="file" accept="application/json" @change="importJson" />
              <input ref="dbFileInput" class="hidden-input" type="file" accept=".db3,.sqlite,.sqlite3" @change="importDb3" />
              <input
                ref="profileKeyFileInput"
                class="hidden-input"
                type="file"
                accept="application/json,.json"
                @change="importProfileKey"
              />
            </div>
          </div>

          <div class="table-wrap log-table-wrap">
            <table class="log-table">
              <colgroup>
                <col class="serial-col" />
                <col class="callsign-col" />
                <col class="time-col" />
                <col class="qth-col" />
                <col class="device-col" />
                <col class="antenna-col" />
                <col class="power-col" />
                <col class="mode-col" />
                <col class="select-col" />
              </colgroup>
              <thead>
                <tr>
                  <th>{{ t('serial') }}</th>
                  <th>{{ t('callsign') }}</th>
                  <th>{{ t('time') }}</th>
                  <th>QTH</th>
                  <th>{{ t('device') }}</th>
                  <th>{{ t('antenna') }}</th>
                  <th>{{ t('power') }}</th>
                  <th>{{ t('mode') }}</th>
                  <th>{{ t('selected') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(record, index) in filteredRecords"
                  :key="record.id"
                  class="editable-row"
                  title="点击修改记录"
                  @click="openRecordEditor(record)"
                >
                  <td>{{ getDisplaySerial(record) }}</td>
                  <td><strong class="callsign">{{ record.callsign }}</strong></td>
                  <td>{{ formatClock(record.time) }}</td>
                  <td>{{ record.qth || '-' }}</td>
                  <td>{{ record.device || '-' }}</td>
                  <td>{{ record.antenna || '-' }}</td>
                  <td>{{ record.power || '-' }}</td>
                  <td :title="record.mode || '-'">{{ record.mode || '-' }}</td>
                  <td>
                    <input
                      v-model="selectedRecordIds"
                      type="checkbox"
                      :value="record.id"
                      @click.stop
                    />
                  </td>
                </tr>
                <tr v-if="!filteredRecords.length">
                  <td colspan="10" class="empty-state">{{ t('noRecords') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section class="right-workbench">
        <section class="fmo-workbench">
          <div class="fmo-topbar">
            <div>
              <h2>{{ currentRelayName }}</h2>
              <p>{{ fmoStatus }}</p>
            </div>
            <div class="fmo-config" :class="{ compact: fmoConfig.source !== 'fmo' }">
              <label class="field source-field">
                <span>{{ t('monitorSource') }}</span>
                <select
                  :value="fmoConfig.source"
                  :class="{ 'emphasized-source-select': isPublicWebVersion && fmoConfig.source === 'bm' }"
                  @change="changeMonitorSource"
                >
                  <option
                    v-for="source in monitorSourceOptions"
                    :key="source.value"
                    :value="source.value"
                    :class="{ 'emphasized-source-option': isPublicWebVersion && source.emphasized }"
                  >
                    {{ isPublicWebVersion && source.webLabel ? source.webLabel : source.label }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span>{{ sourceFieldLabel(currentMonitorSource) }}</span>
                <div v-if="fmoConfig.source === 'mmdvm'" class="clearable-input">
                  <input
                    v-model="fmoConfig.mmdvmHost"
                    :placeholder="sourcePlaceholder(currentMonitorSource)"
                  />
                  <button
                    type="button"
                    class="input-clear-button"
                    :disabled="!fmoConfig.mmdvmHost"
                    title="清空 MMDVM 地址"
                    @click="clearField(fmoConfig, 'mmdvmHost')"
                  >
                    X
                  </button>
                </div>
                <div v-else-if="fmoConfig.source === 'hambox'" class="clearable-input">
                  <input
                    v-model="fmoConfig.hamboxHost"
                    :placeholder="sourcePlaceholder(currentMonitorSource)"
                  />
                  <button
                    type="button"
                    class="input-clear-button"
                    :disabled="!fmoConfig.hamboxHost"
                    title="清空 HAMBOX 地址"
                    @click="clearField(fmoConfig, 'hamboxHost')"
                  >
                    X
                  </button>
                </div>
                <div v-else-if="fmoConfig.source === 'bm'" class="clearable-input">
                  <input
                    v-model="fmoConfig.bmTalkgroup"
                    inputmode="numeric"
                    :placeholder="sourcePlaceholder(currentMonitorSource)"
                  />
                  <button
                    type="button"
                    class="input-clear-button"
                    :disabled="!fmoConfig.bmTalkgroup"
                    title="清空 BM 通话组"
                    @click="clearField(fmoConfig, 'bmTalkgroup')"
                  >
                    X
                  </button>
                </div>
                <input
                  v-else-if="currentMonitorSource.addressKind === 'network'"
                  :value="sourcePlaceholder(currentMonitorSource)"
                  :placeholder="sourcePlaceholder(currentMonitorSource)"
                  readonly
                />
                <div v-else class="clearable-input">
                  <input v-model="fmoConfig.host" :placeholder="sourcePlaceholder(currentMonitorSource)" />
                  <button
                    type="button"
                    class="input-clear-button"
                    :disabled="!fmoConfig.host"
                    title="清空 FMO 地址"
                    @click="clearField(fmoConfig, 'host')"
                  >
                    X
                  </button>
                </div>
              </label>
              <label v-if="fmoConfig.source === 'fmo'" class="field protocol-field">
                <span>{{ t('protocol') }}</span>
                <select v-model="fmoConfig.protocol">
                  <option value="ws">ws</option>
                  <option value="wss">wss</option>
                </select>
              </label>
              <label class="toggle-field">
                <input v-model="fmoConfig.autoRefresh" type="checkbox" />
                <span>{{ t('auto') }}</span>
              </label>
              <button
                type="button"
                class="tool-button"
                :disabled="fmoRefreshing"
                :title="
                  fmoConfig.source === 'mmdvm'
                    ? '刷新 MMDVM Last Heard'
                    : fmoConfig.source === 'hambox'
                      ? '刷新 HAMBOX Last Heard'
                    : fmoConfig.source === 'bm'
                      ? '刷新 BrandMeister Last Heard'
                      : currentMonitorSource.addressKind === 'network'
                        ? `准备接入 ${currentMonitorSource.label} 网络监听`
                        : '刷新 FMO 候选'
                "
                @click="refreshMonitorCandidates"
              >
                <RefreshCw :size="18" :class="{ spinning: fmoRefreshing }" />
                <span>{{ t('refresh') }}</span>
              </button>
            </div>
          </div>
          <p v-if="fmoAddressWarning" class="field-hint">{{ fmoAddressWarning }}</p>

          <div class="fmo-list-wrap">
            <table class="fmo-list">
              <colgroup>
                <col class="callsign-col" />
                <col class="time-col" />
                <col class="qth-col" />
                <col class="device-col" />
                <col class="power-col" />
                <col class="mode-col" />
              </colgroup>
              <thead>
                <tr>
                  <th>{{ t('callsign') }}</th>
                  <th>{{ t('time') }}</th>
                  <th>QTH</th>
                  <th>{{ t('deviceName') }}</th>
                  <th>{{ t('power') }}</th>
                  <th>{{ t('mode') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="candidate in recentFmoCandidates"
                  :key="candidate.id"
                  :class="{ live: candidate.isSpeaking }"
                  @click="chooseFmoCandidate(candidate)"
                >
                  <td><strong class="callsign">{{ candidate.callsign }}</strong></td>
                  <td>{{ formatFullDateTime(candidate.time) }}</td>
                  <td>{{ candidate.qth || candidate.grid || '-' }}</td>
                  <td>{{ candidate.device || '-' }}</td>
                  <td>{{ candidate.power || '-' }}</td>
                  <td :title="candidate.mode || '-'">{{ candidate.mode || '-' }}</td>
                </tr>
                <tr v-if="!recentFmoCandidates.length">
                  <td colspan="6" class="empty-state">{{ t('noRecentQso') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <div class="control-tx-strip" :class="{ active: controlTxInfo?.isSpeaking }">
          <span>{{ t('controlTx') }}</span>
          <strong>{{ controlTxInfo?.callsign || normalizeCallsign(activityConfig.controlCallsign) || '-' }}</strong>
          <em v-if="controlTxInfo">
            <template v-if="controlTxInfo.isSpeaking">{{ t('transmitting') }}</template>
            {{ formatClock(controlTxInfo.time) }}
            {{ controlTxInfo.source }}
            {{ controlTxInfo.relayName }}
            {{ controlTxInfo.mode }}
          </em>
          <em v-else>{{ t('waitingControl') }}</em>
        </div>
      </section>
    </section>

    <div v-if="serialEditorOpen" class="modal-backdrop serial-editor-backdrop" @click.self="closeSerialEditor">
      <form class="serial-modal" @submit.prevent="applySerialEditor">
        <div class="modal-head">
          <h2>{{ t('setRecordedCount') }}</h2>
          <button type="button" class="icon-button" :title="t('close')" @click="closeSerialEditor">X</button>
        </div>
        <label class="field">
          <span>{{ t('recordedCount') }}</span>
          <input
            v-model="serialEditorDraft"
            type="number"
            min="0"
            step="1"
            inputmode="numeric"
            autofocus
          />
        </label>
        <p class="modal-hint">{{ t('serialHint') }}</p>
        <div class="serial-modal-actions">
          <button type="button" class="tool-button" @click="closeSerialEditor">{{ t('cancel') }}</button>
          <button type="submit" class="primary-action">{{ t('saveSetting') }}</button>
        </div>
      </form>
    </div>

    <div v-if="authorQrOpen" class="modal-backdrop compact-modal" @click.self="authorQrOpen = false">
      <div class="author-qr-modal">
        <div class="modal-head">
          <h2>{{ authorQrTitle }}</h2>
          <button type="button" class="icon-button" :title="t('close')" @click="authorQrOpen = false">X</button>
        </div>
        <img :src="authorQrCodeUrl" alt="作者微信二维码" />
        <p>{{ authorQrHint }}</p>
      </div>
    </div>

    <div v-if="profileRegistrationOpen" class="modal-backdrop" @click.self="profileRegistrationOpen = false">
      <div class="profile-registration-modal">
        <div class="modal-head">
          <h2>{{ t('sharedProfileRegister') }}</h2>
          <button type="button" class="icon-button" :title="t('close')" @click="profileRegistrationOpen = false">X</button>
        </div>
        <div class="field-row">
          <label class="field">
            <span>{{ t('registrationCallsign') }}</span>
            <input
              v-model="profileSyncConfig.registrationCallsign"
              autocomplete="off"
              placeholder="BH1JSS"
              @input="handleCallsignInput($event, profileSyncConfig, 'registrationCallsign')"
              @compositionend="handleCallsignCompositionEnd(profileSyncConfig, 'registrationCallsign')"
            />
          </label>
          <label class="field">
            <span>{{ t('cracCertificate') }}</span>
            <input v-model="profileSyncConfig.cracCertificate" autocomplete="off" placeholder="操作证书号" />
          </label>
        </div>
        <div class="field-row">
          <label class="field">
            <span>{{ t('registrationQth') }}</span>
            <input v-model="profileSyncConfig.registrationQth" autocomplete="off" placeholder="北京 昌平" />
          </label>
          <label class="field">
            <span>{{ t('registrationRepeater') }}</span>
            <input
              v-model="profileSyncConfig.registrationRepeater"
              autocomplete="off"
              :placeholder="t('repeaterPlaceholder')"
            />
          </label>
        </div>
        <div class="profile-registration-actions">
          <button type="button" class="tool-button" :disabled="profileSyncBusy" @click="requestProfileRegistration">
            {{ t('submitReview') }}
          </button>
          <button type="button" class="tool-button" @click="authorQrOpen = true">
            {{ t('wechatContact') }}
          </button>
          <button type="button" class="tool-button" @click="profileKeyFileInput?.click()">
            {{ t('importProfileKey') }}
          </button>
          <button type="button" class="tool-button" :disabled="!profileSyncConfig.profileKey" @click="exportProfileKey">
            {{ t('exportProfileKey') }}
          </button>
          <button type="button" class="primary-action" :disabled="!hasProfileSyncRegistration" @click="profileSyncConfig.enabled = true; profileRegistrationOpen = false; syncSharedProfiles({ silent: false })">
            {{ t('enableSync') }}
          </button>
        </div>
        <p class="modal-hint">{{ t('registerHint') }}</p>
      </div>
    </div>

    <div v-if="aboutOpen" class="modal-backdrop" @click.self="aboutOpen = false">
      <div class="about-modal">
        <div class="modal-head">
          <h2>{{ t('aboutTitle') }} <span class="version-badge">{{ appVersion }}</span></h2>
          <button type="button" class="icon-button" :title="t('close')" @click="aboutOpen = false">X</button>
        </div>
        <p>
          {{ t('aboutText1') }}
        </p>
        <p>
          {{ t('aboutText2') }}
        </p>
        <div class="about-actions">
          <a class="footer-link" href="https://github.com/54dashayu/ham-net-checkin" target="_blank" rel="noreferrer">
            <svg aria-hidden="true" viewBox="0 0 19 19">
              <use :href="`${serverBasePath}/icons.svg#github-icon`"></use>
            </svg>
            {{ t('githubProject') }}
          </a>
          <button type="button" class="tool-button" @click="authorQrOpen = true">
            {{ t('contactAuthor') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="recordEditorOpen" class="modal-backdrop" @click.self="closeRecordEditor">
      <form class="record-modal" @submit.prevent="saveRecordEditor">
        <div class="panel-heading">
          <h2>{{ t('editRecord') }}</h2>
          <button type="button" class="icon-button" :title="t('close')" @click="closeRecordEditor">
            <RotateCcw :size="18" />
          </button>
        </div>

        <div class="callsign-row">
          <label class="field prefix-field">
            <span>{{ t('prefix') }}</span>
            <div class="clearable-input">
              <input
                v-model="editDraft.prefix"
                autocomplete="off"
                :placeholder="t('number')"
                inputmode="numeric"
                @input="handleCallsignInput($event, editDraft, 'prefix')"
                @compositionend="handleCallsignCompositionEnd(editDraft, 'prefix')"
                @blur="editDraft.prefix = normalizePrefix(editDraft.prefix)"
              />
              <button
                type="button"
                class="input-clear-button"
                :disabled="!editDraft.prefix"
                :title="t('clearPrefix')"
                @click="clearField(editDraft, 'prefix')"
              >
                X
              </button>
            </div>
          </label>
          <label class="field call-field">
            <span>{{ t('callsignRequired') }}</span>
            <div class="clearable-input">
              <input
                v-model="editDraft.callsign"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                @input="handleCallsignInput($event, editDraft, 'callsign')"
                @compositionend="handleCallsignCompositionEnd(editDraft, 'callsign')"
              />
              <button
                type="button"
                class="input-clear-button"
                :disabled="!editDraft.callsign"
                :title="t('clearCallsign')"
                @click="clearCallsignField(editDraft)"
              >
                X
              </button>
            </div>
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span>QTH</span>
            <div class="clearable-input">
              <input v-model="editDraft.qth" list="qth-options" />
              <button
                type="button"
                class="input-clear-button"
                :disabled="!editDraft.qth"
                title="清空 QTH"
                @click="clearField(editDraft, 'qth')"
              >
                X
              </button>
            </div>
          </label>
          <label class="field">
            <span>{{ t('deviceName') }}</span>
            <div class="clearable-input">
              <input v-model="editDraft.device" list="device-options" />
              <button
                type="button"
                class="input-clear-button"
                :disabled="!editDraft.device"
                :title="`${t('clearField')} ${t('device')}`"
                @click="clearField(editDraft, 'device')"
              >
                X
              </button>
            </div>
          </label>
          <label class="field">
            <span>{{ t('antenna') }}</span>
            <div class="clearable-input">
              <input v-model="editDraft.antenna" list="antenna-options" />
              <button
                type="button"
                class="input-clear-button"
                :disabled="!editDraft.antenna"
                :title="`${t('clearField')} ${t('antenna')}`"
                @click="clearField(editDraft, 'antenna')"
              >
                X
              </button>
            </div>
          </label>
        </div>

        <div class="field-row compact">
          <label class="field">
            <span>{{ t('mode') }}</span>
            <div class="clearable-input">
              <input v-model="editDraft.mode" list="mode-options" />
              <button
                type="button"
                class="input-clear-button"
                :disabled="!editDraft.mode"
                :title="`${t('clearField')} ${t('mode')}`"
                @click="clearField(editDraft, 'mode')"
              >
                X
              </button>
            </div>
          </label>
          <label class="field">
            <span>{{ t('power') }}</span>
            <div class="clearable-input">
              <input v-model="editDraft.power" list="power-options" />
              <button
                type="button"
                class="input-clear-button"
                :disabled="!editDraft.power"
                :title="`${t('clearField')} ${t('power')}`"
                @click="clearField(editDraft, 'power')"
              >
                X
              </button>
            </div>
          </label>
          <label class="field">
            <span>{{ t('signal') }}</span>
            <div class="clearable-input">
              <input v-model="editDraft.signal" list="signal-options" />
              <button
                type="button"
                class="input-clear-button"
                :disabled="!editDraft.signal"
                :title="`${t('clearField')} ${t('signal')}`"
                @click="clearField(editDraft, 'signal')"
              >
                X
              </button>
            </div>
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span>{{ t('time') }}</span>
            <div class="clearable-input">
              <input v-model="editDraft.time" type="datetime-local" />
              <button
                type="button"
                class="input-clear-button"
                :disabled="!editDraft.time"
                :title="`${t('clearField')} ${t('time')}`"
                @click="clearField(editDraft, 'time')"
              >
                X
              </button>
            </div>
          </label>
          <label class="field">
            <span>{{ t('remarks') }}</span>
            <div class="clearable-input">
              <input v-model="editDraft.remarks" />
              <button
                type="button"
                class="input-clear-button"
                :disabled="!editDraft.remarks"
                :title="`${t('clearField')} ${t('remarks')}`"
                @click="clearField(editDraft, 'remarks')"
              >
                X
              </button>
            </div>
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" class="tool-button" @click="closeRecordEditor">{{ t('cancel') }}</button>
          <button type="submit" class="primary-action">
            <Save :size="18" />
            {{ t('saveChanges') }}
          </button>
        </div>
      </form>
    </div>

    <footer class="app-footer">
      <span>{{ t('footerCredit') }}</span>
      <button
        type="button"
        class="footer-link footer-button"
        :title="t('aboutTitle')"
        @click="aboutOpen = true"
      >
        <Info :size="18" />
        {{ t('aboutTitle') }}
      </button>
      <a class="footer-link" href="https://github.com/54dashayu/ham-net-checkin" target="_blank" rel="noreferrer">
        <svg aria-hidden="true" viewBox="0 0 19 19">
          <use :href="`${serverBasePath}/icons.svg#github-icon`"></use>
        </svg>
        {{ t('githubProject') }}
      </a>
    </footer>

    <p v-if="notice" class="toast" :class="{ top: noticePosition === 'top' }" role="status">
      {{ notice }}
    </p>
  </main>
</template>
