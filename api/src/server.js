import { app } from "./app.js";
import { pool, mongoClient, closeDatabases } from "./db.js";

// Check both databases before accepting browser requests.
await pool.query("SET TIME ZONE 'UTC'");
await mongoClient.connect();
const server = app.listen(Number(process.env.PORT || 3001), "127.0.0.1", () => {
  console.log(`StaySpot API: http://127.0.0.1:${process.env.PORT || 3001}`);
});

// Stop accepting requests before closing database connections.
async function shutdown() {
  server.close(async () => {
    await closeDatabases();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
