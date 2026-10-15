import { readFile } from "node:fs/promises";
import { pool, closeDatabases } from "./db.js";

// Apply only additive API support and routine updates; never rerun the destructive view setup.
try {
  for (const file of [
    "03_triggers_and_audit.sql",
    "04_stored_procedures.sql",
    "07_api_support.sql",
  ]) {
    await pool.query(
      await readFile(new URL(`../../sql/${file}`, import.meta.url), "utf8"),
    );
    console.log(`Applied ${file}`);
  }
} finally {
  await closeDatabases();
}
