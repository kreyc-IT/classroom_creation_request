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
  var subject = '[CCR-' + item.id + '] Classroom request assigned to you — ' + item.name;
  var names = allAssignees.map(function (entry) { return entry.name || ('User ' + entry.id); }).join(', ');
  var details = techAssignmentDetails_(item, names);
  var body = 'Hello ' + (assignee.name || 'Tech Team member') + ',\n\nA classroom creation request has been assigned to you.\n\n' +
    details.map(function (entry) { return entry.label + ': ' + entry.value; }).join('\n') + '\n\nOpen request: ' + item.url;
  var rows = details.map(function (entry) { return '<tr><td style="padding:5px 14px 5px 0;color:#676879">' + escapeHtml_(entry.label) + '</td><td style="padding:5px 0"><strong>' + escapeHtml_(entry.value) + '</strong></td></tr>'; }).join('');
  var html = '<div style="font-family:Arial,sans-serif;color:#323338;line-height:1.5"><p>Hello ' + escapeHtml_(assignee.name || 'Tech Team member') + ',</p>' +
    '<p>A classroom creation request has been assigned to you.</p><table role="presentation" style="border-collapse:collapse">' + rows + '</table>' +
    '<p style="margin-top:22px"><a href="' + escapeHtml_(item.url) + '" style="background:#6161ff;color:#fff;text-decoration:none;padding:11px 18px;border-radius:6px;display:inline-block">Open request in monday.com</a></p></div>';
  MailApp.sendEmail({ to: assignee.email, subject: subject, body: body, htmlBody: html, name: 'Kreyco Tech Support' });
}

function sendTechAssignmentChat_(webhookUrl, assignees, item) {
  var names = assignees.map(function (entry) { return entry.name || ('User ' + entry.id); }).join(', ');
  var text = '*Classroom request assigned*\n' + techAssignmentDetails_(item, names).map(function (entry) {
    return '*' + entry.label + ':* ' + entry.value;
  }).join('\n') + '\n*Open request:* ' + item.url;
  var separator = webhookUrl.indexOf('?') === -1 ? '?' : '&';
  var url = webhookUrl + separator + 'messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD';
  var response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify({ text: text, thread: { threadKey: 'classroom-request-' + item.id } }), muteHttpExceptions: true });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('Google Chat returned HTTP ' + status + '.');
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
