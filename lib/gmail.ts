// Gmail API helper — replaces GmailApp.createDraft() from the old
// google-apps-script.js. Uses the same OAuth2 client already authorized for
// Calendar access (lib/google-auth.ts), so no separate auth step is needed.

import { google } from "googleapis";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

// Email headers are 7-bit ASCII by spec — any non-ASCII character (e.g. an
// em dash in the subject) has to be wrapped as an RFC 2047 encoded-word,
// otherwise mail clients are free to guess the byte encoding and mangle it
// (this is what caused the "â€"" garbling in place of "—").
function encodeHeaderValue(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function encodeMessage(to: string, subject: string, htmlBody: string): string {
  const message = [
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody,
  ].join("\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createGmailDraft(auth: OAuth2Client, to: string, subject: string, htmlBody: string) {
  const gmail = google.gmail({ version: "v1", auth });

  return gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw: encodeMessage(to, subject, htmlBody) },
    },
  });
}
