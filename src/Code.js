var CONFIG = Object.freeze({
  apiVersion: '2026-07',
  mondayApiUrl: 'https://api.monday.com/v2',
  destinationBoardId: '18427083218',
  destinationGroupId: 'topics',
  destinationSchoolRelationColumnId: 'board_relation_mm6bpfd8',
  destinationTimelineAcknowledgedColumnId: 'boolean_mm6bkxm5',
  destinationRequestIdColumnId: 'text_mm6bsfag',
  destinationSubitemsColumnId: 'subtasks_mm6b5std',
  destinationSubitemBoardId: '18427107495',
  subitemSectionRelationColumnId: 'board_relation_mm6k159n',
  subitemCurrentTeacherRelationColumnId: 'board_relation_mm6k90h2',
  subitemLanguageColumnId: 'text_mm6bvj23',
  subitemGradeLevelColumnId: 'text_mm6bnbka',
  subitemCurriculumColumnId: 'text_mm6bfn7d',
  subitemLmsCredentialsColumnId: 'long_text_mm6kxvtt',
  subitemLmsVerificationColumnId: 'color_mm6kn274',
  subitemGoogleClassroomColumnId: 'color_mm6ky13d',
  subitemOtherGradingPlatformColumnId: 'text_mm6kwdew',
  subitemGradingCredentialsColumnId: 'long_text_mm6kb928',
  subitemScheduleColumnId: 'long_text_mm6kywe4',
  subitemTechStatusColumnId: 'color_mm6b9q2c',
  subitemTechNotesColumnId: 'long_text_mm6bbjzp',
  accountsBoardId: '9718635629',
  accountsStatusColumnId: 'color_mkwjcmfq',
  accountsActiveLabel: 'Active',
  accountsSubitemBoardId: '9719292298',
  sectionStatusColumnId: 'color_mkvqqdzk',
  assignedTeacherColumnId: 'board_relation_mktxpkv3',
  classCacheSeconds: 120,
  submissionCacheSeconds: 21600,
  maxTextLength: 1500,
  maxClassrooms: 20,
  excludedClassStatuses: Object.freeze([
    'ended - renewal',
    'ended - new',
    'ended',
    'not moving forward'
  ])
});

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Classroom Creation Request')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSchoolPage(options) {
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
        unassignedClassCount: 0
      };
    }
    schoolMap[classroom.schoolId].eligibleClassCount += 1;
    if (!classroom.teacherId) {
      schoolMap[classroom.schoolId].unassignedClassCount += 1;
    }
  });

  var schools = Object.keys(schoolMap).map(function (key) {
    return schoolMap[key];
  }).sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });

  if (search) {
    schools = schools.filter(function (school) {
      return school.name.toLowerCase().indexOf(search) !== -1;
    });
  }

  var totalItems = schools.length;
  var totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  page = Math.min(page, totalPages);
  var start = (page - 1) * pageSize;

  return {
    items: schools.slice(start, start + pageSize),
    page: page,
    pageSize: pageSize,
    totalItems: totalItems,
    totalPages: totalPages
  };
}

function getClassesForSchool(schoolId) {
  schoolId = requireId_(schoolId, 'school');
  return getEligibleClasses_(false).filter(function (classroom) {
    return classroom.schoolId === schoolId;
  }).map(function (classroom) {
    return {
      id: classroom.sectionId,
      name: classroom.sectionName,
      status: classroom.sectionStatus,
      teacherId: classroom.teacherId,
      teacherName: classroom.teacherName
    };
  }).sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
}

function submitRequest(payload) {
  var request = normalizeSubmission_(payload || {});
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var cache = CacheService.getScriptCache();
    var cacheKey = 'submission:' + request.requestId;
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    var classes = getEligibleClasses_(true);
    validateSchoolAndSections_(request, classes);

    var item = createDestinationItem_(request);
    var subitemIds = [];
    var failedSections = [];
    request.classrooms.forEach(function (classroom) {
      try {
        var subitem = createDestinationSubitem_(item.id, classroom);
        subitemIds.push(String(subitem.id));
      } catch (error) {
        failedSections.push(classroom.sectionName);
      }
    });

    var warning = failedSections.length
      ? 'The request item was created, but these classroom subitems could not be added: ' + failedSections.join(', ') + '. Contact Tech Support with item ' + item.id + '.'
      : '';

    var result = {
      ok: true,
      requestId: request.requestId,
      itemId: item.id,
      subitemIds: subitemIds,
      reference: 'CCR-' + item.id,
      warning: warning
    };
    cache.put(cacheKey, JSON.stringify(result), CONFIG.submissionCacheSeconds);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function getEligibleClasses_(forceRefresh) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'eligible-classes-v1';
  var cached = !forceRefresh && cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  var itemFields = [
    'id',
    'name',
    'column_values(ids: ["' + CONFIG.sectionStatusColumnId + '", "' + CONFIG.assignedTeacherColumnId + '"]) {',
    '  id',
    '  text',
    '  ... on StatusValue { label }',
    '  ... on BoardRelationValue { linked_item_ids linked_items { id name } }',
    '}',
    'parent_item {',
    '  id',
    '  name',
    '  column_values(ids: ["' + CONFIG.accountsStatusColumnId + '"]) { id text ... on StatusValue { label } }',
    '}'
  ].join('\n');

  var firstQuery = [
    'query EligibleClasses {',
    '  boards(ids: [' + CONFIG.accountsSubitemBoardId + ']) {',
    '    items_page(limit: 500) {',
    '      cursor',
    '      items { ' + itemFields + ' }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  var data = mondayRequest_(firstQuery, {});
  var page = (((data.boards || [])[0] || {}).items_page || {});
  var items = page.items || [];
  var cursor = page.cursor;

  while (cursor) {
    var nextQuery = [
      'query NextEligibleClasses($cursor: String!) {',
      '  next_items_page(cursor: $cursor) {',
      '    cursor',
      '    items { ' + itemFields + ' }',
      '  }',
      '}'
    ].join('\n');
    var next = mondayRequest_(nextQuery, { cursor: cursor }).next_items_page || {};
    items = items.concat(next.items || []);
    cursor = next.cursor;
  }

  var classes = items.map(function (item) {
    var parent = item.parent_item || {};
    var teacherRelation = columnValue_(item.column_values, CONFIG.assignedTeacherColumnId);
    var teacher = (teacherRelation.linked_items || [])[0] || {};
    return {
      sectionId: String(item.id),
      sectionName: item.name,
      sectionStatus: columnLabel_(item.column_values, CONFIG.sectionStatusColumnId),
      schoolId: String(parent.id || ''),
      schoolName: parent.name || '',
      schoolStatus: columnLabel_(parent.column_values, CONFIG.accountsStatusColumnId),
      teacherId: String(teacher.id || ''),
      teacherName: teacher.name || ''
    };
  }).filter(function (classroom) {
    return classroom.schoolId &&
      classroom.schoolStatus === CONFIG.accountsActiveLabel &&
      isEligibleClassStatus_(classroom.sectionStatus);
  });

  cache.put(cacheKey, JSON.stringify(classes), CONFIG.classCacheSeconds);
  return classes;
}

function validateSchoolAndSections_(request, classes) {
  var schoolClasses = classes.filter(function (classroom) {
    return classroom.schoolId === request.schoolId;
  });
  if (!schoolClasses.length) {
    throw new Error('The selected school no longer has eligible classes. Refresh the form and try again.');
  }

  var classMap = {};
  schoolClasses.forEach(function (classroom) {
    classMap[classroom.sectionId] = classroom;
  });

  var seen = {};
  request.classrooms.forEach(function (classroom) {
    var authoritative = classMap[classroom.sectionId];
    if (!authoritative) {
      throw new Error('One or more selected classes are no longer eligible for this school. Refresh the form and try again.');
    }
    if (seen[classroom.sectionId]) {
      throw new Error('Each class can only appear once in a request.');
    }
    seen[classroom.sectionId] = true;
    classroom.sectionName = authoritative.sectionName;
    classroom.teacherId = authoritative.teacherId;
    classroom.teacherName = authoritative.teacherName;
  });

  request.schoolName = schoolClasses[0].schoolName;
}

function createDestinationItem_(request) {
  var columnValues = buildParentColumnValues_(request);
  var query = [
    'mutation CreateRequest($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {',
    '  create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {',
    '    id',
    '    name',
    '  }',
    '}'
  ].join('\n');
  var data = mondayRequest_(query, {
    boardId: CONFIG.destinationBoardId,
    groupId: CONFIG.destinationGroupId,
    itemName: request.schoolName,
    columnValues: JSON.stringify(columnValues)
  });
  if (!data.create_item || !data.create_item.id) {
    throw new Error('Monday did not return the new request item.');
  }
  return data.create_item;
}

function createDestinationSubitem_(parentItemId, classroom) {
  var columnValues = buildSubitemColumnValues_(classroom);
  var query = [
    'mutation CreateClassroomSubitem($parentItemId: ID!, $itemName: String!, $columnValues: JSON!) {',
    '  create_subitem(parent_item_id: $parentItemId, item_name: $itemName, column_values: $columnValues) {',
    '    id',
    '    name',
    '  }',
    '}'
  ].join('\n');
  var data = mondayRequest_(query, {
    parentItemId: parentItemId,
    itemName: classroom.sectionName,
    columnValues: JSON.stringify(columnValues)
  });
  if (!data.create_subitem || !data.create_subitem.id) {
    throw new Error('Monday did not return the new classroom subitem.');
  }
  return data.create_subitem;
}

function buildParentColumnValues_(request) {
  var values = {};
  values[CONFIG.destinationSchoolRelationColumnId] = { item_ids: [Number(request.schoolId)] };
  values[CONFIG.destinationTimelineAcknowledgedColumnId] = { checked: 'true' };
  values[CONFIG.destinationRequestIdColumnId] = request.requestId;
  return values;
}

function buildSubitemColumnValues_(classroom) {
  var values = {};
  values[CONFIG.subitemSectionRelationColumnId] = { item_ids: [Number(classroom.sectionId)] };
  if (classroom.teacherId) {
    values[CONFIG.subitemCurrentTeacherRelationColumnId] = { item_ids: [Number(classroom.teacherId)] };
  }
  values[CONFIG.subitemLanguageColumnId] = classroom.language;
  values[CONFIG.subitemGradeLevelColumnId] = classroom.gradeLevel;
  values[CONFIG.subitemCurriculumColumnId] = classroom.kreycoCurriculum;
  values[CONFIG.subitemLmsVerificationColumnId] = { label: classroom.verificationNeeded };
  values[CONFIG.subitemGoogleClassroomColumnId] = { label: classroom.useGoogleClassroom };
  setLongTextIfPresent_(values, CONFIG.subitemLmsCredentialsColumnId, classroom.lmsCredentials);
  setTextIfPresent_(values, CONFIG.subitemOtherGradingPlatformColumnId, classroom.otherGradingPlatform);
  setLongTextIfPresent_(values, CONFIG.subitemGradingCredentialsColumnId, classroom.gradingCredentials);
  setLongTextIfPresent_(values, CONFIG.subitemScheduleColumnId, classroom.schedule);
  values[CONFIG.subitemTechStatusColumnId] = { label: 'Not Started' };
  return values;
}

function syncActiveClassroomRequestTeachers() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var requestItems = getClassroomRequestLinks_();
    var summary = { scanned: requestItems.length, updated: 0, cleared: 0, unchanged: 0 };

    requestItems.forEach(function (item) {
      var desiredTeacherId = desiredActiveTeacherId_(item);
      var currentTeacherId = firstLinkedItemId_(item.column_values, CONFIG.subitemCurrentTeacherRelationColumnId);
      if (desiredTeacherId === currentTeacherId) {
        summary.unchanged += 1;
        return;
      }

      updateActiveTeacherRelation_(item.id, desiredTeacherId);
      if (desiredTeacherId) {
        summary.updated += 1;
      } else {
        summary.cleared += 1;
      }
    });

    return summary;
  } finally {
    lock.releaseLock();
  }
}

function getClassroomRequestLinks_() {
  var itemFields = [
    'id',
    'column_values(ids: ["' + CONFIG.subitemSectionRelationColumnId + '", "' + CONFIG.subitemCurrentTeacherRelationColumnId + '"]) {',
    '  id',
    '  ... on BoardRelationValue {',
    '    linked_item_ids',
    '    linked_items {',
    '      id',
    '      column_values(ids: ["' + CONFIG.sectionStatusColumnId + '", "' + CONFIG.assignedTeacherColumnId + '"]) {',
    '        id',
    '        text',
    '        ... on StatusValue { label }',
    '        ... on BoardRelationValue { linked_item_ids }',
    '      }',
    '      parent_item {',
    '        id',
    '        column_values(ids: ["' + CONFIG.accountsStatusColumnId + '"]) { id text ... on StatusValue { label } }',
    '      }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  var firstQuery = [
    'query ClassroomRequestLinks {',
    '  boards(ids: [' + CONFIG.destinationSubitemBoardId + ']) {',
    '    items_page(limit: 500) {',
    '      cursor',
    '      items { ' + itemFields + ' }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  var data = mondayRequest_(firstQuery, {});
  var page = (((data.boards || [])[0] || {}).items_page || {});
  var items = page.items || [];
  var cursor = page.cursor;

  while (cursor) {
    var nextQuery = [
      'query NextClassroomRequestLinks($cursor: String!) {',
      '  next_items_page(cursor: $cursor) {',
      '    cursor',
      '    items { ' + itemFields + ' }',
      '  }',
      '}'
    ].join('\n');
    var next = mondayRequest_(nextQuery, { cursor: cursor }).next_items_page || {};
    items = items.concat(next.items || []);
    cursor = next.cursor;
  }

  return items;
}

function desiredActiveTeacherId_(requestItem) {
  var sectionRelation = columnValue_(requestItem.column_values, CONFIG.subitemSectionRelationColumnId);
  var section = (sectionRelation.linked_items || [])[0];
  if (!section || !isEligibleClassStatus_(columnLabel_(section.column_values, CONFIG.sectionStatusColumnId))) {
    return '';
  }

  var account = section.parent_item || {};
  if (columnLabel_(account.column_values, CONFIG.accountsStatusColumnId) !== CONFIG.accountsActiveLabel) {
    return '';
  }

  return firstLinkedItemId_(section.column_values, CONFIG.assignedTeacherColumnId);
}

function updateActiveTeacherRelation_(requestItemId, teacherId) {
  var values = {};
  values[CONFIG.subitemCurrentTeacherRelationColumnId] = teacherId
    ? { item_ids: [Number(teacherId)] }
    : { item_ids: [] };
  var query = [
    'mutation UpdateActiveTeacher($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {',
    '  change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }',
    '}'
  ].join('\n');
  mondayRequest_(query, {
    boardId: CONFIG.destinationSubitemBoardId,
    itemId: String(requestItemId),
    columnValues: JSON.stringify(values)
  });
}

function columnValue_(values, columnId) {
  return (values || []).filter(function (entry) {
    return entry.id === columnId;
  })[0] || {};
}

function firstLinkedItemId_(values, columnId) {
  var ids = columnValue_(values, columnId).linked_item_ids || [];
  return ids.length ? String(ids[0]) : '';
}

function setLongTextIfPresent_(values, columnId, value) {
  if (value) {
    values[columnId] = { text: value };
  }
}

function setTextIfPresent_(values, columnId, value) {
  if (value) {
    values[columnId] = value;
  }
}

function normalizeSubmission_(payload) {
  if (payload.website) {
    throw new Error('Submission rejected.');
  }
  if (payload.acknowledged !== true) {
    throw new Error('Please acknowledge the lesson limits and processing timeline.');
  }

  var requestId = String(payload.requestId || '');
  if (!/^[A-Za-z0-9-]{16,80}$/.test(requestId)) {
    throw new Error('The request session expired. Refresh the form and try again.');
  }
  var schoolId = requireId_(payload.schoolId, 'school');
  var classrooms = Array.isArray(payload.classrooms) ? payload.classrooms : [];

  if (!classrooms.length || classrooms.length > CONFIG.maxClassrooms) {
    throw new Error('Add between 1 and ' + CONFIG.maxClassrooms + ' classroom sections.');
  }

  var normalizedClassrooms = classrooms.map(function (classroom) {
    var useGoogleClassroom = requireChoice_(classroom.useGoogleClassroom, ['Yes', 'No'], 'Google Classroom grading');
    var otherGradingPlatform = cleanText_(classroom.otherGradingPlatform || '', 200);
    if (useGoogleClassroom === 'No' && !otherGradingPlatform) {
      throw new Error('Enter the other grading platform for every class that does not use Google Classroom.');
    }
    return {
      sectionId: requireId_(classroom.sectionId, 'section'),
      sectionName: '',
      teacherId: '',
      teacherName: '',
      language: requireText_(classroom.language, 'language', 100),
      gradeLevel: requireText_(classroom.gradeLevel, 'grade level', 100),
      kreycoCurriculum: requireText_(classroom.kreycoCurriculum, 'Kreyco curriculum', 100),
      lmsCredentials: cleanText_(classroom.lmsCredentials || '', CONFIG.maxTextLength),
      verificationNeeded: requireChoice_(classroom.verificationNeeded, ['Yes', 'No'], 'LMS verification'),
      useGoogleClassroom: useGoogleClassroom,
      otherGradingPlatform: otherGradingPlatform,
      gradingCredentials: cleanText_(classroom.gradingCredentials || '', CONFIG.maxTextLength),
      schedule: cleanText_(classroom.schedule || '', CONFIG.maxTextLength)
    };
  });

  return {
    requestId: requestId,
    schoolId: schoolId,
    schoolName: '',
    acknowledged: true,
    classrooms: normalizedClassrooms
  };
}

function mondayRequest_(query, variables) {
  var token = PropertiesService.getScriptProperties().getProperty('MONDAY_API_TOKEN');
  if (!token) {
    throw new Error('The form is not configured. Ask Tech Support to add the MONDAY_API_TOKEN script property.');
  }
  var response = UrlFetchApp.fetch(CONFIG.mondayApiUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: token,
      'API-Version': CONFIG.apiVersion
    },
    payload: JSON.stringify({ query: query, variables: variables || {} }),
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  var body = response.getContentText();
  var parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error('Monday returned an unreadable response (HTTP ' + status + ').');
  }
  if (status < 200 || status >= 300 || (parsed.errors && parsed.errors.length)) {
    var messages = (parsed.errors || []).map(function (entry) {
      return entry.message;
    }).filter(Boolean).join('; ');
    throw new Error('Monday request failed' + (messages ? ': ' + messages : ' (HTTP ' + status + ')') + '.');
  }
  return parsed.data || {};
}

function columnLabel_(values, columnId) {
  var value = (values || []).filter(function (entry) {
    return entry.id === columnId;
  })[0] || {};
  return value.label || value.text || '';
}

function isEligibleClassStatus_(label) {
  var normalized = String(label || '').trim().toLowerCase();
  return CONFIG.excludedClassStatuses.indexOf(normalized) === -1;
}

function requireId_(value, fieldName) {
  var id = String(value || '');
  if (!/^\d+$/.test(id)) {
    throw new Error('Select a valid ' + fieldName + '.');
  }
  return id;
}

function requireText_(value, fieldName, maxLength) {
  var text = cleanText_(value || '', maxLength);
  if (!text) {
    throw new Error('Enter a valid ' + fieldName + '.');
  }
  return text;
}

function requireChoice_(value, choices, fieldName) {
  var text = String(value || '');
  if (choices.indexOf(text) === -1) {
    throw new Error('Select a valid value for ' + fieldName + '.');
  }
  return text;
}

function cleanText_(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function clampInteger_(value, min, max, fallback) {
  var number = Number(value);
  if (!Number.isInteger(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}
