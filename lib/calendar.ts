const SE_SCRIPT_URLS: Record<string, string> = {
  mohammad:
    "https://script.google.com/macros/s/AKfycbwuXvj1j_stcoURC9NRkgBnlHFpILbcGDx-29Chf62QnNdU0Sasrizhwz9H-lUlZPoT/exec",
  noor: "https://script.google.com/macros/s/AKfycby1XI41t9p0IKRY9IctcYx47UG46ne4HcHJFqapGINW_UVbAoDrp0264X3QeHaPWspPLQ/exec",
  naumaan:
    "https://script.google.com/macros/s/AKfycbwH6NxKRxwXVVuZy0yP-YEuc5DiH7PpSk_Df69PzHrF-wxmLwNicq0gzqbn891u_zbT7g/exec",
  maha: "https://script.google.com/macros/s/AKfycbxARcvm02RO3GQqx56bt3emAQw0_NufXzJ3n7Kfy2ufzClgtbqXdIH_B77n8aJtgK4BZA/exec",
};

export function getScriptUrl(seOwner: string): string | null {
  return SE_SCRIPT_URLS[seOwner.toLowerCase()] ?? null;
}

export async function scheduleCall(
  seOwner: string,
  brandName: string,
  contactEmails: string[] = []
): Promise<{ success: boolean; scheduledDate?: string; error?: string }> {
  const url = getScriptUrl(seOwner);
  if (!url) {
    return { success: false, error: `No script URL configured for SE: ${seOwner}` };
  }

  try {
    const body: Record<string, unknown> = { eventTitle: `Brand Call: ${brandName}` };
    if (contactEmails.length > 0) body.emails = contactEmails.join(",");

    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" }, // GAS requires text/plain for doPost
      body: JSON.stringify(body),
    });

    const text = await res.text();

    if (!text) {
      return { success: false, error: `Empty response from script (HTTP ${res.status})` };
    }

    let json: { success: boolean; start?: string; error?: string };
    try {
      json = JSON.parse(text);
    } catch {
      return { success: false, error: `Non-JSON response: ${text.slice(0, 300)}` };
    }

    if (!json.success) {
      return { success: false, error: json.error ?? "Script returned success: false" };
    }

    return { success: true, scheduledDate: json.start };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
