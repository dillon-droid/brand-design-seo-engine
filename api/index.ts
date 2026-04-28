import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const result: Record<string, unknown> = { ok: true, tests: {} as Record<string, string> };
  const tests = result.tests as Record<string, string>;

  for (const [name, fn] of [
    ["./lib/db/schema", () => import("./lib/db/schema")],
    ["./lib/db/client", () => import("./lib/db/client")],
    ["./lib/lib/auth", () => import("./lib/lib/auth")],
    ["./lib/lib/ai", () => import("./lib/lib/ai")],
    ["./lib/lib/gsc", () => import("./lib/lib/gsc")],
    ["./lib/app", () => import("./lib/app")],
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
