// מעתיק את מיגרציות Drizzle (drizzle/NNNN_name.sql) לפורמט ש־Netlify Database מריץ בזמן ההעלאה:
// netlify/database/migrations/NNNN_name/migration.sql  (ה־slug: אותיות קטנות, ספרות ומקפים בלבד)
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const src = path.resolve("drizzle");
const dest = path.resolve("netlify/database/migrations");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

const files = readdirSync(src).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
for (const file of files) {
  const [, num, name] = file.match(/^(\d{4})_(.+)\.sql$/);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const dir = path.join(dest, `${num}_${slug}`);
  mkdirSync(dir, { recursive: true });
  // הסימון של Drizzle בין פקודות הוא הערת SQL, ולכן הקובץ תקין כפי שהוא
  writeFileSync(path.join(dir, "migration.sql"), readFileSync(path.join(src, file), "utf8"));
}
console.log(`synced ${files.length} migrations to ${path.relative(process.cwd(), dest)}`);
