const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.js'), 'utf8');
const context = vm.createContext({ console });
vm.runInContext(source, context, { filename: 'Code.js' });

assert.equal(context.isEligibleClassStatus_('Active - New'), true);
assert.equal(context.isEligibleClassStatus_('Pending assignment'), true);
assert.equal(context.isEligibleClassStatus_(''), true);
assert.equal(context.isEligibleClassStatus_('Ended - Renewal'), false);
assert.equal(context.isEligibleClassStatus_('Ended - New'), false);
assert.equal(context.isEligibleClassStatus_('Ended'), false);
assert.equal(context.isEligibleClassStatus_('Not moving forward'), false);

const completePayload = {
  requestId: '12345678-1234-1234-1234-123456789012',
  operationId: '87654321-4321-4321-4321-210987654321',
  expectedRevision: 0,
  acknowledged: true,
  schoolId: '9718639999',
  classId: '9719299999',
  accessToken: '',
  coachName: ' Coach Name ',
  coachEmail: 'Coach@Kreyco.com',
  language: ' Spanish ',
  gradeLevel: ' 8 ',
  kreycoCurriculum: ' Kreyco Spanish 1 ',
  lmsCredentials: ' secure link ',
  verificationNeeded: 'Yes',
  useGoogleClassroom: 'No',
  otherGradingPlatform: ' Canvas ',
  gradingCredentials: '',
  schedule: ' Period 2 '
};

const normalized = context.normalizeClassRequest_(completePayload, false);
assert.equal(normalized.coachName, 'Coach Name');
assert.equal(normalized.coachEmail, 'coach@kreyco.com');
assert.equal(normalized.language, 'Spanish');
assert.equal(normalized.lmsCredentials, 'secure link');
assert.equal(normalized.schedule, 'Period 2');

const assignedCoachPayload = Object.assign({}, completePayload, {
  useAssignedCoach: true,
  assignedCoachId: '43174826',
  coachName: '',
  coachEmail: ''
});
const assignedCoachRequest = context.normalizeClassRequest_(assignedCoachPayload, false);
assert.equal(assignedCoachRequest.useAssignedCoach, true);
assert.equal(assignedCoachRequest.assignedCoachId, '43174826');
assert.equal(assignedCoachRequest.coachEmail, '');

const draft = context.normalizeClassRequest_(Object.assign({}, completePayload, {
  language: '', gradeLevel: '', kreycoCurriculum: '', verificationNeeded: '', useGoogleClassroom: '', otherGradingPlatform: ''
}), true);
assert.equal(draft.language, '');
assert.equal(draft.verificationNeeded, '');
assert.equal(draft.useGoogleClassroom, '');

assert.throws(() => context.normalizeClassRequest_(Object.assign({}, completePayload, { otherGradingPlatform: '' }), false), /other grading platform/i);
assert.throws(() => context.normalizeClassRequest_(Object.assign({}, completePayload, { coachEmail: 'not-an-email' }), true), /valid coach email/i);
assert.throws(() => context.normalizeClassRequest_(Object.assign({}, completePayload, { acknowledged: false }), true), /acknowledge/i);

const classroom = {
  id: '9719299999', name: 'Spanish I - Period 2', status: 'Active - New', schoolId: '9718639999',
  schoolName: 'North Valley Middle School', schoolStatus: 'Active', teacherId: '12757169867',
  teacherName: 'Rebecca Brito', eligible: true, requestItemId: '', portalUrl: '',
  coachCandidates: [{ id: '43174826', name: 'Sierra Coach', email: 'sierra@kreyco.com' }], hasCoachTeamAssignment: false
};

context.resolveRequestCoach_(assignedCoachRequest, classroom);
assert.equal(assignedCoachRequest.coachName, 'Sierra Coach');
assert.equal(assignedCoachRequest.coachEmail, 'sierra@kreyco.com');
assert.throws(() => context.resolveRequestCoach_(Object.assign({}, assignedCoachRequest, { assignedCoachId: '99999999' }), classroom), /changed or is no longer available/i);

const values = JSON.parse(JSON.stringify(context.buildRequestColumnValues_(normalized, classroom, 'Draft', 1, true)));
assert.deepEqual(values.board_relation_mm6nf3v9, { item_ids: [9719299999] });
assert.deepEqual(values.board_relation_mm6bpfd8, { item_ids: [9718639999] });
assert.deepEqual(values.board_relation_mm6ntah3, { item_ids: [12757169867] });
assert.deepEqual(values.multiple_person_mm6na1xy, { personsAndTeams: [] });
assert.deepEqual(values.color_mm6ny859, { label: 'Draft' });
assert.equal(values.text_mm6nce2m, 'Coach Name');
assert.deepEqual(values.email_mm6nk9mk, { email: 'coach@kreyco.com', text: 'coach@kreyco.com' });
assert.equal(values.text_mm6n4jcy, 'Spanish');
assert.deepEqual(values.long_text_mm6n6620, { text: 'secure link' });
assert.deepEqual(values.color_mm6nr1q, { label: 'Yes' });
assert.deepEqual(values.color_mm6nb7mr, { label: 'No' });
assert.equal(values.numeric_mm6nc08f, '1');
assert.deepEqual(values.color_mm6n8gnz, { label: 'Not Requested' });

const assignedCoachValues = JSON.parse(JSON.stringify(context.buildRequestColumnValues_(assignedCoachRequest, classroom, 'Draft', 1, true)));
assert.deepEqual(assignedCoachValues.multiple_person_mm6na1xy, { personsAndTeams: [{ id: 43174826, kind: 'person' }] });
assert.equal(assignedCoachValues.text_mm6nce2m, 'Sierra Coach');
assert.deepEqual(assignedCoachValues.email_mm6nk9mk, { email: 'sierra@kreyco.com', text: 'sierra@kreyco.com' });

const draftValues = JSON.parse(JSON.stringify(context.buildRequestColumnValues_(draft, classroom, 'Draft', 1, true)));
assert.equal(draftValues.text_mm6n4jcy, '');
assert.equal(draftValues.color_mm6nr1q, null);
assert.equal(draftValues.color_mm6nb7mr, null);

const unassigned = Object.assign({}, classroom, { teacherId: '', teacherName: '' });
const unassignedValues = JSON.parse(JSON.stringify(context.buildRequestColumnValues_(normalized, unassigned, 'Draft', 1, true)));
assert.deepEqual(unassignedValues.board_relation_mm6ntah3, { item_ids: [] });

assert.equal(context.progressPercent_('Draft'), 5);
assert.equal(context.progressPercent_('In Progress'), 55);
assert.equal(context.progressPercent_('Completed'), 100);
assert.match(context.defaultProgressMessage_('Waiting for Information'), /additional information/i);
assert.equal(context.constantTimeEqual_('same-token', 'same-token'), true);
assert.equal(context.constantTimeEqual_('same-token', 'different-token'), false);
assert.equal(context.isValidEmail_('coach@kreyco.com'), true);
assert.equal(context.isValidEmail_('coach@'), false);

const sanitizedAudit = JSON.parse(JSON.stringify(context.sanitizeAuditValue_({
  accessToken: 'private-token',
  lmsCredentials: 'do-not-log',
  gradingCredentials: 'also-do-not-log',
  hasLmsCredentials: true,
  nested: { password: 'secret', url: 'https://example.test/?class=123&access=private-token&mode=coach' }
}, '')));
assert.equal(sanitizedAudit.accessToken, '[REDACTED]');
assert.equal(sanitizedAudit.lmsCredentials, '[REDACTED]');
assert.equal(sanitizedAudit.gradingCredentials, '[REDACTED]');
assert.equal(sanitizedAudit.hasLmsCredentials, true);
assert.equal(sanitizedAudit.nested.password, '[REDACTED]');
assert.equal(sanitizedAudit.nested.url, 'https://example.test/?class=123&access=[REDACTED]&mode=coach');

const oversizedJson = context.auditJson_({
  schemaVersion: 1, source: 'test', timestampUtc: '2026-08-28T00:00:00.000Z', eventId: 'event-1',
  severity: 'INFO', category: 'test', action: 'oversized', outcome: 'success', details: { value: 'x'.repeat(50000) }
});
assert.doesNotThrow(() => JSON.parse(oversizedJson));
assert.ok(oversizedJson.length <= 45000);

const snapshotDiff = JSON.parse(JSON.stringify(context.diffAuditSnapshots_(
  { status: 'Draft', revision: 1, progress: { targetDate: '' } },
  { status: 'Sent to Tech', revision: 2, progress: { targetDate: '2026-09-15' } }
)));
assert.deepEqual(snapshotDiff.map(entry => entry.field), ['progress.targetDate', 'revision', 'status']);

const archivedSnapshot = JSON.parse(JSON.stringify(context.requestAuditSnapshot_({
  id: '12835244405', name: 'Class request', url: 'https://monday.test/item', requestId: 'request-1', itemState: 'archived',
  classId: '100', className: 'French', schoolId: '200', schoolName: 'School', teacherId: '', teacherName: '', teacherEmail: '',
  status: 'Sent to Tech', revision: 2, assignedCoachId: '43174826', coachName: 'Coach', coachEmail: 'coach@example.com', language: 'French', gradeLevel: '9',
  kreycoCurriculum: 'Curriculum', hasLmsCredentials: true, lmsCredentialsChangedAt: '2026-08-28T12:00:00Z',
  verificationNeeded: 'Yes', useGoogleClassroom: 'No', otherGradingPlatform: 'Canvas', hasGradingCredentials: true,
  gradingCredentialsChangedAt: '2026-08-28T12:01:00Z', schedule: 'Period 1', publicProgress: 'Reviewing',
  hasInternalNotes: true, internalNotesChangedAt: '2026-08-28T12:02:00Z', targetDate: '2026-09-01', submittedDate: '2026-08-28',
  coachUpdateDate: '', notificationAudience: 'Tech', notificationState: 'Not Requested', notificationMessage: '', notificationEventId: '', notificationError: ''
})));
assert.equal(archivedSnapshot.itemState, 'archived');
assert.equal(archivedSnapshot.coach.mondayUserId, '43174826');
assert.equal(archivedSnapshot.form.hasLmsCredentials, true);
assert.equal(Object.hasOwn(archivedSnapshot.form, 'lmsCredentials'), false);
assert.equal(archivedSnapshot.progress.hasInternalNotes, true);
assert.equal(Object.hasOwn(archivedSnapshot.progress, 'internalNotes'), false);

assert.equal(context.columnChangedAt_([{ id: 'credentials', value: '{"text":"never logged","changed_at":"2026-08-28T12:00:00Z"}' }], 'credentials'), '2026-08-28T12:00:00Z');

const testScriptProperties = { EMAILS_PAUSED: 'true', ADMIN_EMAILS: 'it@kreyco.com,backup@kreyco.com' };
context.PropertiesService = { getScriptProperties: () => ({ getProperty: key => testScriptProperties[key] || '' }) };
assert.equal(context.areEmailsPaused_(), true);
testScriptProperties.EMAILS_PAUSED = 'false';
assert.equal(context.areEmailsPaused_(), false);
let activeAdminEmail = 'it@kreyco.com';
context.Session = { getActiveUser: () => ({ getEmail: () => activeAdminEmail }) };
assert.equal(context.requireTechAdministrator_(), 'it@kreyco.com');
activeAdminEmail = '';
assert.throws(() => context.requireTechAdministrator_(), /restricted/i);

const parsedClass = context.parseClassItem_({
  id: '9719299999', name: 'Spanish I',
  column_values: [
    { id: 'color_mkvqqdzk', label: 'Active - New' },
    { id: 'board_relation_mktxpkv3', linked_items: [{ id: '12757169867', name: 'Rebecca Brito', column_values: [
      { id: 'people8', persons_and_teams: [{ id: '43174826', kind: 'person' }, { id: '881594', kind: 'team' }] }
    ] }] },
    { id: 'board_relation_mm6ndter', linked_item_ids: ['12800000000'] },
    { id: 'link_mm6n6qs', url: 'https://example.test/portal' }
  ],
  parent_item: { id: '9718639999', name: 'North Valley Middle School', column_values: [{ id: 'color_mkwjcmfq', label: 'Active' }] }
});
assert.equal(parsedClass.eligible, true);
assert.equal(parsedClass.teacherId, '12757169867');
assert.deepEqual(JSON.parse(JSON.stringify(parsedClass.coachUserIds)), ['43174826']);
assert.equal(parsedClass.hasCoachTeamAssignment, true);
assert.equal(parsedClass.requestItemId, '12800000000');
assert.equal(parsedClass.portalUrl, 'https://example.test/portal');

const originalMondayRequest = context.mondayRequest_;
context.mondayRequest_ = (query, variables) => {
  if (query.includes('ResolveTeacherCoaches')) return { items: [{
    id: '12757169867', column_values: [{ id: 'people8', persons_and_teams: [{ id: '43174826', kind: 'person' }] }]
  }] };
  if (query.includes('ResolveCoachUsers')) return { users: [{ id: '43174826', name: 'Sierra Coach', email: 'sierra@kreyco.com' }] };
  throw new Error('Unexpected query in coach hydration test');
};
context.hydrateClassCoaches_([parsedClass]);
context.mondayRequest_ = originalMondayRequest;
assert.equal(parsedClass.coachCandidates[0].email, 'sierra@kreyco.com');
const publicClass = JSON.parse(JSON.stringify(context.publicClassroom_(parsedClass)));
assert.deepEqual(publicClass.coachOptions, [{ id: '43174826', name: 'Sierra Coach', hasEmail: true }]);
assert.equal(Object.hasOwn(publicClass.coachOptions[0], 'email'), false);

console.log('Server helper tests passed');
