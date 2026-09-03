const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({
  console,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(String(value)).digest()),
    base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url')
  }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.js'), 'utf8'), context, { filename: 'Code.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'TechAssignmentNotifications.js'), 'utf8'), context,
  { filename: 'TechAssignmentNotifications.js' });

const canonical = JSON.parse(JSON.stringify(context.canonicalTechAssignments_([
  { id: '20', kind: 'person' }, { id: '10', kind: 'person' }, { id: '20', kind: 'person' }, { id: '881594', kind: 'team' }
])));
assert.deepEqual(canonical, [
  { id: '10', kind: 'person' }, { id: '20', kind: 'person' }, { id: '881594', kind: 'team' }
]);
assert.equal(context.assignmentHash_([{ id: '20', kind: 'person' }, { id: '10', kind: 'person' }]),
  context.assignmentHash_([{ id: '10', kind: 'person' }, { id: '20', kind: 'person' }]));

const members = {
  10: { id: '10', name: 'Alex Tech', email: 'alex@kreyco.com' },
  20: { id: '20', name: 'Blair Tech', email: 'blair@kreyco.com' }
};
const item = { id: '123', name: 'School: French 1', assignments: [{ id: '10', kind: 'person' }] };
let state = context.newTechAssignmentState_('123', item.name);
let observed = context.observeTechAssignments_(state, item, members, 1_000_000);
state = observed.state;
assert.equal(observed.changed, true);
assert.equal(state.sendAfterMs, 1_300_000);
assert.deepEqual(JSON.parse(JSON.stringify(state.emailSentUserIds)), []);

observed = context.observeTechAssignments_(state, item, members, 1_060_000);
assert.equal(observed.changed, false);
assert.equal(state.sendAfterMs, 1_300_000, 'an unchanged poll must not extend the debounce');

item.assignments.push({ id: '20', kind: 'person' });
observed = context.observeTechAssignments_(state, item, members, 1_120_000);
state = observed.state;
assert.equal(observed.changed, true);
assert.equal(state.sendAfterMs, 1_420_000, 'adding a second person restarts the five-minute quiet period');
assert.deepEqual(JSON.parse(JSON.stringify(state.currentAssignees.map(entry => entry.id))), ['10', '20']);

state.lastDeliveredAssignees = [{ id: '10', name: 'Alex Tech', email: 'alex@kreyco.com' }];
state.currentHash = 'prior-hash';
observed = context.observeTechAssignments_(state, item, members, 1_500_000);
assert.deepEqual(JSON.parse(JSON.stringify(observed.state.emailSentUserIds)), ['10'], 'retained assignees must not receive a duplicate email');

const invalidState = context.newTechAssignmentState_('124', 'Invalid assignment');
const invalidObservation = context.observeTechAssignments_(invalidState,
  { id: '124', name: 'Invalid assignment', assignments: [{ id: '99', kind: 'person' }, { id: '881594', kind: 'team' }] }, members, 2_000_000);
assert.equal(invalidObservation.invalidAssignments.length, 2);
assert.equal(invalidObservation.state.currentAssignees.length, 0);
assert.equal(invalidObservation.state.lastDeliveredHash, invalidObservation.state.currentHash, 'invalid-only states should not retry every minute');

assert.equal(context.isValidGoogleChatWebhookUrl_('https://chat.googleapis.com/v1/spaces/AAAA/messages?key=abc&token=def'), true);
assert.equal(context.isValidGoogleChatWebhookUrl_('https://chat.googleapis.com/v1/spaces/AAAA/messages?token=def&key=abc'), true);
assert.equal(context.isValidGoogleChatWebhookUrl_('https://example.com/hook?key=abc&token=def'), false);

let chatCall;
context.UrlFetchApp = { fetch: (url, options) => {
  chatCall = { url, options };
  return { getResponseCode: () => 200 };
} };
context.sendTechAssignmentChat_('https://chat.googleapis.com/v1/spaces/AAAA/messages?key=abc&token=def',
  [members[10], members[20]], {
    id: '123', name: 'School: French 1', url: 'https://monday.example/item/123', schoolName: 'School', className: 'French 1',
    teacherName: 'Teacher', coachName: 'Coach', neededByDate: '2026-09-15', status: 'Sent to Tech'
  });
assert.match(chatCall.url, /messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD/);
const chatPayload = JSON.parse(chatCall.options.payload);
assert.equal(chatPayload.thread.threadKey, 'classroom-request-123');
assert.match(chatPayload.text, /Alex Tech, Blair Tech/);
assert.doesNotMatch(chatPayload.text, /credential|password/i);

console.log('Tech assignment notification tests passed.');
