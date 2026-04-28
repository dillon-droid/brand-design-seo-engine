import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./api/lib/db/schema.ts",
  out: "./api/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
