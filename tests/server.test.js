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
    kreycoCurriculum: 'Yes'
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

const updateBody = context.buildUpdateBody_(normalized, {
  id: normalized.teacherId,
  name: 'Rebecca Brito'
});
assert.match(updateBody, /Teacher: Rebecca Brito/);
assert.match(updateBody, /School: North Valley Middle School/);
assert.match(updateBody, /Spanish I - Period 2/);

assert.throws(() => context.normalizeSubmission_({ acknowledged: false }), /acknowledge/i);
assert.throws(() => context.normalizeSubmission_({
  requestId: '12345678-1234-1234-1234-123456789012',
  acknowledged: true,
  teacherId: '1',
  schoolId: '2',
  verificationNeeded: 'Yes',
  useGoogleClassroom: 'No',
  otherGradingPlatform: '',
  classrooms: [{ sectionId: '3', language: 'Spanish', gradeLevel: '8', kreycoCurriculum: 'Yes' }]
}), /other grading platform/i);

console.log('Server helper tests passed');
