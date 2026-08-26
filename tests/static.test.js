const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'appsscript.json'), 'utf8'));

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
assert.equal(scripts.length, 1, 'Expected one inline client script');
new Function(scripts[0]);
new Function(code);

assert.match(html, /id="teacherSelect"/);
assert.match(html, /teacherPrev/);
assert.match(html, /teacherNext/);
assert.doesNotMatch(html, />Staff member</i);
assert.match(code, /new_group64074__1/);
assert.match(code, /board_relation_mktxpkv3/);
assert.match(code, /color_mkvqqdzk/);
assert.match(code, /color_mkwjcmfq/);
assert.match(code, /board_relation_mm6b2ch9/);
assert.match(code, /board_relation_mm6bpfd8/);
assert.match(code, /subtasks_mm6b5std/);
assert.match(code, /board_relation_mm6k159n/);
assert.match(code, /board_relation_mm6k90h2/);
assert.match(code, /syncActiveClassroomRequestTeachers/);
assert.match(code, /text_mm6bfn7d/);
assert.match(code, /create_subitem/);
assert.doesNotMatch(code, /create_update/);
assert.match(html, /id="otherGradingPlatform"/);
assert.match(html, /id="gradingCredentials"/);
assert.match(html, /data-field="kreycoCurriculum" type="text"/);
assert.doesNotMatch(html, /Status \(Tech only\)/);
assert.doesNotMatch(html, /Notes \(Tech only\)/);
assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
assert.doesNotMatch(code, /ScriptApp/);

console.log('Static project checks passed');
