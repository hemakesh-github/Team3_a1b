import { test } from "node:test";
import assert from "node:assert/strict";
import { requestFailure } from "../src/request-errors.js";

test("read-only quotes and reads can be retried without a booking warning", () => {
  for (const [path, method] of [
    ["/bookings/quote", "POST"],
    ["/guests", "GET"],
  ]) {
    const error = requestFailure(path, method);
    assert.equal(error.uncertain, undefined);
    assert.equal(error.recoveryHref, undefined);
    assert.match(error.message, /try again/i);
  }
});

test("an interrupted booking directs the user to verify before retrying", () => {
  const error = requestFailure("/bookings", "POST");
  assert.equal(error.uncertain, true);
  assert.equal(error.recoveryHref, "/bookings");
  assert.match(error.message, /may have been created/);
});

test("other mutations receive recovery instructions for their own operation", () => {
  for (const [path, method, expected] of [
    ["/bookings/123/status", "PATCH", /Reload its status/],
    ["/bookings/123/review", "POST", /Check the saved review/],
    ["/analytics/refresh", "POST", /Reload the summary/],
    ["/search/sessions", "POST", /Refresh the pins/],
  ]) {
    const error = requestFailure(path, method);
    assert.equal(error.uncertain, true);
    assert.equal(error.recoveryHref, undefined);
    assert.match(error.message, expected);
  }
});
