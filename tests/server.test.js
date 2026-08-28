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
  teacherName: 'Rebecca Brito', eligible: true, requestItemId: '', portalUrl: ''
};

const values = JSON.parse(JSON.stringify(context.buildRequestColumnValues_(normalized, classroom, 'Draft', 1, true)));
assert.deepEqual(values.board_relation_mm6nf3v9, { item_ids: [9719299999] });
assert.deepEqual(values.board_relation_mm6bpfd8, { item_ids: [9718639999] });
assert.deepEqual(values.board_relation_mm6ntah3, { item_ids: [12757169867] });
assert.deepEqual(values.color_mm6ny859, { label: 'Draft' });
assert.equal(values.text_mm6nce2m, 'Coach Name');
assert.deepEqual(values.email_mm6nk9mk, { email: 'coach@kreyco.com', text: 'coach@kreyco.com' });
assert.equal(values.text_mm6n4jcy, 'Spanish');
assert.deepEqual(values.long_text_mm6n6620, { text: 'secure link' });
assert.deepEqual(values.color_mm6nr1q, { label: 'Yes' });
assert.deepEqual(values.color_mm6nb7mr, { label: 'No' });
assert.equal(values.numeric_mm6nc08f, '1');
assert.deepEqual(values.color_mm6n8gnz, { label: 'Not Requested' });

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

const parsedClass = context.parseClassItem_({
  id: '9719299999', name: 'Spanish I',
  column_values: [
    { id: 'color_mkvqqdzk', label: 'Active - New' },
    { id: 'board_relation_mktxpkv3', linked_items: [{ id: '12757169867', name: 'Rebecca Brito' }] },
    { id: 'board_relation_mm6ndter', linked_item_ids: ['12800000000'] },
    { id: 'link_mm6n6qs', url: 'https://example.test/portal' }
  ],
  parent_item: { id: '9718639999', name: 'North Valley Middle School', column_values: [{ id: 'color_mkwjcmfq', label: 'Active' }] }
});
assert.equal(parsedClass.eligible, true);
assert.equal(parsedClass.teacherId, '12757169867');
assert.equal(parsedClass.requestItemId, '12800000000');
assert.equal(parsedClass.portalUrl, 'https://example.test/portal');

console.log('Server helper tests passed');
