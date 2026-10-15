import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { BookingReview } from "./booking-review";
import {
  useApi,
  useGuest,
  request,
  Heading,
  Field,
  LoadState,
  ErrorBox,
  Metrics,
  Badge,
  Pager,
  RecordPicker,
  money,
  stamp,
  shortId,
  query,
} from "./shared";

// Split preview from confirmation so the user sees the server-calculated charge first.
export function BookingForm() {
  const { id } = useParams(),
    { guestId, refreshGuest } = useGuest();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const property = useApi(`/properties/${id}`);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [dates, setDates] = useState({ check_in: "", check_out: "" });
  const [quote, setQuote] = useState(null),
    [success, setSuccess] = useState(null),
    [error, setError] = useState(null),
    [pending, setPending] = useState(false);
  async function preview(event) {
    // Quote requests are read-only and reset when either date changes.
    event.preventDefault();
    const entered = Object.fromEntries(new FormData(event.currentTarget));
    setDates(entered);
    setPending(true);
    setError(null);
    setQuote(null);
    try {
      setQuote(
        await request("/bookings/quote", "POST", {
          guest_id: guestId,
          property_id: id,
          ...entered,
        }),
      );
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  async function confirm() {
    // Disable repeat clicks and keep uncertain network outcomes from being resubmitted blindly.
    setPending(true);
    setError(null);
    try {
      setSuccess(
        await request("/bookings", "POST", {
          guest_id: guestId,
          property_id: id,
          ...dates,
        }),
      );
      refreshGuest();
    } catch (error) {
      setError(error);
      if (error.uncertain) setOutcomeUnknown(true);
      setQuote(null);
    } finally {
      setPending(false);
    }
  }
  if (success)
    return (
      <>
        <Heading title="Your stay is confirmed">
          {property.data?.title} · {dates.check_in} – {dates.check_out}
        </Heading>
        <Badge status="CONFIRMED" />
        <Metrics
          items={[
            ["Balance before", money(success.balance_before)],
            ["Amount charged", money(success.audit.amount)],
            ["Balance after", money(success.balance_after)],
          ]}
        />
        <section className="card">
          <h2>New wallet audit entry</h2>
          <dl className="details">
            <dt>Entry</dt>
            <dd>{success.audit.id}</dd>
            <dt>Action</dt>
            <dd>{success.audit.action}</dd>
            <dt>Amount</dt>
            <dd>{money(success.audit.amount)}</dd>
            <dt>Balance after</dt>
            <dd>{money(success.audit.balance_after)}</dd>
            <dt>Recorded at</dt>
            <dd>{stamp(success.audit.timestamp)}</dd>
          </dl>
          <p className="muted">
            This entry was created automatically with the booking.
          </p>
        </section>
        <div className="actions">
          <Link
            className="button primary"
            to={`/bookings/${success.booking.id}`}
          >
            View booking
          </Link>
          <Link className="button" to="/wallet">
            View wallet history
          </Link>
          <Link to="/properties">Browse more stays</Link>
        </div>
      </>
    );
  return (
    <>
      <Heading title="Review your booking">
        Confirm the dates and wallet charge before booking.
      </Heading>
      <LoadState state={property}>
        <div className="split">
          <section className="card">
            <h2>Stay details</h2>
            <h3>{property.data?.title}</h3>
            <form onSubmit={preview}>
              <div className="form-grid">
                {["check_in", "check_out"].map((key) => (
                  <Field
                    key={key}
                    label={key === "check_in" ? "Check-in" : "Check-out"}
                  >
                    <input
                      name={key}
                      required
                      type="date"
                      min={
                        key === "check_in"
                          ? today
                          : new Date(
                              Date.parse(
                                `${dates.check_in || today}T00:00:00Z`,
                              ) + 86400000,
                            )
                              .toISOString()
                              .slice(0, 10)
                      }
                      value={dates[key]}
                      disabled={pending}
                      onInput={(e) => {
                        setDates({ ...dates, [key]: e.target.value });
                        setQuote(null);
                        if (!outcomeUnknown) setError(null);
                      }}
                    />
                  </Field>
                ))}
              </div>
              <p className="muted">
                Check-in must be today or later; check-out must be after
                check-in. Price is calculated by the server.
              </p>
              <button disabled={pending || !guestId || outcomeUnknown}>
                {pending ? "Please wait…" : "Review price & wallet"}
              </button>
            </form>
            {quote && (
              <>
                <p>
                  {quote.nights} nights × {money(quote.nightly_price)}
                </p>
                <button
                  className="primary"
                  disabled={pending || Number(quote.shortfall) > 0}
                  onClick={confirm}
                >
                  {pending
                    ? "Confirming booking…"
                    : `Confirm booking · ${money(quote.total_cost)}`}
                </button>
              </>
            )}
            <ErrorBox error={error} />
            <p>
              <Link to={`/properties/${id}`}>← Back to property</Link>
            </p>
          </section>
          <section className="card">
            <h2>Wallet summary</h2>
            {quote ? (
              <>
                <dl className="details">
                  <dt>Balance before</dt>
                  <dd>{money(quote.wallet_balance)}</dd>
                  <dt>Booking charge</dt>
                  <dd>{money(quote.total_cost)}</dd>
                  <dt>Expected balance</dt>
                  <dd>{money(quote.expected_balance)}</dd>
                </dl>
                {Number(quote.shortfall) > 0 && (
                  <div className="notice error">
                    Your wallet needs {money(quote.shortfall)} more. Change
                    dates or choose another guest.
                  </div>
                )}
              </>
            ) : (
              <p>Enter dates to preview your charge and remaining balance.</p>
            )}
            <p className="muted">
              Your balance is rechecked on confirmation. A failed booking does
              not charge your wallet.
            </p>
          </section>
        </div>
      </LoadState>
    </>
  );
}

// Browse stays and display the selected booking's permitted next action.
export function Bookings() {
  const { id } = useParams(),
    [params] = useSearchParams(),
    { guestId } = useGuest();
  const [filters, setFilters] = useState({
    guest_id: params.get("guest_id") || guestId,
    status: "",
  });
  const [error, setError] = useState(null),
    [pending, setPending] = useState(false);
  // A conflict on the previous record must not follow the user into another booking.
  useEffect(() => {
    setError(null);
  }, [id]);
  const state = useApi(`/bookings?${query(filters)}`),
    detail = useApi(id ? `/bookings/${id}` : null);
  async function advance() {
    // Only offer forward transitions; the database still protects the active-stay constraint.
    setPending(true);
    setError(null);
    try {
      await request(`/bookings/${id}/status`, "PATCH", {
        status: detail.data.status === "CONFIRMED" ? "CHECKED_IN" : "COMPLETED",
      });
      detail.reload();
      state.reload();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Heading title="Manage bookings">
        Inspect stays and move them through confirmed, checked in, and
        completed.
      </Heading>
      <div className="filters">
        <RecordPicker
          type="guests"
          label="Guest"
          value={filters.guest_id}
          onChange={(guest_id) =>
            setFilters({ ...filters, guest_id, cursor: null })
          }
        />
        <Field label="Status">
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters({ ...filters, status: e.target.value, cursor: null })
            }
          >
            <option value="">All statuses</option>
            {["CONFIRMED", "CHECKED_IN", "COMPLETED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <button onClick={() => setFilters({ guest_id: "", status: "" })}>
          All guests
        </button>
      </div>
      {id && (
        <LoadState state={detail}>
          <section className="card">
            <h2>Selected booking · {shortId(id)}</h2>
            <h3>{detail.data?.property_title}</h3>
            <p>
              {detail.data?.guest_name} · {detail.data?.check_in} –{" "}
              {detail.data?.check_out} · {detail.data?.nights} nights ·{" "}
              {money(detail.data?.total_cost)}
            </p>
            <div className="actions">
              <Badge status={detail.data?.status} />
              <span className="muted">CONFIRMED → CHECKED_IN → COMPLETED</span>
            </div>
            {detail.data && detail.data.status !== "COMPLETED" && (
              <button
                className="primary"
                disabled={pending || error?.uncertain}
                onClick={advance}
              >
                {pending
                  ? "Updating…"
                  : detail.data.status === "CONFIRMED"
                    ? "Check in guest"
                    : "Complete stay"}
              </button>
            )}
            {detail.data?.status === "COMPLETED" && (
              <BookingReview key={detail.data.id} booking={detail.data} />
            )}
            <ErrorBox error={error} />
            {error?.uncertain && (
              <button
                onClick={() => {
                  setError(null);
                  detail.reload();
                }}
              >
                Reload booking status
              </button>
            )}
          </section>
        </LoadState>
      )}
      <LoadState state={state} empty={state.data?.items.length === 0}>
        <section className="card table-wrap">
          <h2>Bookings</h2>
          <table>
            <thead>
              <tr>
                <th>Property / guest</th>
                <th>Dates</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.data?.items.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.property_title}</strong>
                    <small>{b.guest_name}</small>
                  </td>
                  <td>
                    {b.check_in}
                    <small>to {b.check_out}</small>
                  </td>
                  <td>{money(b.total_cost)}</td>
                  <td>
                    <Badge status={b.status} />
                  </td>
                  <td>
                    <Link to={`/bookings/${b.id}`}>View details →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </LoadState>
      <Pager
        data={state.data}
        onChange={(cursor) => setFilters({ ...filters, cursor })}
      />
    </>
  );
}
