import dotenv from "dotenv";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;

dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), "../../.env"), override: false });

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  ssl:
    connectionString && connectionString.includes("neon.tech")
      ? { rejectUnauthorized: false }
      : undefined
});

export type TQueryable = Pick<pg.Pool, "query">;
