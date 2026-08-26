# Classroom Creation Request

Google Apps Script web form for classroom-creation requests. The form is designed to run both as a public Apps Script web app and inside a monday.com board view.

## Verified monday.com mapping

| Purpose | Board / column |
| --- | --- |
| Destination request board | `18427083218` |
| Teacher at Submission relation | `board_relation_mm6b2ch9` → Staff Directory `9739309783` |
| Destination School Account relation | `board_relation_mm6bpfd8` |
| Destination LMS credentials | `long_text_mm6b3t9w` |
| Destination LMS verification | `color_mm6bmy8h` |
| Destination Google Classroom grading | `color_mm6bag89` |
| Destination other grading platform | `text_mm6btys6` |
| Destination grading credentials | `long_text_mm6bcq82` |
| Destination schedule | `long_text_mm6bqn8k` |
| Destination timeline acknowledgment | `boolean_mm6bkxm5` |
| Destination request ID | `text_mm6bsfag` |
| Destination subitems | `subtasks_mm6b5std` → board `18427107495` |
| Staff Directory | `9739309783` |
| Teacher job title | `dropdown`, label ID `2` (`Teacher`) |
| Selected Teacher group | `new_group64074__1` |
| Active staff group | `topics` |
| Accounts | `9718635629` |
| Active account status | `color_mkwjcmfq`, label `Active` |
| Account subitem board | `9719292298` |
| Assigned Teacher relation | `board_relation_mktxpkv3` |
| Active section status | `color_mkvqqdzk`, labels containing `Active` |
| Subitem Section Source relation | `board_relation_mm6k159n` → Accounts subitems `9719292298` |
| Accounts class Classroom Creation Requests relation | `board_relation_mm6kgfwb` → request subitems `18427107495` |
| Subitem Current Active Teacher relation | `board_relation_mm6k90h2` → Staff Directory `9739309783` |
| Staff Active Classroom Requests relation | `board_relation_mm6ktws1` → request subitems `18427107495` |
| Subitem language | `text_mm6bvj23` |
| Subitem grade level | `text_mm6bnbka` |
| Subitem Kreyco curriculum | `text_mm6bfn7d` |
| Subitem Tech status | `color_mm6b9q2c` |
| Subitem Tech notes | `long_text_mm6bbjzp` |

The teacher picker is searchable, paginated, and grouped into **Selected Teacher** and **Active**. Selecting a teacher loads active assigned school accounts. Selecting a school loads sections assigned to the same teacher whose New/Renewal status contains `Active`.

## Submission behavior

A successful submission:

1. Revalidates the teacher, school, and sections against monday.com.
2. Creates one item named after the authoritative Staff Directory item name.
3. Writes the historical Teacher at Submission and School Account relations plus every request-level answer into native parent columns.
4. Creates one native subitem per classroom section, named after the authoritative Accounts subitem.
5. Writes the source section, current active teacher, language, grade level, and Kreyco curriculum into native subitem columns and initializes Tech Status to `Not Started`.

The Section Source relation is two-way, so every Accounts class subitem displays its full Classroom Creation Request history. The Current Active Teacher relation is also two-way, so each Staff Directory item displays only requests for classes the teacher currently teaches. `syncActiveClassroomRequestTeachers` clears or moves that teacher relation when an account/class becomes inactive or its Assigned Teacher changes; the class history remains intact.

Run `installActiveClassroomRequestSyncTrigger` once as the Apps Script owner after deployment. It installs a single 15-minute reconciliation trigger, replacing any earlier trigger for the same handler.

Tech staff can update the subitem Tech Status and Tech Notes fields during fulfillment.

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

The token must be able to read boards `9739309783`, `9718635629`, and `9719292298`, create items on `18427083218`, and create subitems on its subitem board `18427107495`. Never put the token in this repository or client-side HTML.

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

These execution and access settings are also declared in `src/appsscript.json` so command-line deployments preserve the public web-app entry point.

The app deliberately allows framing so the same deployment can load inside monday.com. Public deployment exposes eligible teacher names and their Active/Selected Teacher category, so the deployment URL should be treated as organizationally sensitive even though it is anonymous.

## Security controls in this version

- Monday token remains server-side in Script Properties.
- Teacher, school, and section eligibility is revalidated at submission time.
- A honeypot rejects simple automated submissions.
- Script locking and request-ID caching reduce accidental duplicate items.
- Input lengths, enum values, IDs, and duplicate sections are validated server-side.
- Form payloads are not logged.

Before production launch, add an approved CAPTCHA or equivalent abuse-control mechanism for the anonymous endpoint.
