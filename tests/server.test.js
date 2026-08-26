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

const normalized = context.normalizeSubmission_({
  requestId: '12345678-1234-1234-1234-123456789012',
  acknowledged: true,
  schoolId: '9718639999',
  classrooms: [{
    sectionId: '9719299999',
    language: ' Spanish ',
    gradeLevel: ' 8 ',
    kreycoCurriculum: 'Kreyco Spanish 1',
    lmsCredentials: ' secure link ',
    verificationNeeded: 'Yes',
    useGoogleClassroom: 'No',
    otherGradingPlatform: 'Canvas',
    gradingCredentials: '',
    schedule: ' Period 2 '
  }]
});

assert.equal(normalized.classrooms[0].language, 'Spanish');
assert.equal(normalized.classrooms[0].lmsCredentials, 'secure link');
assert.equal(normalized.classrooms[0].schedule, 'Period 2');

const classes = [{
  sectionId: '9719299999',
  sectionName: 'Spanish I - Period 2',
  sectionStatus: 'Active - New',
  schoolId: '9718639999',
  schoolName: 'North Valley Middle School',
  schoolStatus: 'Active',
  teacherId: '12757169867',
  teacherName: 'Rebecca Brito'
}];

context.validateSchoolAndSections_(normalized, classes);
assert.equal(normalized.schoolName, 'North Valley Middle School');
assert.equal(normalized.classrooms[0].sectionName, 'Spanish I - Period 2');
assert.equal(normalized.classrooms[0].teacherId, '12757169867');
assert.equal(normalized.classrooms[0].teacherName, 'Rebecca Brito');

const parentValues = JSON.parse(JSON.stringify(context.buildParentColumnValues_(normalized)));
assert.equal(parentValues.board_relation_mm6b2ch9, undefined);
assert.deepEqual(parentValues.board_relation_mm6bpfd8, { item_ids: [9718639999] });
assert.equal(parentValues.long_text_mm6b3t9w, undefined);
assert.equal(parentValues.color_mm6bmy8h, undefined);
assert.deepEqual(parentValues.boolean_mm6bkxm5, { checked: 'true' });
assert.equal(parentValues.text_mm6bsfag, normalized.requestId);

const subitemValues = JSON.parse(JSON.stringify(
  context.buildSubitemColumnValues_(normalized.classrooms[0])
));
assert.deepEqual(subitemValues.board_relation_mm6k159n, { item_ids: [9719299999] });
assert.deepEqual(subitemValues.board_relation_mm6k90h2, { item_ids: [12757169867] });
assert.equal(subitemValues.text_mm6bvj23, 'Spanish');
assert.equal(subitemValues.text_mm6bnbka, '8');
assert.equal(subitemValues.text_mm6bfn7d, 'Kreyco Spanish 1');
assert.deepEqual(subitemValues.long_text_mm6kxvtt, { text: 'secure link' });
assert.deepEqual(subitemValues.color_mm6kn274, { label: 'Yes' });
assert.deepEqual(subitemValues.color_mm6ky13d, { label: 'No' });
assert.equal(subitemValues.text_mm6kwdew, 'Canvas');
assert.deepEqual(subitemValues.long_text_mm6kywe4, { text: 'Period 2' });
assert.deepEqual(subitemValues.color_mm6b9q2c, { label: 'Not Started' });

const unassignedClassroom = Object.assign({}, normalized.classrooms[0], { teacherId: '', teacherName: '' });
const unassignedValues = JSON.parse(JSON.stringify(context.buildSubitemColumnValues_(unassignedClassroom)));
assert.equal(unassignedValues.board_relation_mm6k90h2, undefined);

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

const upcomingRequest = JSON.parse(JSON.stringify(activeRequest));
upcomingRequest.column_values[0].linked_items[0].column_values[0].label = 'Upcoming';
assert.equal(context.desiredActiveTeacherId_(upcomingRequest), '12757169867');

const unassignedRequest = JSON.parse(JSON.stringify(activeRequest));
unassignedRequest.column_values[0].linked_items[0].column_values[1].linked_item_ids = [];
assert.equal(context.desiredActiveTeacherId_(unassignedRequest), '');

assert.throws(() => context.normalizeSubmission_({ acknowledged: false }), /acknowledge/i);
assert.throws(() => context.normalizeSubmission_({
  requestId: '12345678-1234-1234-1234-123456789012',
  acknowledged: true,
  schoolId: '2',
  classrooms: [{
    sectionId: '3',
    language: 'Spanish',
    gradeLevel: '8',
    kreycoCurriculum: 'Kreyco Spanish 1',
    verificationNeeded: 'Yes',
    useGoogleClassroom: 'No',
    otherGradingPlatform: ''
  }]
}), /other grading platform/i);

console.log('Server helper tests passed');
