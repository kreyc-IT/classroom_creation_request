var CONFIG = Object.freeze({
  apiVersion: '2026-07',
  mondayApiUrl: 'https://api.monday.com/v2',
  publicWebAppUrl: 'https://script.google.com/macros/s/AKfycbzY4LnhCk4gRmNInFqU5H8O-UiLaG8A0M-8695DcpkBT8f-Fp5g06GElEciE3MjW7OH/exec',
  mondayItemUrl: 'https://langlearningnetwork.monday.com/boards/18427083218/pulses/',
  destinationBoardId: '18427083218',
  destinationGroupId: 'topics',
  destinationSchoolRelationColumnId: 'board_relation_mm6bpfd8',
  destinationTimelineAcknowledgedColumnId: 'boolean_mm6bkxm5',
  destinationRequestIdColumnId: 'text_mm6bsfag',
  destinationClassRelationColumnId: 'board_relation_mm6nf3v9',
  destinationTeacherRelationColumnId: 'board_relation_mm6ntah3',
  destinationCoachPeopleColumnId: 'multiple_person_mm6na1xy',
  destinationStatusColumnId: 'color_mm6ny859',
  destinationCoachNameColumnId: 'text_mm6nce2m',
  destinationCoachEmailColumnId: 'email_mm6nk9mk',
  destinationLanguageColumnId: 'text_mm6n4jcy',
  destinationGradeLevelColumnId: 'text_mm6nc7za',
  destinationCurriculumColumnId: 'text_mm6n3w2y',
  destinationLmsCredentialsColumnId: 'long_text_mm6n6620',
  destinationLmsVerificationColumnId: 'color_mm6nr1q',
  destinationGoogleClassroomColumnId: 'color_mm6nb7mr',
  destinationOtherGradingPlatformColumnId: 'text_mm6ngx3t',
  destinationGradingCredentialsColumnId: 'long_text_mm6n7ywf',
  destinationScheduleColumnId: 'long_text_mm6nr7se',
  destinationPublicProgressColumnId: 'long_text_mm6ngwwx',
  destinationInternalNotesColumnId: 'long_text_mm6n4wk4',
  destinationTargetDateColumnId: 'date_mm6n1bp3',
  destinationRevisionColumnId: 'numeric_mm6nc08f',
  destinationSubmittedDateColumnId: 'date_mm6ncb2j',
  destinationCoachUpdateDateColumnId: 'date_mm6n47kd',
  destinationNotificationMessageColumnId: 'long_text_mm6n4cz5',
  destinationNotificationEventColumnId: 'text_mm6n2ty2',
  destinationNotificationSentDateColumnId: 'date_mm6nxd2f',
  destinationNotificationErrorColumnId: 'long_text_mm6nkz30',
  destinationNotificationAudienceColumnId: 'color_mm6n6tt9',
  destinationNotificationStateColumnId: 'color_mm6n8gnz',
  accountsBoardId: '9718635629',
  accountsStatusColumnId: 'color_mkwjcmfq',
  accountsActiveLabel: 'Active',
  accountsSubitemBoardId: '9719292298',
  sectionStatusColumnId: 'color_mkvqqdzk',
  assignedTeacherColumnId: 'board_relation_mktxpkv3',
  classRequestRelationColumnId: 'board_relation_mm6ndter',
  classPortalLinkColumnId: 'link_mm6n6qs',
  staffBoardId: '9739309783',
  staffCoachColumnId: 'people8',
  staffKreycoEmailColumnId: 'lln_email__1',
  staffPersonalEmailColumnId: 'dup__of_personal_email5__1',
  timeZone: 'America/New_York',
  classCacheSeconds: 900,
  operationCacheSeconds: 21600,
  leaseSeconds: 180,
  maxTextLength: 1500,
  maxCoachUpdateLength: 2500,
  auditSchemaVersion: 1,
  auditSheetName: 'Audit Log',
  auditConfigurationSheetName: 'Configuration',
  auditSnapshotSheetName: 'Request Snapshots',
  auditMaxJsonLength: 45000,
  auditSeedRequestItemIds: Object.freeze(['12835244405']),
  excludedClassStatuses: Object.freeze([
    'ended - renewal',
    'ended - new',
    'ended',
    'not moving forward'
  ])
});

var ELIGIBLE_CLASSES_THIS_EXECUTION_ = null;

function doGet(e) {
  var parameters = (e && e.parameter) || {};
  var template = HtmlService.createTemplateFromFile('Index');
  template.bootstrapJson = safeJsonForHtml_({
    classId: /^\d+$/.test(String(parameters.class || '')) ? String(parameters.class) : '',
    accessToken: cleanToken_(parameters.access || ''),
    mode: parameters.mode === 'view' ? 'view' : 'coach'
  });
  return template.evaluate()
    .setTitle('Classroom Creation Request')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getPortalBootstrap(context) {
  return auditedPublicCall_('portal', 'get_portal_bootstrap', { actorType: 'Portal User', input: context || {} }, function () {
    return getPortalBootstrap_(context);
  });
}

function getPortalBootstrap_(context) {
  enforceRateLimit_('portal-read', 300, 60);
  var input = context || {};
  var classId = String(input.classId || '');
  if (!classId) return { mode: 'new', preselected: false };
  classId = requireId_(classId, 'class');
  var requestedMode = input.mode === 'view' ? 'view' : 'coach';
  var accessToken = cleanToken_(input.accessToken || '');
  if (!isValidPortalToken_(classId, requestedMode, accessToken)) {
    throw new Error('This class link is invalid or incomplete. Open the current Classroom Request Form link from the class row.');
  }
  var classroom = getClassById_(classId);
  if (!classroom) throw new Error('This class could not be found.');
  var cachedRequestId = CacheService.getScriptCache().get('class-request:' + classId);
  var requestItemId = classroom.requestItemId || cachedRequestId || '';
  var requestItem = requestItemId ? getRequestItem_(requestItemId) : null;
  if (!requestItem) {
    if (requestedMode === 'view') throw new Error('No classroom request has been started for this class.');
    return {
      mode: classroom.eligible ? 'edit' : 'blocked',
      preselected: true,
      accessMode: 'coach',
      accessToken: accessToken,
      classroom: publicClassroom_(classroom),
      request: null,
      message: classroom.eligible ? '' : 'This class is no longer eligible for a new request.'
    };
  }
  return buildPortalResponse_(classroom, requestItem, requestedMode, accessToken);
}

function getSchoolPage(options) {
  return auditedPublicCall_('directory', 'get_school_page', { actorType: 'Portal User', input: options || {} }, function () {
    return getSchoolPage_(options);
  });
}

function getSchoolPage_(options) {
  enforceRateLimit_('directory-read', 300, 60);
  var input = options || {};
  var pageSize = clampInteger_(input.pageSize, 5, 50, 30);
  var page = clampInteger_(input.page, 1, 10000, 1);
  var search = cleanText_(input.search || '', 100).toLowerCase();
  var classes = getEligibleClasses_(false);
  var schoolMap = {};
  classes.forEach(function (classroom) {
    if (!schoolMap[classroom.schoolId]) {
      schoolMap[classroom.schoolId] = {
        id: classroom.schoolId,
        name: classroom.schoolName,
        eligibleClassCount: 0,
        unassignedClassCount: 0,
        availableClassCount: 0
      };
    }
    schoolMap[classroom.schoolId].eligibleClassCount += 1;
    if (!classroom.teacherId) schoolMap[classroom.schoolId].unassignedClassCount += 1;
    if (!classroom.requestItemId) schoolMap[classroom.schoolId].availableClassCount += 1;
  });
  var schools = Object.keys(schoolMap).map(function (key) { return schoolMap[key]; }).sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  if (search) {
    schools = schools.filter(function (school) { return school.name.toLowerCase().indexOf(search) !== -1; });
  }
  var totalItems = schools.length;
  var totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  page = Math.min(page, totalPages);
  var start = (page - 1) * pageSize;
  return { items: schools.slice(start, start + pageSize), page: page, pageSize: pageSize, totalItems: totalItems, totalPages: totalPages };
}

function getClassesForSchool(schoolId) {
  return auditedPublicCall_('directory', 'get_classes_for_school', { actorType: 'Portal User', schoolId: String(schoolId || '') }, function () {
    return getClassesForSchool_(schoolId);
  });
}

function getClassesForSchool_(schoolId) {
  enforceRateLimit_('directory-read', 300, 60);
  schoolId = requireId_(schoolId, 'school');
  var classes = getEligibleClasses_(false).filter(function (classroom) {
    return classroom.schoolId === schoolId;
  });
  return hydrateClassCoaches_(classes).map(publicClassroom_).sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function saveDraft(payload) {
  var context = auditContextFromPayload_(payload);
  context.statusAfter = 'Draft';
  return auditedPublicCall_('request', 'save_draft', context, function () {
    return saveClassRequest_(payload || {}, 'Draft');
  });
}

function sendToTech(payload) {
  var context = auditContextFromPayload_(payload);
  context.statusAfter = 'Sent to Tech';
  context.notificationAudience = 'Tech';
  context.notificationState = 'Pending';
  return auditedPublicCall_('request', 'send_to_tech', context, function () {
    return saveClassRequest_(payload || {}, 'Sent to Tech');
  });
}

function submitRequestChanges(payload) {
  var context = auditContextFromPayload_(payload);
  context.statusAfter = 'Reopened - Coach Update';
  context.notificationAudience = 'Tech';
  context.notificationState = 'Pending';
  return auditedPublicCall_('request', 'submit_request_changes', context, function () {
    return submitRequestChanges_(payload || {});
  });
}

function submitRequestChanges_(payload) {
  enforceRateLimit_('public-write', 60, 60);
  var request = normalizeClassRequest_(payload, false);
  var operationKey = 'operation:' + request.operationId;
  var cache = CacheService.getScriptCache();
  var cached = cache.get(operationKey);
  if (cached) return JSON.parse(cached);
  var result = withLease_('class:' + request.classId, function () {
    if (!isValidPortalToken_(request.classId, 'coach', request.accessToken)) throw new Error('This coach link is invalid.');
    var classroom = getClassById_(request.classId);
    validateAuthoritativeClass_(request, classroom);
    resolveRequestCoach_(request, classroom);
    var requestItem = classroom.requestItemId ? getRequestItem_(classroom.requestItemId) : null;
    if (!requestItem) throw new Error('No classroom request exists for this class.');
    if (requestItem.status === 'Draft') throw new Error('Send the draft to Tech instead of submitting an update.');
    if (requestItem.status === 'Cancelled' || requestItem.status === 'No Longer Eligible') {
      throw new Error('Updates are disabled for this request. Contact Tech Support if assistance is still needed.');
    }
    if (requestItem.revision !== request.expectedRevision) {
      throw new Error('This request changed since you opened it. Reload the page before submitting your changes.');
    }
    var revision = requestItem.revision + 1;
    var values = buildRequestColumnValues_(request, classroom, 'Reopened - Coach Update', revision, false);
    values[CONFIG.destinationCoachUpdateDateColumnId] = { date: today_() };
    values[CONFIG.destinationPublicProgressColumnId] = { text: 'The coach submitted updated classroom details. Tech has been notified.' };
    values[CONFIG.destinationNotificationAudienceColumnId] = { label: 'Tech' };
    values[CONFIG.destinationNotificationStateColumnId] = { label: 'Pending' };
    values[CONFIG.destinationNotificationMessageColumnId] = { text: 'Classroom request details were updated by ' + request.coachName + '.' };
    values[CONFIG.destinationNotificationEventColumnId] = request.operationId;
    values[CONFIG.destinationNotificationErrorColumnId] = { text: '' };
    updateRequestItem_(requestItem.id, values);
    createMondayUpdate_(requestItem.id, 'Coach edited the classroom request details and submitted the changes to Tech. See the Activity Log for the changed fields.');
    var saved = getRequestItem_(requestItem.id);
    var response = saveResult_(classroom, saved, '');
    response.notificationItemId = String(requestItem.id);
    return response;
  });
  try {
    var notificationResult = processNotificationById_(result.notificationItemId);
    if (notificationResult && notificationResult.paused) result.warning = 'Your changes were saved. Email delivery is paused, so the Tech notification remains queued.';
  }
  catch (notificationError) { result.warning = 'Your changes were saved and queued. Tech notification will retry during scheduled maintenance.'; }
  delete result.notificationItemId;
  cache.put(operationKey, JSON.stringify(result), CONFIG.operationCacheSeconds);
  return result;
}

function saveClassRequest_(payload, targetStatus) {
  enforceRateLimit_('public-write', 60, 60);
  var request = normalizeClassRequest_(payload, targetStatus === 'Draft');
  var operationKey = 'operation:' + request.operationId;
  var cache = CacheService.getScriptCache();
  var cached = cache.get(operationKey);
  if (cached) return JSON.parse(cached);
  var result = withLease_('class:' + request.classId, function () {
    var classroom = getClassById_(request.classId);
    validateAuthoritativeClass_(request, classroom);
    resolveRequestCoach_(request, classroom);
    var existing = classroom.requestItemId ? getRequestItem_(classroom.requestItemId) : null;
    var isNew = !existing;
    if (existing) {
      if (existing.requestId === request.requestId && request.expectedRevision === 0 && targetStatus === 'Draft' && existing.status === 'Draft') {
        return saveResult_(classroom, existing, 'This draft was already saved.');
      }
      if (!isValidPortalToken_(request.classId, 'coach', request.accessToken)) {
        if (existing.requestId === request.requestId && targetStatus === 'Sent to Tech' && existing.status !== 'Draft') {
          return saveResult_(classroom, existing, 'This request was already sent to Tech.');
        }
        throw new Error('Use the dedicated Classroom Request Form link on the class row to update this request.');
      }
      if (existing.status !== 'Draft') {
        if (existing.requestId === request.requestId && targetStatus === 'Sent to Tech') {
          return saveResult_(classroom, existing, 'This request was already sent to Tech.');
        }
        throw new Error('This request has already been sent to Tech. Use Submit an Update from its summary page.');
      }
      if (request.expectedRevision !== existing.revision) {
        throw new Error('This draft changed in another session. Reload the class link before saving again.');
      }
    } else if (request.expectedRevision !== 0) {
      throw new Error('The request state changed. Reload the page and try again.');
    }
    var revision = existing ? existing.revision + 1 : 1;
    var values = buildRequestColumnValues_(request, classroom, targetStatus, revision, isNew);
    var item;
    if (isNew) item = createRequestItem_(classroom.name, values);
    else {
      updateRequestItem_(existing.id, values);
      item = { id: existing.id, url: existing.url || CONFIG.mondayItemUrl + existing.id };
    }
    CacheService.getScriptCache().put('class-request:' + classroom.id, String(item.id), CONFIG.operationCacheSeconds);
    markClassRequestCached_(classroom.id, item.id);
    ensureClassPortalLink_(classroom.id);
    var saved = getRequestItem_(item.id);
    if (targetStatus === 'Sent to Tech') createMondayUpdate_(item.id, 'Request sent to Tech by ' + request.coachName + '.');
    var response = saveResult_(classroom, saved, '');
    response.firstDraft = isNew && targetStatus === 'Draft';
    response.notificationItemId = targetStatus === 'Sent to Tech' ? String(item.id) : '';
    response.coachEmail = request.coachEmail;
    return response;
  });
  if (result.firstDraft) {
    try {
      var draftDelivery = sendDraftSavedEmail_(result.coachEmail, result.coachUrl, result.classroomName);
      if (draftDelivery && draftDelivery.paused) result.warning = 'The draft was saved. Email delivery is paused, so use the Classroom Request Form link on the class row to return to it.';
    }
    catch (draftEmailError) { result.warning = 'The draft was saved, but the confirmation email could not be sent. Keep the class portal link available from the Accounts class row.'; }
  }
  if (result.notificationItemId) {
    try {
      var notificationResult = processNotificationById_(result.notificationItemId);
      if (notificationResult && notificationResult.paused) result.warning = 'The request was saved. Email delivery is paused, so the Tech notification remains queued.';
    }
    catch (notificationError) { result.warning = 'The request was saved and queued for Tech notification. Email delivery will retry during scheduled maintenance.'; }
  }
  delete result.firstDraft;
  delete result.notificationItemId;
  delete result.coachEmail;
  cache.put(operationKey, JSON.stringify(result), CONFIG.operationCacheSeconds);
  return result;
}

function submitCoachUpdate(payload) {
  var context = auditContextFromPayload_(payload);
  context.statusAfter = 'Reopened - Coach Update';
  context.notificationAudience = 'Tech';
  context.notificationState = 'Pending';
  return auditedPublicCall_('request', 'submit_coach_update', context, function () {
    return submitCoachUpdate_(payload);
  });
}

function submitCoachUpdate_(payload) {
  enforceRateLimit_('public-write', 60, 60);
  var input = payload || {};
  if (input.website) throw new Error('Submission rejected.');
  var classId = requireId_(input.classId, 'class');
  var accessToken = cleanToken_(input.accessToken || '');
  if (!isValidPortalToken_(classId, 'coach', accessToken)) throw new Error('This coach link is invalid.');
  var message = requireText_(input.message, 'update for Tech', CONFIG.maxCoachUpdateLength);
  var expectedRevision = clampInteger_(input.expectedRevision, 0, 100000000, -1);
  if (expectedRevision < 0) throw new Error('The request version is missing. Reload the page.');
  var operationId = validateOperationId_(input.operationId);
  var operationKey = 'operation:' + operationId;
  var cache = CacheService.getScriptCache();
  var cached = cache.get(operationKey);
  if (cached) return JSON.parse(cached);
  var result = withLease_('class:' + classId, function () {
    var classroom = getClassById_(classId);
    var requestItem = classroom && classroom.requestItemId ? getRequestItem_(classroom.requestItemId) : null;
    if (!requestItem) throw new Error('No classroom request exists for this class.');
    if (requestItem.revision !== expectedRevision) throw new Error('This request changed since you opened it. Reload the page before submitting your update.');
    if (requestItem.status === 'Draft') throw new Error('Save or send the draft instead of submitting an update.');
    if (requestItem.status === 'Cancelled' || requestItem.status === 'No Longer Eligible') {
      throw new Error('Updates are disabled for this request. Contact Tech Support if assistance is still needed.');
    }
    var values = {};
    values[CONFIG.destinationStatusColumnId] = { label: 'Reopened - Coach Update' };
    values[CONFIG.destinationRevisionColumnId] = String(requestItem.revision + 1);
    values[CONFIG.destinationCoachUpdateDateColumnId] = { date: today_() };
    values[CONFIG.destinationNotificationAudienceColumnId] = { label: 'Tech' };
    values[CONFIG.destinationNotificationStateColumnId] = { label: 'Pending' };
    values[CONFIG.destinationNotificationMessageColumnId] = { text: message };
    values[CONFIG.destinationNotificationEventColumnId] = operationId;
    values[CONFIG.destinationNotificationErrorColumnId] = { text: '' };
    updateRequestItem_(requestItem.id, values);
    createMondayUpdate_(requestItem.id, 'Coach update:\n\n' + message);
    return { ok: true, itemId: requestItem.id, revision: requestItem.revision + 1, status: 'Reopened - Coach Update', reference: 'CCR-' + requestItem.id };
  });
  try {
    var notificationResult = processNotificationById_(result.itemId);
    if (notificationResult && notificationResult.paused) result.warning = 'Your update was saved. Email delivery is paused, so the Tech notification remains queued.';
  }
  catch (notificationError) { result.warning = 'Your update was saved and queued. Tech notification will retry during scheduled maintenance.'; }
  cache.put(operationKey, JSON.stringify(result), CONFIG.operationCacheSeconds);
  return result;
}

function buildRequestColumnValues_(request, classroom, status, revision, isNew) {
  var values = {};
  values[CONFIG.destinationClassRelationColumnId] = { item_ids: [Number(classroom.id)] };
  values[CONFIG.destinationSchoolRelationColumnId] = { item_ids: [Number(classroom.schoolId)] };
  values[CONFIG.destinationTeacherRelationColumnId] = classroom.teacherId ? { item_ids: [Number(classroom.teacherId)] } : { item_ids: [] };
  values[CONFIG.destinationCoachPeopleColumnId] = request.assignedCoachId
    ? { personsAndTeams: [{ id: Number(request.assignedCoachId), kind: 'person' }] }
    : { personsAndTeams: [] };
  values[CONFIG.destinationTimelineAcknowledgedColumnId] = { checked: 'true' };
  values[CONFIG.destinationRequestIdColumnId] = request.requestId;
  values[CONFIG.destinationStatusColumnId] = { label: status };
  values[CONFIG.destinationCoachNameColumnId] = request.coachName;
  values[CONFIG.destinationCoachEmailColumnId] = { email: request.coachEmail, text: request.coachEmail };
  values[CONFIG.destinationLanguageColumnId] = request.language;
  values[CONFIG.destinationGradeLevelColumnId] = request.gradeLevel;
  values[CONFIG.destinationCurriculumColumnId] = request.kreycoCurriculum;
  values[CONFIG.destinationLmsVerificationColumnId] = request.verificationNeeded ? { label: request.verificationNeeded } : null;
  values[CONFIG.destinationGoogleClassroomColumnId] = request.useGoogleClassroom ? { label: request.useGoogleClassroom } : null;
  values[CONFIG.destinationOtherGradingPlatformColumnId] = request.otherGradingPlatform;
  values[CONFIG.destinationScheduleColumnId] = { text: request.schedule };
  values[CONFIG.destinationRevisionColumnId] = String(revision);
  setCredentialValue_(values, CONFIG.destinationLmsCredentialsColumnId, request.lmsCredentials, request.clearLmsCredentials, isNew);
  setCredentialValue_(values, CONFIG.destinationGradingCredentialsColumnId, request.gradingCredentials, request.clearGradingCredentials, isNew);
  if (status === 'Sent to Tech') {
    values[CONFIG.destinationSubmittedDateColumnId] = { date: today_() };
    values[CONFIG.destinationPublicProgressColumnId] = { text: 'Your request has been sent to Tech and is awaiting review.' };
    values[CONFIG.destinationNotificationAudienceColumnId] = { label: 'Tech' };
    values[CONFIG.destinationNotificationStateColumnId] = { label: 'Pending' };
    values[CONFIG.destinationNotificationMessageColumnId] = { text: 'A classroom creation request was submitted by ' + request.coachName + '.' };
    values[CONFIG.destinationNotificationEventColumnId] = request.operationId;
    values[CONFIG.destinationNotificationErrorColumnId] = { text: '' };
  } else if (isNew) values[CONFIG.destinationNotificationStateColumnId] = { label: 'Not Requested' };
  return values;
}

function setCredentialValue_(values, columnId, value, clearValue, isNew) {
  if (clearValue) values[columnId] = { text: '' };
  else if (value) values[columnId] = { text: value };
  else if (isNew) values[columnId] = { text: '' };
}

function createRequestItem_(itemName, columnValues) {
  var query = 'mutation CreateClassRequest($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id name url } }';
  var data = mondayRequest_(query, { boardId: CONFIG.destinationBoardId, groupId: CONFIG.destinationGroupId, itemName: itemName, columnValues: JSON.stringify(columnValues) });
  if (!data.create_item || !data.create_item.id) throw new Error('Monday did not return the new request item.');
  return data.create_item;
}

function updateRequestItem_(itemId, columnValues) {
  var query = 'mutation UpdateClassRequest($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }';
  mondayRequest_(query, { boardId: CONFIG.destinationBoardId, itemId: String(itemId), columnValues: JSON.stringify(columnValues) });
}

function createMondayUpdate_(itemId, body) {
  mondayRequest_('mutation AddRequestUpdate($itemId: ID!, $body: String!) { create_update(item_id: $itemId, body: $body) { id } }', { itemId: String(itemId), body: cleanText_(body, 5000) });
}

function getEligibleClasses_(forceRefresh) {
  if (!forceRefresh && ELIGIBLE_CLASSES_THIS_EXECUTION_) return ELIGIBLE_CLASSES_THIS_EXECUTION_;
  var cache = CacheService.getScriptCache();
  var cacheKey = 'eligible-classes-v4';
  var cached = !forceRefresh && cache.get(cacheKey);
  if (cached) {
    ELIGIBLE_CLASSES_THIS_EXECUTION_ = JSON.parse(cached);
    return ELIGIBLE_CLASSES_THIS_EXECUTION_;
  }
  var itemFields = classQueryFields_();
  var firstQuery = 'query EligibleClasses { boards(ids: [' + CONFIG.accountsSubitemBoardId + ']) { items_page(limit: 500) { cursor items { ' + itemFields + ' } } } }';
  var data = mondayRequest_(firstQuery, {});
  var page = (((data.boards || [])[0] || {}).items_page || {});
  var items = page.items || [];
  var cursor = page.cursor;
  while (cursor) {
    var nextQuery = 'query NextEligibleClasses($cursor: String!) { next_items_page(cursor: $cursor) { cursor items { ' + itemFields + ' } } }';
    var next = mondayRequest_(nextQuery, { cursor: cursor }).next_items_page || {};
    items = items.concat(next.items || []);
    cursor = next.cursor;
  }
  var classes = items.map(parseClassItem_).filter(function (classroom) { return classroom.eligible; });
  ELIGIBLE_CLASSES_THIS_EXECUTION_ = classes;
  cache.put(cacheKey, JSON.stringify(classes), CONFIG.classCacheSeconds);
  return classes;
}

function markClassRequestCached_(classId, requestItemId) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'eligible-classes-v4';
  var cached = cache.get(cacheKey);
  if (!cached) return;
  try {
    var classes = JSON.parse(cached);
    var changed = false;
    classes.forEach(function (classroom) {
      if (String(classroom.id) !== String(classId)) return;
      classroom.requestItemId = String(requestItemId || '');
      changed = true;
    });
    if (changed) cache.put(cacheKey, JSON.stringify(classes), CONFIG.classCacheSeconds);
  } catch (ignore) {}
}

function getClassById_(classId) {
  classId = requireId_(classId, 'class');
  var data = mondayRequest_('query OneClass($itemId: ID!) { items(ids: [$itemId]) { ' + classQueryFields_() + ' } }', { itemId: classId });
  var item = (data.items || [])[0];
  return item ? hydrateClassCoaches_([parseClassItem_(item)])[0] : null;
}

function classQueryFields_() {
  return [
    'id', 'name',
    'column_values(ids: ["' + CONFIG.sectionStatusColumnId + '", "' + CONFIG.assignedTeacherColumnId + '", "' + CONFIG.classRequestRelationColumnId + '", "' + CONFIG.classPortalLinkColumnId + '"]) {',
    ' id text value ... on StatusValue { label } ... on BoardRelationValue { linked_item_ids linked_items { id name } } ... on LinkValue { url text }',
    '}',
    'parent_item { id name column_values(ids: ["' + CONFIG.accountsStatusColumnId + '"]) { id text ... on StatusValue { label } } }'
  ].join('\n');
}

function parseClassItem_(item) {
  var parent = item.parent_item || {};
  var teacher = (columnValue_(item.column_values, CONFIG.assignedTeacherColumnId).linked_items || [])[0] || {};
  var requestRelation = columnValue_(item.column_values, CONFIG.classRequestRelationColumnId);
  var portalLink = columnValue_(item.column_values, CONFIG.classPortalLinkColumnId);
  var status = columnLabel_(item.column_values, CONFIG.sectionStatusColumnId);
  var schoolStatus = columnLabel_(parent.column_values, CONFIG.accountsStatusColumnId);
  var coachAssignments = peopleAssignments_(teacher.column_values, CONFIG.staffCoachColumnId);
  return {
    id: String(item.id), name: item.name || '', status: status,
    schoolId: String(parent.id || ''), schoolName: parent.name || '', schoolStatus: schoolStatus,
    teacherId: String(teacher.id || ''), teacherName: teacher.name || '',
    coachAssignments: coachAssignments,
    coachUserIds: coachAssignments.filter(function (assignment) { return assignment.kind === 'person'; }).map(function (assignment) { return assignment.id; }),
    hasCoachTeamAssignment: coachAssignments.some(function (assignment) { return assignment.kind === 'team'; }),
    coachCandidates: [],
    requestItemId: String((requestRelation.linked_item_ids || [])[0] || ''), portalUrl: portalLink.url || '',
    eligible: !!parent.id && schoolStatus === CONFIG.accountsActiveLabel && isEligibleClassStatus_(status)
  };
}

function hydrateClassCoaches_(classes) {
  var teacherIds = {};
  (classes || []).forEach(function (classroom) {
    if (classroom.teacherId) teacherIds[classroom.teacherId] = true;
  });
  var assignmentsByTeacher = {};
  var ids = Object.keys(teacherIds);
  for (var offset = 0; offset < ids.length; offset += 100) {
    var batch = ids.slice(offset, offset + 100);
    var data = mondayRequest_('query ResolveTeacherCoaches($teacherIds: [ID!]!) { items(ids: $teacherIds) { id column_values(ids: ["' + CONFIG.staffCoachColumnId + '"]) { id value ... on PeopleValue { persons_and_teams { id kind } } } } }', { teacherIds: batch });
    (data.items || []).forEach(function (teacher) {
      assignmentsByTeacher[String(teacher.id)] = peopleAssignments_(teacher.column_values, CONFIG.staffCoachColumnId);
    });
  }
  var coachIds = {};
  (classes || []).forEach(function (classroom) {
    var assignments = assignmentsByTeacher[classroom.teacherId] || classroom.coachAssignments || [];
    classroom.coachUserIds = assignments.filter(function (assignment) { return assignment.kind === 'person'; }).map(function (assignment) { return assignment.id; });
    classroom.hasCoachTeamAssignment = assignments.some(function (assignment) { return assignment.kind === 'team'; });
    classroom.coachUserIds.forEach(function (id) { coachIds[id] = true; });
  });
  var usersById = resolveMondayUsers_(Object.keys(coachIds));
  (classes || []).forEach(function (classroom) {
    classroom.coachCandidates = classroom.coachUserIds.map(function (id) { return usersById[id]; }).filter(Boolean).map(function (user) {
      return { id: user.id, name: user.name, email: user.email };
    });
  });
  return classes || [];
}

function resolveMondayUsers_(userIds) {
  var usersById = {};
  for (var offset = 0; offset < (userIds || []).length; offset += 100) {
    var batch = userIds.slice(offset, offset + 100);
    var data = mondayRequest_('query ResolveCoachUsers($userIds: [ID!]) { users(ids: $userIds) { id name email } }', { userIds: batch });
    (data.users || []).forEach(function (user) {
      usersById[String(user.id)] = { id: String(user.id), name: cleanText_(user.name || '', 150), email: cleanText_(user.email || '', 254).toLowerCase() };
    });
  }
  return usersById;
}

function getRequestItem_(itemId) {
  itemId = requireId_(itemId, 'request item');
  var data = mondayRequest_('query OneRequest($itemId: ID!) { items(ids: [$itemId]) { ' + requestQueryFields_() + ' } }', { itemId: itemId });
  var item = (data.items || [])[0];
  return item ? parseRequestItem_(item) : null;
}

function requestQueryFields_() {
  var ids = requestColumnIds_().map(function (id) { return '"' + id + '"'; }).join(',');
  return [
    'id name url state',
    'column_values(ids: [' + ids + ']) {',
    ' id text value ... on StatusValue { label }',
    ' ... on BoardRelationValue { linked_item_ids linked_items { id name column_values(ids: ["' + CONFIG.staffKreycoEmailColumnId + '", "' + CONFIG.staffPersonalEmailColumnId + '"]) { id text } } }',
    ' ... on EmailValue { email text } ... on DateValue { date } ... on NumbersValue { number } ... on PeopleValue { persons_and_teams { id kind } }',
    '}'
  ].join('\n');
}

function requestColumnIds_() {
  return [CONFIG.destinationSchoolRelationColumnId, CONFIG.destinationRequestIdColumnId, CONFIG.destinationClassRelationColumnId,
    CONFIG.destinationTeacherRelationColumnId, CONFIG.destinationStatusColumnId, CONFIG.destinationCoachNameColumnId,
    CONFIG.destinationCoachEmailColumnId, CONFIG.destinationCoachPeopleColumnId, CONFIG.destinationLanguageColumnId, CONFIG.destinationGradeLevelColumnId,
    CONFIG.destinationCurriculumColumnId, CONFIG.destinationLmsCredentialsColumnId, CONFIG.destinationLmsVerificationColumnId,
    CONFIG.destinationGoogleClassroomColumnId, CONFIG.destinationOtherGradingPlatformColumnId, CONFIG.destinationGradingCredentialsColumnId,
    CONFIG.destinationScheduleColumnId, CONFIG.destinationPublicProgressColumnId, CONFIG.destinationInternalNotesColumnId, CONFIG.destinationTargetDateColumnId,
    CONFIG.destinationRevisionColumnId, CONFIG.destinationSubmittedDateColumnId, CONFIG.destinationCoachUpdateDateColumnId,
    CONFIG.destinationNotificationMessageColumnId, CONFIG.destinationNotificationEventColumnId, CONFIG.destinationNotificationSentDateColumnId,
    CONFIG.destinationNotificationErrorColumnId, CONFIG.destinationNotificationAudienceColumnId, CONFIG.destinationNotificationStateColumnId];
}

function parseRequestItem_(item) {
  var values = item.column_values || [];
  var classroom = (columnValue_(values, CONFIG.destinationClassRelationColumnId).linked_items || [])[0] || {};
  var school = (columnValue_(values, CONFIG.destinationSchoolRelationColumnId).linked_items || [])[0] || {};
  var teacher = (columnValue_(values, CONFIG.destinationTeacherRelationColumnId).linked_items || [])[0] || {};
  var kreycoEmail = columnText_(teacher.column_values, CONFIG.staffKreycoEmailColumnId);
  var personalEmail = columnText_(teacher.column_values, CONFIG.staffPersonalEmailColumnId);
  var assignedCoachId = (peopleAssignments_(values, CONFIG.destinationCoachPeopleColumnId)[0] || {}).id || '';
  return {
    id: String(item.id), name: item.name || '', url: item.url || CONFIG.mondayItemUrl + item.id, itemState: item.state || 'active',
    requestId: columnText_(values, CONFIG.destinationRequestIdColumnId),
    classId: firstLinkedItemId_(values, CONFIG.destinationClassRelationColumnId), className: classroom.name || '',
    schoolId: firstLinkedItemId_(values, CONFIG.destinationSchoolRelationColumnId), schoolName: school.name || '',
    teacherId: String(teacher.id || ''), teacherName: teacher.name || '', teacherEmail: kreycoEmail || personalEmail,
    status: columnLabel_(values, CONFIG.destinationStatusColumnId) || 'Draft',
    assignedCoachId: assignedCoachId,
    coachName: columnText_(values, CONFIG.destinationCoachNameColumnId), coachEmail: columnEmail_(values, CONFIG.destinationCoachEmailColumnId),
    language: columnText_(values, CONFIG.destinationLanguageColumnId), gradeLevel: columnText_(values, CONFIG.destinationGradeLevelColumnId),
    kreycoCurriculum: columnText_(values, CONFIG.destinationCurriculumColumnId),
    hasLmsCredentials: !!columnText_(values, CONFIG.destinationLmsCredentialsColumnId),
    lmsCredentialsChangedAt: columnChangedAt_(values, CONFIG.destinationLmsCredentialsColumnId),
    verificationNeeded: columnLabel_(values, CONFIG.destinationLmsVerificationColumnId),
    useGoogleClassroom: columnLabel_(values, CONFIG.destinationGoogleClassroomColumnId),
    otherGradingPlatform: columnText_(values, CONFIG.destinationOtherGradingPlatformColumnId),
    hasGradingCredentials: !!columnText_(values, CONFIG.destinationGradingCredentialsColumnId),
    gradingCredentialsChangedAt: columnChangedAt_(values, CONFIG.destinationGradingCredentialsColumnId),
    schedule: columnText_(values, CONFIG.destinationScheduleColumnId), publicProgress: columnText_(values, CONFIG.destinationPublicProgressColumnId),
    hasInternalNotes: !!columnText_(values, CONFIG.destinationInternalNotesColumnId),
    internalNotesChangedAt: columnChangedAt_(values, CONFIG.destinationInternalNotesColumnId),
    targetDate: columnDate_(values, CONFIG.destinationTargetDateColumnId),
    revision: Math.max(0, Number(columnNumber_(values, CONFIG.destinationRevisionColumnId) || 0)),
    submittedDate: columnDate_(values, CONFIG.destinationSubmittedDateColumnId), coachUpdateDate: columnDate_(values, CONFIG.destinationCoachUpdateDateColumnId),
    notificationMessage: columnText_(values, CONFIG.destinationNotificationMessageColumnId),
    notificationEventId: columnText_(values, CONFIG.destinationNotificationEventColumnId),
    notificationAudience: columnLabel_(values, CONFIG.destinationNotificationAudienceColumnId),
    notificationState: columnLabel_(values, CONFIG.destinationNotificationStateColumnId),
    notificationError: columnText_(values, CONFIG.destinationNotificationErrorColumnId)
  };
}

function buildPortalResponse_(classroom, requestItem, accessMode, accessToken) {
  var editable = accessMode === 'coach' && requestItem.status === 'Draft' && classroom.eligible;
  var coachCanChange = accessMode === 'coach' && classroom.eligible && ['Cancelled', 'No Longer Eligible'].indexOf(requestItem.status) === -1;
  return {
    mode: editable ? 'edit' : 'summary', preselected: true, accessMode: accessMode, accessToken: accessToken,
    classroom: publicClassroom_(classroom),
    request: {
      id: requestItem.id, reference: 'CCR-' + requestItem.id, requestId: requestItem.requestId,
      revision: requestItem.revision, status: requestItem.status, progressPercent: progressPercent_(requestItem.status),
      assignedCoachId: coachCanChange ? requestItem.assignedCoachId : '', coachDisplayName: requestItem.coachName,
      coachName: coachCanChange ? requestItem.coachName : '', coachEmail: coachCanChange ? requestItem.coachEmail : '',
      language: requestItem.language, gradeLevel: requestItem.gradeLevel, kreycoCurriculum: requestItem.kreycoCurriculum,
      hasLmsCredentials: coachCanChange && requestItem.hasLmsCredentials, verificationNeeded: requestItem.verificationNeeded,
      useGoogleClassroom: requestItem.useGoogleClassroom, otherGradingPlatform: requestItem.otherGradingPlatform,
      hasGradingCredentials: coachCanChange && requestItem.hasGradingCredentials, schedule: requestItem.schedule,
      publicProgress: requestItem.publicProgress || defaultProgressMessage_(requestItem.status), targetDate: requestItem.targetDate,
      submittedDate: requestItem.submittedDate, coachUpdateDate: requestItem.coachUpdateDate,
      canSubmitUpdate: accessMode === 'coach' && ['Draft', 'Cancelled', 'No Longer Eligible'].indexOf(requestItem.status) === -1,
      canEditDetails: coachCanChange && requestItem.status !== 'Draft'
    }
  };
}

function saveResult_(classroom, requestItem, warning) {
  return { ok: true, itemId: requestItem.id, reference: 'CCR-' + requestItem.id, revision: requestItem.revision,
    status: requestItem.status, classroomName: classroom.name, coachUrl: portalUrl_(classroom.id, 'coach'),
    accessToken: portalToken_(classroom.id, 'coach'), assignedCoachId: requestItem.assignedCoachId || '',
    coachName: requestItem.coachName || '', warning: warning || '' };
}

function publicClassroom_(classroom) {
  return { id: classroom.id, name: classroom.name, status: classroom.status, schoolId: classroom.schoolId,
    schoolName: classroom.schoolName, teacherId: classroom.teacherId, teacherName: classroom.teacherName,
    coachOptions: (classroom.coachCandidates || []).map(function (coach) { return { id: coach.id, name: coach.name, hasEmail: isValidEmail_(coach.email) }; }),
    hasCoachTeamAssignment: !!classroom.hasCoachTeamAssignment,
    hasRequest: !!classroom.requestItemId, eligible: classroom.eligible };
}

function validateAuthoritativeClass_(request, classroom) {
  if (!classroom || !classroom.eligible) throw new Error('The selected class or its school is no longer active. Refresh the form and try again.');
  if (request.schoolId && request.schoolId !== classroom.schoolId) throw new Error('The selected class no longer belongs to that school. Refresh the form.');
}

function normalizeClassRequest_(payload, allowIncomplete) {
  if (payload.website) throw new Error('Submission rejected.');
  if (payload.acknowledged !== true) throw new Error('Please acknowledge the lesson limits and processing timeline.');
  var useGoogleClassroom = String(payload.useGoogleClassroom || '');
  if (!allowIncomplete) useGoogleClassroom = requireChoice_(useGoogleClassroom, ['Yes', 'No'], 'Google Classroom grading');
  else if (useGoogleClassroom && ['Yes', 'No'].indexOf(useGoogleClassroom) === -1) throw new Error('Select a valid value for Google Classroom grading.');
  var otherPlatform = cleanText_(payload.otherGradingPlatform || '', 200);
  if (!allowIncomplete && useGoogleClassroom === 'No' && !otherPlatform) throw new Error('Enter the other grading platform when Google Classroom is not used.');
  var useAssignedCoach = payload.useAssignedCoach === true;
  var assignedCoachId = useAssignedCoach ? requireId_(payload.assignedCoachId, 'assigned coach') : '';
  var coachName = useAssignedCoach ? cleanText_(payload.coachName || '', 150) : requireText_(payload.coachName, 'coach name', 150);
  var coachEmail = useAssignedCoach ? '' : requireText_(payload.coachEmail, 'coach email', 254).toLowerCase();
  if (!useAssignedCoach && !isValidEmail_(coachEmail)) throw new Error('Enter a valid coach email address.');
  var expectedRevision = clampInteger_(payload.expectedRevision, 0, 100000000, -1);
  if (expectedRevision < 0) throw new Error('The request version is missing. Reload the page.');
  return {
    requestId: validateRequestId_(payload.requestId), operationId: validateOperationId_(payload.operationId), expectedRevision: expectedRevision,
    schoolId: payload.schoolId ? requireId_(payload.schoolId, 'school') : '', classId: requireId_(payload.classId, 'class'),
    accessToken: cleanToken_(payload.accessToken || ''), useAssignedCoach: useAssignedCoach, assignedCoachId: assignedCoachId,
    coachName: coachName, coachEmail: coachEmail,
    language: allowIncomplete ? cleanText_(payload.language || '', 100) : requireText_(payload.language, 'language', 100),
    gradeLevel: allowIncomplete ? cleanText_(payload.gradeLevel || '', 100) : requireText_(payload.gradeLevel, 'grade level', 100),
    kreycoCurriculum: allowIncomplete ? cleanText_(payload.kreycoCurriculum || '', 200) : requireText_(payload.kreycoCurriculum, 'Kreyco curriculum', 200),
    lmsCredentials: cleanText_(payload.lmsCredentials || '', CONFIG.maxTextLength), clearLmsCredentials: payload.clearLmsCredentials === true,
    verificationNeeded: allowIncomplete && !payload.verificationNeeded ? '' : requireChoice_(payload.verificationNeeded, ['Yes', 'No'], 'LMS verification'), useGoogleClassroom: useGoogleClassroom,
    otherGradingPlatform: otherPlatform, gradingCredentials: cleanText_(payload.gradingCredentials || '', CONFIG.maxTextLength),
    clearGradingCredentials: payload.clearGradingCredentials === true, schedule: cleanText_(payload.schedule || '', CONFIG.maxTextLength)
  };
}

function resolveRequestCoach_(request, classroom) {
  if (!request.useAssignedCoach) {
    request.assignedCoachId = '';
    return request;
  }
  var coach = (classroom.coachCandidates || []).filter(function (candidate) { return candidate.id === request.assignedCoachId; })[0];
  if (!coach) throw new Error('The assigned coach changed or is no longer available. Reload the form or use a different contact.');
  if (!isValidEmail_(coach.email)) throw new Error('The assigned coach does not have a valid Monday email. Use a different contact.');
  request.coachName = coach.name;
  request.coachEmail = coach.email;
  return request;
}

function ensureClassPortalLink_(classId) {
  var values = {};
  values[CONFIG.classPortalLinkColumnId] = { url: portalUrl_(classId, 'coach'), text: 'Open classroom request' };
  mondayRequest_('mutation SetClassPortal($boardId: ID!, $itemId: ID!, $values: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $values) { id } }', {
    boardId: CONFIG.accountsSubitemBoardId, itemId: String(classId), values: JSON.stringify(values)
  });
}

function portalUrl_(classId, mode) {
  var safeMode = mode === 'view' ? 'view' : 'coach';
  return CONFIG.publicWebAppUrl + '?class=' + encodeURIComponent(String(classId)) + '&mode=' + safeMode + '&access=' + encodeURIComponent(portalToken_(classId, safeMode));
}

function portalToken_(classId, mode) {
  var bytes = Utilities.computeHmacSha256Signature(mode + ':' + String(classId), portalSigningSecret_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function isValidPortalToken_(classId, mode, token) {
  return !!token && /^[A-Za-z0-9_-]{32,128}$/.test(token) && constantTimeEqual_(portalToken_(classId, mode), token);
}

function portalSigningSecret_() {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty('PORTAL_SIGNING_SECRET');
  if (secret) return secret;
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    secret = properties.getProperty('PORTAL_SIGNING_SECRET');
    if (!secret) {
      secret = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
      properties.setProperty('PORTAL_SIGNING_SECRET', secret);
    }
    return secret;
  } finally { lock.releaseLock(); }
}

function constantTimeEqual_(expected, actual) {
  var a = String(expected || '');
  var b = String(actual || '');
  var difference = a.length ^ b.length;
  var length = Math.max(a.length, b.length);
  for (var i = 0; i < length; i += 1) {
    difference |= (a.charCodeAt(i % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(i % Math.max(1, b.length)) || 0);
  }
  return difference === 0;
}

function withLease_(leaseName, callback) {
  var properties = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  var key = 'LEASE_' + hashKey_(leaseName);
  var leaseId = Utilities.getUuid();
  var now = Date.now();
  lock.waitLock(5000);
  try {
    var currentRaw = properties.getProperty(key);
    var current;
    try { current = currentRaw ? JSON.parse(currentRaw) : null; } catch (ignore) { current = null; }
    if (current && Number(current.expiresAt || 0) > now) throw new Error('This class is being updated in another session. Wait a few seconds and try again.');
    properties.setProperty(key, JSON.stringify({ id: leaseId, expiresAt: now + (CONFIG.leaseSeconds * 1000) }));
  } finally { lock.releaseLock(); }
  try { return callback(); }
  finally {
    lock.waitLock(5000);
    try {
      var ownedRaw = properties.getProperty(key);
      var owned;
      try { owned = ownedRaw ? JSON.parse(ownedRaw) : null; } catch (ignoreOwned) { owned = null; }
      if (owned && owned.id === leaseId) properties.deleteProperty(key);
    } finally { lock.releaseLock(); }
  }
}

function hashKey_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value));
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '').slice(0, 32);
}

function enforceRateLimit_(bucket, limit, windowSeconds) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) throw new Error('The service is busy. Wait a moment and try again.');
  try {
    var windowId = Math.floor(Date.now() / (windowSeconds * 1000));
    var key = 'rate:' + bucket + ':' + windowId;
    var cache = CacheService.getScriptCache();
    var count = Number(cache.get(key) || 0);
    if (count >= limit) throw new Error('The service is receiving unusually high traffic. Try again in about a minute.');
    cache.put(key, String(count + 1), windowSeconds + 5);
  } finally {
    lock.releaseLock();
  }
}

function syncActiveClassroomRequestTeachers() {
  return auditedPublicCall_('maintenance', 'scheduled_maintenance', { actorType: 'System Trigger' }, function () {
    var result = { requests: syncRequestTeacherRelations_(), portalLinks: syncEligibleClassPortalLinks_(), notifications: processNotificationQueue_() };
    result.auditSnapshots = syncRequestAuditSnapshots_();
    return result;
  });
}

function syncRequestTeacherRelations_() {
  var items = getAllRequestItemsForSync_();
  var summary = { scanned: items.length, updated: 0, cleared: 0, ineligible: 0, unchanged: 0, busy: 0, changes: [] };
  items.forEach(function (item) {
    var classroomItem = (columnValue_(item.column_values, CONFIG.destinationClassRelationColumnId).linked_items || [])[0];
    if (!classroomItem) { summary.unchanged += 1; return; }
    var classroom = parseClassItem_(classroomItem);
    var currentTeacherId = firstLinkedItemId_(item.column_values, CONFIG.destinationTeacherRelationColumnId);
    var desiredTeacherId = classroom.eligible ? classroom.teacherId : '';
    var currentStatus = columnLabel_(item.column_values, CONFIG.destinationStatusColumnId);
    var values = {};
    if (desiredTeacherId !== currentTeacherId) values[CONFIG.destinationTeacherRelationColumnId] = desiredTeacherId ? { item_ids: [Number(desiredTeacherId)] } : { item_ids: [] };
    if (!classroom.eligible && ['Completed', 'Cancelled', 'No Longer Eligible'].indexOf(currentStatus) === -1) values[CONFIG.destinationStatusColumnId] = { label: 'No Longer Eligible' };
    if (!Object.keys(values).length) { summary.unchanged += 1; return; }
    try {
      withLease_('class:' + classroom.id, function () { updateRequestItem_(item.id, values); });
      if (!classroom.eligible) summary.ineligible += 1;
      else if (desiredTeacherId) summary.updated += 1;
      else summary.cleared += 1;
      summary.changes.push({ requestItemId: String(item.id), classId: classroom.id, className: classroom.name,
        schoolId: classroom.schoolId, schoolName: classroom.schoolName, previousTeacherId: currentTeacherId,
        currentTeacherId: desiredTeacherId, previousStatus: currentStatus,
        currentStatus: classroom.eligible ? currentStatus : 'No Longer Eligible' });
    } catch (error) {
      summary.busy += 1;
      summary.changes.push({ requestItemId: String(item.id), classId: classroom.id, outcome: 'busy', error: error.message || String(error) });
    }
  });
  return summary;
}

function getAllRequestItemsForSync_() {
  var itemFields = [
    'id',
    'column_values(ids: ["' + CONFIG.destinationClassRelationColumnId + '", "' + CONFIG.destinationTeacherRelationColumnId + '", "' + CONFIG.destinationStatusColumnId + '"]) {',
    ' id text ... on StatusValue { label } ... on BoardRelationValue { linked_item_ids linked_items { ' + classQueryFields_() + ' } }',
    '}'
  ].join('\n');
  var data = mondayRequest_('query SyncRequests { boards(ids: [' + CONFIG.destinationBoardId + ']) { items_page(limit: 500) { cursor items { ' + itemFields + ' } } } }', {});
  var page = (((data.boards || [])[0] || {}).items_page || {});
  var items = page.items || [];
  var cursor = page.cursor;
  while (cursor) {
    var next = mondayRequest_('query NextSyncRequests($cursor: String!) { next_items_page(cursor: $cursor) { cursor items { ' + itemFields + ' } } }', { cursor: cursor }).next_items_page || {};
    items = items.concat(next.items || []);
    cursor = next.cursor;
  }
  return items;
}

function syncEligibleClassPortalLinks_() {
  var classes = getEligibleClasses_(true);
  var summary = { scanned: classes.length, updated: 0, unchanged: 0, failed: 0, changes: [] };
  classes.forEach(function (classroom) {
    var desired = portalUrl_(classroom.id, 'coach');
    if (classroom.portalUrl === desired) { summary.unchanged += 1; return; }
    try {
      ensureClassPortalLink_(classroom.id);
      summary.updated += 1;
      summary.changes.push({ classId: classroom.id, className: classroom.name, schoolId: classroom.schoolId,
        schoolName: classroom.schoolName, action: classroom.portalUrl ? 'repaired' : 'created' });
    } catch (error) {
      summary.failed += 1;
      summary.changes.push({ classId: classroom.id, className: classroom.name, outcome: 'failed', error: error.message || String(error) });
    }
  });
  return summary;
}

function processNotificationQueue() {
  return auditedPublicCall_('notification', 'process_notification_queue', { actorType: 'Tech User' }, function () {
    return processNotificationQueue_();
  });
}

function authorizeEmailAccess() {
  requireTechAdministrator_();
  return { remainingRecipientQuota: MailApp.getRemainingDailyQuota() };
}

function processNotificationQueue_() {
  var interrupted = recoverInterruptedNotifications_();
  var query = 'query PendingNotifications { items_page_by_column_values(board_id: ' + CONFIG.destinationBoardId + ', limit: 25, columns: [{ column_id: "' + CONFIG.destinationNotificationStateColumnId + '", column_values: ["Pending"] }]) { items { id } } }';
  var data = mondayRequest_(query, {});
  var items = ((data.items_page_by_column_values || {}).items || []);
  var summary = { pending: items.length, sent: 0, failed: 0, paused: areEmailsPaused_(), interrupted: interrupted, results: [] };
  if (summary.paused) return summary;
  items.forEach(function (item) {
    try {
      var result = processNotificationById_(item.id);
      if (result && result.sent) summary.sent += 1;
      summary.results.push({ requestItemId: String(item.id), outcome: result && result.sent ? 'sent' : 'skipped' });
    } catch (error) {
      summary.failed += 1;
      summary.results.push({ requestItemId: String(item.id), outcome: 'failed', error: error.message || String(error) });
    }
  });
  return summary;
}

function recoverInterruptedNotifications_() {
  var query = 'query InterruptedNotifications { items_page_by_column_values(board_id: ' + CONFIG.destinationBoardId + ', limit: 25, columns: [{ column_id: "' + CONFIG.destinationNotificationStateColumnId + '", column_values: ["Sending"] }]) { items { id } } }';
  var data = mondayRequest_(query, {});
  var items = ((data.items_page_by_column_values || {}).items || []);
  var recovered = 0;
  items.forEach(function (item) {
    try {
      withLease_('notification:' + item.id, function () {
        var current = getRequestItem_(item.id);
        if (!current || current.notificationState !== 'Sending') return;
        var values = {};
        values[CONFIG.destinationNotificationStateColumnId] = { label: 'Failed' };
        values[CONFIG.destinationNotificationErrorColumnId] = { text: 'Delivery was interrupted before confirmation. Review the recipients and set Notification State to Pending to retry.' };
        updateRequestItem_(item.id, values);
        recovered += 1;
      });
    } catch (busyError) {
      // A live sender still owns the short notification lease; leave it alone.
    }
  });
  return recovered;
}

function processNotificationById_(itemId) {
  return withLease_('notification:' + itemId, function () {
    var requestItem = getRequestItem_(itemId);
    if (!requestItem || requestItem.notificationState !== 'Pending') return { skipped: true };
    if (areEmailsPaused_()) {
      auditEvent_({ severity: 'INFO', category: 'notification', action: 'email_paused', outcome: 'queued',
        actorType: 'System', requestItemId: requestItem.id, requestUrl: requestItem.url,
        classId: requestItem.classId, teacherId: requestItem.teacherId, teacherName: requestItem.teacherName,
        statusAfter: requestItem.status, revisionAfter: requestItem.revision,
        notificationAudience: requestItem.notificationAudience || 'Tech', notificationState: 'Pending',
        operationId: requestItem.notificationEventId, message: 'Email delivery is paused; notification remains queued.' });
      return { paused: true, queued: true };
    }
    var eventId = requestItem.notificationEventId || Utilities.getUuid();
    var sending = {};
    sending[CONFIG.destinationNotificationStateColumnId] = { label: 'Sending' };
    sending[CONFIG.destinationNotificationEventColumnId] = eventId;
    sending[CONFIG.destinationNotificationErrorColumnId] = { text: '' };
    updateRequestItem_(itemId, sending);
    try {
      deliverNotification_(requestItem, eventId);
      var sent = {};
      sent[CONFIG.destinationNotificationStateColumnId] = { label: 'Sent' };
      sent[CONFIG.destinationNotificationSentDateColumnId] = { date: today_() };
      sent[CONFIG.destinationNotificationErrorColumnId] = { text: '' };
      sent[CONFIG.destinationNotificationMessageColumnId] = { text: '' };
      sent[CONFIG.destinationNotificationEventColumnId] = '';
      updateRequestItem_(itemId, sent);
      auditEvent_({ severity: 'INFO', category: 'notification', action: 'notification_delivered', outcome: 'success',
        actorType: 'System', requestItemId: requestItem.id, requestUrl: requestItem.url,
        classId: requestItem.classId, teacherId: requestItem.teacherId, teacherName: requestItem.teacherName,
        teacherEmail: requestItem.teacherEmail, statusAfter: requestItem.status, revisionAfter: requestItem.revision,
        notificationAudience: requestItem.notificationAudience || 'Tech', notificationState: 'Sent', operationId: eventId });
      return { sent: true, eventId: eventId };
    } catch (error) {
      var failed = {};
      failed[CONFIG.destinationNotificationStateColumnId] = { label: 'Failed' };
      failed[CONFIG.destinationNotificationErrorColumnId] = { text: cleanText_(error.message || 'Email delivery failed.', 1000) };
      updateRequestItem_(itemId, failed);
      auditEvent_({ severity: 'ERROR', category: 'notification', action: 'notification_delivery_failed', outcome: 'failed',
        actorType: 'System', requestItemId: requestItem.id, requestUrl: requestItem.url,
        classId: requestItem.classId, teacherId: requestItem.teacherId, teacherName: requestItem.teacherName,
        teacherEmail: requestItem.teacherEmail, statusAfter: requestItem.status, revisionAfter: requestItem.revision,
        notificationAudience: requestItem.notificationAudience || 'Tech', notificationState: 'Failed', operationId: eventId,
        message: error.message || String(error), error: error.stack || error.message || String(error) });
      throw error;
    }
  });
}

function deliverNotification_(requestItem, eventId) {
  var audience = requestItem.notificationAudience || 'Tech';
  var message = requestItem.notificationMessage || requestItem.publicProgress || defaultProgressMessage_(requestItem.status);
  var subject = '[CCR-' + requestItem.id + '] ' + requestItem.name + ' — ' + requestItem.status;
  var deliveries = [];
  if (audience === 'Tech') deliveries.push({ to: techNotificationEmail_(), url: requestItem.url, linkText: 'Open request in monday.com', greeting: 'Tech Team' });
  else {
    if (!requestItem.coachEmail) throw new Error('The request does not have a coach email address.');
    deliveries.push({ to: requestItem.coachEmail, url: portalUrl_(requestItem.classId, 'coach'), linkText: 'Open classroom request', greeting: requestItem.coachName || 'Coach' });
    if (audience === 'Coach + Teacher' && requestItem.teacherEmail) {
      deliveries.push({ to: requestItem.teacherEmail, url: portalUrl_(requestItem.classId, 'view'), linkText: 'View classroom request progress', greeting: requestItem.teacherName || 'Teacher', optional: true });
    }
  }
  deliveries = deliveries.filter(function (delivery) {
    if (isValidEmail_(delivery.to)) return true;
    if (delivery.optional) return false;
    throw new Error('A required notification email address is invalid.');
  });
  if (MailApp.getRemainingDailyQuota() < deliveries.length) throw new Error('The Apps Script daily email-recipient quota is exhausted.');
  auditEvent_({ severity: 'INFO', category: 'email', action: 'email_delivery_attempt', outcome: 'started', actorType: 'System',
    requestItemId: requestItem.id, requestUrl: requestItem.url, classId: requestItem.classId,
    teacherId: requestItem.teacherId, teacherName: requestItem.teacherName, teacherEmail: requestItem.teacherEmail,
    statusAfter: requestItem.status, revisionAfter: requestItem.revision, notificationAudience: audience,
    notificationState: 'Sending', operationId: eventId, message: message,
    details: { subject: subject, recipients: deliveries.map(function (delivery) { return { email: delivery.to, greeting: delivery.greeting, linkType: delivery.linkText }; }) } });
  deliveries.forEach(function (delivery) {
    var html = '<p>Hello ' + escapeHtml_(delivery.greeting) + ',</p><p>' + escapeHtml_(message).replace(/\n/g, '<br>') + '</p><p><strong>Status:</strong> ' + escapeHtml_(requestItem.status) + '</p><p><a href="' + escapeHtml_(delivery.url) + '">' + escapeHtml_(delivery.linkText) + '</a></p><p style="color:#676879;font-size:12px">Notification reference: ' + escapeHtml_(eventId) + '</p>';
    MailApp.sendEmail({ to: delivery.to, subject: subject, htmlBody: html,
      body: message + '\n\nStatus: ' + requestItem.status + '\n' + delivery.url + '\n\nNotification reference: ' + eventId,
      name: 'Kreyco Tech Support' });
  });
}

function sendDraftSavedEmail_(email, url, classroomName) {
  if (areEmailsPaused_()) {
    auditEvent_({ severity: 'INFO', category: 'email', action: 'draft_confirmation_paused', outcome: 'skipped',
      actorType: 'System', actorEmail: email, message: 'Draft confirmation email skipped while email delivery is paused.',
      details: { classroomName: classroomName } });
    return { paused: true };
  }
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('The daily email-recipient quota is exhausted.');
  MailApp.sendEmail({ to: email, subject: 'Classroom request draft saved — ' + classroomName,
    body: 'Your draft was saved. Resume it from the class row or use this private link:\n\n' + url,
    htmlBody: '<p>Your draft for <strong>' + escapeHtml_(classroomName) + '</strong> was saved.</p><p><a href="' + escapeHtml_(url) + '">Resume classroom request</a></p><p>Treat this link as private because it permits editing the draft.</p>',
    name: 'Kreyco Tech Support' });
  auditEvent_({ severity: 'INFO', category: 'email', action: 'draft_confirmation_sent', outcome: 'success',
    actorType: 'System', actorEmail: email, message: 'Draft confirmation email sent.', details: { classroomName: classroomName } });
  return { sent: true };
}

function techNotificationEmail_() { return PropertiesService.getScriptProperties().getProperty('TECH_NOTIFICATION_EMAIL') || 'it@kreyco.com'; }

function syncRequestAuditSnapshots_() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('AUDIT_SPREADSHEET_ID');
  if (!spreadsheetId) return { skipped: true, reason: 'Audit logging is not configured.' };
  return withLease_('audit-snapshot-sync', function () {
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet = spreadsheet.getSheetByName(CONFIG.auditSnapshotSheetName);
    if (!sheet) {
      configureAuditSpreadsheet_(spreadsheet);
      sheet = spreadsheet.getSheetByName(CONFIG.auditSnapshotSheetName);
    }
    var previousById = {};
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(function (row) {
        if (!row[0] || !row[3]) return;
        try { previousById[String(row[0])] = JSON.parse(String(row[3])); }
        catch (error) { previousById[String(row[0])] = null; }
      });
    }
    var requests = getAllRequestItemsForAudit_(Object.keys(previousById));
    var rows = [];
    var summary = { scanned: requests.length, initialized: 0, changed: 0, unchanged: 0, removed: 0, changes: [] };
    var currentIds = {};
    requests.forEach(function (requestItem) {
      var snapshot = requestAuditSnapshot_(requestItem);
      var snapshotJson = JSON.stringify(snapshot);
      var snapshotHash = hashKey_(snapshotJson);
      currentIds[requestItem.id] = true;
      var previous = previousById[requestItem.id];
      var previousHash = previous ? hashKey_(JSON.stringify(previous)) : '';
      if (!previous) {
        summary.initialized += 1;
        summary.changes.push({ requestItemId: requestItem.id, outcome: 'baseline_created' });
        auditEvent_(requestSnapshotAuditEvent_('request_snapshot_initialized', 'baseline', null, snapshot, requestItem));
      } else if (previousHash !== snapshotHash) {
        var differences = diffAuditSnapshots_(previous, snapshot);
        summary.changed += 1;
        summary.changes.push({ requestItemId: requestItem.id, outcome: 'changed', changedFields: differences.map(function (entry) { return entry.field; }) });
        auditEvent_(requestSnapshotAuditEvent_('monday_request_state_changed', 'changed', previous, snapshot, requestItem, differences));
      } else summary.unchanged += 1;
      rows.push([requestItem.id, snapshotHash, new Date().toISOString(), snapshotJson]);
    });
    Object.keys(previousById).forEach(function (requestItemId) {
      if (currentIds[requestItemId]) return;
      summary.removed += 1;
      summary.changes.push({ requestItemId: requestItemId, outcome: 'no_longer_present' });
      auditEvent_({ severity: 'WARN', category: 'monday', action: 'request_no_longer_present', outcome: 'removed',
        actorType: 'System Trigger', requestItemId: requestItemId, message: 'A previously tracked request item is no longer returned by the request board.',
        details: { previous: previousById[requestItemId] } });
    });
    var previousRows = Math.max(0, sheet.getLastRow() - 1);
    if (previousRows) sheet.getRange(2, 1, previousRows, 4).clearContent();
    if (rows.length) {
      ensureSheetRows_(sheet, rows.length + 1);
      sheet.getRange(2, 1, rows.length, 4).setValues(rows);
      sheet.setRowHeights(2, rows.length, 28);
    }
    return summary;
  });
}

function getAllRequestItemsForAudit_(knownRequestIds) {
  var fields = requestQueryFields_();
  var data = mondayRequest_('query AuditRequests { boards(ids: [' + CONFIG.destinationBoardId + ']) { items_page(limit: 500) { cursor items { ' + fields + ' } } } }', {});
  var page = (((data.boards || [])[0] || {}).items_page || {});
  var items = page.items || [];
  var cursor = page.cursor;
  while (cursor) {
    var next = mondayRequest_('query NextAuditRequests($cursor: String!) { next_items_page(cursor: $cursor) { cursor items { ' + fields + ' } } }', { cursor: cursor }).next_items_page || {};
    items = items.concat(next.items || []);
    cursor = next.cursor;
  }
  var seen = {};
  items.forEach(function (item) { seen[String(item.id)] = true; });
  var linkedRequestIds = getEligibleClasses_(false).map(function (classroom) { return classroom.requestItemId; }).filter(Boolean);
  var additionalIds = CONFIG.auditSeedRequestItemIds.concat(knownRequestIds || []).concat(linkedRequestIds).filter(function (itemId) {
    itemId = String(itemId || '');
    if (!/^\d+$/.test(itemId) || seen[itemId]) return false;
    seen[itemId] = true;
    return true;
  });
  for (var offset = 0; offset < additionalIds.length; offset += 100) {
    var batch = additionalIds.slice(offset, offset + 100);
    var additional = mondayRequest_('query KnownAuditRequests($itemIds: [ID!]!) { items(ids: $itemIds, exclude_nonactive: false) { ' + fields + ' } }', { itemIds: batch }).items || [];
    items = items.concat(additional);
  }
  return items.map(parseRequestItem_);
}

function requestAuditSnapshot_(requestItem) {
  return sanitizeAuditValue_({
    requestItemId: requestItem.id, requestName: requestItem.name, requestUrl: requestItem.url, requestId: requestItem.requestId,
    itemState: requestItem.itemState,
    classId: requestItem.classId, className: requestItem.className, schoolId: requestItem.schoolId, schoolName: requestItem.schoolName,
    teacher: { id: requestItem.teacherId, name: requestItem.teacherName, email: requestItem.teacherEmail },
    status: requestItem.status, revision: requestItem.revision,
    coach: { mondayUserId: requestItem.assignedCoachId, name: requestItem.coachName, email: requestItem.coachEmail },
    form: { language: requestItem.language, gradeLevel: requestItem.gradeLevel, kreycoCurriculum: requestItem.kreycoCurriculum,
      hasLmsCredentials: requestItem.hasLmsCredentials, lmsCredentialsChangedAt: requestItem.lmsCredentialsChangedAt,
      verificationNeeded: requestItem.verificationNeeded,
      useGoogleClassroom: requestItem.useGoogleClassroom, otherGradingPlatform: requestItem.otherGradingPlatform,
      hasGradingCredentials: requestItem.hasGradingCredentials, gradingCredentialsChangedAt: requestItem.gradingCredentialsChangedAt,
      schedule: cleanText_(requestItem.schedule, 5000) },
    progress: { publicUpdate: cleanText_(requestItem.publicProgress, 5000), hasInternalNotes: requestItem.hasInternalNotes,
      internalNotesChangedAt: requestItem.internalNotesChangedAt, targetDate: requestItem.targetDate },
    dates: { submitted: requestItem.submittedDate, lastCoachUpdate: requestItem.coachUpdateDate },
    notification: { audience: requestItem.notificationAudience, state: requestItem.notificationState,
      message: cleanText_(requestItem.notificationMessage, 5000), eventId: requestItem.notificationEventId,
      error: cleanText_(requestItem.notificationError, 5000) }
  }, '');
}

function diffAuditSnapshots_(before, after) {
  var differences = [];
  function compare(previous, current, path) {
    var previousObject = previous && typeof previous === 'object' && !Array.isArray(previous);
    var currentObject = current && typeof current === 'object' && !Array.isArray(current);
    if (previousObject && currentObject) {
      var keys = {};
      Object.keys(previous).forEach(function (key) { keys[key] = true; });
      Object.keys(current).forEach(function (key) { keys[key] = true; });
      Object.keys(keys).sort().forEach(function (key) { compare(previous[key], current[key], path ? path + '.' + key : key); });
      return;
    }
    if (JSON.stringify(previous) !== JSON.stringify(current)) differences.push({ field: path, before: previous === undefined ? null : previous, after: current === undefined ? null : current });
  }
  compare(before || {}, after || {}, '');
  return differences;
}

function requestSnapshotAuditEvent_(action, outcome, before, after, requestItem, differences) {
  return { severity: 'INFO', category: 'monday', action: action, outcome: outcome, actorType: 'System Trigger',
    requestItemId: requestItem.id, requestUrl: requestItem.url, requestId: requestItem.requestId,
    classId: requestItem.classId, className: requestItem.className, schoolId: requestItem.schoolId, schoolName: requestItem.schoolName,
    teacherId: requestItem.teacherId,
    teacherName: requestItem.teacherName, teacherEmail: requestItem.teacherEmail,
    statusBefore: before ? before.status : '', statusAfter: after.status,
    revisionBefore: before ? before.revision : '', revisionAfter: after.revision,
    notificationAudience: requestItem.notificationAudience, notificationState: requestItem.notificationState,
    message: before ? 'A request item changed in monday.com.' : 'Initial monday.com request snapshot recorded.',
    details: { differences: differences || [], before: before, after: after } };
}

function setupAuditLog() {
  requireTechAdministrator_();
  return setupAuditLog_();
}

function pauseEmails() {
  requireTechAdministrator_();
  return pauseEmails_();
}

function resumeEmails() {
  requireTechAdministrator_();
  return resumeEmails_();
}

function getOperationalStatus() {
  requireTechAdministrator_();
  return getOperationalStatus_();
}

function requireTechAdministrator_() {
  var activeEmail = cleanText_(Session.getActiveUser().getEmail() || '', 254).toLowerCase();
  var configured = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || 'it@kreyco.com';
  var allowed = configured.split(',').map(function (email) { return cleanText_(email, 254).toLowerCase(); }).filter(Boolean);
  if (!activeEmail || allowed.indexOf(activeEmail) === -1) throw new Error('This operation is restricted to a configured Tech administrator.');
  return activeEmail;
}

function setupAuditLog_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty('AUDIT_SPREADSHEET_ID');
  var spreadsheet;
  if (spreadsheetId) {
    try { spreadsheet = SpreadsheetApp.openById(spreadsheetId); }
    catch (error) { spreadsheet = null; }
  }
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create('Classroom Creation Request - Audit Log');
    properties.setProperty('AUDIT_SPREADSHEET_ID', spreadsheet.getId());
  }
  configureAuditSpreadsheet_(spreadsheet);
  refreshAuditConfiguration_(spreadsheet);
  auditEvent_({ severity: 'INFO', category: 'configuration', action: 'audit_log_setup', outcome: 'success',
    actorType: 'Tech Administrator', message: 'Google Sheet audit logging configured.',
    details: { spreadsheetId: spreadsheet.getId(), spreadsheetUrl: spreadsheet.getUrl(), schemaVersion: CONFIG.auditSchemaVersion } });
  return getOperationalStatus_();
}

function pauseEmails_() {
  PropertiesService.getScriptProperties().setProperty('EMAILS_PAUSED', 'true');
  refreshAuditConfiguration_();
  auditEvent_({ severity: 'WARN', category: 'configuration', action: 'email_delivery_paused', outcome: 'success',
    actorType: 'Tech Administrator', message: 'All application email delivery was paused. Pending notifications will remain queued.' });
  return getOperationalStatus_();
}

function resumeEmails_() {
  PropertiesService.getScriptProperties().setProperty('EMAILS_PAUSED', 'false');
  refreshAuditConfiguration_();
  auditEvent_({ severity: 'INFO', category: 'configuration', action: 'email_delivery_resumed', outcome: 'success',
    actorType: 'Tech Administrator', message: 'Application email delivery was resumed. Queued notifications will run during scheduled maintenance.' });
  return getOperationalStatus_();
}

function getOperationalStatus_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty('AUDIT_SPREADSHEET_ID') || '';
  return {
    emailsPaused: areEmailsPaused_(),
    auditLoggingConfigured: !!spreadsheetId,
    auditSpreadsheetId: spreadsheetId,
    auditSpreadsheetUrl: spreadsheetId ? 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit' : '',
    webAppUrl: CONFIG.publicWebAppUrl,
    notificationBehavior: areEmailsPaused_() ? 'Emails are paused; Pending notifications remain queued.' : 'Emails are enabled.'
  };
}

function areEmailsPaused_() {
  var value = String(PropertiesService.getScriptProperties().getProperty('EMAILS_PAUSED') || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].indexOf(value) !== -1;
}

function auditContextFromPayload_(payload) {
  var input = payload || {};
  return {
    actorType: 'Coach', actorName: cleanText_(input.coachName || '', 150), actorEmail: cleanText_(input.coachEmail || '', 254).toLowerCase(),
    requestId: String(input.requestId || ''), classId: String(input.classId || ''), schoolId: String(input.schoolId || ''), operationId: String(input.operationId || ''),
    revisionBefore: input.expectedRevision === undefined ? '' : Number(input.expectedRevision),
    details: {
      input: input,
      credentialActions: {
        lms: input.clearLmsCredentials === true ? 'cleared' : (input.lmsCredentials ? 'provided' : 'retained_or_empty'),
        gradingPlatform: input.clearGradingCredentials === true ? 'cleared' : (input.gradingCredentials ? 'provided' : 'retained_or_empty')
      }
    }
  };
}

function auditedPublicCall_(category, action, context, callback) {
  var started = Date.now();
  var meta = context || {};
  var correlationId = meta.operationId || Utilities.getUuid();
  try {
    var result = callback();
    auditEvent_({ severity: 'INFO', category: category, action: action, outcome: 'success',
      actorType: meta.actorType, actorName: meta.actorName, actorEmail: meta.actorEmail,
      requestItemId: meta.requestItemId || (result && (result.itemId || ((result.request || {}).id))) || '',
      requestId: meta.requestId || (result && ((result.request || {}).requestId)) || '',
      classId: meta.classId || String((((result || {}).classroom || {}).id) || ''),
      className: meta.className || String((((result || {}).classroom || {}).name) || ((result || {}).classroomName || '')),
      schoolId: meta.schoolId || String((((result || {}).classroom || {}).schoolId) || ''),
      schoolName: meta.schoolName || String((((result || {}).classroom || {}).schoolName) || ''),
      teacherId: meta.teacherId || String((((result || {}).classroom || {}).teacherId) || ''),
      teacherName: meta.teacherName || String((((result || {}).classroom || {}).teacherName) || ''),
      statusBefore: meta.statusBefore || '', statusAfter: meta.statusAfter || String((result && (result.status || ((result.request || {}).status))) || ''),
      revisionBefore: meta.revisionBefore, revisionAfter: result && (result.revision !== undefined ? result.revision : ((result.request || {}).revision)),
      notificationAudience: meta.notificationAudience || '', notificationState: meta.notificationState || '',
      operationId: meta.operationId || '', correlationId: correlationId, durationMs: Date.now() - started,
      message: (result && (result.warning || result.message)) || '', details: { context: meta.details || meta.input || {}, result: result } });
    return result;
  } catch (error) {
    auditEvent_({ severity: 'ERROR', category: category, action: action, outcome: 'failed',
      actorType: meta.actorType, actorName: meta.actorName, actorEmail: meta.actorEmail,
      requestItemId: meta.requestItemId || '', requestId: meta.requestId || '', classId: meta.classId || '', className: meta.className || '',
      schoolId: meta.schoolId || '', schoolName: meta.schoolName || '', teacherId: meta.teacherId || '', teacherName: meta.teacherName || '',
      statusBefore: meta.statusBefore || '', revisionBefore: meta.revisionBefore,
      operationId: meta.operationId || '', correlationId: correlationId, durationMs: Date.now() - started,
      message: error.message || String(error), error: error.stack || error.message || String(error), details: { context: meta.details || meta.input || {} } });
    throw error;
  }
}

function auditEvent_(event) {
  try {
    var record = buildAuditRecord_(event || {});
    var json = auditJson_(record);
    console.log('AUDIT ' + json);
    var spreadsheetId = PropertiesService.getScriptProperties().getProperty('AUDIT_SPREADSHEET_ID');
    if (!spreadsheetId) return { logged: false, reason: 'AUDIT_SPREADSHEET_ID is not configured', eventId: record.eventId };
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var sheet = spreadsheet.getSheetByName(CONFIG.auditSheetName);
    if (!sheet) {
      configureAuditSpreadsheet_(spreadsheet);
      sheet = spreadsheet.getSheetByName(CONFIG.auditSheetName);
    }
    var row = auditRow_(record, json);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      console.warn('Audit Sheet write skipped because the logger was busy. Event remains in execution logs: ' + record.eventId);
      return { logged: false, reason: 'logger busy', eventId: record.eventId };
    }
    try {
      var targetRow = sheet.getLastRow() + 1;
      ensureSheetRows_(sheet, targetRow);
      sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
      sheet.setRowHeight(targetRow, 28);
    } finally { lock.releaseLock(); }
    return { logged: true, eventId: record.eventId };
  } catch (error) {
    console.error('Audit logging failed without interrupting the primary operation: ' + (error.stack || error.message || String(error)));
    return { logged: false, reason: error.message || String(error) };
  }
}

function buildAuditRecord_(event) {
  var source = event || {};
  var record = {
    schemaVersion: CONFIG.auditSchemaVersion,
    source: 'classroom_creation_request',
    timestampUtc: new Date().toISOString(),
    timestampLocal: Utilities.formatDate(new Date(), CONFIG.timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    eventId: cleanText_(source.eventId || Utilities.getUuid(), 100),
    severity: cleanText_(source.severity || 'INFO', 20).toUpperCase(),
    category: cleanText_(source.category || 'application', 100),
    action: cleanText_(source.action || 'unspecified', 150),
    outcome: cleanText_(source.outcome || 'recorded', 50),
    actor: { type: cleanText_(source.actorType || 'System', 100), name: cleanText_(source.actorName || '', 200), email: cleanText_(source.actorEmail || '', 254).toLowerCase() },
    request: { itemId: cleanText_(source.requestItemId || '', 50), url: cleanText_(source.requestUrl || '', 1000), requestId: cleanText_(source.requestId || '', 100) },
    classroom: { id: cleanText_(source.classId || '', 50), name: cleanText_(source.className || '', 300) },
    school: { id: cleanText_(source.schoolId || '', 50), name: cleanText_(source.schoolName || '', 300) },
    teacher: { id: cleanText_(source.teacherId || '', 50), name: cleanText_(source.teacherName || '', 200), email: cleanText_(source.teacherEmail || '', 254).toLowerCase() },
    state: { statusBefore: cleanText_(source.statusBefore || '', 100), statusAfter: cleanText_(source.statusAfter || '', 100),
      revisionBefore: source.revisionBefore === undefined || source.revisionBefore === '' ? null : Number(source.revisionBefore),
      revisionAfter: source.revisionAfter === undefined || source.revisionAfter === '' ? null : Number(source.revisionAfter) },
    notification: { audience: cleanText_(source.notificationAudience || '', 100), state: cleanText_(source.notificationState || '', 100), emailsPaused: areEmailsPaused_() },
    operation: { operationId: cleanText_(source.operationId || '', 100), correlationId: cleanText_(source.correlationId || source.operationId || '', 100), durationMs: source.durationMs === undefined ? null : Number(source.durationMs) },
    message: cleanText_(source.message || '', 10000),
    error: cleanText_(source.error || '', 10000),
    details: source.details || {}
  };
  return sanitizeAuditValue_(record, '');
}

function sanitizeAuditValue_(value, key) {
  var normalizedKey = String(key || '').toLowerCase();
  var alwaysSecret = ['accesstoken', 'token', 'portalsigningsecret', 'monday_api_token', 'authorization', 'password', 'lmscredentials', 'gradingcredentials'];
  if (alwaysSecret.indexOf(normalizedKey) !== -1 || /(?:^|_)(?:secret|password|authorization|api.?token)(?:$|_)/i.test(String(key || ''))) return '[REDACTED]';
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return cleanText_(value.replace(/([?&]access=)[^&\s"']+/gi, '$1[REDACTED]'), 45000);
  }
  if (Array.isArray(value)) return value.slice(0, 1000).map(function (entry) { return sanitizeAuditValue_(entry, ''); });
  if (typeof value === 'object') {
    var sanitized = {};
    Object.keys(value).slice(0, 1000).forEach(function (childKey) { sanitized[childKey] = sanitizeAuditValue_(value[childKey], childKey); });
    return sanitized;
  }
  return cleanText_(String(value), 1000);
}

function auditJson_(record) {
  var json = JSON.stringify(record);
  if (json.length <= CONFIG.auditMaxJsonLength) return json;
  var compact = Object.assign({}, record, { details: { truncated: true, originalJsonLength: json.length,
    reason: 'Event exceeded the Google Sheets cell limit. Searchable fields and execution logs retain the event identity.' } });
  var compactJson = JSON.stringify(compact);
  if (compactJson.length <= CONFIG.auditMaxJsonLength) return compactJson;
  return JSON.stringify({ schemaVersion: record.schemaVersion, source: record.source, timestampUtc: record.timestampUtc,
    eventId: record.eventId, severity: record.severity, category: record.category, action: record.action,
    outcome: record.outcome, truncated: true, originalJsonLength: json.length });
}

function auditHeaders_() {
  return ['Timestamp (UTC)', 'Timestamp (Local)', 'Event ID', 'Severity', 'Category', 'Action', 'Outcome',
    'Actor Type', 'Actor Name', 'Actor Email', 'Request Item ID', 'Request URL', 'Request ID',
    'Class ID', 'Class Name', 'School ID', 'School Name', 'Teacher ID', 'Teacher Name', 'Teacher Email',
    'Status Before', 'Status After', 'Revision Before', 'Revision After', 'Notification Audience',
    'Notification State', 'Emails Paused', 'Operation ID', 'Correlation ID', 'Duration (ms)', 'Message', 'Error', 'Event JSON'];
}

function auditRow_(record, json) {
  return [record.timestampUtc, record.timestampLocal, record.eventId, record.severity, record.category, record.action, record.outcome,
    record.actor.type, record.actor.name, record.actor.email, record.request.itemId, record.request.url, record.request.requestId,
    record.classroom.id, record.classroom.name, record.school.id, record.school.name, record.teacher.id, record.teacher.name, record.teacher.email,
    record.state.statusBefore, record.state.statusAfter, record.state.revisionBefore, record.state.revisionAfter,
    record.notification.audience, record.notification.state, record.notification.emailsPaused,
    record.operation.operationId, record.operation.correlationId, record.operation.durationMs, record.message, record.error, json];
}

function configureAuditSpreadsheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(CONFIG.auditSheetName) || spreadsheet.getSheets()[0];
  if (sheet.getName() !== CONFIG.auditSheetName) sheet.setName(CONFIG.auditSheetName);
  var headers = auditHeaders_();
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#6161ff').setWrap(true);
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(7);
  var filter = sheet.getFilter();
  if (!filter) sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).createFilter();
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 260);
  for (var index = 4; index <= 30; index += 1) sheet.setColumnWidth(index, index === 31 ? 360 : 150);
  sheet.setColumnWidth(31, 360);
  sheet.setColumnWidth(32, 360);
  sheet.setColumnWidth(33, 700);
  sheet.getRange('A:A').setNumberFormat('@');
  sheet.getRange('B:B').setNumberFormat('@');
  sheet.getRange('W:X').setNumberFormat('0');
  sheet.getRange('AD:AD').setNumberFormat('0');
  sheet.getRange('AE:AG').setWrap(false).setVerticalAlignment('middle');
  if (sheet.getLastRow() > 1) sheet.setRowHeights(2, sheet.getLastRow() - 1, 28);
  var configSheet = spreadsheet.getSheetByName(CONFIG.auditConfigurationSheetName) || spreadsheet.insertSheet(CONFIG.auditConfigurationSheetName);
  configSheet.setFrozenRows(1);
  var snapshotSheet = spreadsheet.getSheetByName(CONFIG.auditSnapshotSheetName) || spreadsheet.insertSheet(CONFIG.auditSnapshotSheetName);
  var snapshotHeaders = ['Request Item ID', 'Snapshot Hash', 'Updated At (UTC)', 'Snapshot JSON'];
  snapshotSheet.getRange(1, 1, 1, snapshotHeaders.length).setValues([snapshotHeaders]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#6161ff');
  snapshotSheet.setFrozenRows(1);
  snapshotSheet.setColumnWidth(1, 180);
  snapshotSheet.setColumnWidth(2, 280);
  snapshotSheet.setColumnWidth(3, 180);
  snapshotSheet.setColumnWidth(4, 900);
  snapshotSheet.getRange('A:C').setNumberFormat('@');
  snapshotSheet.getRange('D:D').setWrap(false).setVerticalAlignment('middle');
  snapshotSheet.setRowHeight(1, 36);
  if (snapshotSheet.getLastRow() > 1) snapshotSheet.setRowHeights(2, snapshotSheet.getLastRow() - 1, 28);
}

function ensureSheetRows_(sheet, requiredRows) {
  if (sheet.getMaxRows() >= requiredRows) return;
  sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(100, requiredRows - sheet.getMaxRows()));
}

function refreshAuditConfiguration_(spreadsheet) {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty('AUDIT_SPREADSHEET_ID');
  if (!spreadsheetId && !spreadsheet) return;
  try {
    spreadsheet = spreadsheet || SpreadsheetApp.openById(spreadsheetId);
    var sheet = spreadsheet.getSheetByName(CONFIG.auditConfigurationSheetName) || spreadsheet.insertSheet(CONFIG.auditConfigurationSheetName);
    var values = [
      ['Setting', 'Value', 'Purpose'],
      ['EMAILS_PAUSED', String(areEmailsPaused_()), 'Master email switch. Pending notifications remain queued while true.'],
      ['AUDIT_SPREADSHEET_ID', spreadsheet.getId(), 'Script Property used by the JSON audit logger.'],
      ['AUDIT_SCHEMA_VERSION', String(CONFIG.auditSchemaVersion), 'Version of the Event JSON structure.'],
      ['WEB_APP_URL', CONFIG.publicWebAppUrl, 'Stable production portal URL.'],
      ['REQUEST_BOARD_ID', CONFIG.destinationBoardId, 'monday.com Classroom Creation Request board.'],
      ['ASSIGNED_COACH_COLUMN_ID', CONFIG.destinationCoachPeopleColumnId, 'Request-board People column populated from the selected teacher coach.'],
      ['ACCOUNTS_BOARD_ID', CONFIG.accountsBoardId, 'monday.com Accounts board.'],
      ['CLASS_SUBITEM_BOARD_ID', CONFIG.accountsSubitemBoardId, 'monday.com class subitem board.'],
      ['STAFF_DIRECTORY_BOARD_ID', CONFIG.staffBoardId, 'monday.com Staff Directory board.'],
      ['STAFF_COACH_COLUMN_ID', CONFIG.staffCoachColumnId, 'Staff Directory People column used as the authoritative coach assignment.'],
      ['SENSITIVE_DATA_POLICY', 'Never log credential values, tokens, passwords, secrets, or authorization headers.', 'Sanitization rule applied before Sheet and execution logging.'],
      ['UPDATED_AT', new Date().toISOString(), 'Last configuration refresh in UTC.']
    ];
    sheet.clearContents();
    sheet.getRange(1, 1, values.length, 3).setValues(values);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setFontColor('#ffffff').setBackground('#6161ff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 220);
    sheet.setColumnWidth(2, 700);
    sheet.setColumnWidth(3, 520);
    sheet.getRange(1, 1, values.length, 3).setWrap(true).setVerticalAlignment('top');
  } catch (error) { console.error('Audit configuration refresh failed: ' + (error.message || String(error))); }
}

function progressPercent_(status) {
  var progress = { 'Draft': 5, 'Sent to Tech': 15, 'Under Review': 25, 'In Progress': 55, 'Waiting for Information': 45,
    'Ready for Verification': 85, 'Completed': 100, 'Reopened - Coach Update': 35, 'Cancelled': 100, 'No Longer Eligible': 100 };
  return progress[status] === undefined ? 10 : progress[status];
}

function defaultProgressMessage_(status) {
  var messages = { 'Draft': 'This request is saved as a draft and has not been sent to Tech.',
    'Sent to Tech': 'Your request has been sent to Tech and is awaiting review.', 'Under Review': 'Tech is reviewing the classroom request.',
    'In Progress': 'Classroom creation is in progress.', 'Waiting for Information': 'Tech needs additional information before continuing.',
    'Ready for Verification': 'The classroom is ready for verification.', 'Completed': 'The classroom request is complete.',
    'Reopened - Coach Update': 'Tech received a new update from the coach.', 'Cancelled': 'This request was cancelled.',
    'No Longer Eligible': 'This class is no longer eligible for an active classroom request.' };
  return messages[status] || 'Tech is processing this request.';
}

function mondayRequest_(query, variables) {
  var token = PropertiesService.getScriptProperties().getProperty('MONDAY_API_TOKEN');
  if (!token) throw new Error('The form is not configured. Ask Tech Support to add the MONDAY_API_TOKEN script property.');
  var lastError;
  for (var attempt = 0; attempt < 4; attempt += 1) {
    var response;
    try {
      response = UrlFetchApp.fetch(CONFIG.mondayApiUrl, { method: 'post', contentType: 'application/json',
        headers: { Authorization: token, 'API-Version': CONFIG.apiVersion },
        payload: JSON.stringify({ query: query, variables: variables || {} }), muteHttpExceptions: true });
    } catch (networkError) {
      lastError = networkError;
      if (attempt < 3) { Utilities.sleep((attempt + 1) * 500 + Math.floor(Math.random() * 250)); continue; }
      throw new Error('Monday could not be reached. Try again shortly.');
    }
    var status = response.getResponseCode();
    var parsed;
    try { parsed = JSON.parse(response.getContentText()); } catch (parseError) { parsed = null; }
    if (status >= 200 && status < 300 && parsed && !(parsed.errors && parsed.errors.length)) return parsed.data || {};
    var errors = (parsed && parsed.errors) || [];
    var retrySeconds = retrySeconds_(response, errors, attempt);
    var retryable = status === 429 || status >= 500 || errors.some(function (entry) {
      return /RATE|CONCURRENCY|COMPLEXITY|INTERNAL/.test((((entry.extensions || {}).code) || '').toUpperCase());
    });
    var messages = errors.map(function (entry) { return entry.message; }).filter(Boolean).join('; ');
    lastError = new Error(messages || 'HTTP ' + status);
    if (retryable && attempt < 3) {
      Utilities.sleep(Math.min(10000, Math.max(250, retrySeconds * 1000)) + Math.floor(Math.random() * 250));
      continue;
    }
    throw new Error('Monday request failed' + (messages ? ': ' + messages : ' (HTTP ' + status + ')') + '.');
  }
  throw lastError || new Error('Monday request failed.');
}

function retrySeconds_(response, errors, attempt) {
  var headers = response.getHeaders ? response.getHeaders() : {};
  var value = Number(headers['Retry-After'] || headers['retry-after'] || 0);
  errors.forEach(function (entry) { value = Math.max(value, Number(((entry.extensions || {}).retry_in_seconds) || 0)); });
  return value || Math.pow(2, attempt) * 0.5;
}

function requestItemByClassForAudit_(classId) {
  var classroom = getClassById_(classId);
  return classroom && classroom.requestItemId ? getRequestItem_(classroom.requestItemId) : null;
}

function columnValue_(values, columnId) { return (values || []).filter(function (entry) { return entry.id === columnId; })[0] || {}; }
function columnText_(values, columnId) { return cleanText_(columnValue_(values, columnId).text || '', 10000); }
function columnEmail_(values, columnId) { var value = columnValue_(values, columnId); return cleanText_(value.email || value.text || '', 254).toLowerCase(); }
function columnDate_(values, columnId) { var value = columnValue_(values, columnId); return cleanText_(value.date || value.text || '', 20); }
function columnNumber_(values, columnId) { var value = columnValue_(values, columnId); return value.number === undefined || value.number === null ? value.text : value.number; }
function columnLabel_(values, columnId) { var value = columnValue_(values, columnId); return value.label || value.text || ''; }
function columnChangedAt_(values, columnId) {
  var raw = columnValue_(values, columnId).value;
  if (!raw) return '';
  try {
    var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return cleanText_(parsed.changed_at || parsed.updated_at || '', 40);
  } catch (error) { return ''; }
}
function peopleAssignments_(values, columnId) {
  var column = columnValue_(values, columnId);
  var assignments = column.persons_and_teams;
  if (!Array.isArray(assignments) && column.value) {
    try {
      var parsed = typeof column.value === 'string' ? JSON.parse(column.value) : column.value;
      assignments = parsed.personsAndTeams || parsed.persons_and_teams || [];
    } catch (error) { assignments = []; }
  }
  return (assignments || []).map(function (assignment) {
    return { id: String(assignment.id || ''), kind: String(assignment.kind || '').toLowerCase() };
  }).filter(function (assignment) { return /^\d+$/.test(assignment.id) && ['person', 'team'].indexOf(assignment.kind) !== -1; });
}
function firstLinkedItemId_(values, columnId) { var ids = columnValue_(values, columnId).linked_item_ids || []; return ids.length ? String(ids[0]) : ''; }
function isEligibleClassStatus_(label) { return CONFIG.excludedClassStatuses.indexOf(String(label || '').trim().toLowerCase()) === -1; }

function requireId_(value, fieldName) {
  var id = String(value || '');
  if (!/^\d+$/.test(id)) throw new Error('Select a valid ' + fieldName + '.');
  return id;
}

function requireText_(value, fieldName, maxLength) {
  var text = cleanText_(value || '', maxLength);
  if (!text) throw new Error('Enter a valid ' + fieldName + '.');
  return text;
}

function requireChoice_(value, choices, fieldName) {
  var text = String(value || '');
  if (choices.indexOf(text) === -1) throw new Error('Select a valid value for ' + fieldName + '.');
  return text;
}

function validateRequestId_(value) {
  var id = String(value || '');
  if (!/^[A-Za-z0-9-]{16,80}$/.test(id)) throw new Error('The request session expired. Reload the page and try again.');
  return id;
}

function validateOperationId_(value) {
  var id = String(value || '');
  if (!/^[A-Za-z0-9-]{16,100}$/.test(id)) throw new Error('The save operation expired. Try again.');
  return id;
}

function isValidEmail_(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '')); }
function cleanToken_(value) { var token = String(value || ''); return /^[A-Za-z0-9_-]{1,128}$/.test(token) ? token : ''; }
function cleanText_(value, maxLength) { return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength); }

function clampInteger_(value, min, max, fallback) {
  var number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function today_() { return Utilities.formatDate(new Date(), CONFIG.timeZone, 'yyyy-MM-dd'); }
function safeJsonForHtml_(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
function escapeHtml_(value) { return String(value || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
