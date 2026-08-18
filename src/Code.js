var CONFIG = Object.freeze({
  apiVersion: '2026-07',
  mondayApiUrl: 'https://api.monday.com/v2',
  destinationBoardId: '18427083218',
  destinationGroupId: 'topics',
  destinationStaffRelationColumnId: 'board_relation_mm6b2ch9',
  staffBoardId: '9739309783',
  staffJobTitleColumnId: 'dropdown',
  teacherLabelId: '2',
  selectedTeacherGroupId: 'new_group64074__1',
  activeTeacherGroupId: 'topics',
  accountsBoardId: '9718635629',
  accountsStatusColumnId: 'color_mkwjcmfq',
  accountsActiveLabel: 'Active',
  accountsSubitemBoardId: '9719292298',
  sectionStatusColumnId: 'color_mkvqqdzk',
  assignedTeacherColumnId: 'board_relation_mktxpkv3',
  teacherCacheSeconds: 300,
  assignmentCacheSeconds: 120,
  submissionCacheSeconds: 21600,
  maxTextLength: 1500,
  maxClassrooms: 20
});

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Classroom Creation Request')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getTeacherPage(options) {
  var input = options || {};
  var pageSize = clampInteger_(input.pageSize, 5, 25, 10);
  var page = clampInteger_(input.page, 1, 10000, 1);
  var search = cleanText_(input.search || '', 100).toLowerCase();
  var teachers = getEligibleTeachers_(false);

  if (search) {
    teachers = teachers.filter(function (teacher) {
      return (teacher.name + ' ' + teacher.groupLabel).toLowerCase().indexOf(search) !== -1;
    });
  }

  var totalItems = teachers.length;
  var totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  page = Math.min(page, totalPages);
  var start = (page - 1) * pageSize;

  return {
    items: teachers.slice(start, start + pageSize),
    page: page,
    pageSize: pageSize,
    totalItems: totalItems,
    totalPages: totalPages
  };
}

function getSchoolsForTeacher(teacherId) {
  teacherId = requireId_(teacherId, 'teacher');
  var assignments = getTeacherAssignments_(teacherId, false);
  var schoolMap = {};

  assignments.forEach(function (assignment) {
    if (!schoolMap[assignment.schoolId]) {
      schoolMap[assignment.schoolId] = {
        id: assignment.schoolId,
        name: assignment.schoolName,
        activeSectionCount: 0
      };
    }
    if (containsActive_(assignment.sectionStatus)) {
      schoolMap[assignment.schoolId].activeSectionCount += 1;
    }
  });

  return Object.keys(schoolMap).map(function (key) {
    return schoolMap[key];
  }).sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
}

function getSectionsForSchool(input) {
  input = input || {};
  var teacherId = requireId_(input.teacherId, 'teacher');
  var schoolId = requireId_(input.schoolId, 'school');

  return getTeacherAssignments_(teacherId, false).filter(function (assignment) {
    return assignment.schoolId === schoolId && containsActive_(assignment.sectionStatus);
  }).map(function (assignment) {
    return {
      id: assignment.sectionId,
      name: assignment.sectionName,
      status: assignment.sectionStatus
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

    var teacher = verifyTeacherEligibility_(request.teacherId);
    var assignments = getTeacherAssignments_(request.teacherId, true);
    validateSchoolAndSections_(request, assignments);

    var item = createDestinationItem_(teacher);
    var updateWarning = '';
    try {
      createRequestUpdate_(item.id, buildUpdateBody_(request, teacher));
    } catch (error) {
      updateWarning = 'The request item was created, but its detailed update could not be attached. Contact Tech Support with item ' + item.id + '.';
    }

    var result = {
      ok: true,
      requestId: request.requestId,
      itemId: item.id,
      reference: 'CCR-' + item.id,
      warning: updateWarning
    };
    cache.put(cacheKey, JSON.stringify(result), CONFIG.submissionCacheSeconds);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function getEligibleTeachers_(forceRefresh) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'eligible-teachers-v2';
  var cached = !forceRefresh && cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  var query = [
    'query EligibleTeachers {',
    '  boards(ids: [' + CONFIG.staffBoardId + ']) {',
    '    items_page(limit: 500, query_params: {operator: and, rules: [',
    '      {column_id: "group", compare_value: ["' + CONFIG.selectedTeacherGroupId + '", "' + CONFIG.activeTeacherGroupId + '"], operator: any_of},',
    '      {column_id: "' + CONFIG.staffJobTitleColumnId + '", compare_value: [' + CONFIG.teacherLabelId + '], operator: any_of}',
    '    ]}) {',
    '      items { id name group { id title } }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  var data = mondayRequest_(query, {});
  var items = (((data.boards || [])[0] || {}).items_page || {}).items || [];
  var teachers = items.map(function (item) {
    var selected = item.group && item.group.id === CONFIG.selectedTeacherGroupId;
    return {
      id: String(item.id),
      name: item.name,
      group: selected ? 'selected_teacher' : 'active',
      groupLabel: selected ? 'Selected Teacher' : 'Active'
    };
  }).sort(function (a, b) {
    if (a.group !== b.group) {
      return a.group === 'selected_teacher' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  cache.put(cacheKey, JSON.stringify(teachers), CONFIG.teacherCacheSeconds);
  return teachers;
}

function getTeacherAssignments_(teacherId, forceRefresh) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'teacher-assignments:' + teacherId;
  var cached = !forceRefresh && cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  var itemFields = [
    'id',
    'name',
    'column_values(ids: ["' + CONFIG.sectionStatusColumnId + '"]) { id text ... on StatusValue { label } }',
    'parent_item {',
    '  id',
    '  name',
    '  column_values(ids: ["' + CONFIG.accountsStatusColumnId + '"]) { id text ... on StatusValue { label } }',
    '}'
  ].join('\n');

  var firstQuery = [
    'query TeacherAssignments {',
    '  boards(ids: [' + CONFIG.accountsSubitemBoardId + ']) {',
    '    items_page(limit: 500, query_params: {rules: [',
    '      {column_id: "' + CONFIG.assignedTeacherColumnId + '", compare_value: [' + teacherId + '], operator: any_of}',
    '    ]}) {',
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
      'query NextTeacherAssignments($cursor: String!) {',
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

  var assignments = items.map(function (item) {
    var parent = item.parent_item || {};
    return {
      sectionId: String(item.id),
      sectionName: item.name,
      sectionStatus: columnLabel_(item.column_values, CONFIG.sectionStatusColumnId),
      schoolId: String(parent.id || ''),
      schoolName: parent.name || '',
      schoolStatus: columnLabel_(parent.column_values, CONFIG.accountsStatusColumnId)
    };
  }).filter(function (assignment) {
    return assignment.schoolId && assignment.schoolStatus === CONFIG.accountsActiveLabel;
  });

  cache.put(cacheKey, JSON.stringify(assignments), CONFIG.assignmentCacheSeconds);
  return assignments;
}

function verifyTeacherEligibility_(teacherId) {
  var query = [
    'query VerifyTeacher {',
    '  items(ids: [' + teacherId + ']) {',
    '    id',
    '    name',
    '    group { id title }',
    '    column_values(ids: ["' + CONFIG.staffJobTitleColumnId + '"]) {',
    '      id',
    '      ... on DropdownValue { values { id label } }',
    '    }',
    '  }',
    '}'
  ].join('\n');
  var data = mondayRequest_(query, {});
  var item = (data.items || [])[0];
  if (!item) {
    throw new Error('The selected teacher no longer exists. Refresh the form and try again.');
  }
  var allowedGroup = item.group && [CONFIG.selectedTeacherGroupId, CONFIG.activeTeacherGroupId].indexOf(item.group.id) !== -1;
  var dropdown = (item.column_values || []).filter(function (value) {
    return value.id === CONFIG.staffJobTitleColumnId;
  })[0] || {};
  var isTeacher = (dropdown.values || []).some(function (value) {
    return String(value.id) === CONFIG.teacherLabelId;
  });
  if (!allowedGroup || !isTeacher) {
    throw new Error('The selected staff member is no longer an eligible teacher. Refresh the form and try again.');
  }
  return { id: String(item.id), name: item.name, groupId: item.group.id };
}

function validateSchoolAndSections_(request, assignments) {
  var schoolAssignments = assignments.filter(function (assignment) {
    return assignment.schoolId === request.schoolId;
  });
  if (!schoolAssignments.length) {
    throw new Error('The selected school is no longer assigned to this teacher. Refresh the form and try again.');
  }

  var activeSectionMap = {};
  schoolAssignments.forEach(function (assignment) {
    if (containsActive_(assignment.sectionStatus)) {
      activeSectionMap[assignment.sectionId] = assignment;
    }
  });

  var seen = {};
  request.classrooms.forEach(function (classroom) {
    if (!activeSectionMap[classroom.sectionId]) {
      throw new Error('One or more selected sections are no longer active for this teacher and school. Refresh the form and try again.');
    }
    if (seen[classroom.sectionId]) {
      throw new Error('Each section can only appear once in a request.');
    }
    seen[classroom.sectionId] = true;
    classroom.sectionName = activeSectionMap[classroom.sectionId].sectionName;
  });

  request.schoolName = schoolAssignments[0].schoolName;
}

function createDestinationItem_(teacher) {
  var columnValues = {};
  columnValues[CONFIG.destinationStaffRelationColumnId] = { item_ids: [Number(teacher.id)] };
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
    itemName: teacher.name,
    columnValues: JSON.stringify(columnValues)
  });
  if (!data.create_item || !data.create_item.id) {
    throw new Error('Monday did not return the new request item.');
  }
  return data.create_item;
}

function createRequestUpdate_(itemId, body) {
  var query = [
    'mutation AddRequestDetails($itemId: ID!, $body: String!) {',
    '  create_update(item_id: $itemId, body: $body) { id }',
    '}'
  ].join('\n');
  return mondayRequest_(query, { itemId: itemId, body: body });
}

function buildUpdateBody_(request, teacher) {
  var lines = [
    'CLASSROOM CREATION REQUEST',
    '',
    'Request reference: ' + request.requestId,
    'Submitted: ' + new Date().toISOString(),
    'Timeline acknowledged: Yes (3-5 lessons per section; 2-5 business days)',
    '',
    'TEACHER AND SCHOOL',
    'Teacher: ' + teacher.name,
    'Staff Directory item ID: ' + teacher.id,
    'School: ' + request.schoolName,
    'Account item ID: ' + request.schoolId,
    '',
    'PLATFORMS AND SCHEDULE',
    'Credentials (LMS): ' + valueOrNotProvided_(request.lmsCredentials),
    'Verification needed (LMS): ' + request.verificationNeeded,
    'Use Google Classroom for grading: ' + request.useGoogleClassroom,
    'Other grading platform: ' + valueOrNotProvided_(request.otherGradingPlatform),
    'Credentials (grading platform): ' + valueOrNotProvided_(request.gradingCredentials),
    'Schedule (check Smores): ' + valueOrNotProvided_(request.schedule),
    '',
    'CLASSROOM SETUP'
  ];

  request.classrooms.forEach(function (classroom, index) {
    lines.push(
      '',
      (index + 1) + '. ' + classroom.sectionName,
      '   Section item ID: ' + classroom.sectionId,
      '   Language: ' + classroom.language,
      '   Grade level: ' + classroom.gradeLevel,
      '   Kreyco curriculum: ' + classroom.kreycoCurriculum,
      '   Status (Tech only):',
      '   Notes (Tech only):'
    );
  });
  return lines.join('\n');
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
  var teacherId = requireId_(payload.teacherId, 'teacher');
  var schoolId = requireId_(payload.schoolId, 'school');
  var verificationNeeded = requireChoice_(payload.verificationNeeded, ['Yes', 'No'], 'LMS verification');
  var useGoogleClassroom = requireChoice_(payload.useGoogleClassroom, ['Yes', 'No'], 'Google Classroom grading');
  var classrooms = Array.isArray(payload.classrooms) ? payload.classrooms : [];

  if (!classrooms.length || classrooms.length > CONFIG.maxClassrooms) {
    throw new Error('Add between 1 and ' + CONFIG.maxClassrooms + ' classroom sections.');
  }

  var normalizedClassrooms = classrooms.map(function (classroom) {
    return {
      sectionId: requireId_(classroom.sectionId, 'section'),
      sectionName: '',
      language: requireText_(classroom.language, 'language', 100),
      gradeLevel: requireText_(classroom.gradeLevel, 'grade level', 100),
      kreycoCurriculum: requireChoice_(classroom.kreycoCurriculum, ['Yes', 'No'], 'Kreyco curriculum')
    };
  });

  var otherPlatform = cleanText_(payload.otherGradingPlatform || '', 200);
  if (useGoogleClassroom === 'No' && !otherPlatform) {
    throw new Error('Enter the other grading platform.');
  }

  return {
    requestId: requestId,
    teacherId: teacherId,
    schoolId: schoolId,
    schoolName: '',
    acknowledged: true,
    lmsCredentials: cleanText_(payload.lmsCredentials || '', CONFIG.maxTextLength),
    verificationNeeded: verificationNeeded,
    useGoogleClassroom: useGoogleClassroom,
    otherGradingPlatform: otherPlatform,
    gradingCredentials: cleanText_(payload.gradingCredentials || '', CONFIG.maxTextLength),
    schedule: cleanText_(payload.schedule || '', CONFIG.maxTextLength),
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

function containsActive_(label) {
  return /(^|\W)active(\W|$)/i.test(String(label || ''));
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

function valueOrNotProvided_(value) {
  return value || 'Not provided';
}
