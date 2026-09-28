# HAM Net Check-in Console User Manual

Applies to: V1.04

## 1. Purpose

HAM Net Check-in Console helps an amateur-radio net control station manage activity details, callsign entry, monitor-source candidates, profile assistance, record ordering, and Excel / ADIF export in one screen.

## 2. Quick Start

1. Enter the activity and net-control station information at the top.
2. Select a monitor source, enter its host or talkgroup, and refresh.
3. Click a recent station to queue it; double-click its card to move it into the entry form and query its profile.
4. Review QTH, device, antenna, power, mode, report, and notes.
5. Click “Add Record”, or use the Enter-key workflow.
6. Drag the handle at the left of a logged row when its order needs adjustment.
7. Export Excel or ADIF when the activity is complete.

## 3. Activity Bar and Serials

- The card shows the logged count in small text and the current serial as a large green number.
- Click the card and enter the number already logged. Saving automatically starts the current serial at the next number; entering 40 starts at 41.
- If existing records contain a higher serial, the next number follows the highest existing serial to prevent duplicates.

## 4. Record Entry and Defaults

- Callsign is required and supports uppercase normalization and suggestions.
- The default antenna is “Stock”, power is “L”, and report is “59”. Mode has no default.
- Enter-key quick entry carries the current antenna, power, and report defaults but does not fill a mode.
- Lower autocomplete menus open upward so they are not covered by the log table.
- Antenna and notes use equal-width fields.

### 4.1 Antenna Profile Search

- Antenna suggestions come from the current callsign profile and all local history.
- Partial input performs a fuzzy match; for example, a partial mobile-antenna term can match a saved mobile value.
- Clicking the antenna field while the default is present still opens the full candidate list.
- Built-in choices are Stock, Mobile, GP, and Yagi; custom historical values are merged into the list.

### 4.2 FMO Candidate Queue

- A single click on a monitor candidate only adds it to the queue and does not query the profile database.
- Double-clicking a queued card moves it to the form, queries and merges its profile, and removes the card.
- Candidate cards omit the pending-entry label. Use the card X to remove one or the queue X to clear all.

## 5. Monitor Sources

- FMO: enter the FMO host and select ws or wss.
- MMDVM: read Last Heard and select All, TS1, or TS2.
- HAMBOX: read recent activity.
- BM DMR: enter a BrandMeister talkgroup.
- Follow the interface guidance for YSF, D-Star, and other network sources.
- The web edition requires the browser bridge and approved local-device access for local FMO, MMDVM, or HAMBOX hosts. The desktop edition can access local devices directly.

## 6. Logged Records and Drag Reordering

- Search filters by callsign, QTH, device, or notes; clicking a row opens its editor.
- Drag the handle at the far left of a row and drop it at the required position.
- After a drop, serials are reassigned continuously in the new order, and the top count/current serial are updated.
- Excel and ADIF exports follow the adjusted serial order.
- Select All, Cancel, and Delete Selected provide batch management.

## 7. Save and Export

- Enable Auto Save before a formal net and save manually during long activities.
- Manual Excel export can include or omit Antenna, Power, and Mode; Auto Save retains every column.
- ADIF is intended for compatible amateur-radio logging software.
- Review serials, callsigns, timestamps, and exported files when the activity ends.

## 8. Common Actions

- Set the logged count: click the counter card.
- Reorder records: drag the handle at the left of a row.
- Edit a record: click its row.
- Clear a field: click its X button.
- Open the manual or switch language: use the two top-right icons.
