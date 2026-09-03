# Production deployment — August 31, 2026

- Apps Script project: `1FBIDwhhTPn05F_ZVZrT8dZGUixrg8eSlW_qmLlAKlg5Y2nEHf-TdHaXQ`
- Version: **18** (previous production version: 17).
- Existing deployment: `AKfycbzY4LnhCk4gRmNInFqU5H8O-UiLaG8A0M-8695DcpkBT8f-Fp5g06GElEciE3MjW7OH`.
- The existing `/exec` URL, access policy, and execution identity are unchanged.
- Clasp named login `classroom-creation` uses `it@kreyco.com`; the default clasp login was preserved.

## Included changes

- Grade level and LMS verification are optional for submissions and updates.
- New Kreyco-branded IT email layout for new requests, coach updates, and other request notifications, with an equivalent plain-text body.
- Default IT recipient is `techgroup@kreyco.com`.
- Live `TECH_NOTIFICATION_EMAIL` was corrected from the misspelled `techgroup@kreyo.com` to `techgroup@kreyco.com` and verified saved.
- Live `EMAILS_PAUSED=false` was verified and left unchanged.
- Coach/teacher email formats and recipients are unchanged.

## Verification

- All server, static, and mocked email-delivery tests passed.
- Remote source matched the checked-in baseline before pushing; no unrelated remote edits were overwritten.
- All four version-18 source files were downloaded and compared with the local source successfully.
- Deployment listing confirmed the existing production deployment uses version 18.
- No test emails were sent and no request items were created or modified during verification. Recipient configuration is verified; group inbox receipt is not independently tested.

Deployment commands use `clasp -u classroom-creation` for the authorized IT account. Repository changes have not been committed or pushed to GitHub as part of this deployment.
