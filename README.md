# Classroom Creation Request

Google Apps Script web form for classroom-creation requests. The form is designed to run both as a public Apps Script web app and inside a monday.com board view.

## Verified monday.com mapping

| Purpose | Board / column |
| --- | --- |
| Destination request board | `18427083218` |
| Legacy Teacher at Submission relation | `board_relation_mm6b2ch9` → Staff Directory `9739309783` |
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
| Accounts | `9718635629` |
| Active account status | `color_mkwjcmfq`, label `Active` |
| Account subitem board | `9719292298` |
| Assigned Teacher relation | `board_relation_mktxpkv3` |
| Class eligibility status | `color_mkvqqdzk`; excludes `Ended - Renewal`, `Ended - New`, `Ended`, and `Not moving forward` |
| Subitem Section Source relation | `board_relation_mm6k159n` → Accounts subitems `9719292298` |
| Accounts class Classroom Creation Requests relation | `board_relation_mm6kgfwb` → request subitems `18427107495` |
| Subitem Current Active Teacher relation | `board_relation_mm6k90h2` → Staff Directory `9739309783` |
| Staff Active Classroom Requests relation | `board_relation_mm6ktws1` → request subitems `18427107495` |
| Subitem language | `text_mm6bvj23` |
| Subitem grade level | `text_mm6bnbka` |
| Subitem Kreyco curriculum | `text_mm6bfn7d` |
| Subitem Tech status | `color_mm6b9q2c` |
| Subitem Tech notes | `long_text_mm6bbjzp` |

The school picker is searchable and paginated. It lists active Accounts that have at least one eligible class. Selecting a school loads its eligible classes and displays each class's current Assigned Teacher. Classes without an assigned teacher remain selectable and are labeled accordingly.

## Submission behavior

A successful submission:

1. Revalidates the school, classes, status exclusions, and current teacher assignments against monday.com.
2. Creates one parent request item named after the authoritative Accounts school name.
3. Writes the School Account relation plus every request-level answer into native parent columns. The legacy Teacher at Submission relation is not used for new class-first requests.
4. Creates one native subitem per classroom section, named after the authoritative Accounts subitem.
5. Writes the source class, language, grade level, and Kreyco curriculum into native subitem columns, initializes Tech Status to `Not Started`, and links the current teacher when one is assigned.

The Section Source relation is two-way, so every Accounts class subitem displays its full Classroom Creation Request history. The Current Active Teacher relation is also two-way, so each Staff Directory item displays requests for eligible classes the teacher currently teaches. Requests for unassigned classes remain linked only to the class until a teacher is assigned. `syncActiveClassroomRequestTeachers` adds, clears, or moves the teacher relation when an account/class status or Assigned Teacher changes; the class history remains intact.

After deployment, add one Apps Script time-driven trigger for `syncActiveClassroomRequestTeachers` using the **Minutes timer** event type and **Every 15 minutes** interval. Creating the trigger in the Apps Script editor avoids granting clasp an unnecessary ScriptApp OAuth scope.

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

The app deliberately allows framing so the same deployment can load inside monday.com. Public deployment exposes active school names, eligible class names/statuses, and current teacher names, so the deployment URL should be treated as organizationally sensitive even though it is anonymous.

## Security controls in this version

- Monday token remains server-side in Script Properties.
- School, class, status, and teacher-assignment data is revalidated at submission time.
- A honeypot rejects simple automated submissions.
- Script locking and request-ID caching reduce accidental duplicate items.
- Input lengths, enum values, IDs, and duplicate sections are validated server-side.
- Form payloads are not logged.

Before production launch, add an approved CAPTCHA or equivalent abuse-control mechanism for the anonymous endpoint.
