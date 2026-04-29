// Google OAuth — per-user. Each team member connects their own Google account
// once; we store the refresh token and use it to talk to Google APIs (Search
// Console, PageSpeed, Indexing, GA4) on their behalf.
import { google, type Auth } from "googleapis";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";

type OAuth2Client = Auth.OAuth2Client;

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

// Scopes we request from the user. Read-only across Search Console + Indexing + Analytics.
export const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/indexing",
  "https://www.googleapis.com/auth/analytics.readonly",
  "openid",
  "email",
  "profile",
];

export function isOAuthConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

function redirectUri(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}/api/google/oauth/callback`;
}

export function buildClient(req: Request): OAuth2Client {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured (set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET)");
  }
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri(req));
}

export function buildAuthUrl(req: Request, state: string): string {
  const client = buildClient(req);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // ensures we always get a refresh_token
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCode(req: Request, code: string) {
  const client = buildClient(req);
  const { tokens } = await client.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date, scope, id_token }
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { email?: string };
  return j.email ?? null;
}

export async function saveTokens(
  userId: string,
  tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null; scope?: string | null },
  email: string | null,
) {
  const updates: Record<string, unknown> = {
    googleAccessToken: tokens.access_token ?? null,
    googleTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    googleScopes: tokens.scope ?? null,
    googleEmail: email,
  };
  // Only overwrite refresh_token if Google sent a new one — they may not on subsequent grants
  if (tokens.refresh_token) updates.googleRefreshToken = tokens.refresh_token;
  await db.update(schema.users).set(updates).where(eq(schema.users.id, userId));
}

export async function getUserClient(userId: string): Promise<OAuth2Client | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const user = rows[0];
  if (!user || !user.googleRefreshToken) return null;

  const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  client.setCredentials({
    access_token: user.googleAccessToken ?? undefined,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiresAt ? user.googleTokenExpiresAt.getTime() : undefined,
    scope: user.googleScopes ?? undefined,
  });

  // Auto-persist refreshed tokens back to DB
  client.on("tokens", async (newTokens) => {
    await db
      .update(schema.users)
      .set({
        googleAccessToken: newTokens.access_token ?? user.googleAccessToken,
        googleTokenExpiresAt: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
        googleScopes: newTokens.scope ?? user.googleScopes,
        ...(newTokens.refresh_token ? { googleRefreshToken: newTokens.refresh_token } : {}),
      })
      .where(eq(schema.users.id, userId));
  });

  return client;
}

export async function disconnect(userId: string) {
  await db
    .update(schema.users)
    .set({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiresAt: null,
      googleScopes: null,
      googleEmail: null,
    })
    .where(eq(schema.users.id, userId));
}

export async function getStatus(userId: string): Promise<{
  connected: boolean;
  email: string | null;
  scopes: string[];
}> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const user = rows[0];
  return {
    connected: Boolean(user?.googleRefreshToken),
    email: user?.googleEmail ?? null,
    scopes: user?.googleScopes ? user.googleScopes.split(" ") : [],
  };
}
