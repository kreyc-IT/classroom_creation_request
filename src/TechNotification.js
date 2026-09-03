/** Builds the IT-only notification. No network calls or credential fields. */
function buildTechNotification_(requestItem, eventId, message) {
  var reference = 'CCR-' + requireId_(requestItem.id, 'request item');
  // Construct links from trusted configuration, never from form or message content.
  var itemUrl = CONFIG.mondayItemUrl + requestItem.id;
  var boardUrl = CONFIG.mondayItemUrl.replace(/\/pulses\/$/, '');
  var isUpdate = requestItem.status === 'Reopened - Coach Update';
  var isNew = requestItem.status === 'Sent to Tech';
  var badge = isUpdate ? 'COACH UPDATE' : (isNew ? 'NEW REQUEST' : 'REQUEST NOTIFICATION');
  var heading = isUpdate ? 'Google Classroom request updated' : (isNew ? 'Google Classroom creation request' : 'Google Classroom request notification');
  var subjectTopic = isUpdate ? 'Coach update: Google Classroom request' : (isNew ? 'New Google Classroom request' : 'Google Classroom request notification');
  var intro = isUpdate
    ? 'Hello IT Team, the coach has updated this classroom request. Review the latest details and continue work on the same item.'
    : (isNew ? 'Hello IT Team, a coach has submitted a classroom setup request. Review the details below and open the request to begin.'
      : 'Hello IT Team, there is a notification for this classroom request. Open the same request item to review its current details and progress.');
  var messageHeading = isUpdate ? 'Coach update' : (isNew ? 'Ready for IT review' : 'Request update');
  var className = requestItem.className || requestItem.name || 'Class not provided';
  var schoolName = requestItem.schoolName || 'School not provided';
  var coachName = requestItem.coachName || 'Not provided';
  var coachEmail = requestItem.coachEmail || 'Email not provided';
  var teacherName = requestItem.teacherName || 'No active teacher assigned yet';
  var status = requestItem.status || 'Not provided';
  var details = [
    ['Language', requestItem.language], ['Grade level', requestItem.gradeLevel],
    ['Kreyco curriculum', requestItem.kreycoCurriculum], ['Request details', requestItem.requestDetails],
    ['LMS verification needed?', requestItem.verificationNeeded],
    ['Google Classroom for grading?', requestItem.useGoogleClassroom], ['Other grading platform', requestItem.otherGradingPlatform],
    ['Class schedule', requestItem.schedule], ['Classrooms needed by', requestItem.neededByDate]
  ];
  var notice = 'Credential fields are not included in this email. Open the request item for authorized access to credentials and secure-share links.';
  var subject = cleanText_('[' + reference + '] ' + subjectTopic + ' — ' + schoolName + ' / ' + className, 1000).replace(/\s+/g, ' ').slice(0, 240);
  var body = [heading, '', intro, '', reference, 'Status: ' + status, 'Class: ' + className, 'School: ' + schoolName,
    'Requesting coach: ' + coachName + ' (' + coachEmail + ')', 'Current teacher: ' + teacherName, '', 'Classroom setup details'];
  details.forEach(function (field) { body.push(field[0] + ': ' + (field[1] || 'Not provided')); });
  body = body.concat(['', messageHeading, message || 'Open the request item for details.', '',
    'Open request in Monday.com: ' + itemUrl, 'View Classroom Creation board: ' + boardUrl, '', notice, '', 'Notification reference: ' + eventId]).join('\n');
  var rows = [];
  for (var i = 0; i < details.length; i += 2) {
    rows.push('<tr>' + techEmailField_(details[i][0], details[i][1], i === details.length - 1 ? 2 : 1)
      + (details[i + 1] ? techEmailField_(details[i + 1][0], details[i + 1][1], 1) : '') + '</tr>');
  }
  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + escapeHtml_(heading) + '</title>'
    + '<style>@media(max-width:480px){.email-padding{padding-left:20px!important;padding-right:20px!important}.contact-stack{display:block!important;width:100%!important;padding-bottom:12px!important}.main-title{font-size:24px!important}}</style></head>'
    + '<body style="margin:0;padding:0;background:#F4F6F8;font-family:Helvetica,Arial,sans-serif;color:#1E293B">'
    + '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">' + escapeHtml_(reference + ' · ' + className + ' · ' + status) + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:28px 12px">'
    + '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E2E8F0">'
    + '<tr><td class="email-padding" style="padding:22px 30px;border-bottom:4px solid #D5DFEA">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><img src="https://kreyco.s3.us-east-2.amazonaws.com/kreyco-logo.png" alt="Kreyco" width="148" style="display:block;width:148px;max-width:100%;height:auto;border:0"></td>'
    + '<td align="right" style="color:#64748B;font-size:11px;font-weight:700;letter-spacing:1px">IT NOTIFICATIONS</td></tr></table></td></tr>'
    + '<tr><td class="email-padding" style="padding:28px 30px 0"><span style="display:inline-block;background:#EFF6FF;color:#295EE3;padding:6px 11px;border-radius:99px;font-weight:700;font-size:11px;letter-spacing:.7px">' + badge + '</span>'
    + '<h1 class="main-title" style="margin:14px 0 10px;color:#16367B;font-size:28px;line-height:1.2;letter-spacing:-.5px">' + escapeHtml_(heading) + '</h1>'
    + '<p style="margin:0;color:#64748B;font-size:14px;line-height:1.65">' + escapeHtml_(intro) + '</p></td></tr>'
    + '<tr><td class="email-padding" style="padding:22px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px"><tr><td style="padding:20px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:12px;font-weight:700;color:#295EE3">' + escapeHtml_(reference) + '</td>'
    + '<td align="right" style="font-size:12px;color:#64748B">' + escapeHtml_(status) + '</td></tr></table>'
    + '<h2 style="margin:12px 0 3px;font-size:20px;line-height:1.35;color:#1E293B;overflow-wrap:anywhere">' + escapeHtml_(className) + '</h2>'
    + '<p style="margin:0 0 16px;color:#64748B;font-size:14px;line-height:1.5;overflow-wrap:anywhere">' + escapeHtml_(schoolName) + '</p>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E2E8F0"><tr>'
    + '<td class="contact-stack" width="55%" valign="top" style="padding-top:14px;padding-right:10px"><div style="color:#64748B;font-size:12px;line-height:1.5;padding-bottom:3px">Requesting coach</div>'
    + '<div style="font-size:14px;font-weight:700;line-height:1.55;overflow-wrap:anywhere">' + escapeHtml_(coachName) + '</div><div style="font-size:12px;line-height:1.6;color:#64748B;overflow-wrap:anywhere">' + escapeHtml_(coachEmail) + '</div></td>'
    + '<td class="contact-stack" width="45%" valign="top" style="padding-top:14px"><div style="color:#64748B;font-size:12px;line-height:1.5;padding-bottom:3px">Current teacher</div>'
    + '<div style="font-size:14px;font-weight:700;line-height:1.55;overflow-wrap:anywhere">' + escapeHtml_(teacherName) + '</div></td></tr></table></td></tr></table></td></tr>'
    + '<tr><td class="email-padding" style="padding:24px 30px 0"><h2 style="margin:0 0 14px;font-size:15px;color:#16367B">Classroom setup details</h2>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">' + rows.join('') + '</table></td></tr>'
    + '<tr><td class="email-padding" style="padding:20px 30px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid #295EE3;background:#EFF6FF;padding:14px 16px">'
    + '<div style="font-size:13px;font-weight:700;color:#16367B;margin-bottom:5px">' + messageHeading + '</div><div style="font-size:13px;line-height:1.65;color:#334155;overflow-wrap:anywhere">'
    + escapeHtml_(message || 'Open the request item for details.').replace(/\r\n|\r|\n/g, '<br>') + '</div></td></tr></table></td></tr>'
    + '<tr><td align="center" class="email-padding" style="padding:24px 30px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#295EE3" style="border-radius:7px">'
    + '<a href="' + escapeHtml_(itemUrl) + '" target="_blank" style="display:inline-block;padding:15px 23px;color:#FFFFFF!important;font-size:14px;font-weight:700;text-decoration:none;border-radius:7px">Open request in Monday.com &rarr;</a></td></tr></table>'
    + '<p style="margin:14px 0 0;font-size:12px;line-height:1.6"><a href="' + escapeHtml_(boardUrl) + '" target="_blank" style="color:#16367B;text-decoration:underline">View Classroom Creation board</a></p></td></tr>'
    + '<tr><td class="email-padding" style="padding:20px 30px 24px"><p style="margin:0;padding-top:18px;border-top:1px solid #E2E8F0;color:#64748B;font-size:12px;line-height:1.65">' + notice + '</p></td></tr>'
    + '<tr><td class="email-padding" align="center" style="padding:16px 30px;background:#F8FAFC;border-top:1px solid #E2E8F0;color:#64748B;font-size:11px;line-height:1.7;overflow-wrap:anywhere">&copy; ' + new Date().getFullYear() + ' Kreyco · Internal IT notification<br>Notification reference: '
    + escapeHtml_(eventId) + '</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>';
  return { subject: subject, htmlBody: html, body: body };
}

function techEmailField_(label, value, colspan) {
  return '<td colspan="' + colspan + '" valign="top" style="padding:0 12px 14px 0"><div style="color:#64748B;font-size:12px;line-height:1.5;padding-bottom:3px">'
    + escapeHtml_(label) + '</div><div style="color:#1E293B;font-size:14px;line-height:1.55;overflow-wrap:anywhere">'
    + escapeHtml_(value || 'Not provided').replace(/\r\n|\r|\n/g, '<br>') + '</div></td>';
}
