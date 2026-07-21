import { SNIPPET_LABEL, type Snippet } from "./detect";

export const MARKS = [10, 20, 30, 40] as const;
export type Mark = (typeof MARKS)[number];

export function buildSubject(brandName: string): string {
  return `${brandName} x FrontrowMD | Implementation Bump`;
}

// Grammatical list join for the [variable] slot:
//   ["Badge"]                     -> "Badge"
//   ["Badge","Reviews"]           -> "Badge and Reviews"
//   ["Badge","Reviews","Clinician Analysis"] -> "Badge, Reviews, and Clinician Analysis"
export function renderVariable(snippets: Snippet[]): string {
  const labels = snippets.map((s) => SNIPPET_LABEL[s]);
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

// Naumaan's language, with subject/verb and it/them agreement resolved so it
// reads correctly whether one snippet or several are ready. Only the {v} slot
// and the agreement words vary; the wording is otherwise verbatim. Day 40 has
// no variable (uses "your widgets").
const TEMPLATES: Record<Mark, (v: string, plural: boolean) => string> = {
  10: (v, plural) =>
    `Hi,<br><br>Congrats, your FrontrowMD ${v} ${plural ? "are" : "is"} ready to go live! Just checking in to see if you've had a chance to get ${plural ? "them" : "it"} added to your site. Let us know if you have any questions or need a hand getting ${plural ? "them" : "it"} live!`,
  20: (v, plural) =>
    `Hi,<br><br>Following up again on your FrontrowMD ${v}. ${plural ? "They're" : "It's"} all set and ready to display on your site. We'd love to help you get ${plural ? "them" : "it"} live so your customers can start seeing ${plural ? "them" : "it"}. Just reply here and we'll walk you through the last steps!`,
  30: (v, plural) =>
    `Hi,<br><br>Just circling back on your FrontrowMD ${v}. We noticed ${plural ? "they aren't" : "it isn't"} live on your site yet. ${plural ? "They're" : "It's"} ready to go whenever you are, and we're happy to help you get ${plural ? "them" : "it"} added. Let us know if you have any questions!`,
  40: () =>
    `Hi,<br><br>We've reached out a few times about getting your widgets live. We'd still love to help, but this will be our last follow-up for now. Please don't hesitate to reach out whenever you're ready and we'll pick things right back up.`,
};

// The plain follow-up text (what would go to the brand).
export function buildFollowupBody(mark: Mark, outstanding: Snippet[]): string {
  return TEMPLATES[mark](renderVariable(outstanding), outstanding.length > 1);
}

// One-off follow-up sent on an SE-scheduled date (brand said "not ready until
// later"). Deliberately widget-agnostic — no variable.
export function buildSnoozeBody(): string {
  return `Hi,<br><br>Just wanted to check in to see if you were able to get those widgets live? Let us know if we can help here!`;
}
