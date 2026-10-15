// Attach a safe, readable error to an HTTP status.
export function fail(status, message, details = {}) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  throw error;
}

// Validate identifiers before sending them to either database.
export function uuid(value, field = "id") {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    fail(400, `Invalid ${field}.`, {
      fields: { [field]: "Choose a valid record." },
    });
  }
  return value;
}

// Reject invalid calendar dates rather than letting JavaScript normalize them.
export function date(value, field) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    fail(400, `Invalid ${field}.`, {
      fields: { [field]: "Enter a valid date." },
    });
  }
  return value;
}

// Decode a bounded offset cursor; each query still loads at most one page.
export function paging(query) {
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  const raw =
    query.cursor === undefined
      ? "0"
      : Buffer.from(String(query.cursor), "base64url").toString();
  const offset = Number(raw);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(offset) ||
    offset > 10000000
  )
    fail(400, "Invalid pagination.");
  return { limit, offset };
}

// Fetch one extra row to know whether a next page exists.
export function page(rows, { limit, offset }) {
  return {
    items: rows.slice(0, limit),
    previous_cursor: offset
      ? Buffer.from(String(Math.max(0, offset - limit))).toString("base64url")
      : null,
    next_cursor:
      rows.length > limit
        ? Buffer.from(String(offset + limit)).toString("base64url")
        : null,
  };
}

// Validate the shared date filter and use an inclusive end date in queries.
export function range(query, required = false) {
  const from = query.from ? date(query.from, "from") : null;
  const to = query.to ? date(query.to, "to") : null;
  if (required && (!from || !to)) fail(400, "Choose both dates.");
  if (from && to && from > to)
    fail(400, "End date must not be before start date.");
  return { from, to };
}

// Validate latitude/longitude without treating empty inputs as zero.
export function coordinates(input) {
  const latitude = Number(input.latitude),
    longitude = Number(input.longitude);
  if (
    input.latitude === undefined ||
    input.longitude === undefined ||
    String(input.latitude).trim() === "" ||
    String(input.longitude).trim() === "" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    fail(
      400,
      "Enter latitude between −90 and 90 and longitude between −180 and 180.",
    );
  return [longitude, latitude];
}

// Booking cutoffs use the application's India calendar day, independent of host timezone.
export function bookingToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
