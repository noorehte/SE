// HTML template for the onboarding-call confirmation draft, matching the
// "Welcome to FrontrowMD" design every SE should send. Only the brand name,
// SE name, scheduled time, and SE's own meeting link change between sends —
// the Implementation Deck / Brand Kit links are the same for every brand.

const IMPLEMENTATION_DECK_LINK =
  "https://www.figma.com/proto/cHT672xSwY6w1kjHHtw8Cs/Client-Solutions-Deck?node-id=6272-301";
const BRAND_KIT_LINK = "https://frontrowmd.notion.site/FrontrowMD-Brand-Starter-Kit-1d2cbf3b26ab80a3a35fd185e8ed65ec";

const NAVY = "#16283f";
const ACCENT_BLUE = "#4a90d9";
const LINK_BLUE = "#2563a8";
const MUTED = "#8a8f98";
const BORDER = "#e2e5e9";

function numberedItem(n: number, title: string, bodyHtml: string): string {
  return `
    <tr>
      <td style="padding:${n === 1 ? "14" : "16"}px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="24" valign="top" style="padding-right:12px;">
            <table cellpadding="0" cellspacing="0" role="presentation"><tr>
              <td width="24" height="24" align="center" valign="middle" style="background:${NAVY};border-radius:50%;color:#ffffff;font-size:12px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${n}</td>
            </tr></table>
          </td>
          <td style="font-size:14px;color:#222222;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">
            <strong>${title}</strong><br/>
            ${bodyHtml}
          </td>
        </tr></table>
      </td>
    </tr>`;
}

function sectionLabel(label: string): string {
  return `
    <tr>
      <td style="padding:20px 32px 0 32px;color:${MUTED};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">${label}</td>
    </tr>`;
}

function divider(): string {
  return `<tr><td style="padding:20px 32px 0 32px;"><hr style="border:none;border-top:1px solid #e8eaed;margin:0;"/></td></tr>`;
}

export function buildOnboardingCallEmail({
  brandName,
  seName,
  formattedStart,
  meetingLink,
  leadTimeWeeks = 4,
}: {
  brandName: string;
  seName: string;
  formattedStart: string;
  meetingLink: string;
  leadTimeWeeks?: number;
}): { subject: string; html: string } {
  const subject = `Your onboarding call with Frontrow - ${brandName}`;

  const rescheduleLine = meetingLink
    ? `Need to reschedule? Due to high volume, our next available slots are ~${leadTimeWeeks} weeks out — check availability <a href="${meetingLink}" style="color:${LINK_BLUE};">here</a>.`
    : `Need to reschedule? Due to high volume, our next available slots are ~${leadTimeWeeks} weeks out — just reply to this email and we'll find a new time.`;

  const html = `
<div style="background:#eef0f3;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="536" align="center" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:6px;overflow:hidden;border:1px solid ${BORDER};">
    <tr>
      <td style="background:${NAVY};padding:24px 32px;border-bottom:3px solid ${ACCENT_BLUE};">
        <span style="color:#ffffff;font-size:20px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Welcome to FrontrowMD</span>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px 8px 32px;color:#222222;font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">
        Hi <strong>${brandName}</strong> Team,<br/><br/>
        I'm <strong>${seName}</strong>, your Solutions Engineer at FrontrowMD. I can't wait to help you get set up!
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px 0 32px;">
        <div style="background:${NAVY};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:8px 14px;border-radius:4px 4px 0 0;font-family:Arial,Helvetica,sans-serif;">Your Onboarding</div>
        <div style="border:1px solid ${BORDER};border-top:none;padding:16px 18px;border-radius:0 0 4px 4px;font-size:14px;line-height:1.6;color:#222222;font-family:Arial,Helvetica,sans-serif;">
          Scheduled for <strong>${formattedStart}</strong><br/><br/>
          ${rescheduleLine}<br/><br/>
          We're using this lead time to obtain product approvals, generate 200+ Clinician Shares, and ideally finish your Clinician reviews — so we can <strong>launch with our best foot forward</strong>.
        </div>
      </td>
    </tr>

    ${divider()}
    ${sectionLabel("Things That Help Us Move Fast")}
    ${numberedItem(
      1,
      "Shopify Collaborator Code",
      `If you're on Shopify, send over your collaborator code (<em>Settings &gt; Users &gt; Security</em>). We'll use it to duplicate your main theme and add our badges to that <strong>draft theme</strong> — so you can preview exactly how everything looks on your PDP before anything goes live. Separately, if you are requesting Clinician AI, we'll also install our <strong>custom pixel</strong> to track ROI from the widget.`
    )}
    ${numberedItem(
      2,
      "HTML-Based Editor",
      `If you're on an HTML-based editor, we'll share <strong>code snippets</strong> with you after our call to get everything implemented.`
    )}

    ${divider()}
    ${sectionLabel("Resources &amp; Attendees")}
    ${numberedItem(3, "Who to Bring", `Please invite a member from your <strong>technical/dev</strong> and <strong>marketing</strong> teams.`)}
    ${numberedItem(
      4,
      "What to Read",
      `Review the attached materials before our call:<br/><br/>
      <a href="${IMPLEMENTATION_DECK_LINK}" style="display:inline-block;border:1px solid ${NAVY};color:${NAVY};font-size:13px;font-weight:600;padding:8px 14px;border-radius:4px;text-decoration:none;margin-right:8px;">Implementation Deck &rarr;</a>
      <a href="${BRAND_KIT_LINK}" style="display:inline-block;border:1px solid ${NAVY};color:${NAVY};font-size:13px;font-weight:600;padding:8px 14px;border-radius:4px;text-decoration:none;">Brand Kit &rarr;</a>`
    )}

    <tr><td style="padding:24px 32px 0 32px;"><hr style="border:none;border-top:1px solid #e8eaed;margin:0;"/></td></tr>
    <tr>
      <td style="padding:20px 32px 28px 32px;font-size:14px;color:#222222;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">
        Any questions in the meantime? Just reply to this email.<br/><br/>
        Best,<br/>
        ${seName}<br/>
        <span style="font-size:11px;color:${MUTED};letter-spacing:0.04em;text-transform:uppercase;">Solutions Engineer &middot; FrontrowMD</span>
      </td>
    </tr>
    <tr>
      <td style="background:${NAVY};padding:14px 32px;text-align:center;">
        <span style="color:#8a94a3;font-size:11px;letter-spacing:0.08em;font-family:Arial,Helvetica,sans-serif;">FRONTROWMD</span>
      </td>
    </tr>
  </table>
</div>`;

  return { subject, html };
}
