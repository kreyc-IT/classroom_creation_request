const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.js'), 'utf8');
const context = vm.createContext({ console });
vm.runInContext(source, context, { filename: 'Code.js' });

assert.equal(context.containsActive_('Active - New'), true);
assert.equal(context.containsActive_('Active - Renewal'), true);
assert.equal(context.containsActive_('Inactive'), false);
assert.equal(context.containsActive_('Ended - Renewal'), false);

const normalized = context.normalizeSubmission_({
  requestId: '12345678-1234-1234-1234-123456789012',
  acknowledged: true,
  teacherId: '12757169867',
  schoolId: '9718639999',
  lmsCredentials: ' secure link ',
  verificationNeeded: 'Yes',
  useGoogleClassroom: 'No',
  otherGradingPlatform: 'Canvas',
  gradingCredentials: '',
  schedule: ' Period 2 ',
  classrooms: [{
    sectionId: '9719299999',
    language: ' Spanish ',
    gradeLevel: ' 8 ',
    kreycoCurriculum: 'Kreyco Spanish 1'
  }]
});

assert.equal(normalized.teacherId, '12757169867');
assert.equal(normalized.lmsCredentials, 'secure link');
assert.equal(normalized.classrooms[0].language, 'Spanish');

const assignments = [{
  sectionId: '9719299999',
  sectionName: 'Spanish I - Period 2',
  sectionStatus: 'Active - New',
  schoolId: '9718639999',
  schoolName: 'North Valley Middle School',
  schoolStatus: 'Active'
}];

context.validateSchoolAndSections_(normalized, assignments);
assert.equal(normalized.schoolName, 'North Valley Middle School');
assert.equal(normalized.classrooms[0].sectionName, 'Spanish I - Period 2');

const parentValues = JSON.parse(JSON.stringify(context.buildParentColumnValues_({
  id: normalized.teacherId,
  name: 'Rebecca Brito'
}, normalized)));
assert.deepEqual(parentValues.board_relation_mm6b2ch9, { item_ids: [12757169867] });
assert.deepEqual(parentValues.board_relation_mm6bpfd8, { item_ids: [9718639999] });
assert.deepEqual(parentValues.long_text_mm6b3t9w, { text: 'secure link' });
assert.deepEqual(parentValues.color_mm6bmy8h, { label: 'Yes' });
assert.deepEqual(parentValues.color_mm6bag89, { label: 'No' });
assert.equal(parentValues.text_mm6btys6, 'Canvas');
assert.deepEqual(parentValues.boolean_mm6bkxm5, { checked: 'true' });
assert.equal(parentValues.text_mm6bsfag, normalized.requestId);

const subitemValues = JSON.parse(JSON.stringify(
  context.buildSubitemColumnValues_(normalized.classrooms[0], normalized.teacherId)
));
assert.deepEqual(subitemValues.board_relation_mm6k159n, { item_ids: [9719299999] });
assert.deepEqual(subitemValues.board_relation_mm6k90h2, { item_ids: [12757169867] });
assert.equal(subitemValues.text_mm6bvj23, 'Spanish');
assert.equal(subitemValues.text_mm6bnbka, '8');
assert.equal(subitemValues.text_mm6bfn7d, 'Kreyco Spanish 1');
assert.deepEqual(subitemValues.color_mm6b9q2c, { label: 'Not Started' });

const activeRequest = {
  column_values: [{
    id: 'board_relation_mm6k159n',
    linked_items: [{
      column_values: [
        { id: 'color_mkvqqdzk', label: 'Active - Renewal' },
        { id: 'board_relation_mktxpkv3', linked_item_ids: ['12757169867'] }
      ],
      parent_item: {
        column_values: [{ id: 'color_mkwjcmfq', label: 'Active' }]
      }
    }]
  }]
};
assert.equal(context.desiredActiveTeacherId_(activeRequest), '12757169867');

const inactiveRequest = JSON.parse(JSON.stringify(activeRequest));
inactiveRequest.column_values[0].linked_items[0].column_values[0].label = 'Ended - Renewal';
assert.equal(context.desiredActiveTeacherId_(inactiveRequest), '');

const inactiveAccountRequest = JSON.parse(JSON.stringify(activeRequest));
inactiveAccountRequest.column_values[0].linked_items[0].parent_item.column_values[0].label = 'Inactive';
assert.equal(context.desiredActiveTeacherId_(inactiveAccountRequest), '');

assert.throws(() => context.normalizeSubmission_({ acknowledged: false }), /acknowledge/i);
assert.throws(() => context.normalizeSubmission_({
  requestId: '12345678-1234-1234-1234-123456789012',
  acknowledged: true,
  teacherId: '1',
  schoolId: '2',
  verificationNeeded: 'Yes',
  useGoogleClassroom: 'No',
  otherGradingPlatform: '',
  classrooms: [{ sectionId: '3', language: 'Spanish', gradeLevel: '8', kreycoCurriculum: 'Kreyco Spanish 1' }]
}), /other grading platform/i);

console.log('Server helper tests passed');
