import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const result: Record<string, unknown> = { ok: true, tests: {} as Record<string, string> };
  const tests = result.tests as Record<string, string>;

  for (const [name, fn] of [
    ["zod", () => import("zod")],
    ["hono", () => import("hono")],
    ["drizzle-orm", () => import("drizzle-orm")],
    ["@neondatabase/serverless", () => import("@neondatabase/serverless")],
    ["bcryptjs", () => import("bcryptjs")],
    ["googleapis", () => import("googleapis")],
    ["@google/genai", () => import("@google/genai")],
    ["./_server/db/schema", () => import("./_server/db/schema")],
    ["./_server/lib/auth", () => import("./_server/lib/auth")],
    ["./_server/lib/ai", () => import("./_server/lib/ai")],
    ["./_server/lib/gsc", () => import("./_server/lib/gsc")],
    ["./_server/app", () => import("./_server/app")],
  ] as const) {
    try {
      await fn();
      tests[name] = "ok";
    } catch (e) {
      tests[name] = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
  }
  res.status(200).json(result);
}
