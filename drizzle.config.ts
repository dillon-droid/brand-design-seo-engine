import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./api/_server/db/schema.ts",
  out: "./api/_server/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
