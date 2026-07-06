// Per-SE display info used when personalizing onboarding-call emails.
// meetingLink is each SE's own HubSpot booking page, used for the
// "check availability here" reschedule link in the draft email.

export interface SEInfo {
  displayName: string;
  meetingLink: string;
}

export const SE_INFO: Record<string, SEInfo> = {
  mohammad: { displayName: "Mohammad", meetingLink: "https://meetings-na2.hubspot.com/mohammad-obeid" },
  noor: { displayName: "Noor", meetingLink: "https://meetings-na2.hubspot.com/nehtesham/noor-meeting-link" },
  naumaan: { displayName: "Naumaan", meetingLink: "https://meetings-na2.hubspot.com/naumaan" },
  maha: { displayName: "Maha", meetingLink: "https://meetings.hubspot.com/maha-awaisi" },
};

export function getSEInfo(seOwner: string): SEInfo {
  const key = seOwner.toLowerCase();
  return (
    SE_INFO[key] ?? {
      displayName: seOwner.charAt(0).toUpperCase() + seOwner.slice(1).toLowerCase(),
      meetingLink: "",
    }
  );
}
