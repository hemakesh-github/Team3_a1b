import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../src/app.js";
import { bookingToday } from "../src/helpers.js";
import { pool, mongo, closeDatabases } from "../src/db.js";

// Exercise real HTTP routes with isolated records and remove only those fixtures afterward.
test("StaySpot API workflows against local PostgreSQL and MongoDB", async (t) => {
  const guest = randomUUID(),
    poor = randomUUID(),
    property = randomUUID();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let booking, secondBooking, pin;
  // Keep request assertions concise while preserving the status and JSON error body.
  async function call(path, method = "GET", body) {
    const response = await fetch(base + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }
  const today = bookingToday();
  const dayAfter = (days) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000)
      .toISOString()
      .slice(0, 10);
  const input = {
    guest_id: guest,
    property_id: property,
    check_in: dayAfter(1),
    check_out: dayAfter(3),
  };
  try {
    await pool.query(
      "INSERT INTO guests(id,name,wallet_balance) VALUES ($1,$2,1000),($3,$4,70)",
      [guest, `API test ${guest}`, poor, `API test ${poor}`],
    );
    await pool.query(
      "INSERT INTO properties(id,title,base_price,latitude,longitude) VALUES ($1,$2,25,12.9716,77.5946)",
      [property, `API test ${property}`],
    );
    await mongo.collection("PropertyAmenities").insertOne({
      property_id: property,
      house_rules: ["No smoking"],
      accessibility_features: ["Elevator"],
      amenities: { wifi: true },
    });
    await mongo.collection("PropertyReviews").insertMany([
      {
        property_id: property,
        guest_id: guest,
        rating: 5,
        tags: ["clean"],
        created_at: new Date(),
      },
      {
        property_id: property,
        guest_id: guest,
        rating: 3,
        tags: ["clean", "great_location"],
        created_at: new Date(),
      },
    ]);
    await t.test("browse, detail, filters and bounded pagination", async () => {
      for (const path of [
        `/guests?q=${guest}`,
        `/guests/${guest}`,
        `/properties?q=${property}`,
        `/properties/${property}`,
        `/properties/${property}/amenities`,
      ])
        assert.equal((await call(path)).status, 200, path);
      const list = await call("/properties?limit=2&sort=price_desc");
      assert.equal(list.data.items.length, 2);
      assert.ok(list.data.next_cursor);
      const next = await call(
        `/properties?limit=2&sort=price_desc&cursor=${list.data.next_cursor}`,
      );
      assert.ok(next.data.previous_cursor);
      assert.notEqual(next.data.items[0].id, list.data.items[0].id);
      assert.equal((await call("/properties?limit=1000")).status, 400);
    });
    await t.test("quote uses stored pricing and does not write", async () => {
      const result = await call("/bookings/quote", "POST", input);
      assert.equal(result.status, 200);
      assert.equal(result.data.total_cost, "50.00");
      assert.equal(result.data.expected_balance, "950.00");
      assert.equal(
        (await call(`/guests/${guest}`)).data.wallet_balance,
        "1000.00",
      );
      assert.equal(
        (
          await call("/bookings/quote", "POST", {
            ...input,
            check_out: "2026-02-30",
          })
        ).status,
        400,
      );
    });
    await t.test(
      "past check-ins are rejected by quotes and bookings without writes",
      async () => {
        for (const path of ["/bookings/quote", "/bookings"]) {
          const result = await call(path, "POST", {
            ...input,
            check_in: dayAfter(-1),
            check_out: dayAfter(1),
          });
          assert.equal(result.status, 400);
          assert.equal(
            result.data.error.fields.check_in,
            "Choose today or a later date.",
          );
        }
        assert.equal(
          (
            await call("/bookings/quote", "POST", {
              ...input,
              check_in: today,
              check_out: dayAfter(1),
            })
          ).status,
          200,
        );
        assert.equal(
          (await call(`/guests/${guest}`)).data.wallet_balance,
          "1000.00",
        );
        assert.equal(
          (await call(`/guests/${guest}/audit`)).data.items.length,
          0,
        );
        assert.equal(
          (await call(`/bookings?guest_id=${guest}`)).data.items.length,
          0,
        );
      },
    );
    await t.test(
      "booking returns exact booking and trigger audit identifiers",
      async () => {
        const result = await call("/bookings", "POST", {
          ...input,
          total_cost: "0.01",
        });
        assert.equal(result.status, 201);
        assert.equal(result.data.balance_before, "1000.00");
        assert.equal(result.data.balance_after, "950.00");
        assert.equal(result.data.booking.total_cost, "50.00");
        assert.equal(result.data.audit.amount, "50.00");
        booking = result.data.booking.id;
        const audit = (
          await pool.query("SELECT * FROM wallet_audit_logs WHERE id=$1", [
            result.data.audit.id,
          ])
        ).rows[0];
        assert.equal(audit.guest_id, guest);
        assert.equal(audit.balance_after, "950.00");
        assert.equal((await call(`/bookings/${booking}`)).status, 200);
        assert.equal(
          (await call(`/bookings?guest_id=${guest}`)).data.items.length,
          1,
        );
      },
    );
    await t.test(
      "concurrent debits allow one booking and reject overdraft without extra audit",
      async () => {
        const results = await Promise.all([
          call("/bookings", "POST", { ...input, guest_id: poor }),
          call("/bookings", "POST", { ...input, guest_id: poor }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        assert.equal(
          (await call(`/guests/${poor}`)).data.wallet_balance,
          "20.00",
        );
        assert.equal(
          (await call(`/guests/${poor}/audit`)).data.items.length,
          1,
        );
        assert.equal(
          results.find((r) => r.status === 409).data.error.shortfall,
          "30.00",
        );
      },
    );
    await t.test(
      "check-in conflict and forward-only completion do not debit again",
      async () => {
        secondBooking = (await call("/bookings", "POST", input)).data.booking
          .id;
        assert.equal(
          (
            await call(`/bookings/${booking}/status`, "PATCH", {
              status: "CHECKED_IN",
            })
          ).status,
          200,
        );
        const conflict = await call(
          `/bookings/${secondBooking}/status`,
          "PATCH",
          { status: "CHECKED_IN" },
        );
        assert.equal(conflict.status, 409);
        assert.equal(conflict.data.error.active_booking_id, booking);
        assert.equal(
          (
            await call(`/bookings/${secondBooking}/status`, "PATCH", {
              status: "COMPLETED",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await call(`/bookings/${booking}/status`, "PATCH", {
              status: "COMPLETED",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call(`/bookings/${secondBooking}/status`, "PATCH", {
              status: "CHECKED_IN",
            })
          ).status,
          200,
        );
        assert.equal(
          (await call(`/guests/${guest}`)).data.wallet_balance,
          "900.00",
        );
      },
    );
    await t.test(
      "audit totals cover the full period while entries are paginated",
      async () => {
        const result = await call(`/guests/${guest}/audit?limit=1`);
        assert.equal(result.data.items.length, 1);
        assert.equal(result.data.debits, "100.00");
        assert.equal(Number(result.data.credits), 0);
        const empty = await call(
          `/guests/${guest}/audit?from=2000-01-01&to=2000-01-02`,
        );
        assert.equal(empty.data.items.length, 0);
        assert.equal(Number(empty.data.debits), 0);
      },
    );
    await t.test(
      "analytics returns moving average, dense ranks and refreshed summary",
      async () => {
        const today = new Date().toISOString().slice(0, 10);
        const chart = await call(
          `/analytics/revenue?property_id=${property}&from=${today}&to=${today}`,
        );
        assert.equal(chart.status, 200);
        assert.equal(chart.data.items[0].daily_total, "150.00");
        assert.equal(
          (await call("/analytics/revenue/rankings?limit=2")).data.items.length,
          2,
        );
        const refresh = await call("/analytics/refresh", "POST");
        assert.equal(refresh.status, 200);
        assert.ok(refresh.data.last_refreshed_at);
        const summary = await call(
          `/analytics/properties?property_id=${property}`,
        );
        assert.equal(summary.data.totals.total_bookings, "3");
        assert.equal(summary.data.totals.total_nights_booked, "6");
        assert.equal(summary.data.totals.gross_revenue, "150.00");
      },
    );
    await t.test(
      "review facets and flexible catalog preserve seeded values",
      async () => {
        const reviews = await call(
          `/reviews/analytics?property_id=${property}`,
        );
        assert.equal(reviews.data.overallAverage[0].avgRating, 4);
        assert.equal(reviews.data.topTags[0].count, 2);
        assert.equal((await call("/reviews/analytics")).status, 200);
        assert.equal(
          (await call(`/properties/${property}/amenities`)).data.amenities.wifi,
          true,
        );
      },
    );
    await t.test(
      "completed stays accept one guest review, including concurrent submissions",
      async () => {
        const reviewPath = `/bookings/${booking}/review`;
        const review = {
          guest_id: guest,
          rating: 5,
          tags: ["clean", "clean"],
          comment: "  A lovely stay.  ",
        };
        assert.equal((await call(reviewPath)).data, null);
        assert.equal(
          (await call(`/bookings/${secondBooking}/review`, "POST", review))
            .status,
          409,
        );
        assert.equal(
          (await call(reviewPath, "POST", { ...review, guest_id: poor }))
            .status,
          403,
        );
        for (const invalid of [
          { rating: 0 },
          { rating: 6 },
          { rating: 2.5 },
          { rating: "5" },
          { tags: "clean" },
          { tags: ["<script>"] },
          { comment: "x".repeat(2001) },
        ]) {
          assert.equal(
            (await call(reviewPath, "POST", { ...review, ...invalid })).status,
            400,
          );
        }
        const results = await Promise.all([
          call(reviewPath, "POST", review),
          call(reviewPath, "POST", review),
        ]);
        assert.deepEqual(
          results.map((result) => result.status).sort(),
          [201, 409],
        );
        assert.equal(
          results.find((result) => result.status === 409).data.error.code,
          "REVIEW_EXISTS",
        );
        const saved = (await call(reviewPath)).data;
        assert.equal(saved.booking_id, booking);
        assert.equal(saved.property_id, property);
        assert.equal(saved.guest_id, guest);
        assert.deepEqual(saved.tags, ["clean"]);
        assert.equal(saved.comment, "A lovely stay.");
        assert.equal(
          await mongo
            .collection("PropertyReviews")
            .countDocuments({ booking_id: booking }),
          1,
        );
        const analytics = (
          await call(`/reviews/analytics?property_id=${property}`)
        ).data;
        assert.equal(analytics.overallAverage[0].totalReviews, 3);
        assert.equal(
          analytics.topTags.find((tag) => tag._id === "clean").count,
          3,
        );
        assert.equal(
          (await call(`/guests/${guest}`)).data.wallet_balance,
          "900.00",
        );
      },
    );
    await t.test(
      "fresh map pin appears at zero distance and invalid coordinates fail",
      async () => {
        const result = await call("/search/sessions", "POST", {
          latitude: 12.9716,
          longitude: 77.5946,
        });
        assert.equal(result.status, 201);
        pin = result.data.id;
        const map = await call(
          "/search/hotspots?latitude=12.9716&longitude=77.5946",
        );
        assert.equal(map.status, 200);
        assert.ok(
          map.data.items.some((p) => p.id === pin && p.distance_meters < 1),
        );
        assert.ok(map.data.bands.some((b) => b._id === 0));
        assert.equal(
          (await call("/search/hotspots?latitude=91&longitude=0")).status,
          400,
        );
      },
    );
    await t.test(
      "bad identifiers and missing records return friendly failures",
      async () => {
        assert.equal((await call("/guests/not-a-uuid")).status, 400);
        assert.equal((await call(`/properties/${randomUUID()}`)).status, 404);
        assert.equal(
          (
            await call("/bookings", "POST", {
              ...input,
              property_id: randomUUID(),
            })
          ).status,
          404,
        );
        assert.equal(
          (await call(`/guests/${guest}`)).data.wallet_balance,
          "900.00",
        );
      },
    );
  } finally {
    // Delete only this test's fixtures; refresh again so summaries do not retain test properties.
    await mongo
      .collection("PropertyAmenities")
      .deleteMany({ property_id: property });
    await mongo
      .collection("PropertyReviews")
      .deleteMany({ property_id: property });
    if (pin)
      await mongo.collection("SearchSessions").deleteOne({ session_id: pin });
    await pool.query("DELETE FROM bookings WHERE guest_id=ANY($1::uuid[])", [
      [guest, poor],
    ]);
    await pool.query(
      "DELETE FROM wallet_audit_logs WHERE guest_id=ANY($1::uuid[])",
      [[guest, poor]],
    );
    await pool.query("DELETE FROM guests WHERE id=ANY($1::uuid[])", [
      [guest, poor],
    ]);
    await pool.query("DELETE FROM properties WHERE id=$1", [property]);
    await call("/analytics/refresh", "POST");
    await new Promise((resolve) => server.close(resolve));
    await closeDatabases();
  }
});
