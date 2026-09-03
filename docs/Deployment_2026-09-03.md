# Production deployment — September 3, 2026

- Apps Script production version: **23**.
- Existing deployment ID and `/exec` URL were preserved.
- Created Monday date column **Classrooms Needed By** (`date_mm6vwjs`) on request board `18427083218`.
- Added an optional coach date field to new requests, drafts, and editable submitted requests.
- The date is shown in review, coach/teacher summaries, IT email notifications, and JSON audit snapshots.
- Tech's separate **Target Completion Date** (`date_mm6n1bp3`) remains unchanged.
- Valid dates use ISO `YYYY-MM-DD`; invalid calendar dates are rejected server-side.
- Existing requests remain valid and show the coach need-by date as not provided until updated.
- Created the multi-person **Assigned Techs** column (`multiple_person_mm6vdq7a`) on request board `18427083218`.
- Added one-minute assignment monitoring with a five-minute quiet-period debounce.
- Newly assigned individual members of monday.com **Tech Team** (`881594`) receive email; the Tech Google Chat space receives one consolidated, request-threaded notification.
- Assignment delivery state is durable in the audit spreadsheet's **Tech Assignment Queue** tab. Reordered or retained assignees are not notified twice.
- `GOOGLE_CHAT_TECH_WEBHOOK_URL` is stored only as a Script Property and is hidden from source, tests, and audit logs.
- The production trigger and updated notification properties were verified successfully; no live test notification was sent during deployment.
- Assignment emails now use the same Kreyco-branded layout as other IT notifications and address each assignee by first name.
- Tech-space notifications now use a structured Google Chat card with separate assignment and classroom-detail sections, a monday.com action button, no distorted header logo, and no duplicate text line above the card.
- Added the long-text **Request Details** column (`long_text_mm6vdzch`) to request board `18427083218`.
- Added optional Request Details to drafts, new submissions, editable requests, coach/teacher summaries, IT notifications, and sanitized JSON audit snapshots.
- New submissions and edited request details copy the current Request Details into native monday.com Updates. Additional-information messages append to Request Details with the date and coach name and are also posted as native Updates.
- Hid **Verification needed for LMS?** from coach-facing forms, reviews, summaries, and public payloads. Coach writes now omit `color_mm6nr1q`, preserving any Tech-entered value.

All server, static, and mocked notification tests passed. The production response and live Monday column mapping were verified after deployment.
