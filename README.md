# Classroom Creation Request

Production Google Apps Script portal for one classroom-creation request per Accounts class. The same class-owned link starts a request, resumes a draft, and displays the submitted request's progress summary.

## User workflow

1. The coach acknowledges the 3–5 lesson limit and 2–5 business-day lead time.
2. The coach selects one eligible Accounts class, or opens its persistent **Classroom Request Form** link.
3. If the assigned teacher has a Coach in Staff Directory, the form offers that coach automatically. A single coach is selected automatically; multiple individual coaches are presented in a dropdown. The public picker never exposes staff email addresses—the selected email is resolved server-side when saving.
4. **Save as draft** creates or updates the class's single request item without notifying Tech. The first draft save emails the private coach link.
5. **Send to Tech** validates all required fields, changes the item to `Sent to Tech`, and emails Tech a direct monday.com item link.
6. The class link becomes a progress summary after submission. Credentials and internal Tech notes are never returned by the summary API.
7. **Submit an update** appends the coach's message to the same monday.com item, sets `Reopened - Coach Update`, and emails Tech.

When email delivery is paused, all request and progress data continues to save normally. Tech/coach/teacher notifications remain `Pending`; first-draft confirmation emails are skipped because the persistent class-row link remains available.

## Tech workflow

Tech works directly on the class item in board `18427083218`:

- Update **Request Status**, **Public Progress Update**, and **Target Completion Date**.
- Keep sensitive working details in **Internal Tech Notes**.
- To send a progress email, select **Notification Audience** (`Coach` or `Coach + Teacher`), optionally enter **Notification Message**, then set **Notification State** to `Pending`.
- Scheduled maintenance sends the email and changes Notification State to `Sent` or `Failed`.

## Email pause control

`EMAILS_PAUSED` is the master delivery switch:

- `true`: no application email is sent. Board notifications remain `Pending` for later delivery.
- `false`: delivery is enabled. The next scheduled maintenance run processes queued notifications.

Change it under **Apps Script → Project Settings → Script Properties**, or run the editor functions `pauseEmails()` and `resumeEmails()`. The editor functions require the active Google account to match `ADMIN_EMAILS`; anonymous portal clients have no active identity and are rejected.

Pausing does not disable the portal, monday.com writes, class links, drafts, submissions, coach updates, progress tracking, or audit logging. Draft confirmation emails skipped during a pause are not replayed later; coaches can always resume from the class row.

## JSON audit logging

Run the editor function `setupAuditLog()` once. It creates **Classroom Creation Request - Audit Log** in the deploying account's Google Drive and stores its ID in the `AUDIT_SPREADSHEET_ID` Script Property. Setup is protected by the same Tech-administrator check as the email controls.

The workbook contains:

- **Audit Log** — one row per event with 32 searchable operational columns plus the canonical **Event JSON** document.
- **Request Snapshots** — the latest sanitized JSON state for every request item, used to detect direct monday.com changes during scheduled maintenance.
- **Configuration** — current email state, board/project identifiers, schema version, and the sensitive-data policy.

Events include portal and directory calls, successful and failed drafts/submissions, coach updates, monday.com state changes, current-teacher reconciliation, portal-link repair, notification attempts/results, interrupted deliveries, rate/concurrency failures surfaced by public operations, configuration changes, and scheduled-maintenance summaries. Records include UTC/local timestamps, event and correlation IDs, actor context, request/class/school/teacher identifiers, status and revision before/after, notification state, duration, message/error details, and sanitized before/after JSON.

Credential values, access tokens, passwords, signing secrets, API tokens, and authorization headers are always redacted before both Sheet and execution logging. Credential activity is logged only as safe metadata such as `provided`, `retained_or_empty`, or `cleared`. Coach portal URLs have their `access` token removed. Audit failures never interrupt the main request workflow; every event is also written as JSON to the Apps Script execution log as a fallback.

monday.com's board pagination returns active items only. Once a request has a snapshot, its known ID continues to be checked after archival; migrated item `12835244405` is also included as an explicit initial audit seed. Deleted or archived items that predate this logger and whose IDs are unknown cannot be discovered board-wide through the monday.com API.

Teacher notifications resolve the current Assigned Teacher at delivery time, prefer the Staff Directory Kreyco email, and fall back to the personal email. Teachers receive a read-only summary link; coaches receive the private editing/update link. New requests resolve the assigned coach from the selected teacher's `people8` field. If no individual coach with a valid monday.com email is available, the form requires a manual coach contact.

## Live monday.com mapping

### Request board `18427083218`

| Purpose | Column ID |
| --- | --- |
| Source Class | `board_relation_mm6nf3v9` → Accounts subitems `9719292298` |
| Current Active Teacher | `board_relation_mm6ntah3` → Staff Directory `9739309783` |
| Assigned Coach | `multiple_person_mm6na1xy` → monday.com user selected from the teacher's Staff Directory Coach field |
| School Account | `board_relation_mm6bpfd8` |
| Request Status | `color_mm6ny859` |
| Request ID | `text_mm6bsfag` |
| Timeline Acknowledged | `boolean_mm6bkxm5` |
| Coach Name | `text_mm6nce2m` |
| Coach Email | `email_mm6nk9mk` |
| Language | `text_mm6n4jcy` |
| Grade Level | `text_mm6nc7za` |
| Kreyco Curriculum | `text_mm6n3w2y` |
| Credentials (LMS) | `long_text_mm6n6620` |
| Verification needed for LMS? | `color_mm6nr1q` |
| Use Google Classroom for grading? | `color_mm6nb7mr` |
| Other grading platform | `text_mm6ngx3t` |
| Credentials (grading platform) | `long_text_mm6n7ywf` |
| Schedule | `long_text_mm6nr7se` |
| Public Progress Update | `long_text_mm6ngwwx` |
| Internal Tech Notes | `long_text_mm6n4wk4` |
| Target Completion Date | `date_mm6n1bp3` |
| Request Revision | `numeric_mm6nc08f` |
| Submitted At | `date_mm6ncb2j` |
| Last Coach Update At | `date_mm6n47kd` |
| Notification Audience | `color_mm6n6tt9` |
| Notification State | `color_mm6n8gnz` |
| Notification Message | `long_text_mm6n4cz5` |
| Notification Event ID | `text_mm6n2ty2` |
| Last Notification Sent | `date_mm6nxd2f` |
| Notification Error | `long_text_mm6nkz30` |

### Accounts class subitem board `9719292298`

| Purpose | Column ID |
| --- | --- |
| Assigned Teacher | `board_relation_mktxpkv3` |
| Class eligibility status | `color_mkvqqdzk` |
| Classroom Creation Request Item | `board_relation_mm6ndter` → request board `18427083218` |
| Classroom Request Form | `link_mm6n6qs` |

The parent Account must have `color_mkwjcmfq = Active`. Class statuses excluded from new or editable requests are `Ended - Renewal`, `Ended - New`, `Ended`, and `Not moving forward`.

### Staff Directory `9739309783`

| Purpose | Column ID |
| --- | --- |
| Current Classroom Requests reciprocal relation | `board_relation_mm6n2hz8` |
| Coach | `people8` |
| Kreyco Email | `lln_email__1` |
| Personal Email fallback | `dup__of_personal_email5__1` |

## Concurrency and reliability

- Different classes update concurrently.
- A short Script Properties lease serializes only writes for the same class.
- Every action carries an operation ID and is cached to reduce duplicate saves or emails.
- Request Revision provides optimistic concurrency protection against stale browser tabs.
- monday.com 429, concurrency, complexity, network, and temporary server errors retry with bounded exponential backoff and jitter.
- Notifications move through `Pending → Sending → Sent/Failed` and remain recoverable by scheduled maintenance.
- School/class browsing is cached for 120 seconds; writes validate only the selected class instead of scanning the full Accounts subitem board.

## Apps Script configuration

Project ID:

```text
1FBIDwhhTPn05F_ZVZrT8dZGUixrg8eSlW_qmLlAKlg5Y2nEHf-TdHaXQ
```

Required Script Property:

```text
MONDAY_API_TOKEN=<dedicated integration token>
```

Optional property:

```text
TECH_NOTIFICATION_EMAIL=it@kreyco.com
EMAILS_PAUSED=true|false
ADMIN_EMAILS=it@kreyco.com
```

Created by `setupAuditLog()`:

```text
AUDIT_SPREADSHEET_ID=<Google Spreadsheet ID>
```

`PORTAL_SIGNING_SECRET` is generated automatically on first use and must not be removed or coach/teacher links will change.

The web app executes as the deploying integration owner and is accessible anonymously. The persistent deployment URL is declared server-side so every class portal link remains stable.

## Scheduled maintenance

Keep the existing time-driven trigger for `syncActiveClassroomRequestTeachers` at every 15 minutes. It now performs three jobs:

1. Reconciles current teacher relations and class eligibility.
2. Adds or repairs persistent class portal links.
3. Delivers queued Tech/coach/teacher notifications when email is enabled.
4. Compares sanitized request snapshots and logs direct monday.com changes as JSON audit events.

Because the project uses `MailApp` and `SpreadsheetApp`, the deploying account must authorize the `script.send_mail` and `spreadsheets` scopes once after deployment.

## Development and deployment

```bash
npm test
clasp status
clasp push
```

Use a versioned deployment update so the stable `/exec` URL does not change.
