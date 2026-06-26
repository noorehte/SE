const SE_SCRIPT_URLS: Record<string, string> = {
  mohammad:
    "https://script.google.com/macros/s/AKfycbwTqgDoS9gp0B5pYbrhKbW7QTPkEY0opVCw9USIgKM8IFC9C7B47-MRJjxYmiGUGMVZ/exec",
  noor: "https://script.google.com/macros/s/AKfycbzi-sof4cYR-9R75QjBpeGnuZSYw7_sYFZ5RrKoP8nz1mvnwN4T9kgD9FVkOCUcs-jK-A/exec",
  naumaan:
    "https://script.google.com/macros/s/AKfycbw0B5OJfOFdRlv2ZB3QXixOI5aEtvOIpftffmurZubvcTNhI-A_gYzz7F2YOlEauYLjsw/exec",
  maha: "https://script.google.com/macros/s/AKfycbw_opIiYn3Q1jkdKQtdlQhV6kX8JE3Dy2FeUkevaoKiFn1ieZVH1jE1HYEUGvGogWK8RQ/exec",
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
