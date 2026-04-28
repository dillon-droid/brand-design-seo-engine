import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const present = (name: string) => Boolean(process.env[name] && process.env[name]!.length > 0);
  res.status(200).json({
    DATABASE_URL: present("DATABASE_URL"),
    POSTGRES_URL: present("POSTGRES_URL"),
    GEMINI_API_KEY: present("GEMINI_API_KEY"),
    AUTH_SECRET: present("AUTH_SECRET"),
    GOOGLE_SA_KEY_B64: present("GOOGLE_SA_KEY_B64"),
    NODE_VERSION: process.version,
    ALL_DB_VARS: Object.keys(process.env).filter((k) => /POSTGRES|DATABASE|NEON/i.test(k)),
  });
}
