/**
 * Updated Google Apps Script — SE Brand Call Scheduling
 *
 * SETUP (repeat for all 4 SE scripts):
 * 1. Open your Google Apps Script project
 * 2. Replace the entire existing code with this file
 * 3. Deploy → Manage deployments → Edit (pencil icon)
 * 4. Set "Who has access" → Anyone
 * 5. Click Deploy — if the URL changes, update lib/calendar.ts in the repo
 *
 * Accepts GET params:
 *   ?brandName=Acme+Corp&date=2026-07-19T10:00:00.000Z
 */

function doGet(e) {
  try {
    var params = e.parameter || {};
    var brandName = params.brandName || "Unknown Brand";
    var dateStr = params.date;

    if (!dateStr) {
      return jsonResponse({ success: false, error: "Missing required param: date" });
    }

    // Parse ISO date and set call time to 10:00 AM
    var callDate = new Date(dateStr);
    callDate.setHours(10, 0, 0, 0);
    var callEnd = new Date(callDate.getTime() + 60 * 60 * 1000); // 1 hour

    var title = "Brand Call: " + brandName;
    var description =
      "Onboarding call with " + brandName + ".\n\n" +
      "Scheduled automatically via SE Dashboard — 4 weeks after sign-up.";

    var calendar = CalendarApp.getDefaultCalendar();
    var event = calendar.createEvent(title, callDate, callEnd, {
      description: description,
    });

    return jsonResponse({
      success: true,
      eventId: event.getId(),
      title: title,
      date: callDate.toISOString(),
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
