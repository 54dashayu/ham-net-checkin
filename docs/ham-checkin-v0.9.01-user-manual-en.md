# HAM Net Check-in Console User Manual

Applies to: V0.9.01

## 1. Purpose

HAM Net Check-in Console helps an amateur radio net control station run a check-in session. It combines activity setup, callsign logging, monitor-source candidates, control-station transmit indication, Excel export, and callsign profile assistance in one screen.

## 2. Quick Start

1. Fill in the net activity name, control callsign, control QTH, rig, antenna, and power at the top.
2. Choose a monitor source on the right, enter the host or talkgroup, then click “Refresh”.
3. Click a station in the waiting queue or recent QSO list to copy it into the entry form.
4. Review and complete antenna, signal report, notes, and other fields.
5. Click “Add Record” to save the check-in to the main list.
6. At the end of the net, click “Excel” to export the log.

## 3. Top Activity Bar

- Net Activity: identifies this session in saved files and exported logs.
- Control Call: used by the control TX indicator.
- Control QTH, Rig, Antenna, Power: written into the activity record.
- Logged counter: click it to set the current count; the next serial number follows automatically.
- Save: saves the current check-in table.
- Auto Save: saves automatically when records change.
- New: starts a new check-in activity.
- Manual icon: opens the manual in the current language.
- Language icon: switches between Chinese and English.

## 4. Adding a Record

The left entry panel is used to log one station.

- Prefix: optional numeric callsign prefix.
- Callsign: required; input is normalized to uppercase and can use suggestions.
- QTH: location or grid square.
- Radio / Device: radio, hotspot, mobile rig, handheld, or other device.
- Mode: FM, DMR, YSF, and similar modes.
- Power: L, M, H, 5W, 25W, and similar values.
- Report: signal report such as 59 or 5/9.
- Antenna: mobile, GP, Yagi, handheld stock antenna, and similar values.
- Notes: hotspot, simplex, first check-in, mobile station, or other context.

Click “Add Record” to write the station to the main list. When editing an existing record, the button changes to “Save Changes”.

## 5. Monitor Sources

The right panel reads recent QSO candidates from the selected source.

- FMO: enter the FMO host and choose ws or wss.
- MMDVM: enter the MMDVM host to read Last Heard.
- HAMBOX: enter the HAMBOX host to read recent activity.
- BM DMR: enter the BrandMeister talkgroup.
- Other network sources: placeholders are reserved for future support.

Enable “Auto” to refresh candidates periodically. Click any candidate row to copy that station into the left entry form.

## 6. Control TX Indicator

The “Control TX” strip shows whether the configured control callsign is appearing in the active monitor source. It is meant as a quick reminder of the control station’s transmit state during the net.

## 7. Logged Records

The main list shows all stations logged in the current activity.

- Search: filters records by callsign, QTH, device, or notes.
- Click a row: opens the edit dialog for that record.
- Select All / Cancel: selects or clears the current filtered records.
- Delete selected: removes checked records.
- Excel: exports the current log.

## 8. Callsign Database

The callsign database helps fill station information.

1. Enable “Callsign DB”.
2. For shared sync, click “Register” and enter registration callsign, CRAC certificate number, common QTH, and common server.
3. After review, import the verification key from the author.
4. Enable sync to update shared callsign profiles.

Without registration, local suggestions and local history can still be used.

## 9. Saving and Export Tips

- Confirm activity and control-station information before the net starts.
- Enable Auto Save for formal check-ins.
- For long sessions, click Save manually from time to time.
- After the activity, export Excel and review serial numbers, callsigns, and timestamps.

## 10. Common Actions

- Start over: click “New”.
- Change serial start: click the logged counter at the top.
- Edit a record: click a row in the main list.
- Clear one field: click the X button inside that input.
- Open the manual: click the manual icon in the top-right corner.
- Switch to Chinese: click the language icon in the top-right corner.
