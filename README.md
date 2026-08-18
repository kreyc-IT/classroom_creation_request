# Classroom Creation Request

Google Apps Script web form for classroom-creation requests. The form is designed to run both as a public Apps Script web app and inside a monday.com board view.

## Verified monday.com mapping

| Purpose | Board / column |
| --- | --- |
| Destination request board | `18427083218` |
| Destination Staff Directory relation | `board_relation_mm6b2ch9` |
| Staff Directory | `9739309783` |
| Teacher job title | `dropdown`, label ID `2` (`Teacher`) |
| Selected Teacher group | `new_group64074__1` |
| Active staff group | `topics` |
| Accounts | `9718635629` |
| Active account status | `color_mkwjcmfq`, label `Active` |
| Account subitem board | `9719292298` |
| Assigned Teacher relation | `board_relation_mktxpkv3` |
| Active section status | `color_mkvqqdzk`, labels containing `Active` |

The teacher picker is searchable, paginated, and grouped into **Selected Teacher** and **Active**. Selecting a teacher loads active assigned school accounts. Selecting a school loads sections assigned to the same teacher whose New/Renewal status contains `Active`.

## Submission behavior

The existing destination board currently contains only its item name and Staff Directory relation columns. A successful submission therefore:

1. Revalidates the teacher, school, and sections against monday.com.
2. Creates one item named after the authoritative Staff Directory item name.
3. Sets `board_relation_mm6b2ch9` to the selected Staff Directory item.
4. Adds the questions and classroom table as a structured item update.

No destination-board schema changes are required.

## Apps Script project

This repository is linked through `.clasp.json` to script project:

```text
1FBIDwhhTPn05F_ZVZrT8dZGUixrg8eSlW_qmLlAKlg5Y2nEHf-TdHaXQ
```

The project files live in `src/`.

## Required configuration

In **Apps Script → Project Settings → Script Properties**, add:

```text
MONDAY_API_TOKEN=<token for the dedicated monday integration user>
```

The token must be able to read boards `9739309783`, `9718635629`, and `9719292298`, and write items and updates to `18427083218`. Never put the token in this repository or client-side HTML.

## Development

```bash
npm test
clasp status
clasp push
```

Use `clasp push` only after the GitHub review is approved.

## Deployment

Create a versioned web-app deployment that:

- executes as the deploying integration owner;
- is accessible to anyone, including anonymous users;
- uses the `/exec` deployment URL in the monday.com board-view feature.

The app deliberately allows framing so the same deployment can load inside monday.com. Public deployment exposes eligible teacher names and their Active/Selected Teacher category, so the deployment URL should be treated as organizationally sensitive even though it is anonymous.

## Security controls in this version

- Monday token remains server-side in Script Properties.
- Teacher, school, and section eligibility is revalidated at submission time.
- A honeypot rejects simple automated submissions.
- Script locking and request-ID caching reduce accidental duplicate items.
- Input lengths, enum values, IDs, and duplicate sections are validated server-side.
- Form payloads are not logged.

Before production launch, add an approved CAPTCHA or equivalent abuse-control mechanism for the anonymous endpoint.
