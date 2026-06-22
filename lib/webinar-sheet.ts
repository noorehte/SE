// Appends a brand row to the "Brands We Need to Schedule" sheet
// via a Google Apps Script web app deployed on the spreadsheet.
// Set WEBINAR_SHEET_SCRIPT_URL in your Vercel env vars after deploying
// the companion webinar-sheet-script.js to the Google Sheet.

const SCRIPT_URL = process.env.WEBINAR_SHEET_SCRIPT_URL!;

export async function addToWebinarSheet(
  brandName: string,
  seName: string,
  segment: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!SCRIPT_URL) {
    return { success: false, error: "WEBINAR_SHEET_SCRIPT_URL env var not set" };
  }

  try {
    const initial = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandName, seName, segment: segment ?? "Unknown" }),
      redirect: "manual",
    });

    const redirectUrl = initial.headers.get("location");
    if (!redirectUrl) {
      return { success: false, error: "No redirect from script — check deployment" };
    }

    const res = await fetch(redirectUrl);
    if (!res.ok) {
      return { success: false, error: `Script echo returned HTTP ${res.status}` };
    }

    const json = await res.json();
    if (!json.success) {
      return { success: false, error: json.error ?? "Script returned success: false" };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
