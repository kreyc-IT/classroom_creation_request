const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console });
for (const filename of ['Code.js', 'TechNotification.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', filename), 'utf8'), context, { filename });
}
const request = {
  id: '13000000001', name: 'French 6–8 · Section A', className: 'French 6–8 · Section A',
  schoolName: 'Riverside Academy', classId: '9719299999', status: 'Sent to Tech',
  coachName: 'Taylor Morgan', coachEmail: 'coach@example.org', teacherName: 'Jordan Lee', teacherEmail: 'teacher@example.org',
  language: 'French', gradeLevel: '6–8', kreycoCurriculum: 'French Foundations · Level 2',
  requestDetails: 'Create separate teacher and student sections.',
  verificationNeeded: '', useGoogleClassroom: 'No', otherGradingPlatform: 'Canvas',
  schedule: 'Monday & Wednesday\nPeriod 3', neededByDate: '2026-09-15', notificationAudience: 'Tech',
  notificationMessage: 'Please review this classroom request.',
  url: 'https://langlearningnetwork.monday.com/boards/18427083218/pulses/13000000001',
  lmsCredentials: 'SECRET-LMS', gradingCredentials: 'SECRET-GRADING', internalNotes: 'SECRET-INTERNAL',
  accessToken: 'SECRET-PORTAL', portalUrl: 'https://example.org/?access=SECRET-PORTAL'
};
const render = overrides => context.buildTechNotification_(Object.assign({}, request, overrides), 'test-event-123', 'Please review.\nThank you.');
const email = render({});
assert.match(email.subject, /^\[CCR-13000000001\] New Google Classroom request/);
assert.match(email.subject, /Riverside Academy/);
assert.match(email.subject, /French 6–8/);
assert.match(email.htmlBody, /NEW REQUEST/);
assert.match(email.htmlBody, /kreyco-logo\.png/);
assert.match(email.htmlBody, /Hello IT Team/);
assert.match(email.htmlBody, /Not provided/);
assert.match(email.htmlBody, /Monday &amp; Wednesday<br>Period 3/);
assert.match(email.htmlBody, /Please review\.<br>Thank you\./);
assert.match(email.body, /Grade level: 6–8/);
assert.match(email.body, /Request details: Create separate teacher and student sections\./);
assert.match(email.htmlBody, /Request details/);
assert.match(email.body, /LMS verification needed\?: Not provided/);
assert.match(email.body, /Google Classroom for grading\?: No/);
assert.match(email.body, /Classrooms needed by: 2026-09-15/);
assert.match(email.htmlBody, /Classrooms needed by/);
assert.match(email.body, /Notification reference: test-event-123/);
assert.match(email.htmlBody, /Notification reference: test-event-123/);
for (const token of ['SECRET-LMS', 'SECRET-GRADING', 'SECRET-INTERNAL', 'SECRET-PORTAL']) {
  assert.ok(!JSON.stringify(email).includes(token), 'Do not include credential or internal fields');
}
assert.deepEqual([...email.htmlBody.matchAll(/href="([^"]+)"/g)].map(m => m[1]), [
  request.url, 'https://langlearningnetwork.monday.com/boards/18427083218'
]);
assert.doesNotMatch(email.htmlBody, /<script|onclick=|data-preview-action|DEMO|\<\?/i);

const update = render({ status: 'Reopened - Coach Update' });
assert.match(update.subject, /Coach update: Google Classroom request/);
assert.match(update.htmlBody, /COACH UPDATE/);
assert.match(update.htmlBody, /continue work on the same item/);
const progressed = render({ status: 'In Progress', coachUpdateDate: '2026-08-31' });
assert.match(progressed.htmlBody, /REQUEST NOTIFICATION/);
assert.doesNotMatch(progressed.htmlBody, /NEW REQUEST|COACH UPDATE/);
const unassigned = render({ teacherName: '', gradeLevel: undefined, verificationNeeded: undefined });
assert.match(unassigned.htmlBody, /No active teacher assigned yet/);
assert.match(unassigned.body, /Grade level: Not provided/);
assert.match(unassigned.body, /LMS verification needed\?: Not provided/);
const missing = render({ name: '', className: '', schoolName: '', coachName: '', coachEmail: '' });
assert.match(missing.body, /Class: Class not provided/);
assert.match(missing.body, /School: School not provided/);
assert.match(missing.body, /Email not provided/);

const attack = '<img src=x onerror="alert(1)"> & "quoted"';
const hostileRequest = Object.assign({}, request);
for (const key of ['className', 'schoolName', 'coachName', 'coachEmail', 'teacherName', 'language', 'gradeLevel', 'kreycoCurriculum', 'requestDetails', 'verificationNeeded', 'useGoogleClassroom', 'otherGradingPlatform', 'schedule', 'neededByDate', 'status']) hostileRequest[key] = attack;
hostileRequest.url = 'javascript:alert(1)';
const escaped = context.buildTechNotification_(hostileRequest, attack, attack);
assert.ok(!escaped.htmlBody.includes(attack));
assert.ok(escaped.htmlBody.includes('&lt;img'));
assert.doesNotMatch(escaped.htmlBody, /href="javascript:/);
assert.match(escaped.htmlBody, /href="https:\/\/langlearningnetwork.monday.com\/boards\/18427083218\/pulses\/13000000001"/);
assert.throws(() => render({ id: '1" onclick="alert(1)' }), /request item/);
const long = render({ schoolName: 'School\r\nBcc: someone@example.org\n' + 'x'.repeat(1000) });
assert.ok(long.subject.length <= 240);
assert.doesNotMatch(long.subject, /[\r\n]/);

// Exercise real delivery routing using mock services; no outbound calls.
const sent = [];
let quota = 100;
let paused = false;
const properties = {};
context.PropertiesService = { getScriptProperties: () => ({ getProperty: key => properties[key] || '' }) };
context.MailApp = { getRemainingDailyQuota: () => quota, sendEmail: options => sent.push(options) };
context.auditEvent_ = () => {};
context.portalUrl_ = (classId, mode) => 'https://example.org/portal?class=' + classId + '&mode=' + mode;
context.deliverNotification_(request, 'delivery-1');
assert.equal(sent.length, 1);
assert.equal(sent[0].to, 'techgroup@kreyco.com');
assert.equal(sent[0].name, 'Kreyco Tech Support');
assert.match(sent[0].htmlBody, /IT NOTIFICATIONS/);
assert.match(sent[0].body, /Classroom setup details/);
assert.match(sent[0].htmlBody, /Please review this classroom request\./);
properties.TECH_NOTIFICATION_EMAIL = 'it-test@example.org';
context.deliverNotification_(Object.assign({}, request, { notificationAudience: '' }), 'delivery-2');
assert.equal(sent[1].to, 'it-test@example.org');

sent.length = 0;
context.deliverNotification_(Object.assign({}, request, { notificationAudience: 'Coach + Teacher' }), 'delivery-3');
assert.deepEqual(sent.map(mail => mail.to), ['coach@example.org', 'teacher@example.org']);
for (const message of sent) {
  assert.doesNotMatch(message.htmlBody, /IT NOTIFICATIONS|Classroom setup details/);
  assert.equal(message.subject, '[CCR-13000000001] French 6–8 · Section A — Sent to Tech');
}
assert.match(sent[0].htmlBody, /mode=coach/);
assert.match(sent[1].htmlBody, /mode=view/);
sent.length = 0;
quota = 0;
assert.throws(() => context.deliverNotification_(request, 'delivery-4'), /quota/);
assert.equal(sent.length, 0);
quota = 100;
properties.TECH_NOTIFICATION_EMAIL = 'invalid';
assert.throws(() => context.deliverNotification_(request, 'delivery-5'), /email address is invalid/);
assert.equal(sent.length, 0);
delete properties.TECH_NOTIFICATION_EMAIL;

// The queue still honors pause and records Sent/Failed without changing its semantics.
context.withLease_ = (key, callback) => callback();
context.getRequestItem_ = () => Object.assign({}, request, { notificationState: 'Pending', notificationEventId: 'queue-event' });
context.areEmailsPaused_ = () => paused;
context.today_ = () => '2026-08-31';
const writes = [];
context.updateRequestItem_ = (id, values) => writes.push(values);
paused = true;
assert.equal(context.processNotificationById_(request.id).paused, true);
assert.equal(writes.length, 0);
assert.equal(sent.length, 0);
paused = false;
assert.equal(context.processNotificationById_(request.id).sent, true);
assert.equal(sent.length, 1);
assert.equal(writes[0].color_mm6n8gnz.label, 'Sending');
assert.equal(writes[1].color_mm6n8gnz.label, 'Sent');
assert.equal(writes[1].long_text_mm6n4cz5.text, '');
context.MailApp.sendEmail = () => { throw new Error('Simulated delivery failure'); };
assert.throws(() => context.processNotificationById_(request.id), /Simulated delivery failure/);
assert.equal(writes[writes.length - 1].color_mm6n8gnz.label, 'Failed');

console.log('IT email template and mocked delivery tests passed');
