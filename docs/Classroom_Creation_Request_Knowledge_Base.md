# Classroom Creation Request

## System knowledge base and operations handbook

**Organization:** Kreyco Tech Support  
**System:** Public Google Apps Script portal integrated with monday.com  
**Document version:** 1.1<br>
**Current-state date:** September 3, 2026<br>
**Audience:** Tech Support, system administrators, coaches, developers, and AI assistants  
**Classification:** Internal operational documentation. Do not add API tokens, passwords, portal signing secrets, or reusable credentials to this document.

---

## 1. How to use this document with Gemini

This document is intended to be uploaded as grounding material for Gemini Notebook or a Gemini Gem. It describes the implemented production system, not just the original form concept.

When answering questions about the system, treat the following rules as authoritative:

1. The request is owned by the **class**, not by the school or teacher.
2. One eligible class can have only one classroom creation request.
3. Each request is a separate **parent item** on the Classroom Creation Request board. Requests are not subitems.
4. The class itself is an Accounts-board subitem. Its row contains the persistent portal link and the relation to its request item.
5. The current teacher is derived from the Accounts class assignment and can change over time without changing request ownership.
6. The coach is the requester. An assigned coach is derived from the selected teacher's Staff Directory item when possible; otherwise the coach enters a manual contact.
7. A draft does not notify Tech. Sending a new request, editing submitted request details, or sending additional information does notify Tech.
8. Tech manages progress on the same monday.com request item.
9. Credential values are sensitive. They must not be included in AI prompts, audit logs, screenshots, or user-facing summaries.
10. The stable production `/exec` URL is the supported public URL. The Apps Script `/dev` URL is for authorized development testing only.
11. Tech assignment uses one multi-person **Assigned Techs** column. Only individual users who belong to monday.com Tech Team `881594` are eligible for assignment notifications.
12. Assignment changes are consolidated after five quiet minutes. Newly added technicians receive individual branded emails, and the Tech Google Chat space receives one readable, consolidated card for the final assignment.

If the code and this document ever disagree, inspect the current production code before advising an operator. Column IDs, board IDs, deployment configuration, and security settings are implementation contracts and should not be guessed.

---

## 2. Executive summary

The Classroom Creation Request system replaces a monday.com Form with a public, class-owned portal. A teacher's coach acknowledges the request limits, selects an active school and eligible class, enters class-specific LMS and grading information, and either saves a draft or submits the request to Tech.

The portal writes to monday.com board `18427083218`. Every eligible Accounts class has a persistent **Classroom Request Form** link. That link starts the class's request, resumes its draft, or opens the submitted request's progress summary. This eliminates separate continuation links and makes the Accounts class row the durable entry point.

Tech performs all fulfillment work on the same request item. Tech can assign one or more eligible technicians in a single People column, update status, publish progress, set a target completion date, keep internal notes, and send progress notifications to the coach or to the coach and current teacher. Technician assignment changes are debounced for five minutes, then newly assigned people receive branded first-name emails and the Tech Google Chat space receives one consolidated, logo-free card. Scheduled workers reconcile teacher assignments, repair class portal links, deliver queued notifications, monitor technician assignments, and record sanitized JSON audit history.

The system is deployed as a Google Apps Script web app that executes as the deploying integration account and permits anonymous access. Public access does not mean unrestricted access to an existing class request: class-specific coach and teacher URLs include signed tokens. Anyone who possesses a coach link can edit, so coach links must be treated as private.

---

## 3. Scope and non-goals

### In scope

- Acknowledgement of the 3-5 lesson limit and 2-5 business-day processing timeline.
- Paginated and searchable browsing of active schools.
- Selection of eligible class subitems from the Accounts board.
- Automatic display of the current assigned teacher, including an explicit no-teacher state.
- Automatic coach selection from the teacher's Staff Directory Coach field when possible.
- Manual coach contact fallback.
- Draft creation and resumption.
- Submission to Tech.
- Submission of an additional class as a separate request item.
- Editing of submitted request fields on the same item.
- Message-only updates to Tech on the same item.
- Tech progress tracking and optional coach/teacher notifications.
- Multi-person Tech assignment restricted to members of Tech Team `881594`.
- Debounced assignment notifications by email and Google Chat.
- Synchronization of current teacher relations.
- Persistent class-row portal links.
- monday.com Activity Log history and detailed sanitized Google Sheets JSON audit history.

### Not in scope

- Creating request subitems on board `18427083218`.
- Treating the teacher as the permanent owner of a request.
- Treating one school-level request as a container for several classes.
- Authenticating the public portal user with Google or monday.com identity.
- Firebase Hosting or Cloud Functions. Firebase is a possible future architecture, not part of the current implementation.
- A general credential vault. The form recommends secure-share links, but monday.com long-text columns still hold submitted credential instructions.
- Automatically replaying draft-confirmation emails that were skipped while email was paused.

---

## 4. Core domain model

### School

A school is a parent item on the Accounts board `9718635629`. A school is available to the portal only when its parent status column `color_mkwjcmfq` has the label `Active`.

### Class

A class is a subitem under a school and resides on Accounts subitem board `9719292298`. The class is the permanent business owner of a classroom creation request.

A class is eligible when both conditions are true:

- Its parent school is `Active`.
- Its New/Renewal status in `color_mkvqqdzk` is not one of the excluded labels.

Excluded class labels are:

- `Ended - Renewal`
- `Ended - New`
- `Ended`
- `Not moving forward`

A class may be eligible even when it does not yet have an assigned teacher.

### Teacher

The teacher is a Staff Directory item related from the class through Accounts subitem column `board_relation_mktxpkv3`. The teacher is current context, not request ownership.

If the teacher changes, scheduled maintenance updates the request's **Current Active Teacher** relation. If the class remains eligible but has no assigned teacher, the relation is cleared and the request remains class-owned. If the class becomes ineligible, the relation is cleared and the request is set to `No Longer Eligible`, unless it is already `Completed`, `Cancelled`, or `No Longer Eligible`.

### Coach

The coach is the requester and primary recipient of portal notifications. The form resolves the teacher's Staff Directory Coach field, `people8`, to monday.com user records.

- One valid individual coach: selected automatically.
- Several valid individual coaches: displayed in a dropdown.
- Team assignment only, missing assignment, or invalid/missing coach email: manual coach contact is required.
- The public picker shows coach names and whether an email is available, but does not expose the email address. The server resolves the selected email when saving.

### Classroom creation request

The request is a parent item in board `18427083218`, group `topics`. Its item name is the class name. It relates to the source class, school, current teacher, and assigned coach.

There is one request item per class. A second class always creates or updates its own separate parent item. The application never calls monday.com's `create_subitem` mutation and does not read or write the request board's Subitems column.

---

## 5. System architecture

### Components

1. **Google Apps Script web app**
   - Renders the public HTML interface.
   - Validates class eligibility and portal tokens.
   - Reads and writes monday.com through GraphQL.
   - Sends email through `MailApp`.
   - Writes sanitized audit events to Google Sheets.

2. **monday.com Accounts board**
   - Authoritative source for active schools.
   - Parent of class subitems.

3. **Accounts subitem board**
   - Authoritative source for classes, class status, assigned teacher, request relation, and portal link.

4. **monday.com Staff Directory**
   - Authoritative source for the teacher item, teacher email, and assigned coach.

5. **Classroom Creation Request board**
   - System of record for each class request, its progress, and its notification state.

6. **Google Sheets audit workbook**
   - Append-only operational events, sanitized request snapshots, configuration metadata, and a durable Tech assignment queue.

7. **Email delivery**
   - Sends draft confirmations, Tech submission/update notices, and Tech-authored progress notifications.

8. **Tech assignment notification worker**
   - Polls the request board every minute for changes to Assigned Techs.
   - Waits for five quiet minutes after the most recent change.
   - Emails newly assigned technicians and posts one consolidated Google Chat card.

9. **Google Chat Tech space**
   - Receives the final consolidated assignment card through a webhook stored only in Script Properties.

### Data flow

1. Portal loads immediately and prefetches the active school/class directory.
2. Coach selects a class.
3. Server re-reads the selected class and validates current eligibility.
4. Request is created or updated on board `18427083218`.
5. Request relation and persistent portal link are written back to the Accounts class row.
6. Teacher and coach relations are recorded when available.
7. A submission or update queues a notification on the same request item.
8. Notification processing sends email immediately when possible or during scheduled maintenance.
9. Portal reads the same request item to display progress.
10. The assignment worker observes the Assigned Techs column, persists queue state in the audit workbook, and sends assignment notifications after the debounce period.

---

## 6. User roles and access

### Coach

- Opens the public form or a class-specific coach link.
- Can create and edit an eligible class's draft.
- Can submit the request to Tech.
- Can edit submitted request details through the private coach link.
- Can send additional information without changing form fields.
- Can view the progress summary.
- Can start another class request.

### Teacher

- Is displayed as the current teacher when assigned.
- May receive a read-only progress link when Tech selects `Coach + Teacher`.
- Does not own the request and is not required for initial submission.

### Tech

- Works directly on the request item.
- Changes Request Status, Public Progress Update, and Target Completion Date.
- Uses Internal Tech Notes for non-public working information.
- Queues progress emails by selecting an audience and setting Notification State to `Pending`.
- Assigns one or more technicians in the **Assigned Techs** People column.
- Maintains Apps Script configuration, deployments, permissions, triggers, and logs.

### System administrator

- Maintains Script Properties and the monday.com integration token.
- Authorizes email and spreadsheet scopes as the deploying account.
- Runs setup, pause/resume, status, notification, and maintenance functions.
- Protects the portal signing secret and stable deployment URL.

### Anonymous visitor

The base form is available without sign-in. Class-specific actions require possession of a correctly signed link. The application does not establish the human identity of the visitor.

---

## 7. Coach workflow

### 7.1 Start a new request

1. Open the stable production form.
2. Read the welcome notice:
   - Tech can upload 3-5 lessons per class section per request.
   - Requests may take 2-5 business days.
3. Check the acknowledgement box.
4. Continue to the Request step.
5. Wait for the visible school-fetch indicator to report that active schools are ready.
6. Search or page through active schools.
7. Select a school.
8. Wait for the class list to load.
9. Select a class.
10. Review the automatically displayed current teacher, or the `No active teacher assigned yet` message.
11. Confirm or select the assigned coach, or enter a manual coach contact.
12. Complete the class-specific details.
13. Save as draft or continue to Review.

### 7.2 Form fields

Required for submission:

- Timeline acknowledgement.
- Class.
- Coach name and valid coach email, resolved from the assigned coach or entered manually.
- Language.
- Kreyco curriculum. This is a text field, not a dropdown.
- Use Google Classroom for grading: `Yes` or `No`.
- Other grading platform when Google Classroom is not used.

Optional:

- Grade level.
- Verification needed for LMS: `Yes`, `No`, or left unanswered (not assumed to mean `No`).
- Classrooms Needed By: the coach's requested need-by date. This is separate from Tech's Target Completion Date.
- Credentials (LMS).
- Credentials (grading platform).
- Schedule (check Smores).

Internal Tech Status and internal Tech Notes are not displayed on the coach form.

### 7.3 Save as draft

- An incomplete request may be saved.
- The first draft save creates the class's request item with status `Draft`.
- Tech is not notified.
- The class row receives the permanent Classroom Request Form link and request relation.
- When email is enabled, the first draft save emails the coach's private link.
- Later draft saves update the same item and increment its revision.
- When email is paused, the draft confirmation is skipped and is not replayed later. The class-row link remains available.

### 7.4 Send to Tech

- The form validates every required field.
- The existing draft is updated, or a new request item is created.
- Status becomes `Sent to Tech`.
- Public progress becomes `Your request has been sent to Tech and is awaiting review.`
- Notification Audience becomes `Tech`.
- Notification State becomes `Pending`.
- The submission date is recorded.
- A monday.com update states who submitted the request.
- Email processing attempts to send Tech a direct link to the request item.

### 7.5 Submit and add another class

`Submit & add another class` completes the current class's request and returns the coach to the class picker.

The next class creates or updates its own request parent item. It is not added as a subitem of the previous request. Each request has a distinct item ID, reference, status, progress, Activity Log, and audit history.

### 7.6 Resume a draft or view progress

The persistent link in the Accounts class row is the preferred entry point.

- No request exists: opens a preselected new form for that class.
- Draft exists: opens the draft for editing.
- Submitted request exists: opens the progress summary.
- Class is no longer eligible: blocks creation or editing as appropriate.

### 7.7 Edit submitted request details

From the coach summary page, `Edit request details` reopens editable form fields on the same request item.

- Submitting changes sets status to `Reopened - Coach Update`.
- Tech is notified.
- A monday.com update directs Tech to the Activity Log for changed fields.
- Existing credential values are retained when the credential field is left blank.
- A saved credential can be explicitly cleared.
- The browser must have the current request revision. A stale page is rejected and must be refreshed.

### 7.8 Send additional information

`Send additional information` is a message-only path.

- The message is appended to the same monday.com item as a native update.
- Request fields are not changed.
- Status becomes `Reopened - Coach Update`.
- Tech notification is queued.
- The request revision and last-coach-update date are updated.

---

## 8. Tech workflow

### 8.1 Work the request

Tech opens the request item from board `18427083218` or from an email link. The item name identifies the class. The Source Class relation identifies the authoritative Accounts subitem; the School Account and Current Active Teacher relations provide current context.

### 8.2 Update progress

Tech should maintain:

- **Request Status:** lifecycle status.
- **Public Progress Update:** coach/teacher-safe progress text shown in the portal and used as a notification fallback.
- **Target Completion Date:** displayed in the summary when set.
- **Internal Tech Notes:** private working notes that are never returned by the portal summary API.

### 8.3 Send a progress notification

1. Update the public status and progress fields first.
2. Set **Notification Audience** to `Coach` or `Coach + Teacher`.
3. Optionally enter **Notification Message**. If it is empty, the system uses Public Progress Update or the default message for the current status.
4. Set **Notification State** to `Pending`.
5. Scheduled maintenance, or an authorized manual queue run, sends the email.
6. Successful delivery changes state to `Sent`, records the sent date, and clears the temporary message and event ID.
7. Failed delivery changes state to `Failed` and records an error.

Teacher recipients are resolved at delivery time from the request's current teacher relation. Kreyco Email is preferred; Personal Email is the fallback. A missing teacher email does not prevent a `Coach + Teacher` notification from reaching the coach because the teacher delivery is optional.

### 8.4 Respond to a coach update

When a coach edits fields or sends additional information, status becomes `Reopened - Coach Update` and Tech is notified. Tech reviews the Activity Log and item updates, adjusts the request, then returns it to the appropriate progress status.

### 8.5 Assign technicians

Mariana or another authorized Tech operator assigns all technicians in the single multi-person **Assigned Techs** column. The column may contain one person or several people. Assignment notifications are sent only for individual users who are members of monday.com Tech Team `881594`; teams and non-members are ignored.

The one-minute assignment monitor records each observed change in the durable **Tech Assignment Queue** sheet. It then waits until the assignment has remained unchanged for five minutes. Adding another technician during that interval restarts the quiet period instead of producing duplicate notifications.

After the quiet period:

- Each newly added technician receives one Kreyco-branded email with a first-name greeting and a direct request-item link.
- The Tech Google Chat space receives one consolidated, logo-free card showing the final assignee list, request status, school, class, teacher, coach, need-by date, and a monday.com button.
- A retained assignee is not emailed again merely because another technician was added.
- Removing and later re-adding a technician is treated as a new assignment after the new debounce period.
- `EMAILS_PAUSED=true` pauses assignment emails but does not suppress the Google Chat notification. Paused email work remains queued.

The request-board Notification State is used for coach/teacher/Tech progress emails. It is separate from the durable Tech Assignment Queue used for technician assignment monitoring.

---

## 9. Request status model

| Status | Portal progress | Meaning |
|---|---:|---|
| Draft | 5% | Saved but not sent to Tech. |
| Sent to Tech | 15% | Submitted and awaiting review. |
| Under Review | 25% | Tech is reviewing the request. |
| Reopened - Coach Update | 35% | Coach supplied changed details or a new message. |
| Waiting for Information | 45% | Tech needs more information before continuing. |
| In Progress | 55% | Classroom creation is underway. |
| Ready for Verification | 85% | Classroom is ready for verification. |
| Completed | 100% | Work is complete. |
| Cancelled | 100% | Request was cancelled. Coach updates are disabled. |
| No Longer Eligible | 100% | The class or school is no longer eligible. Coach updates are disabled. |

The visible six-stage timeline is `Sent to Tech`, `Under Review`, `In Progress`, `Waiting for Information`, `Ready for Verification`, and `Completed`. The status badge always displays the actual current status, including Draft, Reopened, Cancelled, and No Longer Eligible.

---

## 10. Notification state model

| State | Meaning | Operator action |
|---|---|---|
| Not Requested | No notification is queued. | None. |
| Pending | Waiting for delivery. | Leave pending; maintenance will process it. |
| Sending | A worker claimed the notification. | Do not edit while delivery is active. |
| Sent | Delivery succeeded. | None. |
| Failed | Delivery failed or an interrupted send was recovered. | Review Notification Error, correct the cause, then set state to Pending to retry. |

`EMAILS_PAUSED=true` leaves queued notifications in `Pending`. It does not place the portal in maintenance mode and does not block form submissions, updates, monday.com writes, portal links, progress tracking, or audit logging.

---

## 11. monday.com data mapping

### 11.1 Classroom Creation Request board

**Board:** `18427083218`  
**Write group:** `topics`

| Purpose | Column ID | Behavior |
|---|---|---|
| Source Class | `board_relation_mm6nf3v9` | Relates to Accounts class subitem board `9719292298`. |
| Current Active Teacher | `board_relation_mm6ntah3` | Relates to Staff Directory `9739309783`; reconciled by maintenance. |
| Assigned Coach | `multiple_person_mm6na1xy` | monday.com user selected from teacher's Coach field. |
| Assigned Techs | `multiple_person_mm6vdq7a` | Multi-person Tech assignment; notifications are restricted to individual members of Tech Team `881594`. |
| School Account | `board_relation_mm6bpfd8` | Relates to the parent school item. |
| Request Status | `color_mm6ny859` | Controls lifecycle and portal progress. |
| Request ID | `text_mm6bsfag` | Client-generated operation identity for the request. |
| Timeline Acknowledged | `boolean_mm6bkxm5` | Records acceptance of limits and lead time. |
| Coach Name | `text_mm6nce2m` | Requester display name. |
| Coach Email | `email_mm6nk9mk` | Primary coach email. |
| Language | `text_mm6n4jcy` | Class-specific text. |
| Grade Level | `text_mm6nc7za` | Class-specific text. |
| Kreyco Curriculum | `text_mm6n3w2y` | Free-text curriculum description. |
| Credentials (LMS) | `long_text_mm6n6620` | Sensitive; never returned in summary or audit JSON. |
| Verification needed for LMS? | `color_mm6nr1q` | `Yes` or `No`. |
| Use Google Classroom for grading? | `color_mm6nb7mr` | `Yes` or `No`. |
| Other grading platform | `text_mm6ngx3t` | Required when Google Classroom is `No`. |
| Credentials (grading platform) | `long_text_mm6n7ywf` | Sensitive; never returned in summary or audit JSON. |
| Schedule | `long_text_mm6nr7se` | Class-specific schedule notes. |
| Classrooms Needed By | `date_mm6vwjs` | Optional coach-provided need-by date. |
| Public Progress Update | `long_text_mm6ngwwx` | Safe for coach/teacher display. |
| Internal Tech Notes | `long_text_mm6n4wk4` | Tech-only; not returned to portal clients. |
| Target Completion Date | `date_mm6n1bp3` | Optional Tech-managed estimate shown to coaches and teachers. |
| Request Revision | `numeric_mm6nc08f` | Optimistic concurrency version. |
| Submitted At | `date_mm6ncb2j` | Date first sent to Tech. |
| Last Coach Update At | `date_mm6n47kd` | Date of latest coach edit/message. |
| Notification Audience | `color_mm6n6tt9` | `Tech`, `Coach`, or `Coach + Teacher`. |
| Notification State | `color_mm6n8gnz` | Queue state. |
| Notification Message | `long_text_mm6n4cz5` | Optional email message. |
| Notification Event ID | `text_mm6n2ty2` | Idempotency/correlation value. |
| Last Notification Sent | `date_mm6nxd2f` | Successful delivery date. |
| Notification Error | `long_text_mm6nkz30` | Latest delivery failure detail. |

The board may still contain a native Subitems column, currently `subtasks_mm6b5std`, and an associated unused subitem board. The application does not depend on either. At the last verification, current request items had no subitems. The column may be hidden for reversible cleanup or deleted after confirming that no manual/legacy data must be retained.

### 11.2 Accounts board and class subitem board

**Accounts parent board:** `9718635629`  
**Class subitem board:** `9719292298`

| Level | Purpose | Column ID | Behavior |
|---|---|---|---|
| Parent school | Account status | `color_mkwjcmfq` | Must be exactly `Active`. |
| Class subitem | New/Renewal status | `color_mkvqqdzk` | Determines class eligibility. |
| Class subitem | Assigned Teacher | `board_relation_mktxpkv3` | Relates to Staff Directory teacher. |
| Class subitem | Classroom Creation Request Item | `board_relation_mm6ndter` | Relates to request board `18427083218`. |
| Class subitem | Classroom Request Form | `link_mm6n6qs` | Persistent signed coach portal link. |

### 11.3 Staff Directory

**Board:** `9739309783`

| Purpose | Column ID | Behavior |
|---|---|---|
| Current Classroom Requests | `board_relation_mm6n2hz8` | Reciprocal relation generated through Current Active Teacher. |
| Coach | `people8` | Authoritative coach assignment for the teacher. |
| Kreyco Email | `lln_email__1` | Preferred teacher notification email. |
| Personal Email | `dup__of_personal_email5__1` | Teacher notification fallback. |

If a similarly named legacy Staff Directory column such as `Active Classroom Requests` is present, it is not part of the application contract unless the code is explicitly changed to use its ID. The supported teacher-facing relation is **Current Classroom Requests**.

---

## 12. Portal behavior and links

### Base URL

Stable production URL:

`https://script.google.com/macros/s/AKfycbzY4LnhCk4gRmNInFqU5H8O-UiLaG8A0M-8695DcpkBT8f-Fp5g06GElEciE3MjW7OH/exec`

Do not distribute a `/dev` URL. A `/dev` deployment can require Google authorization and is intended for users with editor access.

### Coach link

The coach link contains:

- `class=<Accounts class item ID>`
- `mode=coach`
- `access=<HMAC token>`

It allows draft editing, submitted-detail edits, additional information, and progress viewing while the class/request is eligible for those actions.

### Teacher/read-only link

The teacher link contains the same class ID with `mode=view` and a separate mode-specific token. It displays progress but does not permit edits.

### Token behavior

- Tokens are HMAC-SHA256 values derived from mode, class ID, and `PORTAL_SIGNING_SECRET`.
- Coach and view tokens are not interchangeable.
- Tokens are validated with a constant-time comparison.
- Deleting or replacing `PORTAL_SIGNING_SECRET` invalidates every existing class link.
- Link possession is the access control. Users must not post coach links in public channels.

---

## 13. Security and privacy

### Secrets

Store these only in Apps Script Script Properties:

- `MONDAY_API_TOKEN`
- `PORTAL_SIGNING_SECRET`
- operational configuration such as `TECH_NOTIFICATION_EMAIL`

Never place secrets in `Code.js`, `Index.html`, Git, the audit sheet, this document, screenshots, or AI prompts.

### Credentials submitted by coaches

- Prefer password-manager secure-share links or access instructions.
- Avoid reusable passwords in the form.
- Credential values are stored in monday.com long-text fields because Tech needs them for fulfillment.
- Summary responses expose only whether credential information exists, never its value.
- When editing, a blank credential input preserves the existing value; an explicit checkbox clears it.
- Audit logging records safe states such as `provided`, `retained_or_empty`, or `cleared`, not the credential content.

### Public data exposure controls

- Assigned coach email addresses are resolved server-side and not displayed in the dropdown payload.
- Internal Tech Notes and credential values are excluded from portal summary responses.
- Input lengths and allowed choices are validated server-side.
- A hidden honeypot rejects basic automated submissions.
- Public reads and writes are rate-limited.
- The web app executes as the deployer so visitors do not receive direct monday.com or Google permissions.

### Security limitation

The portal is not identity-authenticated. A forwarded coach link grants coach capabilities for that class. If identity-level access, revocation, or per-user authorization becomes necessary, migrate the front end/API to an authenticated platform such as Firebase Hosting plus Cloud Functions or add another identity layer.

---

## 14. Reliability, concurrency, and performance

### Concurrency controls

- Different classes can be processed concurrently.
- Writes for the same class use a short Script Properties lease.
- The lease timeout is 180 seconds.
- Every action has an operation ID cached for six hours to reduce duplicate writes and emails.
- Request Revision rejects stale edits from an older browser session.
- Notification delivery uses a separate per-item lease.

### Rate limits

- Portal/directory reads: 300 operations per 60 seconds per defined bucket.
- Public writes: 60 operations per 60 seconds per defined bucket.

### monday.com retry behavior

The integration retries up to four attempts for transient network, rate, concurrency, complexity, and temporary server failures. Retry delays use bounded backoff and jitter. Permanent GraphQL or validation errors are surfaced to the caller and logged.

### Caching

- Eligible class directory cache: 15 minutes.
- School browsing renders the Welcome step immediately and prefetches in the background.
- The UI shows explicit fetching, ready, cached, and error states.
- Newly created requests update the cached class record so the class immediately becomes unavailable for another new request.
- Saving validates only the selected class against monday.com instead of rescanning the entire directory.
- Scheduled maintenance refreshes and retains the directory cache.

### Notification recovery

- Queue processing handles up to 25 pending items per run.
- A notification moves `Pending -> Sending -> Sent` on success.
- An item left in `Sending` after an interrupted execution is moved to `Failed` on the next queue run to avoid silent uncertainty.
- Operators may correct the error and return the state to `Pending`.

### Audit resilience

Audit logging is best effort and never blocks the request workflow. Every event is also emitted as JSON to the Apps Script execution log, so a busy or unavailable spreadsheet does not erase the event identity.

---

## 15. Email behavior

### Sender

Email is sent by `MailApp` under the Google account that owns and deploys the web app. The visible sender name is `Kreyco Tech Support`. The underlying From address is controlled by Google Apps Script and the deploying account.

### Tech recipient

`TECH_NOTIFICATION_EMAIL` is the authoritative Script Property. If it is missing, the code falls back to `techgroup@kreyco.com`. Verify the property before production testing instead of relying on the fallback.

### Draft email

The first draft save emails the coach a private resume link. It is an immediate one-time action, not a queued notification. If delivery is paused, it is skipped and not replayed.

### Submission and update email

New submissions, edited request details, and additional-information messages queue an audience of `Tech`. The email contains a direct monday.com item link.

### Progress email

Tech can notify `Coach` or `Coach + Teacher`. Coaches receive the private coach portal link. Teachers receive a read-only progress link.

### Technician assignment email and Chat message

Newly assigned technicians receive the same Kreyco-branded visual email system used by other IT notifications. The greeting uses the assignee's first name, and the content summarizes the classroom assignment without exposing credentials, private portal links, or Internal Tech Notes. Each newly added eligible technician is emailed once per assignment change; retained assignees are not emailed again.

The Tech Google Chat space receives a structured `cardsV2` message after the five-minute quiet period. The card intentionally has no logo, uses separated assignment and classroom sections for readability, and includes one direct button to the monday.com request item. Previously sent Chat messages do not change retroactively when the template is updated.

### Pause control

Set Script Property:

`EMAILS_PAUSED=true`

to stop delivery while preserving queued notification state. Set it to `false` to resume. Authorized editor functions are also available:

- `pauseEmails()`
- `resumeEmails()`
- `getOperationalStatus()`

These functions require the active account to be listed in `ADMIN_EMAILS`.

### Email authorization

Run `authorizeEmailAccess()` from the Apps Script editor as the deploying account. This forces authorization of `https://www.googleapis.com/auth/script.send_mail` and returns remaining recipient quota. After code or scope changes, update the deployment and run the function again if Google requires renewed consent.

---

## 16. JSON audit logging

### Workbook

Spreadsheet ID:

`1G4EMFdjjVK882bOuMHSanY0ZiRLMDpS6_qZ118aTnJQ`

The workbook contains:

1. **Audit Log** - one row per event, searchable operational columns, and canonical Event JSON.
2. **Request Snapshots** - latest sanitized JSON state per request item.
3. **Configuration** - identifiers, email state, schema version, and sensitive-data policy.
4. **Tech Assignment Queue** - durable per-request assignment observations, debounce timing, notified-user state, Chat delivery state, and retry information.

### Setup

Run `setupAuditLog()` once as an authorized Tech administrator. It creates/configures the workbook and stores `AUDIT_SPREADSHEET_ID` in Script Properties.

### Events

The logger records:

- Portal and directory requests.
- Draft and submission attempts, successes, and failures.
- Coach field edits and message-only updates.
- monday.com state changes detected from snapshots.
- Current-teacher reconciliation.
- Portal-link creation or repair.
- Notification queue actions, attempts, results, and interruptions.
- Tech assignment observations, debounce resets, eligible/ineligible assignees, email results, Chat results, and manual retries.
- Configuration changes.
- Rate, concurrency, validation, and integration failures.
- Scheduled maintenance summaries.

### Event metadata

Depending on the event, the record can include:

- UTC and America/New_York timestamps.
- Event ID, operation ID, and correlation ID.
- Severity, category, action, and outcome.
- Actor type and safe actor context.
- Request item ID and URL.
- Class, school, and teacher identifiers and names.
- Status and revision before/after.
- Notification audience/state.
- Duration, message, error, and sanitized before/after JSON.

### Redaction rules

The logger removes or replaces:

- Credential values.
- API and access tokens.
- Passwords.
- Signing secrets.
- Authorization headers.
- Coach portal `access` query tokens.

### Discovery limitation

monday.com board pagination returns active items. Once a request has a snapshot, the logger continues checking its known ID after archival. Seed request `12835244405` is explicitly included. Deleted or archived items that predate the logger and were never known cannot be discovered through a board-wide active-items query.

### Native Activity Log versus JSON audit log

- monday.com's Activity Log is the human-friendly record of column changes and updates on an item.
- The Google Sheet is the system-wide technical audit and snapshot history.
- Both are intentional. The Sheet does not replace monday.com's native Activity Log.

---

## 17. Scheduled maintenance and assignment monitoring

Install a 15-minute time-driven trigger for:

`syncActiveClassroomRequestTeachers`

Recommended frequency: every 15 minutes.

Each run performs four jobs:

1. Reconcile current teacher relations and class eligibility.
2. Add or repair persistent class portal links.
3. Deliver queued Tech/coach/teacher notifications when email is enabled.
4. Compare sanitized request snapshots and log direct monday.com changes.

It also runs a fallback Tech-assignment pass so assignment work can recover if a dedicated trigger execution was missed.

Install a separate one-minute time-driven trigger for:

`processTechAssignmentNotifications`

The one-minute trigger does not send a notification every minute. Each run observes the Assigned Techs value and evaluates the five-minute quiet period. Delivery happens only after the assignment has remained unchanged for five minutes.

Expected behavior:

- Class stays eligible and teacher changes: request relation follows the new teacher.
- Class stays eligible and has no teacher: request relation is cleared; request remains active.
- Class becomes ineligible: teacher relation is cleared and request becomes `No Longer Eligible`, unless already completed/cancelled/ineligible.
- Portal link is missing or altered: maintenance restores the signed coach link.
- Email is paused: notifications remain pending.

---

## 18. Configuration reference

### Required Script Property

`MONDAY_API_TOKEN=<dedicated integration token>`

### Recommended Script Properties

`TECH_NOTIFICATION_EMAIL=techgroup@kreyco.com`  
`GOOGLE_CHAT_TECH_WEBHOOK_URL=<secret webhook URL>`

`EMAILS_PAUSED=true|false`  
`ADMIN_EMAILS=it@kreyco.com`

### Automatically created

`PORTAL_SIGNING_SECRET=<generated on first use>`

Do not delete or rotate it casually. Rotation invalidates every existing class portal link until maintenance repairs links with new tokens.

### Created by audit setup

`AUDIT_SPREADSHEET_ID=1G4EMFdjjVK882bOuMHSanY0ZiRLMDpS6_qZ118aTnJQ`

### Apps Script manifest contract

- Runtime: V8.
- Time zone: America/New_York.
- Web app access: `ANYONE_ANONYMOUS`.
- Execute as: `USER_DEPLOYING`.
- OAuth scopes:
  - `script.external_request`
  - `script.send_mail`
  - `script.scriptapp`
  - `spreadsheets`
  - `userinfo.email`

---

## 19. Development and deployment

### Source control

Repository:

`https://github.com/kreyc-IT/classroom_creation_request`

Current review branch at documentation time:

`codex/build-classroom-request-form`

Pull request:

`https://github.com/kreyc-IT/classroom_creation_request/pull/1`

### Apps Script project

Project ID:

`1FBIDwhhTPn05F_ZVZrT8dZGUixrg8eSlW_qmLlAKlg5Y2nEHf-TdHaXQ`

Stable deployment ID:

`AKfycbzY4LnhCk4gRmNInFqU5H8O-UiLaG8A0M-8695DcpkBT8f-Fp5g06GElEciE3MjW7OH`

Production version at documentation time: `22`.

### Local project files

- `src/Code.js` - server logic, monday.com integration, notification queue, audit logger, and maintenance.
- `src/TechAssignmentNotifications.js` - Assigned Techs monitoring, durable debounce queue, email/Chat delivery, and retry support.
- `src/TechNotification.js` - branded IT and technician-assignment email rendering plus Chat card rendering.
- `src/Index.html` - public UI and client-side workflow.
- `src/appsscript.json` - Apps Script manifest and scopes.
- `tests/server.test.js` - server unit/behavior tests with Apps Script/monday mocks.
- `tests/static.test.js` - static architectural and UI contract tests.
- `README.md` - concise developer/operator reference.

### Release procedure

1. Review the working tree and preserve unrelated user changes.
2. Run `npm test`.
3. Run `git diff --check`.
4. Review `clasp status`.
5. Run `clasp push` using the authorized integration account.
6. Create a new Apps Script version.
7. Update the existing versioned deployment. Do not create a new public URL unless intentionally migrating links.
8. Confirm the stable `/exec` URL still matches `CONFIG.publicWebAppUrl`.
9. Verify Script Properties and trigger ownership.
10. Run a production smoke test.
11. Commit and push the source changes for review.

### Why the existing deployment must be updated

The permanent class links embed the stable `/exec` URL. Replacing the deployment with a new URL would leave class rows and emailed links pointing to the old app until repaired. Version the code and update the existing deployment to keep URLs stable.

---

## 20. Production verification checklist

### Configuration

- `MONDAY_API_TOKEN` is present and belongs to a dedicated integration user.
- `TECH_NOTIFICATION_EMAIL` is correct.
- `GOOGLE_CHAT_TECH_WEBHOOK_URL` is present and valid; never paste its value into documentation or logs.
- `ADMIN_EMAILS` includes the deploying Tech account.
- `PORTAL_SIGNING_SECRET` exists and has not been changed unexpectedly.
- `AUDIT_SPREADSHEET_ID` points to the correct workbook.
- `EMAILS_PAUSED` has the intended value.

### Authorization and triggers

- `authorizeEmailAccess()` succeeds as the deploying account.
- Spreadsheet authorization is active.
- A 15-minute trigger exists for `syncActiveClassroomRequestTeachers`.
- A one-minute trigger exists for `processTechAssignmentNotifications`.
- Trigger executions show no repeated failures.

### New request

- Welcome appears before the directory finishes loading.
- Fetching state is visible.
- Only active schools appear.
- Excluded classes do not appear.
- No-teacher classes remain selectable.
- Assigned coach resolution behaves correctly.
- Required-field validation works.
- Save as draft creates one parent item.
- Class row receives the request relation and portal link.
- Submit changes the same item to `Sent to Tech`.
- Tech receives an email when email is enabled.

### Existing request

- Class link opens the draft or summary as appropriate.
- Credentials are not displayed.
- Internal Tech Notes are not displayed.
- Edited details update the same item and notify Tech.
- Additional information adds a monday.com update and notifies Tech.
- Stale revisions are rejected.

### Multiple classes

- `Submit & add another class` returns to class selection.
- The second class creates a separate parent request item.
- Neither request contains a request subitem.

### Progress and notifications

- Tech status changes appear after Refresh status.
- Public progress and target date are visible.
- Coach notification links permit coach actions.
- Teacher notification links are read-only.
- Failed notifications record a useful error.

### Technician assignment notifications

- Assigned Techs accepts one or more people in a single column.
- Only individual members of Tech Team `881594` are eligible for notifications.
- Adding a second assignee during the five-minute quiet period produces one consolidated Chat card.
- Each newly added assignee receives one branded email with a first-name greeting.
- A retained assignee is not emailed again.
- The Chat card is readable, logo-free, and contains a working monday.com item button.
- With `EMAILS_PAUSED=true`, Chat still sends after the debounce while assignee email remains queued.
- Paused delivery leaves state Pending and does not block saving.

### Maintenance and audit

- Teacher reassignment updates the request relation.
- Removing a teacher clears the relation without deleting the request.
- Making a class ineligible results in `No Longer Eligible` when applicable.
- Missing class portal links are repaired.
- Audit Log receives sanitized events.
- Request Snapshots update after direct monday.com changes.
- Credential values and portal access tokens do not appear in the audit sheet.

---

## 21. Troubleshooting guide

### The public page asks for Google sign-in or behaves badly with multiple Google accounts

Confirm the user is opening the stable `/exec` URL, not `/dev` and not a domain-scoped `/a/macros/.../dev` URL. Confirm the deployed web app is set to execute as the deployer and allow anyone anonymously. If the production `/exec` deployment still requires sign-in, review deployment ownership and access settings.

### `localhost refused to connect` after `clasp login`

The OAuth callback was opened in a browser that could not reach the local `clasp` listener. Retry `clasp login` from the terminal and complete authorization in the default browser on the same Mac. Keep the command running until the callback finishes.

### Google reports `This app is blocked`

Use the approved organization account and review Google Workspace OAuth controls. If necessary, authorize the official clasp client through the administrator-approved path. Do not work around the warning with an untrusted OAuth client.

### MailApp permission error

If the error names `script.send_mail`:

1. Confirm the scope exists in `src/appsscript.json`.
2. Push the manifest.
3. Open Apps Script as the deploying account.
4. Run `authorizeEmailAccess()`.
5. Complete the Google permission prompt.
6. Update the versioned deployment if the manifest changed.
7. Retry and inspect Executions and the audit log.

### No email reaches Tech

Check, in order:

1. `EMAILS_PAUSED` is not `true`.
2. `TECH_NOTIFICATION_EMAIL` is correct.
3. Notification State on the request is `Pending`, `Sending`, `Sent`, or `Failed` as expected.
4. Notification Error has details.
5. MailApp authorization succeeds.
6. Remaining daily recipient quota is sufficient.
7. The 15-minute maintenance trigger is active.
8. Apps Script Executions and the Audit Log show the delivery attempt.
9. Spam/quarantine and Google Workspace routing are checked.

### No email reaches the coach

- A draft confirmation is sent only on the first draft save and is skipped while email is paused.
- Progress email requires Tech to select `Coach` or `Coach + Teacher` and set Notification State to `Pending`.
- Confirm Coach Email on the request item is valid.
- Confirm the notification was not sent to Tech audience instead.

### Active schools or classes load slowly

- Wait for the explicit fetch status.
- Confirm monday.com is reachable and the API token is valid.
- Review monday.com complexity/rate errors in Apps Script Executions.
- Confirm the class cache is being retained for 15 minutes.
- Run scheduled maintenance to refresh the cache if needed.
- Do not remove pagination or fetch every school's details independently from the browser.

### A class does not appear

Confirm:

- Parent Account status is exactly `Active`.
- Class status is not in the excluded list.
- The class belongs to the expected parent.
- A request relation does not already exist. Existing requests must be opened from the class-row link.
- Cache is not temporarily stale; maintenance or the 15-minute expiry will refresh it.

### Coach does not autofill

Confirm:

- Class has an Assigned Teacher relation.
- Teacher's Staff Directory item has an individual person in Coach column `people8`.
- The assigned monday.com user has a valid email.
- A team-only assignment is not being mistaken for an individual coach.
- If several coaches are assigned, the user must choose one.

### Request is not visible under the teacher

Confirm the request's Current Active Teacher relation points to the teacher's Staff Directory item and the Staff Directory reciprocal Current Classroom Requests column is correctly connected. Run scheduled maintenance. Do not use an unrelated legacy `Active Classroom Requests` column as the application relation.

### Request still appears under a former teacher

Confirm the Accounts class's Assigned Teacher relation was updated. Run `syncActiveClassroomRequestTeachers` and inspect its execution result. The request should follow the current teacher or clear when no teacher is assigned.

### User sees a stale-update error

Another browser/session or Tech changed the item after the page loaded. Refresh the portal, review the current values, and submit again. Do not remove revision checks; they prevent silent overwrites.

### Request link is invalid

- Open the current Classroom Request Form link from the Accounts class row.
- Confirm `PORTAL_SIGNING_SECRET` was not replaced.
- Run maintenance to repair the link.
- Confirm `CONFIG.publicWebAppUrl` points to the active stable deployment.

### Audit sheet shows a JSON snapshot but the item is not obvious on the board

The snapshot is a real or seeded request item state, not example data. Search the request item ID in monday.com, including archived items. Snapshot logging may continue to track a known archived item by ID.

---

## 22. Known constraints and future considerations

### Apps Script constraints

- Execution time, simultaneous execution, MailApp quota, CacheService size/expiry, and trigger reliability are platform constraints.
- Current controls are appropriate for moderate internal request volume, not high-volume public SaaS traffic.
- The notification queue processes a limited batch each run.

### Link-based authorization

- Coach access is controlled by possession of a signed URL, not by identity.
- There is no per-user revocation without changing the signing secret or adding a revocation layer.
- Rotating the global secret invalidates all links at once.

### Credential storage

- monday.com long-text fields are not a purpose-built secrets manager.
- The operational recommendation is to submit secure-share links rather than reusable passwords.

### Firebase option

A future Firebase architecture could use:

- Firebase Hosting for the public UI.
- Same-origin `/api` rewrites to Cloud Functions.
- Secret Manager for the monday.com token and signing secrets.
- Optional Firebase Authentication for identity-level access.
- Apps Script retained temporarily for email, maintenance, or Sheets logging during migration.

This would avoid Google Apps Script session/account behavior and provide more control over concurrency and authentication, but it requires replacing `google.script.run` with HTTP APIs and securing every endpoint. No Firebase migration has been implemented.

### Native monday.com Form and subitem structure

A native monday.com Form view and an unused request-board Subitems column may exist from earlier designs. They are not the production Apps Script workflow. Removing or hiding them can reduce confusion, but operators must confirm that no manual or legacy data depends on them before deletion.

---

## 23. Change-control rules

Before changing a board column or status label:

1. Search `src/Code.js`, `src/Index.html`, tests, README, and this document for the column ID or label.
2. Confirm whether the code relies on the column ID, label text, relation direction, or reciprocal configuration.
3. Update monday.com and code as one coordinated change.
4. Add or update tests.
5. Deploy through a new Apps Script version on the existing stable deployment.
6. Run the production verification checklist.
7. Update this knowledge base.

Never delete a relation column, signing secret, deployment, trigger, or audit workbook based only on its display name. Resolve the exact ID and verify current data first.

---

## 24. Glossary

**Account:** A school parent item on board `9718635629`.

**Activity Log:** monday.com's native per-item history of column changes and updates.

**Assigned coach:** A monday.com person resolved from the current teacher's Staff Directory Coach field.

**Class:** An Accounts subitem on board `9719292298`; permanent request owner.

**Coach link:** Signed private class URL that permits request edits and coach updates.

**Current teacher:** Teacher presently related to the Accounts class; synchronized to the request.

**Draft:** Request saved on monday.com but not sent to Tech.

**Eligible class:** A class under an Active Account whose class status is not excluded.

**Operation ID:** Client-generated idempotency/correlation identifier for a write action.

**Portal link:** Persistent signed link stored on the Accounts class row.

**Request item:** Separate parent item on board `18427083218`; never a request subitem.

**Request revision:** Numeric version used to reject stale browser updates.

**Teacher link:** Signed read-only class progress URL.

**Tech notification:** Email with a direct monday.com request item link.

---

## 25. Authoritative references

- Production portal: `https://script.google.com/macros/s/AKfycbzY4LnhCk4gRmNInFqU5H8O-UiLaG8A0M-8695DcpkBT8f-Fp5g06GElEciE3MjW7OH/exec`
- Apps Script project: `https://script.google.com/home/projects/1FBIDwhhTPn05F_ZVZrT8dZGUixrg8eSlW_qmLlAKlg5Y2nEHf-TdHaXQ/edit`
- GitHub repository: `https://github.com/kreyc-IT/classroom_creation_request`
- Pull request: `https://github.com/kreyc-IT/classroom_creation_request/pull/1`
- Classroom Creation Request board: `https://langlearningnetwork.monday.com/boards/18427083218`
- Accounts board ID: `9718635629`
- Accounts class subitem board ID: `9719292298`
- Staff Directory board ID: `9739309783`
- Audit workbook: `https://docs.google.com/spreadsheets/d/1G4EMFdjjVK882bOuMHSanY0ZiRLMDpS6_qZ118aTnJQ/edit`
- Original source requirements: `Classroom creation - Tech Doc.pdf`, created August 17, 2026.

---

## 26. AI answer guardrails

An AI assistant grounded on this document should:

- Explain whether it is describing current behavior, an operator procedure, or a proposed future change.
- Never invent a board or column ID.
- Never request or reproduce the monday.com API token, portal signing secret, reusable password, credential value, or signed coach-link token.
- Never state that a request belongs permanently to a teacher.
- Never recommend creating request subitems for additional classes.
- Distinguish the Accounts class subitem from the request board parent item.
- Warn that deleting a column, deployment, trigger, signing secret, or workbook is destructive and requires exact-ID verification.
- Prefer the class-row portal link for resuming a request.
- Direct Tech progress work to the same request item.
- Treat `EMAILS_PAUSED` as an email-delivery switch, not full maintenance mode.
- Recommend validating against current code and monday.com metadata before a structural change.
