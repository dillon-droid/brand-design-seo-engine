import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "./lib/app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const protocol = (req.headers["x-forwarded-proto"] as string) || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const url = `${protocol}://${host}${req.url || "/"}`;

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach((vv) => headers.append(k, vv));
      else if (typeof v === "string") headers.set(k, v);
    }

    let body: BodyInit | undefined;
    if (req.method && req.method !== "GET" && req.method !== "HEAD") {
      if (req.body && typeof req.body === "object") {
        body = JSON.stringify(req.body);
        if (!headers.has("content-type")) headers.set("content-type", "application/json");
      } else if (typeof req.body === "string") {
        body = req.body;
      }
    }

    const request = new Request(url, { method: req.method, headers, body });
    const response = await app.fetch(request);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-encoding") res.setHeader(key, value);
    });
    const buf = Buffer.from(await response.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8) : undefined,
    });
  }
}
