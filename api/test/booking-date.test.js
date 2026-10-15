import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingToday } from "../src/helpers.js";

test("booking day changes at midnight in India, independent of UTC day", () => {
  assert.equal(bookingToday(new Date("2026-10-11T18:29:59Z")), "2026-10-11");
  assert.equal(bookingToday(new Date("2026-10-11T18:30:00Z")), "2026-10-12");
});
