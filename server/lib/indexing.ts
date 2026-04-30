// Google Indexing API — tells Google a URL has been added or updated so it
// re-crawls quickly. Officially supported for JobPosting + BroadcastEvent
// content types but works for general pages in practice for many sites.
// Requires the user's OAuth token (auth/indexing scope, which we request).
import { google, type Auth } from "googleapis";

type OAuth2Client = Auth.OAuth2Client;

export type IndexingNotificationType = "URL_UPDATED" | "URL_DELETED";

export type IndexingResult = {
  url: string;
  type: IndexingNotificationType;
  notifiedAt: string | null;
  ok: boolean;
};

export async function notifyIndexing({
  auth,
  url,
  type = "URL_UPDATED",
}: {
  auth: OAuth2Client;
  url: string;
  type?: IndexingNotificationType;
}): Promise<IndexingResult> {
  const indexing = google.indexing({ version: "v3", auth });
  const { data } = await indexing.urlNotifications.publish({
    requestBody: { url, type },
  });
  return {
    url,
    type,
    notifiedAt: data.urlNotificationMetadata?.latestUpdate?.notifyTime ?? null,
    ok: true,
  };
}
