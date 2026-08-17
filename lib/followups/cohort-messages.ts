import type { WidgetStatus } from "./cohort-widgets";

export const MARKS = [10, 20, 30, 40] as const;
export type Mark = (typeof MARKS)[number];

const FORM_URL = "https://forms.gle/RPFcHVqm8Tk3GNee8";
const FORM_LINK = `<a href="${FORM_URL}">here</a>`;

export function buildSubject(brandName: string): string {
  return `${brandName} x FrontrowMD | Implementation Bump`;
}

// Which of the three widgets are ready-and-not-live right now, in display order.
// Reviews leads (it's the cohort's defining widget); Badge/Clinician AI only
// appear when that brand actually has them ready but not yet live.
export function outstandingWidgets(s: WidgetStatus): string[] {
  const items: string[] = [];
  if (s.reviewsReady && !s.reviewsLive) items.push("Reviews");
  if (s.badgeReady && !s.badgeLive) items.push("Badge");
  if (s.caiApproved && !s.caiLive) items.push("Clinician AI");
  return items;
}

// "Reviews" | "Reviews and Badge" | "Reviews, Badge, and Clinician AI"
export function renderList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "Reviews";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Manager-approved copy. Only the widget-list slot varies per brand/day.
// Day 10 & 20 include the draft-theme form link; Day 40 is the final touch.
const TEMPLATES: Record<Mark, (list: string) => string> = {
  10: (list) =>
    `<p>Hi Team! Congrats — your FrontrowMD ${list} are ready to go live! Just checking in to see if you've had a chance to get them added to your site? If you'd like us to implement on a draft theme for you, fill out this form ${FORM_LINK}! Let us know if you have any questions or need a hand getting them live!</p>`,
  20: (list) =>
    `<p>Hi Team! Following up again on your FrontrowMD ${list}. They're all set and ready to display on your site. We'd love to help you get them live so your customers can start seeing them. Just reply here and we'll walk you through the last steps! Of course, if you'd like us to implement on a draft theme for you, fill out this form ${FORM_LINK}!</p>`,
  30: (list) =>
    `<p>Hi Team! Just circling back on your FrontrowMD ${list}. We noticed they aren't live on your site yet. They're ready to go whenever you are, and we're happy to help you get them added. Let us know if you have any questions!</p>`,
  40: (list) =>
    `<p>Hi Team! We've reached out a few times about getting your ${list} live. We'd still love to help, but this will be our last follow-up for now. Please don't hesitate to reach out whenever you're ready and we'll pick things right back up.</p>`,
};

export function buildBody(mark: Mark, status: WidgetStatus): string {
  return TEMPLATES[mark](renderList(outstandingWidgets(status)));
}
