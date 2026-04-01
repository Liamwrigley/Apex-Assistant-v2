import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../client.js";

async function run(): Promise<void> {
  dotenv.config({ path: resolve(process.cwd(), "../../.env") });
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Ensure apex-assistant/.env exists.");
  }
  const schemaPath = resolve(process.cwd(), "schema.sql");
  const sql = await readFile(schemaPath, "utf-8");
  await pool.query(sql);
  await pool.end();
  console.log("Database schema applied.");
}

run().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
