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
  staffKreycoEmailColumnId: 'lln_email__1',
  staffPersonalEmailColumnId: 'dup__of_personal_email5__1',
  timeZone: 'America/New_York',
  classCacheSeconds: 120,
  operationCacheSeconds: 21600,
  leaseSeconds: 180,
  maxTextLength: 1500,
  maxCoachUpdateLength: 2500,
  excludedClassStatuses: Object.freeze([
    'ended - renewal',
    'ended - new',
    'ended',
    'not moving forward'
  ])
});

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
  enforceRateLimit_('directory-read', 300, 60);
  var input = options || {};
  var pageSize = clampInteger_(input.pageSize, 5, 25, 10);
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
  enforceRateLimit_('directory-read', 300, 60);
  schoolId = requireId_(schoolId, 'school');
  return getEligibleClasses_(false).filter(function (classroom) {
    return classroom.schoolId === schoolId;
  }).map(publicClassroom_).sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function saveDraft(payload) { return saveClassRequest_(payload || {}, 'Draft'); }
function sendToTech(payload) { return saveClassRequest_(payload || {}, 'Sent to Tech'); }

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
    try { sendDraftSavedEmail_(result.coachEmail, result.coachUrl, result.classroomName); }
    catch (draftEmailError) { result.warning = 'The draft was saved, but the confirmation email could not be sent. Keep the class portal link available from the Accounts class row.'; }
  }
  if (result.notificationItemId) {
    try { processNotificationById_(result.notificationItemId); }
    catch (notificationError) { result.warning = 'The request was saved and queued for Tech notification. Email delivery will retry during scheduled maintenance.'; }
  }
  delete result.firstDraft;
  delete result.notificationItemId;
  delete result.coachEmail;
  cache.put(operationKey, JSON.stringify(result), CONFIG.operationCacheSeconds);
  return result;
}

function submitCoachUpdate(payload) {
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
  try { processNotificationById_(result.itemId); }
  catch (notificationError) { result.warning = 'Your update was saved and queued. Tech notification will retry during scheduled maintenance.'; }
  cache.put(operationKey, JSON.stringify(result), CONFIG.operationCacheSeconds);
  return result;
}

function buildRequestColumnValues_(request, classroom, status, revision, isNew) {
  var values = {};
  values[CONFIG.destinationClassRelationColumnId] = { item_ids: [Number(classroom.id)] };
  values[CONFIG.destinationSchoolRelationColumnId] = { item_ids: [Number(classroom.schoolId)] };
  values[CONFIG.destinationTeacherRelationColumnId] = classroom.teacherId ? { item_ids: [Number(classroom.teacherId)] } : { item_ids: [] };
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
  var cache = CacheService.getScriptCache();
  var cacheKey = 'eligible-classes-v3';
  var cached = !forceRefresh && cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
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
  cache.put(cacheKey, JSON.stringify(classes), CONFIG.classCacheSeconds);
  return classes;
}

function getClassById_(classId) {
  classId = requireId_(classId, 'class');
  var data = mondayRequest_('query OneClass($itemId: ID!) { items(ids: [$itemId]) { ' + classQueryFields_() + ' } }', { itemId: classId });
  var item = (data.items || [])[0];
  return item ? parseClassItem_(item) : null;
}

function classQueryFields_() {
  return [
    'id', 'name',
    'column_values(ids: ["' + CONFIG.sectionStatusColumnId + '", "' + CONFIG.assignedTeacherColumnId + '", "' + CONFIG.classRequestRelationColumnId + '", "' + CONFIG.classPortalLinkColumnId + '"]) {',
    ' id text ... on StatusValue { label } ... on BoardRelationValue { linked_item_ids linked_items { id name } } ... on LinkValue { url text }',
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
  return {
    id: String(item.id), name: item.name || '', status: status,
    schoolId: String(parent.id || ''), schoolName: parent.name || '', schoolStatus: schoolStatus,
    teacherId: String(teacher.id || ''), teacherName: teacher.name || '',
    requestItemId: String((requestRelation.linked_item_ids || [])[0] || ''), portalUrl: portalLink.url || '',
    eligible: !!parent.id && schoolStatus === CONFIG.accountsActiveLabel && isEligibleClassStatus_(status)
  };
}

function getRequestItem_(itemId) {
  itemId = requireId_(itemId, 'request item');
  var ids = requestColumnIds_().map(function (id) { return '"' + id + '"'; }).join(',');
  var fields = [
    'id name url',
    'column_values(ids: [' + ids + ']) {',
    ' id text value ... on StatusValue { label }',
    ' ... on BoardRelationValue { linked_item_ids linked_items { id name column_values(ids: ["' + CONFIG.staffKreycoEmailColumnId + '", "' + CONFIG.staffPersonalEmailColumnId + '"]) { id text } } }',
    ' ... on EmailValue { email text } ... on DateValue { date } ... on NumbersValue { number }',
    '}'
  ].join('\n');
  var data = mondayRequest_('query OneRequest($itemId: ID!) { items(ids: [$itemId]) { ' + fields + ' } }', { itemId: itemId });
  var item = (data.items || [])[0];
  return item ? parseRequestItem_(item) : null;
}

function requestColumnIds_() {
  return [CONFIG.destinationSchoolRelationColumnId, CONFIG.destinationRequestIdColumnId, CONFIG.destinationClassRelationColumnId,
    CONFIG.destinationTeacherRelationColumnId, CONFIG.destinationStatusColumnId, CONFIG.destinationCoachNameColumnId,
    CONFIG.destinationCoachEmailColumnId, CONFIG.destinationLanguageColumnId, CONFIG.destinationGradeLevelColumnId,
    CONFIG.destinationCurriculumColumnId, CONFIG.destinationLmsCredentialsColumnId, CONFIG.destinationLmsVerificationColumnId,
    CONFIG.destinationGoogleClassroomColumnId, CONFIG.destinationOtherGradingPlatformColumnId, CONFIG.destinationGradingCredentialsColumnId,
    CONFIG.destinationScheduleColumnId, CONFIG.destinationPublicProgressColumnId, CONFIG.destinationTargetDateColumnId,
    CONFIG.destinationRevisionColumnId, CONFIG.destinationSubmittedDateColumnId, CONFIG.destinationCoachUpdateDateColumnId,
    CONFIG.destinationNotificationMessageColumnId, CONFIG.destinationNotificationEventColumnId, CONFIG.destinationNotificationSentDateColumnId,
    CONFIG.destinationNotificationErrorColumnId, CONFIG.destinationNotificationAudienceColumnId, CONFIG.destinationNotificationStateColumnId];
}

function parseRequestItem_(item) {
  var values = item.column_values || [];
  var teacher = (columnValue_(values, CONFIG.destinationTeacherRelationColumnId).linked_items || [])[0] || {};
  var kreycoEmail = columnText_(teacher.column_values, CONFIG.staffKreycoEmailColumnId);
  var personalEmail = columnText_(teacher.column_values, CONFIG.staffPersonalEmailColumnId);
  return {
    id: String(item.id), name: item.name || '', url: item.url || CONFIG.mondayItemUrl + item.id,
    requestId: columnText_(values, CONFIG.destinationRequestIdColumnId),
    classId: firstLinkedItemId_(values, CONFIG.destinationClassRelationColumnId),
    schoolId: firstLinkedItemId_(values, CONFIG.destinationSchoolRelationColumnId),
    teacherId: String(teacher.id || ''), teacherName: teacher.name || '', teacherEmail: kreycoEmail || personalEmail,
    status: columnLabel_(values, CONFIG.destinationStatusColumnId) || 'Draft',
    coachName: columnText_(values, CONFIG.destinationCoachNameColumnId), coachEmail: columnEmail_(values, CONFIG.destinationCoachEmailColumnId),
    language: columnText_(values, CONFIG.destinationLanguageColumnId), gradeLevel: columnText_(values, CONFIG.destinationGradeLevelColumnId),
    kreycoCurriculum: columnText_(values, CONFIG.destinationCurriculumColumnId),
    hasLmsCredentials: !!columnText_(values, CONFIG.destinationLmsCredentialsColumnId),
    verificationNeeded: columnLabel_(values, CONFIG.destinationLmsVerificationColumnId),
    useGoogleClassroom: columnLabel_(values, CONFIG.destinationGoogleClassroomColumnId),
    otherGradingPlatform: columnText_(values, CONFIG.destinationOtherGradingPlatformColumnId),
    hasGradingCredentials: !!columnText_(values, CONFIG.destinationGradingCredentialsColumnId),
    schedule: columnText_(values, CONFIG.destinationScheduleColumnId), publicProgress: columnText_(values, CONFIG.destinationPublicProgressColumnId),
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
  return {
    mode: editable ? 'edit' : 'summary', preselected: true, accessMode: accessMode, accessToken: accessToken,
    classroom: publicClassroom_(classroom),
    request: {
      id: requestItem.id, reference: 'CCR-' + requestItem.id, requestId: requestItem.requestId,
      revision: requestItem.revision, status: requestItem.status, progressPercent: progressPercent_(requestItem.status),
      coachName: editable ? requestItem.coachName : '', coachEmail: editable ? requestItem.coachEmail : '',
      language: requestItem.language, gradeLevel: requestItem.gradeLevel, kreycoCurriculum: requestItem.kreycoCurriculum,
      hasLmsCredentials: editable && requestItem.hasLmsCredentials, verificationNeeded: requestItem.verificationNeeded,
      useGoogleClassroom: requestItem.useGoogleClassroom, otherGradingPlatform: requestItem.otherGradingPlatform,
      hasGradingCredentials: editable && requestItem.hasGradingCredentials, schedule: requestItem.schedule,
      publicProgress: requestItem.publicProgress || defaultProgressMessage_(requestItem.status), targetDate: requestItem.targetDate,
      submittedDate: requestItem.submittedDate, coachUpdateDate: requestItem.coachUpdateDate,
      canSubmitUpdate: accessMode === 'coach' && ['Draft', 'Cancelled', 'No Longer Eligible'].indexOf(requestItem.status) === -1
    }
  };
}

function saveResult_(classroom, requestItem, warning) {
  return { ok: true, itemId: requestItem.id, reference: 'CCR-' + requestItem.id, revision: requestItem.revision,
    status: requestItem.status, classroomName: classroom.name, coachUrl: portalUrl_(classroom.id, 'coach'),
    accessToken: portalToken_(classroom.id, 'coach'), warning: warning || '' };
}

function publicClassroom_(classroom) {
  return { id: classroom.id, name: classroom.name, status: classroom.status, schoolId: classroom.schoolId,
    schoolName: classroom.schoolName, teacherId: classroom.teacherId, teacherName: classroom.teacherName,
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
  var coachEmail = requireText_(payload.coachEmail, 'coach email', 254).toLowerCase();
  if (!isValidEmail_(coachEmail)) throw new Error('Enter a valid coach email address.');
  var expectedRevision = clampInteger_(payload.expectedRevision, 0, 100000000, -1);
  if (expectedRevision < 0) throw new Error('The request version is missing. Reload the page.');
  return {
    requestId: validateRequestId_(payload.requestId), operationId: validateOperationId_(payload.operationId), expectedRevision: expectedRevision,
    schoolId: payload.schoolId ? requireId_(payload.schoolId, 'school') : '', classId: requireId_(payload.classId, 'class'),
    accessToken: cleanToken_(payload.accessToken || ''), coachName: requireText_(payload.coachName, 'coach name', 150), coachEmail: coachEmail,
    language: allowIncomplete ? cleanText_(payload.language || '', 100) : requireText_(payload.language, 'language', 100),
    gradeLevel: allowIncomplete ? cleanText_(payload.gradeLevel || '', 100) : requireText_(payload.gradeLevel, 'grade level', 100),
    kreycoCurriculum: allowIncomplete ? cleanText_(payload.kreycoCurriculum || '', 200) : requireText_(payload.kreycoCurriculum, 'Kreyco curriculum', 200),
    lmsCredentials: cleanText_(payload.lmsCredentials || '', CONFIG.maxTextLength), clearLmsCredentials: payload.clearLmsCredentials === true,
    verificationNeeded: allowIncomplete && !payload.verificationNeeded ? '' : requireChoice_(payload.verificationNeeded, ['Yes', 'No'], 'LMS verification'), useGoogleClassroom: useGoogleClassroom,
    otherGradingPlatform: otherPlatform, gradingCredentials: cleanText_(payload.gradingCredentials || '', CONFIG.maxTextLength),
    clearGradingCredentials: payload.clearGradingCredentials === true, schedule: cleanText_(payload.schedule || '', CONFIG.maxTextLength)
  };
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
  return { requests: syncRequestTeacherRelations_(), portalLinks: syncEligibleClassPortalLinks_(), notifications: processNotificationQueue_() };
}

function syncRequestTeacherRelations_() {
  var items = getAllRequestItemsForSync_();
  var summary = { scanned: items.length, updated: 0, cleared: 0, ineligible: 0, unchanged: 0, busy: 0 };
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
    } catch (error) { summary.busy += 1; }
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
  var summary = { scanned: classes.length, updated: 0, unchanged: 0, failed: 0 };
  classes.forEach(function (classroom) {
    var desired = portalUrl_(classroom.id, 'coach');
    if (classroom.portalUrl === desired) { summary.unchanged += 1; return; }
    try { ensureClassPortalLink_(classroom.id); summary.updated += 1; }
    catch (error) { summary.failed += 1; }
  });
  CacheService.getScriptCache().remove('eligible-classes-v3');
  return summary;
}

function processNotificationQueue() { return processNotificationQueue_(); }

function processNotificationQueue_() {
  var interrupted = recoverInterruptedNotifications_();
  var query = 'query PendingNotifications { items_page_by_column_values(board_id: ' + CONFIG.destinationBoardId + ', limit: 25, columns: [{ column_id: "' + CONFIG.destinationNotificationStateColumnId + '", column_values: ["Pending"] }]) { items { id } } }';
  var data = mondayRequest_(query, {});
  var items = ((data.items_page_by_column_values || {}).items || []);
  var summary = { pending: items.length, sent: 0, failed: 0, interrupted: interrupted };
  items.forEach(function (item) {
    try { processNotificationById_(item.id); summary.sent += 1; }
    catch (error) { summary.failed += 1; }
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
      return { sent: true, eventId: eventId };
    } catch (error) {
      var failed = {};
      failed[CONFIG.destinationNotificationStateColumnId] = { label: 'Failed' };
      failed[CONFIG.destinationNotificationErrorColumnId] = { text: cleanText_(error.message || 'Email delivery failed.', 1000) };
      updateRequestItem_(itemId, failed);
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
  deliveries.forEach(function (delivery) {
    var html = '<p>Hello ' + escapeHtml_(delivery.greeting) + ',</p><p>' + escapeHtml_(message).replace(/\n/g, '<br>') + '</p><p><strong>Status:</strong> ' + escapeHtml_(requestItem.status) + '</p><p><a href="' + escapeHtml_(delivery.url) + '">' + escapeHtml_(delivery.linkText) + '</a></p><p style="color:#676879;font-size:12px">Notification reference: ' + escapeHtml_(eventId) + '</p>';
    MailApp.sendEmail({ to: delivery.to, subject: subject, htmlBody: html,
      body: message + '\n\nStatus: ' + requestItem.status + '\n' + delivery.url + '\n\nNotification reference: ' + eventId,
      name: 'Kreyco Tech Support' });
  });
}

function sendDraftSavedEmail_(email, url, classroomName) {
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('The daily email-recipient quota is exhausted.');
  MailApp.sendEmail({ to: email, subject: 'Classroom request draft saved — ' + classroomName,
    body: 'Your draft was saved. Resume it from the class row or use this private link:\n\n' + url,
    htmlBody: '<p>Your draft for <strong>' + escapeHtml_(classroomName) + '</strong> was saved.</p><p><a href="' + escapeHtml_(url) + '">Resume classroom request</a></p><p>Treat this link as private because it permits editing the draft.</p>',
    name: 'Kreyco Tech Support' });
}

function techNotificationEmail_() { return PropertiesService.getScriptProperties().getProperty('TECH_NOTIFICATION_EMAIL') || 'it@kreyco.com'; }

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
