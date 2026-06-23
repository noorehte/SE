const SE_SCRIPT_URLS: Record<string, string> = {
  mohammad:
    "https://script.google.com/macros/s/AKfycbyqfDKpqiUy4RsxVbcl6VZQ-W7ov80DMlW7Nii0jKZSpeuofN7u4HVmbC-o2MSwhNn7/exec",
  noor: "https://script.google.com/macros/s/AKfycbwh_2lvCzU1AGNLDX5KMhh5SQoqujxzog1zCE_kItVH7tAR-WD5gmbDVzMuYSUyr2qAxQ/exec",
  naumaan:
    "https://script.google.com/macros/s/AKfycbxUHl1cs5pCmlI5ZToTyIG30Riub979c6xm1WMEwXzj7auxMNO6XVdfe8EAqzTS3IF6sA/exec",
  maha: "https://script.google.com/macros/s/AKfycbwmiFil4O5VwwgWweoioRevTbL7wyOUk_E9UUHoV1xl7QeBNCFbiBQMjxs2f5n4xyakHw/exec",
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
