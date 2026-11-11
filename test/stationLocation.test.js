import test from 'node:test'
import assert from 'node:assert/strict'
import { aprsCallsign, coordinatesGrid, resolveStationLocation } from '../src/services/stationLocation.js'
const options = { isGrid: value => /^[A-R]{2}\d{2}(?:[A-X]{2})?(?:\d{2})?$/.test(value || ''), gridAddress: async () => '测试地址' }
test('device identity lookup preserves SSID and excludes AI', () => {
  assert.equal(aprsCallsign('P.BH1JSS-7'), 'BH1JSS-7')
  assert.equal(aprsCallsign('BG9JFQ.R'), 'BG9JFQ')
  assert.equal(aprsCallsign('AI-BH1JSS'), '')
  assert.equal(coordinatesGrid({lat:NaN,lon:116}), '')
  assert.equal(options.isGrid(coordinatesGrid({lat:90,lon:180})), true)
})
test('packet grid or coordinates take priority without APRS', async () => {
  const fetcher = () => { throw Error('must not query APRS') }
  for (const raw of [{grid:'OM89DX'}, {latitude:39.9,longitude:116.4}]) {
    const value=await resolveStationLocation({callsign:'BH1JSS',raw}, {...options,fetcher})
    assert.equal(value.locationSource,'通联位置')
    assert.equal(value.qth,'测试地址')
  }
})
test('missing packet position uses cached latest APRS and labels it', async () => {
  let count=0
  const fetcher=async url=>{count++;assert.ok(url.endsWith('BG9HUF'));return {ok:true,json:async()=>({latitude:34,longitude:108,receivedAt:1000,address:'最近地址',fresh:false})}}
  const candidate={callsign:'BG9HUF',displayCallsign:'P.BG9HUF'}
  const value=await resolveStationLocation(candidate,{...options,fetcher})
  assert.equal(value.qth,'最近地址');assert.equal(value.locationSource,'APRS 最近位置')
  await resolveStationLocation(candidate,{...options,fetcher});assert.equal(count,1)
  assert.equal(await resolveStationLocation({callsign:'BH1JSS',displayCallsign:'AI-BH1JSS'},{...options,fetcher}),null)
})
