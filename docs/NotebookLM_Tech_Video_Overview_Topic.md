# NotebookLM Video Overview - Tech explainer

## Suggested video title

Classroom Creation Request: How Tech Operates and Supports the System

## Supporting visual source

Upload `NotebookLM_Classroom_Request_Visual_Walkthrough.pdf` to the notebook together with the system handbook. Ask NotebookLM to use screenshots 9 and 10 for the Tech board and audit workflow, and screenshots 1-8 when explaining the coach and teacher experience that Tech supports.

## Compact custom topic

Create a 7-10 minute internal training explainer for Kreyco Tech Support. Center the video on the class-owned model: the class is an Accounts subitem, while each Classroom Creation Request is a separate parent item on board `18427083218`; the current teacher and coach are changing related context. Walk through draft, submission, coach edits, additional information, Tech progress, notifications, completion, and adding another class. Explain the class-row portal link, current-teacher synchronization, the notification queue, email pause, scheduled maintenance, Activity Log, and sanitized JSON audit history. End with a troubleshooting checklist for `/exec` versus `/dev`, MailApp authorization, Script Properties, the 15-minute trigger, stale revisions, invalid links, and missing coach/teacher relations. Never display credentials, API tokens, signing secrets, or signed access parameters. Label Firebase as a future option, not current behavior.

## Paste-ready custom topic

Create a practical technical explainer for Kreyco Tech Support about the production Classroom Creation Request system. Assume the viewer will operate, troubleshoot, or maintain the system but has not worked on its design.

Use the uploaded visual walkthrough screenshots as the primary on-screen examples. Match the narration to the numbered screenshot sequence and zoom into the relevant fields or controls when describing them.

Begin with the most important concept: the **class owns the request**. A class is an Accounts-board subitem, while its classroom creation request is a separate parent item on board `18427083218`. The current teacher and assigned coach are related context and can change; adding another class always creates a separate request parent item, never a request subitem.

Walk through the complete lifecycle: coach acknowledgement, active-school and eligible-class selection, automatic teacher and coach resolution, draft saving, submission to Tech, editable coach updates, additional-information messages, Tech progress updates, and completion. Explain how the persistent class-row portal link resumes a draft or opens the progress summary.

Show Tech's operating workflow on the same request item. Explain Request Status, Public Progress Update, Internal Tech Notes, Target Completion Date, Notification Audience, Notification State, Notification Message, and Notification Error. Clearly show how Tech sends updates to Coach or Coach + Teacher and how `Pending`, `Sending`, `Sent`, and `Failed` behave.

Explain the four scheduled-maintenance jobs: current-teacher reconciliation, class portal-link repair, queued email delivery, and sanitized JSON snapshot auditing. Include what happens when a teacher changes, no teacher is assigned, a class becomes ineligible, or email delivery is paused.

Include a short architecture explanation connecting Google Apps Script, the Accounts board, Accounts class subitems, Staff Directory, the Classroom Creation Request board, MailApp, and the Google Sheets audit workbook.

End with a Tech troubleshooting checklist covering: production `/exec` versus `/dev`, email authorization, `TECH_NOTIFICATION_EMAIL`, `EMAILS_PAUSED`, the 15-minute trigger, stale request revisions, invalid portal links, missing coach autofill, request visibility under the current teacher, Apps Script Executions, monday.com's Activity Log, and the JSON Audit Log.

Use a calm, professional, internal-training tone. Prefer diagrams, board relationships, lifecycle arrows, field highlights, and operational checklists over decorative visuals. Do not display or invent API tokens, signing-secret values, signed coach-link tokens, passwords, or credential contents. Clearly label current production behavior versus future ideas such as Firebase.

## Recommended focus

- **Audience:** Kreyco Tech Support and system administrators.
- **Knowledge level:** Familiar with monday.com; limited knowledge of this custom integration.
- **Target length:** 7-10 minutes.
- **Primary goal:** Enable Tech to operate the request lifecycle and diagnose common failures safely.
- **Secondary goal:** Explain enough architecture to prevent incorrect board or column changes.

## Suggested video flow

### 1. The ownership model

- School is the Accounts parent item.
- Class is the Accounts subitem and permanent request owner.
- Request is a separate parent item on board `18427083218`.
- Current teacher follows the class assignment.
- Additional classes create additional parent request items.

### 2. What the coach experiences

- Accepts the 3-5 lesson limit and 2-5 business-day lead time.
- Selects an active school and eligible class.
- Reviews the current teacher or no-teacher state.
- Uses an assigned coach or manual contact.
- Saves a draft or sends the request to Tech.
- Returns through the class-row link.
- Edits request fields or sends additional information.

### 3. What happens in monday.com

- The request item is created or updated.
- Source Class, School Account, Current Active Teacher, and Assigned Coach are related.
- The class row receives its request relation and persistent portal link.
- Revision, status, submitted date, and notification fields are maintained.
- Native Activity Log records field changes and item updates.

### 4. How Tech shows progress

- Update Request Status.
- Write coach-safe text in Public Progress Update.
- Keep private work in Internal Tech Notes.
- Set Target Completion Date when appropriate.
- Use Notification Audience and Notification State to send an update.

### 5. Email and queue behavior

- Draft confirmation goes to the coach on the first draft save.
- Submissions and coach updates notify Tech.
- Progress notifications can go to Coach or Coach + Teacher.
- Email is sent by the Apps Script deploying account.
- `EMAILS_PAUSED=true` leaves queued notifications pending without disabling the portal.
- Failed notifications record an error and can be returned to Pending after correction.

### 6. Scheduled maintenance

- Follows teacher reassignment.
- Clears the current teacher when none is assigned.
- Marks an ineligible request `No Longer Eligible` when applicable.
- Repairs class portal links.
- Processes queued notifications.
- Captures sanitized request snapshots and direct monday.com changes.

### 7. Security and operational safeguards

- Public portal executes as the deploying integration account.
- Coach and teacher links use separate signed tokens.
- Coach links are private bearer links.
- Credentials and Internal Tech Notes are not returned in the summary.
- Audit logging redacts secrets and credential contents.
- Operation IDs, per-class leases, revision checks, caching, and retry logic reduce duplicate or conflicting work.

### 8. Troubleshooting sequence

1. Confirm the stable production `/exec` URL is being used.
2. Check the request's status and notification fields.
3. Verify `EMAILS_PAUSED` and `TECH_NOTIFICATION_EMAIL`.
4. Run `authorizeEmailAccess()` if MailApp permissions are missing.
5. Confirm the 15-minute trigger is active.
6. Review Apps Script Executions and Notification Error.
7. Review monday.com's Activity Log.
8. Review the Google Sheets Audit Log and Request Snapshots.
9. Verify current Accounts class and Staff Directory relations.
10. Avoid deleting or replacing columns, links, deployments, or secrets until exact dependencies are confirmed.

## Visual guidance

Ask NotebookLM to favor these visual explanations:

- A relationship diagram: `School -> Class -> Request`, with Teacher and Coach shown as changing related context.
- A lifecycle diagram: `Draft -> Sent to Tech -> Under Review -> In Progress/Waiting for Information -> Ready for Verification -> Completed`.
- A notification state diagram: `Pending -> Sending -> Sent`, with `Failed -> correct issue -> Pending`.
- A maintenance loop showing teacher sync, portal-link repair, notification delivery, and audit snapshots.
- A split-screen comparison of Public Progress Update versus Internal Tech Notes.
- A troubleshooting checklist using production URL, Script Properties, trigger, executions, Activity Log, and Audit Log.

## Required accuracy and safety constraints

- Do not describe the teacher as the permanent request owner.
- Do not describe an additional class as a request subitem.
- Do not imply that a teacher must be assigned before submission.
- Do not imply that email pause disables the form.
- Do not show credentials, secrets, API tokens, authorization headers, or signed access parameters.
- Do not present Firebase as implemented. It is a future option only.
- Do not invent board IDs, column IDs, status labels, or deployment details.
- Use the uploaded system handbook as the authority for exact identifiers and current behavior.
