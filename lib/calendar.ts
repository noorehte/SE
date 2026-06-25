const SE_SCRIPT_URLS: Record<string, string> = {
  mohammad:
    "https://script.google.com/macros/s/AKfycbxGPVa4AsQ3HaCeGIe28jNh-WBU5PPp2FmM4cf0ht-pmaMgvUsQjlqb5t6qjvNduucg/exec",
  noor: "https://script.google.com/macros/s/AKfycbyU_RR_oZRw9Zuds2qfJkz6saqVsJ3pzx2z7muiE6TZxvJySrwFmOVzL7ZuId1_i1MdNg/exec",
  naumaan:
    "https://script.google.com/macros/s/AKfycbw1CpQr3wat7v9X7aXxsPsK7mG-oWK17dmuzdH3Mt2yr0zQ9lQ5-KtnmrykhE8-MLFkfg/exec",
  maha: "https://script.google.com/macros/s/AKfycbwl7vki8oMRE-GMyPstxYOxRkXaxXsYGfjN5EIzAdVTWm9eJ3db1Vr6-sG3vPrXX7TRUQ/exec",
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
    const params = new URLSearchParams({
      eventTitle: `Brand Call: ${brandName}`,
      ...(contactEmails.length > 0 && { emails: contactEmails.join(",") }),
    });

    const res = await fetch(`${url}?${params}`, {
      method: "GET",
      redirect: "follow",
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
