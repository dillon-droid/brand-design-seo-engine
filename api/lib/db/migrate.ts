import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const sql = neon(url);
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "./api/lib/db/migrations" });
console.log("Migrations applied.");
