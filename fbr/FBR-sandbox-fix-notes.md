# FBR Digital Invoicing: Sandbox Scenarios SN018 and SN019

**Business:** Al Karam Enterprises, NTN 4022617, RTO-II Karachi
**App:** AK Solar (Next.js and Supabase) with the `fbr-sender` program on the shop PC
**Date of notes:** 2 October 2026
**Status:** All 14 sandbox scenarios are now completed. Production token and IP approval are still pending.

---

## 1. What we wanted

FBR will not issue a **production token** until every required sandbox scenario is completed. A scenario counts as complete only when at least one invoice for that scenario is posted successfully.

IRIS showed **12 of 14 scenarios successful** and **2 pending**:

| Scenario | Description | Sale type |
|---|---|---|
| SN018 | Services rendered or provided where FED is charged in ST mode | Services (FED in ST Mode) |
| SN019 | Services rendered or provided | Services |

Both are **service** scenarios. The shop had only ever sold goods, so FBR had nothing to mark as completed.

## 2. Why they stayed pending

1. The app and the sender were built for goods. The sender (`src/payload.js`) only knew goods scenarios (SN026, SN027, SN028, SN008 and so on). A services bill was sent as SN026 and rejected.
2. The inventory form had no way to enter an SRO / Schedule number for a Services item.
3. The correct HS code, unit and tax rate for Services were unknown. We guessed at first, and each wrong guess cost one failed bill.

## 3. Every failed attempt and why it failed

Bills recorded as failed by the sender: **7**. Two bills were then accepted. (Other test bills may have been deleted along the way.)

| Bill | Scenario sent | HS code | Unit | Rate | FBR error | Reason |
|---|---|---|---|---|---|---|
| AK-000050 | SN026 | 9812.6290 | Numbers, pieces, units | 18% | **0204** Sale type not match with scenario | Sender sent a Services bill as SN026 (goods) |
| AK-000051 | SN026 | 9812.6290 | Numbers, pieces, units | 18% | **0099** UoM not allowed for HS code | Wrong unit for this HS code |
| AK-000052 | SN026 | 9812.6290 | 1000 kWh | 18% | **0204** | Sender still sent SN026. The code fix was not saved yet |
| AK-000053 | SN019 | 9812.6290 | 1000 kWh | 18% | **0046** Rate not correct for sale type | 18% is not a valid Services rate in Sindh |
| AK-000055 | SN019 | 9820.3000 | Bag | 15% | **0077** SRO / Schedule No. mandatory | Rate other than 18% needs an SRO number. None was sent |
| AK-000056 | SN019 | 9820.3000 | Bag | 18% | **0046** | Wrong rate again |
| AK-000059 | SN028 | 9820.3000 | Numbers, pieces, units | 5% | **0099** | Wrong unit again |

**Accepted by FBR:**

| Bill | Scenario | HS code | Unit | Rate | SRO | FBR invoice number |
|---|---|---|---|---|---|---|
| AK-000054 | SN018 | 9802.9000 | Bag | 8% | none | (sent, status accepted) |
| AK-000063 | SN019 | 9820.3000 | Bag | 15% | ICTO TABLE I, item 1(i)(i) | 4210145008979DIQOGZ26376562 |

## 4. How we fixed it (in order)

### Fix 1: Teach the sender about services (clears error 0204)
In `C:\fbr-sender\src\payload.js`, function `pickScenario`, two lines were added under `// retailer selling to end consumers`, above the existing lines:

```js
if (has(/services/i) && has(/fed/i)) return "SN018";
if (has(/^services/i)) return "SN019";
```

- The FED check must come first, because both sale types start with "Services".
- The sender only reads the file when it starts. After editing, stop it (`taskkill /F /IM node.exe`) and start it again with `start-sender.bat`.
- Check the edit with: `findstr /n "SN018 SN019" src\payload.js`. It must show two lines.

### Fix 2: Use the exact valid values from FBR (clears errors 0099 and 0046)
Instead of guessing, we asked FBR's own reference APIs using a helper script, `check-rates.js`, run on the shop PC. Results for **Services in Sindh**:

- Valid rates: 0%, Exempt, 5%, **15%**, 16%, 17%, 18.5%, plus per-unit rates. **18% is not on the list.**
- The unit lookup (`HS_UOM`) returned an empty list for every one of the 211 service HS codes (98xx). FBR gave no unit to copy from.
- So the unit and HS code were taken from the SN018 bill that FBR had already accepted: **HS 9820.3000, unit Bag**.

### Fix 3: Add the SRO / Schedule number (clears error 0077)
FBR says any rate other than 18% needs an SRO / Schedule number. The FBR lists gave, for Services at 15%: **ICTO TABLE I** (SRO id 434), with item serials such as `1(i)(i)`.

The app's inventory form only shows the SRO boxes for reduced-rate or exempt items, so it could not enter this for Services. Bills copy their SRO values from the `public.inventory` row, so it was set in the database:

```sql
update public.inventory
set hs_code = '9820.3000',
    uom = 'Bag',
    sale_type = 'Services',
    fbr_rate_desc = '15%',
    sro_schedule_no = 'ICTO TABLE I',
    sro_item_serial_no = '1(i)(i)',
    quantity = 5
where brand ilike 'Installation Service%';
```

A new bill (AK-000063) was then made with only this item, buyer province Sindh. FBR accepted it.

## 5. What we learned

- Each FBR error code points to one specific field. Read the code, then fix only that field:
  - **0204**: the scenario and the sale type do not match.
  - **0099**: the unit is not allowed for that HS code.
  - **0046**: the rate is wrong for the sale type.
  - **0077**: a rate other than 18% needs an SRO / Schedule number.
  - **0052**: the HS code does not match the sale type.
- Never retry a failed bill after fixing the item. A bill keeps the old values it was saved with. Always make a **new** bill.
- A scenario is only complete when one bill for that scenario succeeds.
- Rates, units and SRO numbers must come from FBR's reference lists, not from memory.
- The sender must be running (`npm run status` must say RUNNING) and restarted after any edit to its files.

## 6. What is still open

| Item | Status |
|---|---|
| Sandbox scenarios | All 14 done. Confirm IRIS shows 14 successful and 0 pending |
| Production token | Not issued. Ask FBR now that scenarios are complete |
| Static IP 103.245.193.47 | Showed as **Pending** in IRIS. Needs FBR approval |
| 3 older approved IPs | Not accessible since the technical staff changed. Ask FBR to deactivate or replace them |
| Reply to FBR | FBR said the token is issued only after all required scenarios are complete. Reply that they are done and ask for the token |

Contacts already emailed: `mehboob.rehman@pral.com.pk`, `fp.pos.rtoii.khi@fbr.gov.pk`, and the FBR helpline `helpline@fbr.gov.pk`.

## 7. Do not do yet

- Do **not** switch the app or sender to production until you have the production token **and** an approved IP. Production invoices are real.
- Do **not** delete or cancel bills AK-000054 and AK-000063. They are the ones FBR counted.

## 8. Quick reference

Start the sender (leave the window open):
```
cd C:\fbr-sender
start-sender.bat
```

Check the sender (in a second window):
```
cd C:\fbr-sender
npm run status
```

Stop the old sender:
```
taskkill /F /IM node.exe
```

Look up valid rates and SRO numbers from FBR:
```
cd C:\fbr-sender
node check-rates.js
```

## 9. Suggested improvements to the app (not done yet)

1. Show the **SRO / Schedule number** and **SRO item serial** boxes for **any** rate other than 18%, not only for reduced-rate and exempt items.
2. Add Services as a clear choice in inventory, with the valid Sindh rates loaded from FBR.
3. Save a copy of `payload.js` (and `check-rates.js`). The sender lives only on the shop PC and is not in GitHub, so the scenario fix is lost if that PC fails.
4. Warn when a rate is not on FBR's valid list for the sale type, before the bill is made.
