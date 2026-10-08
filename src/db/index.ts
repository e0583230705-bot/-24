import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * שלושה מצבים:
 * - DATABASE_DRIVER=netlify — מסד הנתונים של Netlify (Postgres). המיגרציות מורצות על ידי Netlify בזמן ההעלאה.
 * - DATABASE_URL — כל Postgres אחר (למשל Supabase); המיגרציות מורצות כאן באתחול, אלא אם
 *   DATABASE_MIGRATIONS=external (הסכמה מנוהלת מבחוץ — למשל דרך כלי ה־MCP של Supabase).
 * - אחרת — PGlite: Postgres שרץ בתוך התהליך, לפיתוח מקומי ולבדיקות, בלי שרת.
 * לכל המצבים אותו API של Drizzle, ולכן הטיפוס משותף.
 */
export type Db = PgliteDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { dbPromise?: Promise<Db> };

async function initPostgres(connectionString: string, runMigrations: boolean): Promise<Db> {
  const { Pool } = await import("pg");
  const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");
  // פונקציות serverless: מעט חיבורים לכל מופע.
  // TLS: מצב ה־SSL נקבע בכתובת (למשל ?sslmode=verify-full). אם ה־CA של השרת אינו ציבורי (Supabase מספקת
  // תעודת שורש להורדה), שמים את תוכן קובץ ה־PEM ב־DATABASE_SSL_CA והאימות נעשה מולו.
  const ca = process.env.DATABASE_SSL_CA?.trim();
  const pool = new Pool({ connectionString, max: 3, ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}) });
  const db = drizzlePg({ client: pool, schema });
  if (runMigrations) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  }
  return db as unknown as Db;
}

async function initPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (!dataDir.includes("://")) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

async function init(): Promise<Db> {
  if (process.env.DATABASE_DRIVER === "netlify") {
    const { getConnectionString } = await import("@netlify/database");
    return initPostgres(getConnectionString(), false);
  }
  if (process.env.DATABASE_URL) return initPostgres(process.env.DATABASE_URL, process.env.DATABASE_MIGRATIONS !== "external");
  return initPglite();
}

export function getDb(): Promise<Db> {
  globalForDb.dbPromise ??= init().catch((err) => {
    // אתחול שנכשל לא נשמר — הבקשה הבאה תנסה שוב
    globalForDb.dbPromise = undefined;
    throw err;
  });
  return globalForDb.dbPromise;
}

export { schema };
