/**
 * Updated Google Apps Script — SE Brand Call Scheduling
 *
 * SETUP (repeat for all 4 SE scripts):
 * 1. Open your Google Apps Script project
 * 2. Replace the entire existing code with this file
 * 3. Set SE_EMAIL below to your own email address
 * 4. Deploy → Manage deployments → Edit (pencil icon)
 * 5. Set "Who has access" → Anyone
 * 6. Click Deploy
 *
 * TODO: replace WEBINAR_LINK_HERE with the real webinar URL.
 */

// ⚠️ SET THIS to the email of whoever is deploying this script
var SE_EMAIL = "your-email@thefrontrowhealth.com";

var WEBINAR_LINK = "WEBINAR_LINK_HERE";

var HOLIDAYS = [
  // 2025
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-06-19',
  '2025-07-04', '2025-09-01', '2025-10-13', '2025-11-11', '2025-11-27', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19',
  '2026-07-03', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25'
];

var TIMEZONE = 'America/Los_Angeles';

function safeIsHoliday(date) {
  if (date === null || date === undefined) return false;
  if (!(date instanceof Date)) return false;
  if (isNaN(date.getTime())) return false;
  try {
    var dateString = Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
    return HOLIDAYS.indexOf(dateString) !== -1;
  } catch (e) {
    return false;
  }
}

function formatDate(date) {
  if (!date || isNaN(date.getTime())) return "Invalid Date";
  try {
    return Utilities.formatDate(date, TIMEZONE, "EEEE, MMMM d, yyyy 'at' h:mm a z");
  } catch (e) {
    return "Invalid Date";
  }
}

function createValidDate(timestamp) {
  if (timestamp === null || timestamp === undefined || isNaN(timestamp)) return null;
  try {
    var date = new Date(timestamp);
    if (!date || isNaN(date.getTime())) return null;
    return date;
  } catch (e) {
    return null;
  }
}

function addDaysSafely(date, numDays) {
  if (date === null || date === undefined || !(date instanceof Date) || isNaN(date.getTime())) return null;
  try {
    var result = new Date(date);
    result.setTime(result.getTime() + (numDays * 24 * 60 * 60 * 1000));
    if (isNaN(result.getTime())) return null;
    return result;
  } catch (e) {
    return null;
  }
}

function setTimeTo9AM(date) {
  if (date === null || date === undefined || !(date instanceof Date) || isNaN(date.getTime())) return null;
  try {
    var dateStr = Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
    var result = new Date(dateStr + 'T09:00:00');
    var offset = getTimezoneOffset(result);
    result = new Date(result.getTime() + offset);
    if (isNaN(result.getTime())) return null;
    return result;
  } catch (e) {
    return null;
  }
}

function getTimezoneOffset(date) {
  var utcDate = new Date(Utilities.formatDate(date, 'UTC', "yyyy-MM-dd'T'HH:mm:ss"));
  var tzDate = new Date(Utilities.formatDate(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss"));
  return utcDate.getTime() - tzDate.getTime();
}

function getHourInTimezone(date) {
  var hourStr = Utilities.formatDate(date, TIMEZONE, 'H');
  return parseInt(hourStr, 10);
}

function getMinuteInTimezone(date) {
  var minStr = Utilities.formatDate(date, TIMEZONE, 'm');
  return parseInt(minStr, 10);
}

function getDayOfWeekInTimezone(date) {
  var dayStr = Utilities.formatDate(date, TIMEZONE, 'u');
  return parseInt(dayStr, 10);
}

function findSlot(eventTitle, durationMinutes, startDate, endDate, calendarIds, guestEmails) {
  if (!eventTitle) throw new Error('Event title is required');
  if (!durationMinutes || durationMinutes <= 0) throw new Error('Valid duration required');
  if (!startDate || !(startDate instanceof Date) || isNaN(startDate.getTime())) throw new Error('Invalid startDate');
  if (!endDate || !(endDate instanceof Date) || isNaN(endDate.getTime())) throw new Error('Invalid endDate');
  if (!calendarIds || calendarIds.length === 0) throw new Error('No calendarIds provided');
  if (!guestEmails) throw new Error('guestEmails required');

  var calendar = CalendarApp.getDefaultCalendar();
  if (!calendar) throw new Error("Cannot access calendar");

  var durationMs = durationMinutes * 60 * 1000;
  var busyPeriods = [];

  var events = calendar.getEvents(startDate, endDate);
  for (var ev = 0; ev < events.length; ev++) {
    var evStart = events[ev].getStartTime();
    var evEnd = events[ev].getEndTime();
    if (evStart && !isNaN(evStart.getTime()) && evEnd && !isNaN(evEnd.getTime())) {
      busyPeriods.push({ start: evStart.getTime(), end: evEnd.getTime() });
    }
  }

  busyPeriods.sort(function(a, b) { return a.start - b.start; });

  var currentTime = startDate.getTime();
  var endTime = endDate.getTime();

  while (currentTime + durationMs <= endTime) {
    if (isNaN(currentTime)) {
      currentTime = startDate.getTime();
      continue;
    }

    var currentDate = createValidDate(currentTime);
    if (currentDate === null || isNaN(currentDate.getTime())) {
      currentTime += 30 * 60 * 1000;
      continue;
    }

    var hours = getHourInTimezone(currentDate);
    var minutes = getMinuteInTimezone(currentDate);
    var dayOfWeek = getDayOfWeekInTimezone(currentDate);

    if (safeIsHoliday(currentDate)) {
      var nextDay = addDaysSafely(currentDate, 1);
      if (nextDay === null) { currentTime += 30 * 60 * 1000; continue; }
      var nextDayAt9 = setTimeTo9AM(nextDay);
      if (nextDayAt9 === null) { currentTime += 30 * 60 * 1000; continue; }
      currentTime = nextDayAt9.getTime();
      if (isNaN(currentTime)) currentTime = startDate.getTime();
      continue;
    }

    if (minutes !== 0 && minutes !== 30) {
      currentTime += (30 - (minutes % 30)) * 60000;
      continue;
    }

    if (dayOfWeek >= 1 && dayOfWeek <= 5 && hours >= 9 && (hours + durationMinutes / 60) <= 16) {
      var slotStart = currentTime;
      var slotEnd = currentTime + durationMs;

      var overlaps = false;
      for (var b = 0; b < busyPeriods.length; b++) {
        if (slotStart < busyPeriods[b].end && slotEnd > busyPeriods[b].start) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        var dayStart = new Date(slotStart);
        dayStart.setHours(0, 0, 0, 0);
        var dayEnd = new Date(slotStart);
        dayEnd.setHours(23, 59, 59, 999);

        var skipDay = false;
        if (calendar.getEvents(dayStart, dayEnd).length >= 6) {
          skipDay = true;
        }

        if (skipDay) {
          var nd = addDaysSafely(currentDate, 1);
          if (nd === null) { currentTime += 30 * 60 * 1000; continue; }
          var nd9 = setTimeTo9AM(nd);
          if (nd9 === null) { currentTime += 30 * 60 * 1000; continue; }
          currentTime = nd9.getTime();
          if (isNaN(currentTime)) currentTime = startDate.getTime();
          continue;
        }

        var event = calendar.createEvent(
          eventTitle,
          new Date(slotStart),
          new Date(slotEnd),
          { guests: guestEmails.join(','), sendInvites: true }
        );
        return event;
      }
    }
    currentTime += 30 * 60 * 1000;
  }
  throw new Error("No available time slot found");
}

function doGet(e) {
  return handleRequest(e.parameter || {});
}

function doPost(e) {
  try {
    return handleRequest(JSON.parse(e.postData.contents));
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function handleRequest(params) {
  try {
    if (!params.eventTitle) throw new Error("Missing eventTitle");

    var seEmail = SE_EMAIL;
    var allEmails = [seEmail];
    var incoming = params.emails || null;

    if (incoming) {
      if (typeof incoming === "string") {
        var parts = incoming.split(/[,;]/);
        for (var i = 0; i < parts.length; i++) {
          var trimmed = parts[i].replace(/^\s+|\s+$/g, '');
          if (trimmed && trimmed.indexOf("@") !== -1) allEmails.push(trimmed);
        }
      } else if (incoming && incoming.length) {
        for (var j = 0; j < incoming.length; j++) {
          var item = incoming[j];
          if (typeof item === "string" && item.indexOf("@") !== -1) {
            allEmails.push(item.replace(/^\s+|\s+$/g, ''));
          } else if (item && item.email) {
            allEmails.push(String(item.email).replace(/^\s+|\s+$/g, ''));
          }
        }
      }
    }

    var uniqueEmails = [];
    for (var u = 0; u < allEmails.length; u++) {
      if (uniqueEmails.indexOf(allEmails[u]) === -1) uniqueEmails.push(allEmails[u]);
    }

    var startDate = addDaysSafely(new Date(), 28);
    if (startDate === null) throw new Error("Failed to create startDate");

    var endDate = addDaysSafely(new Date(), 42);
    if (endDate === null) throw new Error("Failed to create endDate");

    var event = findSlot(
      params.eventTitle,
      30,
      startDate,
      endDate,
      [seEmail],
      uniqueEmails
    );

    var formattedStart = formatDate(event.getStartTime());

    // Create Gmail draft for the SE to send to the brand
    var brandName = params.eventTitle.replace(/^Brand Call:\s*/i, '');
    var subject = "Your onboarding call with Frontrow — " + brandName;
    var body =
      "Hi,\n\n" +
      "We've scheduled an onboarding call for " + brandName + " on " + formattedStart + ".\n\n" +
      "If that time doesn't work, you're also welcome to join one of our upcoming webinars instead:\n" +
      WEBINAR_LINK + "\n\n" +
      "Let us know if you have any questions!\n\n" +
      "Best,\n" +
      "[Your name]";

    GmailApp.createDraft("", subject, body);

    return jsonResponse({
      success: true,
      eventId: event.getId(),
      eventTitle: event.getTitle(),
      start: formattedStart,
      end: formatDate(event.getEndTime())
    });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
