const SE_SCRIPT_URLS: Record<string, string> = {
  mohammad:
    "https://script.google.com/macros/s/AKfycbxA3cuEYhPzXM03vBpZNzjwh_b_gDuLVWp3fpVJGM4XonkIDNCHb9cGuqx1gbArMB-b/exec",
  noor: "https://script.google.com/macros/s/AKfycbzCO7TWOCPAutk2Tb4ITLCs8Nm3cy98hrnyxvwfMp2PxHzvHFkFmpbNxsmnlAUL0ES8Rw/exec",
  naumaan:
    "https://script.google.com/macros/s/AKfycbx8AgPQrlYB-3cqIC5yPZb3cnuPAHfhg6F8WPDTxfy6OBjX-deo3i53O-0SzRGjfyrvWQ/exec",
  maha: "https://script.google.com/macros/s/AKfycbyfIYkQgBxJzUzxe1DEG90zVG3ZjyTNe0Jodm5943__epZuu-jLKvQNKqOHzPbCKxZhHA/exec",
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
    // GAS web apps redirect on POST — follow manually to avoid
    // the redirect being converted to a GET (which hits doGet).
    const initial = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTitle: `Brand Call: ${brandName}`,
        emails: [],
      }),
      redirect: "manual",
    });

    // Follow the redirect with GET to retrieve the response content
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

    return { success: true, scheduledDate: json.start };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
