# Classroom Creation Request

Production Google Apps Script portal for one classroom-creation request per Accounts class. The same class-owned link starts a request, resumes a draft, and displays the submitted request's progress summary.

## User workflow

1. The coach acknowledges the 3–5 lesson limit and 2–5 business-day lead time.
2. The coach selects one eligible Accounts class, or opens its persistent **Classroom Request Form** link.
3. **Save as draft** creates or updates the class's single request item without notifying Tech. The first draft save emails the private coach link.
4. **Send to Tech** validates all required fields, changes the item to `Sent to Tech`, and emails Tech a direct monday.com item link.
5. The class link becomes a progress summary after submission. Credentials and internal Tech notes are never returned by the summary API.
6. **Submit an update** appends the coach's message to the same monday.com item, sets `Reopened - Coach Update`, and emails Tech.

## Tech workflow

Tech works directly on the class item in board `18427083218`:

- Update **Request Status**, **Public Progress Update**, and **Target Completion Date**.
- Keep sensitive working details in **Internal Tech Notes**.
- To send a progress email, select **Notification Audience** (`Coach` or `Coach + Teacher`), optionally enter **Notification Message**, then set **Notification State** to `Pending`.
- Scheduled maintenance sends the email and changes Notification State to `Sent` or `Failed`.

Teacher notifications resolve the current Assigned Teacher at delivery time, prefer the Staff Directory Kreyco email, and fall back to the personal email. Teachers receive a read-only summary link; coaches receive the private editing/update link.

## Live monday.com mapping

### Request board `18427083218`

| Purpose | Column ID |
| --- | --- |
| Source Class | `board_relation_mm6nf3v9` → Accounts subitems `9719292298` |
| Current Active Teacher | `board_relation_mm6ntah3` → Staff Directory `9739309783` |
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
```

`PORTAL_SIGNING_SECRET` is generated automatically on first use and must not be removed or coach/teacher links will change.

The web app executes as the deploying integration owner and is accessible anonymously. The persistent deployment URL is declared server-side so every class portal link remains stable.

## Scheduled maintenance

Keep the existing time-driven trigger for `syncActiveClassroomRequestTeachers` at every 15 minutes. It now performs three jobs:

1. Reconciles current teacher relations and class eligibility.
2. Adds or repairs persistent class portal links.
3. Delivers queued Tech/coach/teacher notifications.

Because the project now uses `MailApp`, the deploying account must authorize the `script.send_mail` scope once after deployment.

## Development and deployment

```bash
npm test
clasp status
clasp push
```

Use a versioned deployment update so the stable `/exec` URL does not change.
