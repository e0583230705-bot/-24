import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg", "@netlify/database", "xlsx"],
  experimental: {
    serverActions: {
      // ברירת המחדל (1MB) קטנה מדי לצילומי קבלות ולקובצי מבנה אחיד.
      // המגבלה המדויקת לכל סוג קובץ נאכפת בשירותים (קבלה 10MB, בנק 5MB, ספרים לביקורת 30MB).
      bodySizeLimit: "32mb",
    },
  },
};

export default nextConfig;
