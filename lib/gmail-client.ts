import { google, type gmail_v1 } from "googleapis";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。`);
  }
  return value;
}

export function createGmailClient(): gmail_v1.Gmail {
  const oauth2Client = new google.auth.OAuth2(
    getEnv("GMAIL_CLIENT_ID"),
    getEnv("GMAIL_CLIENT_SECRET")
  );
  oauth2Client.setCredentials({
    refresh_token: getEnv("GMAIL_REFRESH_TOKEN"),
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export type CardEmail = {
  id: string;
  from: string;
  subject: string;
  bodyText: string;
  receivedAt: Date;
};

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(tr|p|div|td)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function extractBodyText(
  payload: gmail_v1.Schema$MessagePart | undefined
): string {
  if (!payload) {
    return "";
  }

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    const plainPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plainPart?.body?.data) {
      return decodeBase64Url(plainPart.body.data);
    }

    const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      return stripHtml(decodeBase64Url(htmlPart.body.data));
    }

    for (const part of payload.parts) {
      const nested = extractBodyText(part);
      if (nested) {
        return nested;
      }
    }
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }

  return "";
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  const header = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? "";
}

export async function searchCardEmails(
  gmail: gmail_v1.Gmail,
  senderAddresses: string[]
): Promise<CardEmail[]> {
  const fromQuery = senderAddresses.map((addr) => `from:${addr}`).join(" OR ");
  const query = `(${fromQuery}) newer_than:1d`;

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 50,
  });

  const messageIds = (listResponse.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));

  const results = await Promise.all(
    messageIds.map(async (id): Promise<CardEmail> => {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });

      const headers = detail.data.payload?.headers;
      const from = getHeader(headers, "From");
      const subject = getHeader(headers, "Subject");
      const bodyText = extractBodyText(detail.data.payload);
      const receivedAt = detail.data.internalDate
        ? new Date(Number(detail.data.internalDate))
        : new Date();

      return { id, from, subject, bodyText, receivedAt };
    })
  );

  return results;
}
