const SE_SCRIPT_URLS: Record<string, string> = {
  mohammad:
    "https://script.google.com/macros/s/AKfycbyEfOxn_Nb1GplpkeWveq4PM0sOGuQI0c0vflUVbcYiqmirwgZfx4j1HYAwQkRm0Mg7/exec",
  noor: "https://script.google.com/macros/s/AKfycbzWCiruRK-7kMcZLY0LZ_OlVr5hw09yL5-_8g1QtnXIOQMeoOuQhP5zSs5EOX4Q_-BSIw/exec",
  naumaan:
    "https://script.google.com/macros/s/AKfycbzRwOraB7unb6K0VnPO6Vv6LoVzDPa5An7f4JDf3If8ret7z5dfAPFTuok3Ou5ETRJuUw/exec",
  maha: "https://script.google.com/macros/s/AKfycbyQ5KHK9YynGeomJqBIZCbUqpgYShpabCefxPlFoZSvSFY6Eg0S8L9_fwqPLTqmGA1kMw/exec",
};

export function getScriptUrl(seOwner: string): string | null {
  return SE_SCRIPT_URLS[seOwner.toLowerCase()] ?? null;
}

export async function scheduleCall(
  seOwner: string,
  brandName: string
): Promise<{ success: boolean; scheduledDate?: string; error?: string }> {
  const url = getScriptUrl(seOwner);
  if (!url) {
    return { success: false, error: `No script URL configured for SE: ${seOwner}` };
  }

  try {
    const params = new URLSearchParams({
      eventTitle: `Brand Call: ${brandName}`,
    });

    const res = await fetch(`${url}?${params}`, {
      method: "GET",
      redirect: "follow",
    });

    if (!res.ok) {
      return { success: false, error: `Script returned HTTP ${res.status}` };
    }

    const json = await res.json();
    if (!json.success) {
      return { success: false, error: json.error ?? "Script returned success: false" };
    }

    return { success: true, scheduledDate: json.start };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
