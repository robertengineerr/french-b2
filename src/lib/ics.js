// Daily reminder as a calendar subscription file.
//
// Why not push notifications: on iOS, web push only works for a PWA already added
// to the home screen, and it still needs a push server with VAPID keys plus a
// machine awake to send at the right minute. A repeating calendar event with an
// alarm needs none of that, works offline, survives reinstalling the app, and
// lets you change the time in Calendar without touching the code.

function pad(n) {
  return String(n).padStart(2, '0');
}

// Local time, floating (no timezone) — so 19:00 stays 19:00 wherever you are.
function stamp(d) {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

function utcStamp(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export function buildReminderICS(timeHHMM = '19:00', appUrl = '') {
  const [h, m] = timeHHMM.split(':').map(Number);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 19, m || 0, 0);
  if (start <= now) start.setDate(start.getDate() + 1); // start tomorrow if today's slot has passed
  const end = new Date(start.getTime() + 15 * 60000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Parcours B2//Daily French//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:parcours-b2-daily-${start.getTime()}@local`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    'RRULE:FREQ=DAILY',
    'SUMMARY:Défi de français 🇫🇷',
    `DESCRIPTION:Lecture, écoute et quiz du jour.${appUrl ? ` ${appUrl}` : ''}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Défi de français',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // RFC 5545 wants CRLF line endings; Apple Calendar is strict about it.
  return lines.join('\r\n');
}

export function downloadReminder(timeHHMM, appUrl) {
  const blob = new Blob([buildReminderICS(timeHHMM, appUrl)], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'defi-francais.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
