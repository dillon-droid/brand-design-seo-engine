import "dotenv/config";
import { db, schema } from "../api/_server/db/client";
import { hashPassword } from "../api/_server/lib/auth";
import { eq } from "drizzle-orm";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = readline.createInterface({ input: stdin, output: stdout });

const email = (process.argv[2] || (await rl.question("Email: "))).trim().toLowerCase();
const name = process.argv[3] || (await rl.question("Name (optional): "));
const password = await rl.question("Password: ");
rl.close();

if (!email || !password) {
  console.error("Email and password are required.");
  process.exit(1);
}

const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
const passwordHash = await hashPassword(password);

if (existing[0]) {
  await db.update(schema.users).set({ passwordHash, name: name || existing[0].name }).where(eq(schema.users.id, existing[0].id));
  console.log(`Updated password for ${email}`);
} else {
  const [u] = await db.insert(schema.users).values({ email, name: name || null, passwordHash }).returning();
  console.log(`Created user ${u.email} (${u.id})`);
}
