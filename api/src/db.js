import "dotenv/config";
import pg from "pg";
import { MongoClient } from "mongodb";

// Keep dates as calendar strings instead of converting them through local time zones.
pg.types.setTypeParser(1082, (value) => value);
export const pool = new pg.Pool({
  host: process.env.STAYSPOT_PG_HOST || "127.0.0.1",
  port: Number(process.env.STAYSPOT_PG_PORT || 5432),
  database: process.env.STAYSPOT_PG_DB || "stayspot",
  user: process.env.STAYSPOT_PG_USER || process.env.USER || "postgres",
  password: process.env.STAYSPOT_PG_PASSWORD || undefined,
  max: 10,
  options: "-c timezone=UTC", // Give date filters consistent UTC boundaries on every connection.
});
export const mongoClient = new MongoClient(
  process.env.STAYSPOT_MONGO_URI || "mongodb://127.0.0.1:27017",
);
export const mongo = mongoClient.db(
  process.env.STAYSPOT_MONGO_DB || "stayspot",
);

// Release both clients so tests and shutdowns finish cleanly.
export async function closeDatabases() {
  await Promise.all([pool.end(), mongoClient.close()]);
}
