// Schedules SE onboarding calls directly against Google Calendar + Gmail via
// OAuth, using each SE's own connected Google account (see lib/google-auth.ts).
//
// This replaces the old approach of POSTing to a personal Apps Script
// deployment per SE (google-apps-script.js) — that required each SE to
// manually re-authorize the script in the Apps Script editor and re-deploy
// every time a new scope (like Gmail) was added. With real OAuth, an SE
// connects once via /api/auth/google/login and everything (including the
// daily cron) works off the stored refresh token from then on.
//
// Slot-finding logic (business hours, holidays, max meetings/day) is ported
// as-is from the old findSlot() function in google-apps-script.js.

import { google } from "googleapis";
import { DateTime } from "luxon";
import { getAuthorizedClient } from "@/lib/google-auth";
import { createGmailDraft } from "@/lib/gmail";
import { getSEInfo } from "@/lib/se-info";
import { buildOnboardingCallEmail } from "@/lib/email-templates";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const TIMEZONE = "America/Los_Angeles";
const MAX_EVENTS_PER_DAY = 6;
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 16;

const HOLIDAYS = [
  // 2025
  "2025-01-01", "2025-01-20", "2025-02-17", "2025-05-26", "2025-06-19",
  "2025-07-04", "2025-09-01", "2025-10-13", "2025-11-11", "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
];

interface Slot {
  start: Date;
  end: Date;
}

function partsInTZ(date: Date) {
  const dt = DateTime.fromJSDate(date).setZone(TIMEZONE);
  return {
    dateStr: dt.toFormat("yyyy-LL-dd"),
    hour: dt.hour,
    minute: dt.minute,
    weekday: dt.weekday, // 1 = Monday ... 7 = Sunday
  };
}

function nextDayAt9AM(date: Date): Date {
  return DateTime.fromJSDate(date)
    .setZone(TIMEZONE)
    .plus({ days: 1 })
    .set({ hour: BUSINESS_START_HOUR, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();
}

async function findAvailableSlot(
  auth: OAuth2Client,
  durationMinutes: number,
  startDate: Date,
  endDate: Date
): Promise<Slot | null> {
  const calendar = google.calendar({ version: "v3", auth });

  const [freebusyRes, eventsRes] = await Promise.all([
    calendar.freebusy.query({
      requestBody: {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: [{ id: "primary" }],
      },
    }),
    calendar.events.list({
      calendarId: "primary",
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      maxResults: 2500,
    }),
  ]);

  const busyPeriods = (freebusyRes.data.calendars?.primary?.busy ?? [])
    .map((b) => ({ start: new Date(b.start!).getTime(), end: new Date(b.end!).getTime() }))
    .sort((a, b) => a.start - b.start);

  // Used to enforce "skip days that already have 6+ meetings," same as the
  // original Apps Script's calendar.getEvents(dayStart, dayEnd).length >= 6 check.
  const eventsByDay = new Map<string, number>();
  for (const ev of eventsRes.data.items ?? []) {
    const startStr = ev.start?.dateTime ?? ev.start?.date;
    if (!startStr) continue;
    const dateStr = partsInTZ(new Date(startStr)).dateStr;
    eventsByDay.set(dateStr, (eventsByDay.get(dateStr) ?? 0) + 1);
  }

  const durationMs = durationMinutes * 60 * 1000;
  let current = startDate.getTime();
  const endMs = endDate.getTime();

  while (current + durationMs <= endMs) {
    const currentDate = new Date(current);
    const { dateStr, hour, minute, weekday } = partsInTZ(currentDate);

    if (HOLIDAYS.includes(dateStr)) {
      current = nextDayAt9AM(currentDate).getTime();
      continue;
    }

    if (minute !== 0 && minute !== 30) {
      current += (30 - (minute % 30)) * 60000;
      continue;
    }

    const isWeekday = weekday >= 1 && weekday <= 5;
    const fitsInBusinessHours = hour >= BUSINESS_START_HOUR && hour + durationMinutes / 60 <= BUSINESS_END_HOUR;

    if (isWeekday && fitsInBusinessHours) {
      const slotStart = current;
      const slotEnd = current + durationMs;
      const overlaps = busyPeriods.some((b) => slotStart < b.end && slotEnd > b.start);

      if (!overlaps) {
        if ((eventsByDay.get(dateStr) ?? 0) >= MAX_EVENTS_PER_DAY) {
          current = nextDayAt9AM(currentDate).getTime();
          continue;
        }

        return { start: new Date(slotStart), end: new Date(slotEnd) };
      }
    }

    current += 30 * 60 * 1000;
  }

  return null;
}

export async function scheduleCall(
  seOwner: string,
  brandName: string,
  contactEmails: string[] = []
): Promise<{ success: boolean; scheduledDate?: string; error?: string; authUrl?: string }> {
  const auth = await getAuthorizedClient(seOwner);

  if (!auth) {
    return {
      success: false,
      error: `${seOwner} hasn't connected their Google account yet`,
      authUrl: "/api/auth/google/login",
    };
  }

  try {
    const startDate = DateTime.now().plus({ days: 28 }).toJSDate();
    const endDate = DateTime.now().plus({ days: 42 }).toJSDate();

    const slot = await findAvailableSlot(auth, 30, startDate, endDate);
    if (!slot) {
      return { success: false, error: "No available time slot found" };
    }

    const uniqueEmails = Array.from(
      new Set(contactEmails.map((e) => e.trim()).filter((e) => e.includes("@")))
    );

    // Intentionally no `attendees` here — the SE adds contacts to the calendar
    // invite themselves once they've reviewed the draft email below.
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: `Brand Call: ${brandName}`,
        start: { dateTime: slot.start.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: slot.end.toISOString(), timeZone: TIMEZONE },
      },
    });

    const formattedStart = DateTime.fromJSDate(slot.start)
      .setZone(TIMEZONE)
      .toFormat("EEEE, LLLL d, yyyy 'at' h:mm a ZZZZ");

    // Create a Gmail draft for the SE to review and send. Every SE gets the same
    // "Welcome to FrontrowMD" template — brand name, SE name/title, scheduled
    // time, and the SE's own booking link are filled in automatically.
    const draftTo = uniqueEmails[0];
    if (draftTo) {
      const seInfo = getSEInfo(seOwner);
      const { subject, html } = buildOnboardingCallEmail({
        brandName,
        seName: seInfo.displayName,
        formattedStart,
        meetingLink: seInfo.meetingLink,
      });

      await createGmailDraft(auth, draftTo, subject, html).catch((err) => {
        console.error(`Failed to create Gmail draft for ${brandName}:`, err);
      });
    }

    return { success: true, scheduledDate: formattedStart };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
