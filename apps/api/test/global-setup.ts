import { execSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { ADMIN_DATABASE_URL, TEST_DATABASE_URL } from "./test-db";

/** Creates the test database (if missing) and applies all migrations. */
export default async function globalSetup(): Promise<void> {
  const dbName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "");
  const admin = new Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "42P04") throw error; // 42P04 = already exists
  } finally {
    await admin.end();
  }

  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
