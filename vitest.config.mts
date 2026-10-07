import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    env: { PGLITE_DATA_DIR: "memory://" },
    // כל קובץ בדיקות מרים Postgres בזיכרון ומריץ מיגרציות — הבדיקה הראשונה בקובץ איטית יותר
    testTimeout: 30_000,
  },
});
