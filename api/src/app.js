import express from "express";
import { randomUUID } from "node:crypto";
import { pool, mongo } from "./db.js";
import {
  fail,
  uuid,
  date,
  paging,
  page,
  range,
  coordinates,
  bookingToday,
} from "./helpers.js";

export const app = express();
app.use(express.json({ limit: "32kb" }));
// Normalize empty request bodies and reject arrays before reading form fields.
app.use((req, res, next) => {
  req.body ??= {};
  if (Array.isArray(req.body) || typeof req.body !== "object")
    return next(
      Object.assign(new Error("Send a JSON object."), { status: 400 }),
    );
  next();
});

// Return a single PostgreSQL record or a friendly not-found response.
async function record(table, id, client = pool) {
  uuid(id);
  const { rows } = await client.query(`SELECT * FROM ${table} WHERE id=$1`, [
    id,
  ]);
  if (!rows[0]) fail(404, "Record not found.");
  return rows[0];
}

// Include names in booking results so the browser does not need per-row requests.
const bookingSelect = `SELECT b.*, g.name AS guest_name, p.title AS property_title,
  (b.check_out-b.check_in) AS nights FROM bookings b
  JOIN guests g ON g.id=b.guest_id JOIN properties p ON p.id=b.property_id`;

// Search guest names and emails with bounded server pagination.
app.get("/api/guests", async (req, res) => {
  const pg = paging(req.query);
  const { rows } = await pool.query(
    "SELECT id,name,email,wallet_balance FROM guests WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY name,id LIMIT $2 OFFSET $3",
    [`%${req.query.q || ""}%`, pg.limit + 1, pg.offset],
  );
  res.json(page(rows, pg));
});
app.get("/api/guests/:id", async (req, res) => {
  // Guest details also supply the selected actor's current wallet balance.
  res.json(await record("guests", req.params.id));
});

// Allow only known sort expressions; all user values remain query parameters.
app.get("/api/properties", async (req, res) => {
  const pg = paging(req.query);
  const sorts = {
    title_asc: "title,id",
    title_desc: "title DESC,id",
    price_asc: "base_price,id",
    price_desc: "base_price DESC,id",
  };
  const sort = req.query.sort || "title_asc";
  if (!Object.hasOwn(sorts, sort)) fail(400, "Invalid property sort.");
  const min =
    req.query.min_price === undefined ? null : Number(req.query.min_price);
  const max =
    req.query.max_price === undefined ? null : Number(req.query.max_price);
  if (
    [min, max].some((n) => n !== null && (!Number.isFinite(n) || n < 0)) ||
    (min !== null && max !== null && min > max)
  )
    fail(400, "Invalid price range.");
  const { rows } = await pool.query(
    `SELECT * FROM properties WHERE title ILIKE $1 AND ($2::numeric IS NULL OR base_price >= $2) AND ($3::numeric IS NULL OR base_price <= $3) ORDER BY ${sorts[sort]} LIMIT $4 OFFSET $5`,
    [`%${req.query.q || ""}%`, min, max, pg.limit + 1, pg.offset],
  );
  res.json(page(rows, pg));
});
app.get("/api/properties/:id", async (req, res) => {
  // Read the relational property record for details and pricing.
  res.json(await record("properties", req.params.id));
});
app.get("/api/properties/:id/amenities", async (req, res) => {
  // Distinguish a missing property from a property without a MongoDB catalog.
  await record("properties", req.params.id);
  res.json(
    await mongo
      .collection("PropertyAmenities")
      .findOne({ property_id: req.params.id }, { projection: { _id: 0 } }),
  );
});

// Filter bookings by actor, property or lifecycle status.
app.get("/api/bookings", async (req, res) => {
  const pg = paging(req.query),
    { guest_id, property_id, status } = req.query;
  if (guest_id) uuid(guest_id, "guest_id");
  if (property_id) uuid(property_id, "property_id");
  if (status && !["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(status))
    fail(400, "Invalid booking status.");
  const { rows } = await pool.query(
    `${bookingSelect} WHERE ($1::uuid IS NULL OR b.guest_id=$1) AND ($2::uuid IS NULL OR b.property_id=$2) AND ($3::text IS NULL OR b.status=$3) ORDER BY b.created_at DESC,b.id LIMIT $4 OFFSET $5`,
    [
      guest_id || null,
      property_id || null,
      status || null,
      pg.limit + 1,
      pg.offset,
    ],
  );
  res.json(page(rows, pg));
});
app.get("/api/bookings/:id", async (req, res) => {
  // Fetch the selected booking with its associated display names.
  uuid(req.params.id);
  const { rows } = await pool.query(`${bookingSelect} WHERE b.id=$1`, [
    req.params.id,
  ]);
  if (!rows[0]) fail(404, "Booking not found.");
  res.json(rows[0]);
});

// Calculate money using PostgreSQL NUMERIC; never trust a browser-supplied price.
async function quote(input, client = pool, lock = false) {
  uuid(input.guest_id, "guest_id");
  uuid(input.property_id, "property_id");
  date(input.check_in, "check_in");
  date(input.check_out, "check_out");
  if (input.check_in < bookingToday())
    fail(400, "Check-in cannot be before today.", {
      fields: { check_in: "Choose today or a later date." },
    });
  if (input.check_out <= input.check_in)
    fail(400, "Check-out must be after check-in.", {
      fields: { check_out: "Choose a later date." },
    });
  if (lock) {
    await client.query("SELECT id FROM guests WHERE id=$1 FOR UPDATE", [
      input.guest_id,
    ]);
    await client.query("SELECT id FROM properties WHERE id=$1 FOR SHARE", [
      input.property_id,
    ]);
  }
  await record("guests", input.guest_id, client);
  await record("properties", input.property_id, client);
  const { rows } = await client.query(
    `SELECT ($4::date-$3::date) AS nights, p.base_price AS nightly_price,
    (p.base_price*($4::date-$3::date))::numeric(14,2) AS total_cost, g.wallet_balance,
    (g.wallet_balance-p.base_price*($4::date-$3::date))::numeric(14,2) AS expected_balance,
    GREATEST(0,p.base_price*($4::date-$3::date)-g.wallet_balance)::numeric(14,2) AS shortfall
    FROM guests g CROSS JOIN properties p WHERE g.id=$1 AND p.id=$2`,
    [input.guest_id, input.property_id, input.check_in, input.check_out],
  );
  return rows[0];
}
app.post("/api/bookings/quote", async (req, res) => {
  // Preview only: this endpoint does not debit the wallet or reserve a stay.
  res.json(await quote(req.body));
});
app.post("/api/bookings", async (req, res) => {
  // Keep quote, debit, trigger audit and booking in one transaction on one connection.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = await quote(req.body, client, true);
    if (Number(q.shortfall) > 0)
      fail(409, "Your wallet does not have enough funds.", {
        code: "INSUFFICIENT_FUNDS",
        ...q,
      });
    const { guest_id, property_id, check_in, check_out } = req.body;
    const result = await client.query(
      "CALL sp_atomic_booking($1,$2,$3,$4,$5,NULL)",
      [guest_id, property_id, q.total_cost, check_in, check_out],
    );
    const booking = (
      await client.query(`${bookingSelect} WHERE b.id=$1`, [
        result.rows[0].p_booking_id,
      ])
    ).rows[0];
    const audit = (
      await client.query(
        "SELECT id,action_type AS action,amount_changed AS amount,balance_after,timestamp FROM wallet_audit_logs WHERE id=current_setting('stayspot.last_audit_id')::uuid",
      )
    ).rows[0];
    await client.query("COMMIT");
    res.status(201).json({
      booking,
      balance_before: q.wallet_balance,
      balance_after: audit.balance_after,
      audit,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.patch("/api/bookings/:id/status", async (req, res) => {
  // Serialize changes for a guest; the partial unique index remains the final safeguard.
  const id = uuid(req.params.id),
    status = req.body.status;
  if (!["CHECKED_IN", "COMPLETED"].includes(status))
    fail(400, "Choose CHECKED_IN or COMPLETED.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await record("bookings", id, client);
    await client.query("SELECT id FROM guests WHERE id=$1 FOR UPDATE", [
      existing.guest_id,
    ]);
    const booking = (
      await client.query("SELECT * FROM bookings WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (
      { CONFIRMED: "CHECKED_IN", CHECKED_IN: "COMPLETED" }[booking.status] !==
      status
    )
      fail(409, "This status transition is not allowed.");
    if (status === "CHECKED_IN") {
      const active = (
        await client.query(
          "SELECT id FROM bookings WHERE guest_id=$1 AND status='CHECKED_IN'",
          [booking.guest_id],
        )
      ).rows[0];
      if (active)
        fail(409, "Complete the current stay before checking in here.", {
          code: "ACTIVE_STAY_CONFLICT",
          active_booking_id: active.id,
        });
    }
    await client.query("UPDATE bookings SET status=$2 WHERE id=$1", [
      id,
      status,
    ]);
    const updated = (await client.query(`${bookingSelect} WHERE b.id=$1`, [id]))
      .rows[0];
    await client.query("COMMIT");
    res.json(updated);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

// A completed stay can receive one review; MongoDB enforces uniqueness under races.
app.get("/api/bookings/:id/review", async (req, res) => {
  const booking = await record("bookings", req.params.id);
  res.json(
    await mongo
      .collection("PropertyReviews")
      .findOne({ booking_id: booking.id }, { projection: { _id: 0 } }),
  );
});
app.post("/api/bookings/:id/review", async (req, res) => {
  const booking = await record("bookings", req.params.id);
  const guestId = uuid(req.body.guest_id, "guest_id");
  if (guestId !== booking.guest_id)
    fail(403, "Select the guest who made this booking to write its review.");
  if (booking.status !== "COMPLETED")
    fail(409, "You can review this property after completing your stay.", {
      code: "STAY_NOT_COMPLETED",
    });
  const { rating, tags = [], comment = "" } = req.body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    fail(400, "Choose a rating from 1 to 5 stars.", {
      fields: { rating: "Choose 1 to 5 stars." },
    });
  if (
    !Array.isArray(tags) ||
    tags.length > 12 ||
    tags.some(
      (tag) =>
        typeof tag !== "string" ||
        tag.length > 40 ||
        !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(tag),
    )
  )
    fail(400, "Choose up to 12 valid feedback tags.");
  if (typeof comment !== "string" || comment.length > 2000)
    fail(400, "Keep your written review within 2,000 characters.");
  const review = {
    booking_id: booking.id,
    property_id: booking.property_id,
    guest_id: booking.guest_id,
    rating,
    tags: [...new Set(tags)],
    comment: comment.trim(),
    created_at: new Date(),
  };
  try {
    await mongo.collection("PropertyReviews").insertOne({ ...review });
  } catch (error) {
    if (error.code === 11000)
      fail(409, "A review has already been submitted for this booking.", {
        code: "REVIEW_EXISTS",
      });
    throw error;
  }
  res.status(201).json(review);
});

// Aggregate across the entire selected period, independently of the visible audit page.
app.get("/api/guests/:id/audit", async (req, res) => {
  const guest = await record("guests", req.params.id),
    pg = paging(req.query),
    { from, to } = range(req.query);
  const where =
    "guest_id=$1 AND ($2::date IS NULL OR timestamp >= $2::date) AND ($3::date IS NULL OR timestamp < $3::date+1)";
  const args = [guest.id, from, to];
  const entries = await pool.query(
    `SELECT id,action_type AS action,amount_changed AS amount,balance_after,timestamp FROM wallet_audit_logs WHERE ${where} ORDER BY timestamp DESC,id LIMIT $4 OFFSET $5`,
    [...args, pg.limit + 1, pg.offset],
  );
  const totals = (
    await pool.query(
      `SELECT COALESCE(SUM(amount_changed) FILTER (WHERE action_type='DEBIT'),0) AS debits,COALESCE(SUM(amount_changed) FILTER (WHERE action_type='CREDIT'),0) AS credits FROM wallet_audit_logs WHERE ${where}`,
      args,
    )
  ).rows[0];
  res.json({
    ...page(entries.rows, pg),
    wallet_balance: guest.wallet_balance,
    ...totals,
  });
});

// Compute the inherited window before filtering displayed dates to retain its lookback.
app.get("/api/analytics/revenue", async (req, res) => {
  const id = uuid(req.query.property_id, "property_id"),
    { from, to } = range(req.query, true);
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 3660)
    fail(400, "Choose a range of at most ten years.");
  await record("properties", id);
  const { rows } = await pool.query(
    `WITH daily AS (
    SELECT created_at::date AS booking_day,SUM(total_cost) AS daily_total FROM bookings WHERE property_id=$1 GROUP BY created_at::date
  ), moving AS (SELECT *,ROUND(AVG(daily_total) OVER (ORDER BY booking_day RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW),2) AS moving_avg_7d FROM daily)
  SELECT * FROM moving WHERE booking_day BETWEEN $2::date AND $3::date ORDER BY booking_day`,
    [id, from, to],
  );
  res.json({ items: rows });
});
app.get("/api/analytics/revenue/rankings", async (req, res) => {
  // Rank all properties with bookings before slicing a page.
  const pg = paging(req.query);
  const { rows } = await pool.query(
    `WITH totals AS (SELECT property_id,SUM(total_cost) AS total_revenue FROM bookings GROUP BY property_id)
    SELECT t.*,p.title,DENSE_RANK() OVER (ORDER BY total_revenue DESC) AS revenue_rank FROM totals t JOIN properties p ON p.id=t.property_id ORDER BY total_revenue DESC,t.property_id LIMIT $1 OFFSET $2`,
    [pg.limit + 1, pg.offset],
  );
  res.json(page(rows, pg));
});
app.get("/api/analytics/properties", async (req, res) => {
  // Read summary cards and rows from the materialized view, with persistent freshness metadata.
  const pg = paging(req.query),
    id = req.query.property_id ? uuid(req.query.property_id) : null;
  const rows = (
    await pool.query(
      "SELECT * FROM property_summary WHERE ($1::uuid IS NULL OR property_id=$1) ORDER BY title,property_id LIMIT $2 OFFSET $3",
      [id, pg.limit + 1, pg.offset],
    )
  ).rows;
  const totals = (
    await pool.query(
      "SELECT COALESCE(SUM(total_bookings),0) AS total_bookings,COALESCE(SUM(total_nights_booked),0) AS total_nights_booked,COALESCE(SUM(gross_revenue),0) AS gross_revenue FROM property_summary WHERE ($1::uuid IS NULL OR property_id=$1)",
      [id],
    )
  ).rows[0];
  const metadata = (
    await pool.query(
      "SELECT refreshed_at FROM summary_refresh_metadata WHERE name='property_summary'",
    )
  ).rows[0];
  res.json({
    ...page(rows, pg),
    totals,
    last_refreshed_at: metadata?.refreshed_at || null,
  });
});
app.post("/api/analytics/refresh", async (req, res) => {
  // Serialize refresh requests and commit the refreshed view and its timestamp together.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT name FROM summary_refresh_metadata WHERE name='property_summary' FOR UPDATE",
    );
    await client.query("SELECT refresh_property_summary()");
    const result = await client.query(
      "UPDATE summary_refresh_metadata SET refreshed_at=clock_timestamp() WHERE name='property_summary' RETURNING refreshed_at AS last_refreshed_at",
    );
    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

// Keep $geoNear first, then return bounded map pins and the original distance-band summary.
app.get("/api/search/hotspots", async (req, res) => {
  const origin = coordinates(req.query),
    pg = paging(req.query);
  const result = await mongo
    .collection("SearchSessions")
    .aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: origin },
          distanceField: "distance_meters",
          maxDistance: 5000,
          spherical: true,
          query: { created_at: { $gte: new Date(Date.now() - 7200000) } },
        },
      },
      {
        $facet: {
          pins: [
            { $sort: { distance_meters: 1, _id: 1 } },
            { $skip: pg.offset },
            { $limit: pg.limit + 1 },
            {
              $project: {
                _id: 0,
                id: "$session_id",
                coordinates: "$location.coordinates",
                timestamp: "$created_at",
                distance_meters: 1,
              },
            },
          ],
          bands: [
            {
              $bucket: {
                groupBy: "$distance_meters",
                boundaries: [0, 1000, 2000, 3000, 4000, 5000],
                default: "5000+",
                output: { count: { $sum: 1 } },
              },
            },
          ],
        },
      },
    ])
    .toArray();
  res.json({
    ...page(result[0]?.pins || [], pg),
    bands: result[0]?.bands || [],
    updated_at: new Date().toISOString(),
  });
});
app.post("/api/search/sessions", async (req, res) => {
  // Add a fresh demo search; MongoDB's existing TTL index expires it automatically.
  const point = coordinates(req.body),
    id = randomUUID(),
    timestamp = new Date();
  await mongo.collection("SearchSessions").insertOne({
    session_id: id,
    location: { type: "Point", coordinates: point },
    created_at: timestamp,
  });
  res.status(201).json({ id, coordinates: point, timestamp });
});
app.get("/api/reviews/analytics", async (req, res) => {
  // Reuse the inherited $facet calculations for one property or all reviews.
  const id = req.query.property_id ? uuid(req.query.property_id) : null;
  const result = await mongo
    .collection("PropertyReviews")
    .aggregate([
      { $match: id ? { property_id: id } : {} },
      {
        $facet: {
          ratingDistribution: [
            { $group: { _id: "$rating", count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          topTags: [
            { $unwind: "$tags" },
            { $group: { _id: "$tags", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 10 },
          ],
          overallAverage: [
            {
              $group: {
                _id: null,
                avgRating: { $avg: "$rating" },
                totalReviews: { $sum: 1 },
              },
            },
          ],
        },
      },
    ])
    .toArray();
  res.json(result[0]);
});

// Centralize failures so database details never reach the browser.
app.use((req, res) =>
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } }),
);
app.use((error, req, res, next) => {
  const status = error.status || (error.code === "23505" ? 409 : 500);
  if (status === 500) console.error(error);
  res.status(status).json({
    error: {
      code: status === 500 ? "SERVER_ERROR" : "REQUEST_ERROR",
      message:
        status === 500
          ? "The request could not be completed. Please try again."
          : error.message,
      ...error.details,
    },
  });
});
