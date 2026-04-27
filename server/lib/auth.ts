import bcrypt from "bcryptjs";
import { eq, gt, and } from "drizzle-orm";
import { db, schema } from "../db/client";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { randomBytes } from "node:crypto";

const SESSION_COOKIE = "bd_session";
const SESSION_DAYS = 30;

function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(schema.sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function getSession(id: string) {
  const now = new Date();
  const rows = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, now)))
    .limit(1);
  return rows[0] ?? null;
}

export async function destroySession(id: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
}

export async function findUserByEmail(email: string) {
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export function setSessionCookie(c: Context, sessionId: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export type AuthedUser = { id: string; email: string; name: string | null };

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export const requireAuth: MiddlewareHandler<{ Variables: { user: AuthedUser } }> = async (c, next) => {
  const id = readSessionCookie(c);
  if (!id) return c.json({ error: "Unauthorized" }, 401);
  const s = await getSession(id);
  if (!s) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", { id: s.user.id, email: s.user.email, name: s.user.name });
  await next();
};
