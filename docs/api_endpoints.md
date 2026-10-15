# StaySpot API endpoints

| Endpoint | Inputs | Outputs |
|---|---|---|
| `GET /api/guests` | Optional query: `q` (name/email), `limit`, `cursor` | Guest list (`id`, `name`, `email`, `wallet_balance`), `previous_cursor`, `next_cursor`. |
| `GET /api/guests/{id}` | Path: guest `id` | Guest `id`, `name`, `email`, `wallet_balance`. |
| `GET /api/properties` | Optional query: `q` (title), `min_price`, `max_price`, `sort` (title/price ascending or descending), `limit`, `cursor` | Property list (`id`, `title`, `base_price`, coordinates), `previous_cursor`, `next_cursor`. |
| `GET /api/properties/{id}` | Path: property `id` | Property `id`, `title`, `base_price`, coordinates. |
| `GET /api/properties/{id}/amenities` | Path: property `id` | Amenities, house rules, accessibility features and other available catalog fields; `null` if no catalog exists. |
| `GET /api/bookings` | Optional query: `guest_id`, `property_id`, `status`, `limit`, `cursor` | Bookings with IDs, guest names, property titles, check-in/out dates, total costs and statuses; `previous_cursor`, `next_cursor`. |
| `GET /api/bookings/{id}` | Path: booking `id` | Booking `id`, guest ID/name, property ID/title, check-in/out dates, nights, total cost and status. |
| `POST /api/bookings/quote` | Body: `guest_id`, `property_id`, `check_in`, `check_out` | Nights, nightly price, total cost, current wallet balance, expected balance after booking and any shortfall; or field-validation errors. |
| `POST /api/bookings` | Body: `guest_id`, `property_id`, `check_in`, `check_out` | Created booking, `balance_before`, `balance_after`, new audit entry (`id`, action, amount, `balance_after`, timestamp); or error code/message with field errors or insufficient-funds balance, cost and shortfall. |
| `PATCH /api/bookings/{id}/status` | Path: booking `id`; body: `status` (`CHECKED_IN` or `COMPLETED`) | Updated booking; or error code/message, including `active_booking_id` for an active-stay conflict. |
| `GET /api/guests/{id}/audit` | Path: guest `id`; optional query: `from`, `to`, `limit`, `cursor` | Audit entries (`id`, action, amount, timestamp, `balance_after`), current wallet balance, debit/credit totals for the entire selected period, `previous_cursor`, `next_cursor`. |
| `GET /api/analytics/revenue` | Query: `property_id`, `from`, `to` | Daily revenue and seven-day moving-average values for the selected property and date range. |
| `GET /api/analytics/revenue/rankings` | Optional query: `limit`, `cursor` | All-history property revenue rankings (`property_id`, title, total revenue, dense rank), `previous_cursor`, `next_cursor`. |
| `GET /api/analytics/properties` | Optional query: `property_id`, `limit`, `cursor` | Property summary rows (booking count, nights booked, gross revenue), totals across all matching properties, `last_refreshed_at`, `previous_cursor`, `next_cursor`. |
| `POST /api/analytics/refresh` | None | `last_refreshed_at` after a successful summary refresh; or error code/message. |
| `GET /api/search/hotspots` | Query: `latitude`, `longitude`; optional: `limit`, `cursor` | Search pins from the last two hours within 5 km, ordered by distance (`id`, coordinates, timestamp, `distance_meters`); distance-band counts, `next_cursor`, `updated_at`. |
| `POST /api/search/sessions` | Body: `latitude`, `longitude` | Created search pin: session `id`, coordinates and timestamp; or field-validation errors. |
| `GET /api/reviews/analytics` | Optional query: `property_id` (omit for all properties) | Rating distribution, top tags with counts, average rating and review count. |

## Guest-written reviews

| Endpoint | Inputs | Outputs |
|---|---|---|
| `GET /api/bookings/{id}/review` | Booking UUID | Saved review or `null`; 404 if the booking does not exist. |
| `POST /api/bookings/{id}/review` | Booking UUID; body: `guest_id`, integer `rating` (1–5), optional `tags` (up to 12 strings), optional `comment` (up to 2,000 characters) | 201 with `booking_id`, `property_id`, `guest_id`, `rating`, deduplicated `tags`, trimmed `comment`, `created_at`. |

The selected guest must own the booking (403 otherwise), and the booking must be
`COMPLETED` (409 `STAY_NOT_COMPLETED` otherwise). One review is allowed per booking,
including concurrent requests; duplicates return 409 `REVIEW_EXISTS`. Invalid
fields return 400. Tags use lowercase letters/digits separated by underscores and
are at most 40 characters each. Property and author IDs are derived from the
booking, not accepted as independent client claims. Actor switching is not login
or authorization for a production system. Existing seeded reviews without a
booking ID continue to participate in analytics. Reviews have no edit/delete API.
