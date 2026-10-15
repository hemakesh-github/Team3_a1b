import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useApi,
  request,
  Heading,
  Field,
  LoadState,
  ErrorBox,
  Metrics,
  Pager,
  RecordPicker,
  Catalog,
  money,
  stamp,
  query,
} from "./shared";

// Draw a small accessible SVG chart and retain exact values in an expandable data table.
function RevenueChart({ rows }) {
  if (!rows.length) return <p>No bookings in this date range.</p>;
  const max = Math.max(1, ...rows.map((r) => Number(r.moving_avg_7d)));
  const start = Date.parse(rows[0].booking_day),
    span = Math.max(86400000, Date.parse(rows.at(-1).booking_day) - start);
  const points = rows
    .map(
      (r) =>
        `${65 + ((Date.parse(r.booking_day) - start) / span) * 790},${235 - (Number(r.moving_avg_7d) / max) * 190}`,
    )
    .join(" ");
  return (
    <>
      <svg
        className="chart"
        viewBox="0 0 900 285"
        role="img"
        aria-label="Seven-day moving average revenue over the selected dates"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1="65"
              x2="855"
              y1={235 - t * 190}
              y2={235 - t * 190}
              stroke="#d8d8d3"
            />
            <text x="58" y={240 - t * 190} textAnchor="end" fontSize="12">
              {Math.round(max * t)}
            </text>
          </g>
        ))}
        <polyline
          points={points}
          fill="none"
          stroke="#246b60"
          strokeWidth="3"
        />
        {rows.length === 1 && (
          <circle
            cx="65"
            cy={235 - (Number(rows[0].moving_avg_7d) / max) * 190}
            r="5"
            fill="#246b60"
          />
        )}
        <text x="65" y="268" fontSize="13">
          {rows[0].booking_day}
        </text>
        <text x="855" y="268" textAnchor="end" fontSize="13">
          {rows.at(-1).booking_day}
        </text>
      </svg>
      <details>
        <summary>View chart values</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Daily revenue</th>
                <th>Moving average</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.booking_day}>
                  <td>{r.booking_day}</td>
                  <td>{money(r.daily_total)}</td>
                  <td>{money(r.moving_avg_7d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

// Keep chart date filters separate from the all-history rankings and materialized summaries.
export function Analytics() {
  const today = new Date().toISOString().slice(0, 10),
    past = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const [property, setProperty] = useState(""),
    [dates, setDates] = useState({ from: past, to: today }),
    [cursor, setCursor] = useState(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(null);
  const revenue = useApi(
    property
      ? `/analytics/revenue?${query({ property_id: property, ...dates })}`
      : null,
  );
  const rankings = useApi(`/analytics/revenue/rankings?${query({ cursor })}`),
    summary = useApi(
      `/analytics/properties?${query({ property_id: property })}`,
    );
  async function refresh() {
    // Refetch only after the server successfully refreshes the materialized view.
    setPending(true);
    setError(null);
    try {
      await request("/analytics/refresh", "POST");
      summary.reload();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  function filter(event) {
    // Apply a valid display range without changing the all-history rank scope.
    event.preventDefault();
    setDates(Object.fromEntries(new FormData(event.currentTarget)));
  }
  return (
    <>
      <Heading title="Property performance">
        Revenue trends, ranked properties and stored summaries.
      </Heading>
      <div className="filters">
        <RecordPicker
          type="properties"
          label="Property"
          value={property}
          onChange={setProperty}
          allowAll
        />
        <form className="filters" onSubmit={filter}>
          <Field label="From">
            <input type="date" name="from" required defaultValue={past} />
          </Field>
          <Field label="To">
            <input type="date" name="to" required defaultValue={today} />
          </Field>
          <button className="primary">Apply dates</button>
        </form>
      </div>
      <LoadState state={summary}>
        <Metrics
          items={[
            ["Bookings · all history", summary.data?.totals.total_bookings],
            [
              "Nights booked · all history",
              summary.data?.totals.total_nights_booked,
            ],
            [
              "Gross revenue · all history",
              money(summary.data?.totals.gross_revenue),
            ],
          ]}
        />
      </LoadState>
      <section className="card">
        <h2>7-day moving average</h2>
        {property ? (
          <LoadState state={revenue}>
            <RevenueChart rows={revenue.data?.items || []} />
          </LoadState>
        ) : (
          <p>Select a property to view its revenue chart.</p>
        )}
        <p className="muted">
          Average over booking days within the calendar window; days without
          bookings are excluded.
        </p>
      </section>
      <LoadState state={rankings} empty={rankings.data?.items.length === 0}>
        <section className="card table-wrap">
          <h2>Revenue ranking · all history</h2>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Property</th>
                <th>Total revenue</th>
              </tr>
            </thead>
            <tbody>
              {rankings.data?.items.map((p) => (
                <tr key={p.property_id}>
                  <td>{p.revenue_rank}</td>
                  <td>{p.title}</td>
                  <td>{money(p.total_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </LoadState>
      <Pager data={rankings.data} onChange={setCursor} />
      <div className="actions">
        <span>
          Summary last refreshed: {stamp(summary.data?.last_refreshed_at)}
        </span>
        <button disabled={pending} onClick={refresh}>
          {pending ? "Refreshing…" : "Refresh summary"}
        </button>
      </div>
      <ErrorBox error={error} />
      {error?.uncertain && (
        <button
          onClick={() => {
            summary.reload();
            setError(null);
          }}
        >
          Reload summary
        </button>
      )}
    </>
  );
}
