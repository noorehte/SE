/**
 * Google Apps Script — Webinar Sheet Row Appender
 *
 * SETUP:
 * 1. Open the spreadsheet: https://docs.google.com/spreadsheets/d/1zWuVZwYSuAHV9gLH2wKmnDNJew_9fCK2-YDLt4KhMxU
 * 2. Extensions → Apps Script
 * 3. Paste this entire file, replacing any existing code
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the deployment URL
 * 6. Add it to Vercel env vars as: WEBINAR_SHEET_SCRIPT_URL
 *
 * Accepts GET with query params: ?brandName=...&seName=...&segment=...
 * Appends a row to "Brands We Need to Schedule" sheet.
 */

var SHEET_NAME = "Brands We Need to Schedule";

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
    var brandName = params.brandName || "";
    var seName = params.seName || "";
    var segment = params.segment || "";

    if (!brandName) {
      return jsonResponse({ success: false, error: "Missing brandName" });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: "Sheet not found: " + SHEET_NAME });
    }

    // Columns: Brand Name, SE Name, Segment, Onboarding Portal?, Call/Webinar Sent Date,
    //          Registered?, Attended Date, SE Notes, AM Notes Post Webinar
    sheet.appendRow([
      brandName,
      seName,
      segment,
      "Yes",   // Onboarding Portal? — came through the portal
      "",      // Call / Webinar Sent Date — Mohammad to fill in
      "FALSE", // Registered?
      "",      // Attended Date
      "",      // SE Notes
      "",      // AM Notes Post Webinar
    ]);

    return jsonResponse({ success: true, brandName: brandName });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
