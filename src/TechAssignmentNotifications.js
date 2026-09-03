var TECH_ASSIGNMENT_QUEUE_HEADERS_ = Object.freeze([
  'Request Item ID', 'Request Name', 'Current Hash', 'Current Assignees JSON',
  'First Observed (UTC)', 'Last Changed (UTC)', 'Send After (UTC)',
  'Last Delivered Hash', 'Last Delivered Assignees JSON', 'Email Sent User IDs JSON',
  'Chat Attempted Hash', 'Chat Sent Hash', 'Last Delivered (UTC)', 'Last Error', 'Updated At (UTC)'
]);

function setupTechAssignmentNotifications() {
  requireTechAdministrator_();
  var status = setupTechAssignmentNotifications_();
  auditEvent_({ severity: 'INFO', category: 'configuration', action: 'tech_assignment_notifications_setup', outcome: 'success',
    actorType: 'Tech Administrator', message: 'One-minute Tech assignment monitoring was configured.', details: status });
  return status;
}

function setupTechAssignmentNotifications_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty('AUDIT_SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Run setupAuditLog first so assignment notification state has durable storage.');
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  configureTechAssignmentQueueSheet_(spreadsheet);
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'processTechAssignmentNotifications') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('processTechAssignmentNotifications').timeBased().everyMinutes(1).create();
  refreshAuditConfiguration_(spreadsheet);
  return { enabled: true, intervalMinutes: 1, debounceMinutes: CONFIG.techAssignmentDebounceMs / 60000,
    assignedTechsColumnId: CONFIG.destinationAssignedTechsColumnId, techTeamId: CONFIG.techTeamId,
    chatConfigured: !!properties.getProperty('GOOGLE_CHAT_TECH_WEBHOOK_URL'), queueSheetName: CONFIG.techAssignmentQueueSheetName };
}

function processTechAssignmentNotifications() {
  return auditedPublicCall_('notification', 'process_tech_assignment_notifications', { actorType: 'System Trigger' }, function () {
    return processTechAssignmentNotifications_();
  });
}

function processTechAssignmentNotifications_() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('AUDIT_SPREADSHEET_ID');
  if (!spreadsheetId) return { skipped: true, reason: 'Audit logging is not configured.' };
  return withLease_('tech-assignment-notifications', function () {
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet = configureTechAssignmentQueueSheet_(spreadsheet);
    var states = readTechAssignmentQueue_(sheet);
    var items = getTechAssignmentRequestItems_();
    var teamMembers = getTechTeamMembers_();
    var now = Date.now();
    var summary = { scanned: items.length, changed: 0, waiting: 0, delivered: 0, emailsSent: 0,
      chatMessagesSent: 0, invalidAssignments: 0, emailsPaused: areEmailsPaused_(), results: [] };

    items.forEach(function (item) {
      var state = states[item.id] || newTechAssignmentState_(item.id, item.name);
      var observation = observeTechAssignments_(state, item, teamMembers, now);
      state = observation.state;
      if (observation.changed) summary.changed += 1;
      if (observation.invalidAssignments.length) summary.invalidAssignments += observation.invalidAssignments.length;
      if (observation.changed || !state.rowNumber) writeTechAssignmentState_(sheet, state);

      if (!state.currentAssignees.length) {
        if (observation.invalidAssignments.length) {
          summary.results.push({ requestItemId: item.id, outcome: 'invalid_assignment', invalid: observation.invalidAssignments });
          if (observation.changed) auditTechAssignmentIssue_(item, 'invalid_assignment', state.lastError, observation.invalidAssignments);
        } else summary.results.push({ requestItemId: item.id, outcome: 'unassigned' });
        return;
      }
      if (state.currentHash === state.lastDeliveredHash) {
        summary.results.push({ requestItemId: item.id, outcome: 'already_delivered' });
        return;
      }
      if (now < state.sendAfterMs) {
        summary.waiting += 1;
        summary.results.push({ requestItemId: item.id, outcome: 'debouncing', sendAfterUtc: new Date(state.sendAfterMs).toISOString() });
        return;
      }

      var delivery = deliverTechAssignmentState_(sheet, state, item, summary);
      if (delivery.complete) summary.delivered += 1;
      summary.results.push({ requestItemId: item.id, outcome: delivery.complete ? 'delivered' : 'partially_delivered',
        emailComplete: delivery.emailComplete, chatComplete: delivery.chatComplete, error: state.lastError || '' });
    });
    return summary;
  });
}

function getTechAssignmentRequestItems_() {
  var ids = [CONFIG.destinationAssignedTechsColumnId, CONFIG.destinationStatusColumnId, CONFIG.destinationClassRelationColumnId,
    CONFIG.destinationSchoolRelationColumnId, CONFIG.destinationTeacherRelationColumnId, CONFIG.destinationCoachNameColumnId,
    CONFIG.destinationNeededByDateColumnId].map(function (id) { return '"' + id + '"'; }).join(',');
  var fields = ['id name url state', 'column_values(ids: [' + ids + ']) {',
    ' id text value ... on StatusValue { label } ... on DateValue { date }',
    ' ... on PeopleValue { persons_and_teams { id kind } }',
    ' ... on BoardRelationValue { linked_item_ids linked_items { id name } }', '}'].join('\n');
  var data = mondayRequest_('query TechAssignmentRequests { boards(ids: [' + CONFIG.destinationBoardId + ']) { items_page(limit: 500) { cursor items { ' + fields + ' } } } }', {});
  var page = (((data.boards || [])[0] || {}).items_page || {});
  var items = page.items || [];
  var cursor = page.cursor;
  while (cursor) {
    var next = mondayRequest_('query NextTechAssignmentRequests($cursor: String!) { next_items_page(cursor: $cursor) { cursor items { ' + fields + ' } } }', { cursor: cursor }).next_items_page || {};
    items = items.concat(next.items || []);
    cursor = next.cursor;
  }
  return items.filter(function (item) { return item.state !== 'deleted'; }).map(parseTechAssignmentRequestItem_);
}

function parseTechAssignmentRequestItem_(item) {
  var values = item.column_values || [];
  var classroom = (columnValue_(values, CONFIG.destinationClassRelationColumnId).linked_items || [])[0] || {};
  var school = (columnValue_(values, CONFIG.destinationSchoolRelationColumnId).linked_items || [])[0] || {};
  var teacher = (columnValue_(values, CONFIG.destinationTeacherRelationColumnId).linked_items || [])[0] || {};
  return { id: String(item.id), name: cleanText_(item.name || '', 300), url: item.url || CONFIG.mondayItemUrl + item.id,
    assignments: canonicalTechAssignments_(peopleAssignments_(values, CONFIG.destinationAssignedTechsColumnId)),
    status: columnLabel_(values, CONFIG.destinationStatusColumnId) || 'Draft',
    classId: String(classroom.id || ''), className: cleanText_(classroom.name || '', 300),
    schoolId: String(school.id || ''), schoolName: cleanText_(school.name || '', 300),
    teacherId: String(teacher.id || ''), teacherName: cleanText_(teacher.name || '', 200),
    coachName: columnText_(values, CONFIG.destinationCoachNameColumnId),
    neededByDate: columnDate_(values, CONFIG.destinationNeededByDateColumnId) };
}

function canonicalTechAssignments_(assignments) {
  var seen = {};
  return (assignments || []).map(function (assignment) {
    return { id: String(assignment.id || ''), kind: String(assignment.kind || '').toLowerCase() };
  }).filter(function (assignment) {
    var key = assignment.kind + ':' + assignment.id;
    if (!/^\d+$/.test(assignment.id) || ['person', 'team'].indexOf(assignment.kind) === -1 || seen[key]) return false;
    seen[key] = true;
    return true;
  }).sort(function (a, b) {
    return (a.kind + ':' + a.id).localeCompare(b.kind + ':' + b.id);
  });
}

function getTechTeamMembers_() {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'TECH_TEAM_MEMBERS_' + CONFIG.techTeamId;
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignore) { /* refresh below */ }
  }
  var data = mondayRequest_('query TechTeamMembers { teams(ids: [' + CONFIG.techTeamId + ']) { users { id name email } } }', {});
  var members = {};
  ((((data.teams || [])[0] || {}).users) || []).forEach(function (user) {
    var id = String(user.id || '');
    if (!/^\d+$/.test(id)) return;
    members[id] = { id: id, name: cleanText_(user.name || '', 150), email: cleanText_(user.email || '', 254).toLowerCase() };
  });
  cache.put(cacheKey, JSON.stringify(members), 300);
  return members;
}

function assignmentHash_(assignments) {
  return hashKey_(JSON.stringify(canonicalTechAssignments_(assignments)));
}

function observeTechAssignments_(state, item, teamMembers, now) {
  var assignments = canonicalTechAssignments_(item.assignments);
  var invalid = [];
  var valid = [];
  assignments.forEach(function (assignment) {
    if (assignment.kind !== 'person') { invalid.push({ id: assignment.id, kind: assignment.kind, reason: 'Assign individual Tech Team members, not a team.' }); return; }
    var member = teamMembers[assignment.id];
    if (!member) { invalid.push({ id: assignment.id, kind: assignment.kind, reason: 'Person is not a member of Tech Team ' + CONFIG.techTeamId + '.' }); return; }
    valid.push(member);
  });
  valid.sort(function (a, b) { return a.id.localeCompare(b.id); });
  var hash = hashKey_(JSON.stringify({ assignments: assignments, validMemberIds: valid.map(function (member) { return member.id; }) }));
  var changed = state.currentHash !== hash;
  if (changed) {
    var previouslyDelivered = {};
    (state.lastDeliveredAssignees || []).forEach(function (assignee) { previouslyDelivered[String(assignee.id)] = true; });
    state.requestName = item.name;
    state.currentHash = hash;
    state.currentAssignees = valid;
    state.firstObservedUtc = state.firstObservedUtc || new Date(now).toISOString();
    state.lastChangedUtc = new Date(now).toISOString();
    state.sendAfterMs = now + CONFIG.techAssignmentDebounceMs;
    state.emailSentUserIds = valid.filter(function (member) { return previouslyDelivered[member.id]; }).map(function (member) { return member.id; });
    state.chatAttemptedHash = '';
    state.chatSentHash = '';
    state.lastError = invalid.map(function (entry) { return entry.reason + ' ID ' + entry.id; }).join(' ');
  }
  if (!valid.length) {
    state.lastDeliveredHash = hash;
    state.lastDeliveredAssignees = [];
    state.emailSentUserIds = [];
    state.chatAttemptedHash = hash;
    state.chatSentHash = hash;
    state.lastDeliveredUtc = new Date(now).toISOString();
    if (!invalid.length) state.lastError = '';
  }
  if (changed) state.updatedAtUtc = new Date(now).toISOString();
  return { state: state, changed: changed, invalidAssignments: invalid };
}

function deliverTechAssignmentState_(sheet, state, item, summary) {
  var emailSent = {};
  (state.emailSentUserIds || []).forEach(function (id) { emailSent[String(id)] = true; });
  if (!areEmailsPaused_()) {
    state.currentAssignees.forEach(function (assignee) {
      if (emailSent[assignee.id]) return;
      if (!isValidEmail_(assignee.email)) {
        emailSent[assignee.id] = true;
        state.emailSentUserIds.push(assignee.id);
        state.lastError = appendTechAssignmentError_(state.lastError, 'No valid email is available for ' + (assignee.name || ('user ' + assignee.id)) + '.');
        writeTechAssignmentState_(sheet, state);
        auditTechAssignmentIssue_(item, 'assignee_email_invalid', state.lastError, { assigneeId: assignee.id, assigneeName: assignee.name });
        return;
      }
      if (MailApp.getRemainingDailyQuota() < 1) {
        state.lastError = appendTechAssignmentError_(state.lastError, 'The Apps Script daily email-recipient quota is exhausted.');
        return;
      }
      try {
        sendTechAssignmentEmail_(assignee, state.currentAssignees, item);
        emailSent[assignee.id] = true;
        state.emailSentUserIds.push(assignee.id);
        state.updatedAtUtc = new Date().toISOString();
        writeTechAssignmentState_(sheet, state);
        summary.emailsSent += 1;
        auditEvent_({ severity: 'INFO', category: 'notification', action: 'tech_assignment_email_sent', outcome: 'success',
          actorType: 'System', actorName: assignee.name, actorEmail: assignee.email, requestItemId: item.id, requestUrl: item.url,
          classId: item.classId, className: item.className, schoolId: item.schoolId, schoolName: item.schoolName,
          teacherId: item.teacherId, teacherName: item.teacherName, statusAfter: item.status,
          notificationAudience: 'Assigned Tech', notificationState: 'Sent', message: 'Tech assignment email delivered.' });
      } catch (emailError) {
        state.lastError = appendTechAssignmentError_(state.lastError, 'Assignment email to ' + assignee.email + ' failed: ' + (emailError.message || String(emailError)));
        state.updatedAtUtc = new Date().toISOString();
        writeTechAssignmentState_(sheet, state);
        auditTechAssignmentIssue_(item, 'tech_assignment_email_failed', state.lastError,
          { assigneeId: assignee.id, assigneeName: assignee.name, assigneeEmail: assignee.email });
      }
    });
  }

  if (state.chatSentHash !== state.currentHash && state.chatAttemptedHash !== state.currentHash) {
    var webhookUrl = PropertiesService.getScriptProperties().getProperty('GOOGLE_CHAT_TECH_WEBHOOK_URL') || '';
    if (!isValidGoogleChatWebhookUrl_(webhookUrl)) {
      state.lastError = appendTechAssignmentError_(state.lastError, 'GOOGLE_CHAT_TECH_WEBHOOK_URL is missing or invalid.');
    } else {
      state.chatAttemptedHash = state.currentHash;
      state.updatedAtUtc = new Date().toISOString();
      writeTechAssignmentState_(sheet, state);
      try {
        sendTechAssignmentChat_(webhookUrl, state.currentAssignees, item);
        state.chatSentHash = state.currentHash;
        state.updatedAtUtc = new Date().toISOString();
        writeTechAssignmentState_(sheet, state);
        summary.chatMessagesSent += 1;
        auditEvent_({ severity: 'INFO', category: 'notification', action: 'tech_assignment_chat_sent', outcome: 'success',
          actorType: 'System', requestItemId: item.id, requestUrl: item.url, classId: item.classId, className: item.className,
          schoolId: item.schoolId, schoolName: item.schoolName, teacherId: item.teacherId, teacherName: item.teacherName,
          statusAfter: item.status, notificationAudience: 'Tech Space', notificationState: 'Sent',
          message: 'Consolidated Tech assignment message delivered to Google Chat.',
          details: { assigneeIds: state.currentAssignees.map(function (assignee) { return assignee.id; }) } });
      } catch (error) {
        state.lastError = appendTechAssignmentError_(state.lastError, 'Google Chat delivery was not confirmed: ' + (error.message || String(error)) + ' Use retryTechAssignmentChat after checking the webhook.');
        auditTechAssignmentIssue_(item, 'tech_assignment_chat_failed', state.lastError, { chatAttemptedHash: state.chatAttemptedHash });
      }
    }
  }

  state.emailSentUserIds = Object.keys(emailSent).sort();
  var emailComplete = state.currentAssignees.every(function (assignee) { return emailSent[assignee.id]; });
  var chatComplete = state.chatSentHash === state.currentHash;
  if (emailComplete && chatComplete) {
    state.lastDeliveredHash = state.currentHash;
    state.lastDeliveredAssignees = state.currentAssignees.slice();
    state.lastDeliveredUtc = new Date().toISOString();
  }
  state.updatedAtUtc = new Date().toISOString();
  writeTechAssignmentState_(sheet, state);
  return { complete: emailComplete && chatComplete, emailComplete: emailComplete, chatComplete: chatComplete };
}

function sendTechAssignmentEmail_(assignee, allAssignees, item) {
  var email = buildTechAssignmentEmail_(assignee, allAssignees, item);
  MailApp.sendEmail({ to: assignee.email, subject: email.subject, body: email.body, htmlBody: email.htmlBody, name: 'Kreyco Tech Support' });
}

function buildTechAssignmentEmail_(assignee, allAssignees, item) {
  var itemId = requireId_(item.id, 'request item');
  var reference = 'CCR-' + itemId;
  var itemUrl = CONFIG.mondayItemUrl + itemId;
  var boardUrl = CONFIG.mondayItemUrl.replace(/\/pulses\/$/, '');
  var greetingName = firstName_(assignee.name) || 'Tech Team member';
  var names = allAssignees.map(function (entry) { return entry.name || ('User ' + entry.id); }).join(', ');
  var className = item.className || item.name || 'Class not provided';
  var schoolName = item.schoolName || 'School not provided';
  var teacherName = item.teacherName || 'No active teacher assigned yet';
  var coachName = item.coachName || 'Not assigned';
  var status = item.status || 'Not provided';
  var neededBy = item.neededByDate || 'Not set';
  var subject = cleanText_('[' + reference + '] Classroom request assigned to you — ' + schoolName + ' / ' + className, 1000).replace(/\s+/g, ' ').slice(0, 240);
  var notice = 'Credential fields are not included in this email. Open the request item for authorized access to credentials and secure-share links.';
  var body = ['Google Classroom request assigned', '', 'Hello ' + greetingName + ',',
    '', 'You have been assigned to this classroom creation request. Coordinate with the other assigned technicians and update progress on the same monday.com item.',
    '', reference, 'Status: ' + status, 'Class: ' + className, 'School: ' + schoolName,
    'Current teacher: ' + teacherName, 'Requesting coach: ' + coachName, 'Assigned Techs: ' + (names || 'None'),
    'Classrooms needed by: ' + neededBy, '', 'Open request in Monday.com: ' + itemUrl,
    'View Classroom Creation board: ' + boardUrl, '', notice].join('\n');
  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>Google Classroom request assigned</title><style>@media(max-width:480px){.email-padding{padding-left:20px!important;padding-right:20px!important}.contact-stack{display:block!important;width:100%!important;padding-bottom:12px!important}.main-title{font-size:24px!important}}</style></head>'
    + '<body style="margin:0;padding:0;background:#F4F6F8;font-family:Helvetica,Arial,sans-serif;color:#1E293B">'
    + '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">' + escapeHtml_(reference + ' · ' + className + ' · assigned to you') + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:28px 12px">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E2E8F0">'
    + '<tr><td class="email-padding" style="padding:22px 30px;border-bottom:4px solid #D5DFEA"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td><img src="https://kreyco.s3.us-east-2.amazonaws.com/kreyco-logo.png" alt="Kreyco" width="148" style="display:block;width:148px;max-width:100%;height:auto;border:0"></td>'
    + '<td align="right" style="color:#64748B;font-size:11px;font-weight:700;letter-spacing:1px">IT NOTIFICATIONS</td></tr></table></td></tr>'
    + '<tr><td class="email-padding" style="padding:28px 30px 0"><span style="display:inline-block;background:#EFF6FF;color:#295EE3;padding:6px 11px;border-radius:99px;font-weight:700;font-size:11px;letter-spacing:.7px">ASSIGNED TO YOU</span>'
    + '<h1 class="main-title" style="margin:14px 0 10px;color:#16367B;font-size:28px;line-height:1.2;letter-spacing:-.5px">Google Classroom request assigned</h1>'
    + '<p style="margin:0;color:#64748B;font-size:14px;line-height:1.65">Hello ' + escapeHtml_(greetingName) + ', you have been assigned to this classroom creation request. Review the details below and coordinate work on the same item.</p></td></tr>'
    + '<tr><td class="email-padding" style="padding:22px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px"><tr><td style="padding:20px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:12px;font-weight:700;color:#295EE3">' + escapeHtml_(reference) + '</td><td align="right" style="font-size:12px;color:#64748B">' + escapeHtml_(status) + '</td></tr></table>'
    + '<h2 style="margin:12px 0 3px;font-size:20px;line-height:1.35;color:#1E293B;overflow-wrap:anywhere">' + escapeHtml_(className) + '</h2><p style="margin:0 0 16px;color:#64748B;font-size:14px;line-height:1.5;overflow-wrap:anywhere">' + escapeHtml_(schoolName) + '</p>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E2E8F0"><tr><td class="contact-stack" width="50%" valign="top" style="padding-top:14px;padding-right:10px"><div style="color:#64748B;font-size:12px;padding-bottom:3px">Requesting coach</div><div style="font-size:14px;font-weight:700;line-height:1.55">' + escapeHtml_(coachName) + '</div></td>'
    + '<td class="contact-stack" width="50%" valign="top" style="padding-top:14px"><div style="color:#64748B;font-size:12px;padding-bottom:3px">Current teacher</div><div style="font-size:14px;font-weight:700;line-height:1.55">' + escapeHtml_(teacherName) + '</div></td></tr></table></td></tr></table></td></tr>'
    + '<tr><td class="email-padding" style="padding:22px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid #295EE3;background:#EFF6FF;padding:15px 17px"><div style="font-size:13px;font-weight:700;color:#16367B;margin-bottom:6px">Assignment team</div><div style="font-size:14px;line-height:1.6;color:#334155">' + escapeHtml_(names || 'None') + '</div></td></tr></table></td></tr>'
    + '<tr><td class="email-padding" style="padding:22px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    + techEmailField_('Classrooms needed by', neededBy, 1) + techEmailField_('Status', status, 1) + '</tr></table></td></tr>'
    + '<tr><td align="center" class="email-padding" style="padding:10px 30px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#295EE3" style="border-radius:7px"><a href="' + escapeHtml_(itemUrl) + '" target="_blank" style="display:inline-block;padding:15px 23px;color:#FFFFFF!important;font-size:14px;font-weight:700;text-decoration:none;border-radius:7px">Open request in Monday.com &rarr;</a></td></tr></table>'
    + '<p style="margin:14px 0 0;font-size:12px;line-height:1.6"><a href="' + escapeHtml_(boardUrl) + '" target="_blank" style="color:#16367B;text-decoration:underline">View Classroom Creation board</a></p></td></tr>'
    + '<tr><td class="email-padding" style="padding:20px 30px 24px"><p style="margin:0;padding-top:18px;border-top:1px solid #E2E8F0;color:#64748B;font-size:12px;line-height:1.65">' + notice + '</p></td></tr>'
    + '<tr><td class="email-padding" align="center" style="padding:16px 30px;background:#F8FAFC;border-top:1px solid #E2E8F0;color:#64748B;font-size:11px;line-height:1.7">&copy; ' + new Date().getFullYear() + ' Kreyco · Internal IT notification</td></tr>'
    + '</table></td></tr></table></body></html>';
  return { subject: subject, body: body, htmlBody: html };
}

function sendTechAssignmentChat_(webhookUrl, assignees, item) {
  var itemId = requireId_(item.id, 'request item');
  var itemUrl = CONFIG.mondayItemUrl + itemId;
  var names = assignees.map(function (entry) { return entry.name || ('User ' + entry.id); }).join(', ');
  var reference = 'CCR-' + itemId;
  var card = {
    cardId: 'classroom-request-' + itemId,
    card: {
      header: { title: 'Classroom request assigned', subtitle: reference + ' · ' + (item.status || 'Not provided') },
      sectionDividerStyle: 'SOLID_DIVIDER',
      sections: [
        { header: 'Assignment', widgets: [
          { textParagraph: { text: '<b>' + escapeChatCardText_(names || 'None') + '</b>' } },
          { textParagraph: { text: 'Please coordinate the classroom setup and record progress on the same monday.com request.' } }
        ] },
        { header: 'Classroom details', widgets: techAssignmentChatDetailWidgets_(item) },
        { widgets: [{ buttonList: { buttons: [{ text: 'Open classroom request',
          onClick: { openLink: { url: itemUrl } }, color: { red: 0.16, green: 0.37, blue: 0.89 } }] } }] }
      ]
    }
  };
  var separator = webhookUrl.indexOf('?') === -1 ? '?' : '&';
  var url = webhookUrl + separator + 'messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD';
  var response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify({ cardsV2: [card], thread: { threadKey: 'classroom-request-' + itemId } }), muteHttpExceptions: true });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('Google Chat returned HTTP ' + status + '.');
}

function techAssignmentChatDetailWidgets_(item) {
  var details = [
    ['School', item.schoolName || 'Not provided'], ['Class', item.className || 'Not provided'],
    ['Current teacher', item.teacherName || 'Not assigned'], ['Coach', item.coachName || 'Not assigned'],
    ['Classrooms needed by', item.neededByDate || 'Not set'], ['Status', item.status || 'Not provided']
  ];
  return details.map(function (entry) {
    return { decoratedText: { topLabel: entry[0], text: '<b>' + escapeChatCardText_(entry[1]) + '</b>', wrapText: true } };
  });
}

function escapeChatCardText_(value) {
  return escapeHtml_(cleanText_(value || '', 1000));
}

function firstName_(fullName) {
  var name = cleanText_(fullName || '', 150).replace(/\s+/g, ' ');
  if (!name) return '';
  var parts = name.split(' ');
  var honorifics = ['mr.', 'mrs.', 'ms.', 'miss', 'dr.', 'prof.'];
  if (parts.length > 1 && honorifics.indexOf(parts[0].toLowerCase()) !== -1) return parts[1];
  return parts[0];
}

function techAssignmentDetails_(item, assigneeNames) {
  return [
    { label: 'Request', value: item.name + ' (CCR-' + item.id + ')' },
    { label: 'Assigned Techs', value: assigneeNames || 'None' },
    { label: 'School', value: item.schoolName || 'Not provided' },
    { label: 'Class', value: item.className || 'Not provided' },
    { label: 'Current teacher', value: item.teacherName || 'Not assigned' },
    { label: 'Coach', value: item.coachName || 'Not assigned' },
    { label: 'Classrooms needed by', value: item.neededByDate || 'Not set' },
    { label: 'Status', value: item.status || 'Not provided' }
  ];
}

function isValidGoogleChatWebhookUrl_(url) {
  return /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[A-Za-z0-9_-]+\/messages\?[^#]*\bkey=[^&]+&[^#]*\btoken=[^&]+/.test(String(url || '')) ||
    /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[A-Za-z0-9_-]+\/messages\?[^#]*\btoken=[^&]+&[^#]*\bkey=[^&]+/.test(String(url || ''));
}

function retryTechAssignmentChat(itemId) {
  requireTechAdministrator_();
  itemId = requireId_(itemId, 'request item');
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('AUDIT_SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Audit logging is not configured.');
  var sheet = configureTechAssignmentQueueSheet_(SpreadsheetApp.openById(spreadsheetId));
  var state = readTechAssignmentQueue_(sheet)[itemId];
  if (!state) throw new Error('No assignment notification state exists for this request item.');
  state.chatAttemptedHash = '';
  state.lastError = '';
  state.updatedAtUtc = new Date().toISOString();
  writeTechAssignmentState_(sheet, state);
  return { queued: true, requestItemId: itemId };
}

function configureTechAssignmentQueueSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(CONFIG.techAssignmentQueueSheetName);
  var needsFormatting = !sheet;
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.techAssignmentQueueSheetName);
  var headers = TECH_ASSIGNMENT_QUEUE_HEADERS_;
  if (!needsFormatting && sheet.getLastColumn() >= headers.length) {
    needsFormatting = JSON.stringify(sheet.getRange(1, 1, 1, headers.length).getValues()[0]) !== JSON.stringify(headers);
  }
  if (!needsFormatting) return sheet;
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#6161ff').setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  sheet.setRowHeight(1, 42);
  for (var index = 1; index <= headers.length; index += 1) sheet.setColumnWidth(index, [1, 3, 8, 11, 12].indexOf(index) !== -1 ? 220 : (index === 4 || index === 9 || index === 10 || index === 14 ? 420 : 180));
  sheet.getRange('A:O').setNumberFormat('@').setVerticalAlignment('middle');
  sheet.getRange('D:D').setWrap(false);
  sheet.getRange('I:J').setWrap(false);
  sheet.getRange('N:N').setWrap(true);
  return sheet;
}

function readTechAssignmentQueue_(sheet) {
  var states = {};
  if (sheet.getLastRow() < 2) return states;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, TECH_ASSIGNMENT_QUEUE_HEADERS_.length).getValues().forEach(function (row, index) {
    if (!row[0]) return;
    var state = techAssignmentStateFromRow_(row);
    state.rowNumber = index + 2;
    states[state.itemId] = state;
  });
  return states;
}

function newTechAssignmentState_(itemId, requestName) {
  return { itemId: String(itemId), requestName: requestName || '', currentHash: '', currentAssignees: [], firstObservedUtc: '',
    lastChangedUtc: '', sendAfterMs: 0, lastDeliveredHash: '', lastDeliveredAssignees: [], emailSentUserIds: [],
    chatAttemptedHash: '', chatSentHash: '', lastDeliveredUtc: '', lastError: '', updatedAtUtc: '', rowNumber: 0 };
}

function techAssignmentStateFromRow_(row) {
  var state = newTechAssignmentState_(row[0], row[1]);
  state.currentHash = String(row[2] || '');
  state.currentAssignees = safeAssignmentJsonArray_(row[3]);
  state.firstObservedUtc = String(row[4] || '');
  state.lastChangedUtc = String(row[5] || '');
  state.sendAfterMs = row[6] ? Date.parse(String(row[6])) : 0;
  state.lastDeliveredHash = String(row[7] || '');
  state.lastDeliveredAssignees = safeAssignmentJsonArray_(row[8]);
  state.emailSentUserIds = safeStringJsonArray_(row[9]);
  state.chatAttemptedHash = String(row[10] || '');
  state.chatSentHash = String(row[11] || '');
  state.lastDeliveredUtc = String(row[12] || '');
  state.lastError = String(row[13] || '');
  state.updatedAtUtc = String(row[14] || '');
  return state;
}

function techAssignmentStateRow_(state) {
  return [state.itemId, state.requestName, state.currentHash, JSON.stringify(state.currentAssignees || []), state.firstObservedUtc,
    state.lastChangedUtc, state.sendAfterMs ? new Date(state.sendAfterMs).toISOString() : '', state.lastDeliveredHash,
    JSON.stringify(state.lastDeliveredAssignees || []), JSON.stringify(state.emailSentUserIds || []), state.chatAttemptedHash,
    state.chatSentHash, state.lastDeliveredUtc, state.lastError, state.updatedAtUtc];
}

function writeTechAssignmentState_(sheet, state) {
  var rowNumber = state.rowNumber;
  if (!rowNumber) {
    rowNumber = sheet.getLastRow() + 1;
    ensureSheetRows_(sheet, rowNumber);
    state.rowNumber = rowNumber;
  }
  sheet.getRange(rowNumber, 1, 1, TECH_ASSIGNMENT_QUEUE_HEADERS_.length).setValues([techAssignmentStateRow_(state)]);
  sheet.setRowHeight(rowNumber, 28);
}

function safeAssignmentJsonArray_(value) {
  try {
    var parsed = value ? JSON.parse(String(value)) : [];
    return Array.isArray(parsed) ? parsed.map(function (entry) {
      return { id: String(entry.id || ''), name: cleanText_(entry.name || '', 150), email: cleanText_(entry.email || '', 254).toLowerCase() };
    }).filter(function (entry) { return /^\d+$/.test(entry.id); }) : [];
  } catch (error) { return []; }
}

function safeStringJsonArray_(value) {
  try {
    var parsed = value ? JSON.parse(String(value)) : [];
    return Array.isArray(parsed) ? parsed.map(String).filter(function (entry) { return /^\d+$/.test(entry); }) : [];
  } catch (error) { return []; }
}

function appendTechAssignmentError_(existing, message) {
  var values = [cleanText_(existing || '', 1500), cleanText_(message || '', 1500)].filter(Boolean);
  return cleanText_(values.filter(function (value, index) { return values.indexOf(value) === index; }).join(' '), 3000);
}

function auditTechAssignmentIssue_(item, action, message, details) {
  auditEvent_({ severity: 'WARN', category: 'notification', action: action, outcome: 'attention_required', actorType: 'System',
    requestItemId: item.id, requestUrl: item.url, classId: item.classId, className: item.className,
    schoolId: item.schoolId, schoolName: item.schoolName, teacherId: item.teacherId, teacherName: item.teacherName,
    statusAfter: item.status, notificationAudience: 'Assigned Tech / Tech Space', notificationState: 'Pending',
    message: message, details: details || {} });
}
