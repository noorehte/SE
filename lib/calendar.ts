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
