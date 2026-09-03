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
  requestDetails: ' Please create separate teacher and student sections. ',
  lmsCredentials: ' secure link ',
  verificationNeeded: 'Yes',
  useGoogleClassroom: 'No',
  otherGradingPlatform: ' Canvas ',
  gradingCredentials: '',
  schedule: ' Period 2 ',
  neededByDate: '2026-09-15'
};

const normalized = context.normalizeClassRequest_(completePayload, false);
assert.equal(normalized.coachName, 'Coach Name');
assert.equal(normalized.coachEmail, 'coach@kreyco.com');
assert.equal(normalized.language, 'Spanish');
assert.equal(normalized.lmsCredentials, 'secure link');
assert.equal(normalized.requestDetails, 'Please create separate teacher and student sections.');
assert.equal(Object.hasOwn(normalized, 'verificationNeeded'), false);
assert.equal(normalized.schedule, 'Period 2');
assert.equal(normalized.gradeLevel, '8');
assert.equal(normalized.neededByDate, '2026-09-15');
assert.equal(context.optionalDate_('', 'needed by'), '');
assert.equal(context.optionalDate_('2028-02-29', 'needed by'), '2028-02-29');
for (const invalidDate of ['09/15/2026', '2026-02-29', '2026-13-01', 'not-a-date']) {
  assert.throws(() => context.normalizeClassRequest_(Object.assign({}, completePayload, { neededByDate: invalidDate }), false), /valid date/i);
}

// Grade level is optional. Public LMS verification input is ignored because the field is Tech-only.
for (const optionalFields of [{ gradeLevel: '' }, { gradeLevel: undefined }]) {
  const optionalRequest = context.normalizeClassRequest_(Object.assign({}, completePayload, optionalFields), false);
  assert.equal(optionalRequest.gradeLevel, '');
}
assert.equal(Object.hasOwn(context.normalizeClassRequest_(Object.assign({}, completePayload, { verificationNeeded: 'Maybe' }), false), 'verificationNeeded'), false);
for (const requiredField of ['language', 'kreycoCurriculum', 'useGoogleClassroom']) {
  assert.throws(() => context.normalizeClassRequest_(Object.assign({}, completePayload, { [requiredField]: '' }), false));
}

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
  language: '', gradeLevel: '', kreycoCurriculum: '', useGoogleClassroom: '', otherGradingPlatform: ''
}), true);
assert.equal(draft.language, '');
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
assert.deepEqual(values.long_text_mm6vdzch, { text: 'Please create separate teacher and student sections.' });
assert.deepEqual(values.long_text_mm6n6620, { text: 'secure link' });
assert.equal(Object.hasOwn(values, 'color_mm6nr1q'), false);
assert.deepEqual(values.color_mm6nb7mr, { label: 'No' });
assert.equal(values.numeric_mm6nc08f, '1');
assert.deepEqual(values.color_mm6n8gnz, { label: 'Not Requested' });
assert.deepEqual(values.date_mm6vwjs, { date: '2026-09-15' });

const optionalSubmission = context.normalizeClassRequest_(Object.assign({}, completePayload, { gradeLevel: '' }), false);
const originalSubmissionToday = context.today_;
context.today_ = () => '2026-08-31';
const optionalSubmissionValues = context.buildRequestColumnValues_(optionalSubmission, classroom, 'Sent to Tech', 1, true);
context.today_ = originalSubmissionToday;
assert.equal(optionalSubmissionValues.text_mm6nc7za, '');
assert.equal(Object.hasOwn(optionalSubmissionValues, 'color_mm6nr1q'), false);
assert.equal(context.buildRequestColumnValues_(Object.assign({}, optionalSubmission, { neededByDate: '' }), classroom, 'Draft', 2, false).date_mm6vwjs, null);

const assignedCoachValues = JSON.parse(JSON.stringify(context.buildRequestColumnValues_(assignedCoachRequest, classroom, 'Draft', 1, true)));
assert.deepEqual(assignedCoachValues.multiple_person_mm6na1xy, { personsAndTeams: [{ id: 43174826, kind: 'person' }] });
assert.equal(assignedCoachValues.text_mm6nce2m, 'Sierra Coach');
assert.deepEqual(assignedCoachValues.email_mm6nk9mk, { email: 'sierra@kreyco.com', text: 'sierra@kreyco.com' });

const draftValues = JSON.parse(JSON.stringify(context.buildRequestColumnValues_(draft, classroom, 'Draft', 1, true)));
assert.equal(draftValues.text_mm6n4jcy, '');
assert.equal(Object.hasOwn(draftValues, 'color_mm6nr1q'), false);
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
  kreycoCurriculum: 'Curriculum', requestDetails: 'Create two sections.', hasLmsCredentials: true, lmsCredentialsChangedAt: '2026-08-28T12:00:00Z',
  verificationNeeded: 'Yes', useGoogleClassroom: 'No', otherGradingPlatform: 'Canvas', hasGradingCredentials: true,
  gradingCredentialsChangedAt: '2026-08-28T12:01:00Z', schedule: 'Period 1', neededByDate: '2026-09-15', publicProgress: 'Reviewing',
  hasInternalNotes: true, internalNotesChangedAt: '2026-08-28T12:02:00Z', targetDate: '2026-09-01', submittedDate: '2026-08-28',
  coachUpdateDate: '', notificationAudience: 'Tech', notificationState: 'Not Requested', notificationMessage: '', notificationEventId: '', notificationError: ''
})));
assert.equal(archivedSnapshot.itemState, 'archived');
assert.equal(archivedSnapshot.coach.mondayUserId, '43174826');
assert.equal(archivedSnapshot.form.hasLmsCredentials, true);
assert.equal(archivedSnapshot.form.requestDetails, 'Create two sections.');
assert.equal(archivedSnapshot.form.neededByDate, '2026-09-15');
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

const submittedRequest = {
  id: '12800000000', requestId: completePayload.requestId, revision: 3, status: 'In Progress',
  assignedCoachId: '', coachName: 'Coach Name', coachEmail: 'coach@kreyco.com', language: 'Spanish', gradeLevel: '8',
  kreycoCurriculum: 'Kreyco Spanish 1', requestDetails: 'Original details', hasLmsCredentials: true, verificationNeeded: 'Yes', useGoogleClassroom: 'No',
  otherGradingPlatform: 'Canvas', hasGradingCredentials: false, schedule: 'Period 2', neededByDate: '2026-09-15', publicProgress: 'Working',
  targetDate: '', submittedDate: '2026-08-28', coachUpdateDate: ''
};
const submittedPortal = JSON.parse(JSON.stringify(context.buildPortalResponse_(classroom, submittedRequest, 'coach', 'coach-token')));
assert.equal(submittedPortal.mode, 'summary');
assert.equal(submittedPortal.request.canEditDetails, true);
assert.equal(submittedPortal.request.hasLmsCredentials, true);
assert.equal(submittedPortal.request.coachEmail, 'coach@kreyco.com');
assert.equal(submittedPortal.request.neededByDate, '2026-09-15');
assert.equal(submittedPortal.request.requestDetails, 'Original details');
assert.equal(Object.hasOwn(submittedPortal.request, 'verificationNeeded'), false);
const cancelledPortal = JSON.parse(JSON.stringify(context.buildPortalResponse_(classroom, Object.assign({}, submittedRequest, { status: 'Cancelled' }), 'coach', 'coach-token')));
assert.equal(cancelledPortal.request.canEditDetails, false);

let changedRequestValues;
const originalCacheService = context.CacheService;
const originalRateLimit = context.enforceRateLimit_;
const originalWithLease = context.withLease_;
const originalTokenValidator = context.isValidPortalToken_;
const originalGetClass = context.getClassById_;
const originalGetRequest = context.getRequestItem_;
const originalUpdateRequest = context.updateRequestItem_;
const originalCreateUpdate = context.createMondayUpdate_;
const originalProcessNotification = context.processNotificationById_;
const originalToday = context.today_;
const originalSaveResult = context.saveResult_;
context.CacheService = { getScriptCache: () => ({ get: () => null, put: () => {} }) };
context.enforceRateLimit_ = () => {};
context.withLease_ = (key, callback) => callback();
context.isValidPortalToken_ = () => true;
context.getClassById_ = () => Object.assign({}, classroom, { requestItemId: submittedRequest.id });
let requestReadCount = 0;
context.getRequestItem_ = () => {
  requestReadCount += 1;
  return requestReadCount === 1 ? submittedRequest : Object.assign({}, submittedRequest, { revision: 4, status: 'Reopened - Coach Update' });
};
context.updateRequestItem_ = (itemId, changedValues) => { changedRequestValues = changedValues; };
context.createMondayUpdate_ = () => {};
context.processNotificationById_ = () => ({ sent: true });
context.today_ = () => '2026-08-29';
context.saveResult_ = (savedClassroom, requestItem) => ({ ok: true, itemId: requestItem.id, revision: requestItem.revision, status: requestItem.status, reference: 'CCR-' + requestItem.id });
const changeResult = JSON.parse(JSON.stringify(context.submitRequestChanges_(Object.assign({}, completePayload, {
  expectedRevision: 3,
  accessToken: 'valid-coach-token'
}))));
assert.equal(changeResult.revision, 4);
assert.equal(changeResult.status, 'Reopened - Coach Update');
assert.deepEqual(JSON.parse(JSON.stringify(changedRequestValues.color_mm6ny859)), { label: 'Reopened - Coach Update' });
assert.deepEqual(JSON.parse(JSON.stringify(changedRequestValues.color_mm6n6tt9)), { label: 'Tech' });
assert.deepEqual(JSON.parse(JSON.stringify(changedRequestValues.color_mm6n8gnz)), { label: 'Pending' });
assert.deepEqual(JSON.parse(JSON.stringify(changedRequestValues.long_text_mm6vdzch)), { text: 'Please create separate teacher and student sections.' });
assert.equal(Object.hasOwn(changedRequestValues, 'color_mm6nr1q'), false);

requestReadCount = 0;
const optionalChangeResult = context.submitRequestChanges_(Object.assign({}, completePayload, {
  expectedRevision: 3, accessToken: 'valid-coach-token', gradeLevel: ''
}));
assert.equal(optionalChangeResult.status, 'Reopened - Coach Update');
assert.equal(changedRequestValues.text_mm6nc7za, '');
assert.equal(Object.hasOwn(changedRequestValues, 'color_mm6nr1q'), false);

let coachUpdateBody = '';
context.getRequestItem_ = () => submittedRequest;
context.createMondayUpdate_ = (itemId, body) => { coachUpdateBody = body; };
const coachUpdateResult = context.submitCoachUpdate_({
  classId: classroom.id, accessToken: 'valid-coach-token', expectedRevision: 3,
  operationId: '12344321-1234-4321-1234-123456789012', message: 'Please add the late roster.', website: ''
});
assert.equal(coachUpdateResult.revision, 4);
assert.deepEqual(JSON.parse(JSON.stringify(changedRequestValues.long_text_mm6vdzch)), {
  text: 'Original details\n\n[2026-08-29] Coach Name:\nPlease add the late roster.'
});
assert.equal(coachUpdateBody, 'Coach update:\n\nPlease add the late roster.');
assert.equal(Object.hasOwn(changedRequestValues, 'color_mm6nr1q'), false);
assert.equal(context.requestDetailsUpdateBody_('Submitted.', ''), 'Submitted.');
assert.equal(context.requestDetailsUpdateBody_('Submitted.', 'Two sections.'), 'Submitted.\n\nRequest details:\nTwo sections.');
context.CacheService = originalCacheService;
context.enforceRateLimit_ = originalRateLimit;
context.withLease_ = originalWithLease;
context.isValidPortalToken_ = originalTokenValidator;
context.getClassById_ = originalGetClass;
context.getRequestItem_ = originalGetRequest;
context.updateRequestItem_ = originalUpdateRequest;
context.createMondayUpdate_ = originalCreateUpdate;
context.processNotificationById_ = originalProcessNotification;
context.today_ = originalToday;
context.saveResult_ = originalSaveResult;

console.log('Server helper tests passed');
