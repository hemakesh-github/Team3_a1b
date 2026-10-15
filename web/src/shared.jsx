import React, { createContext, useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { requestFailure } from "./request-errors";

export const GuestContext = createContext(null);
export const useGuest = () => useContext(GuestContext); // Share only the demo actor across screens.
export const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }); // Format display values, not booking calculations.
export const stamp = (value) =>
  value ? new Date(value).toLocaleString() : "Not recorded"; // Display timestamps in the viewer's local time.
export const shortId = (value) => value?.slice(0, 8); // Short labels retain full identifiers in API requests.

// Omit blank filters and encode every value safely.
export function query(values) {
  return new URLSearchParams(
    Object.entries(values).filter(
      ([, value]) => value !== "" && value !== null && value !== undefined,
    ),
  ).toString();
}

// Normalize network and API failures in one place; never retry a mutation automatically.
export async function request(path, method = "GET", body, signal) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw requestFailure(path, method);
  }
  // An unreadable response also leaves a mutation's outcome unknown.
  let result;
  try {
    result = await response.json();
  } catch {
    throw requestFailure(path, method);
  }
  if (!response.ok)
    throw Object.assign(
      new Error(result.error?.message || "Request failed."),
      result.error,
      { status: response.status },
    );
  return result;
}

// Abort old reads when filters change to avoid showing late responses for a previous selection.
export function useApi(path) {
  const [state, setState] = useState({
    path,
    data: null,
    loading: true,
    error: null,
  });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) {
      setState({ path, data: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState({ path, data: null, loading: true, error: null });
    request(path, "GET", undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ path, data, loading: false, error: null });
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setState({ path, data: null, loading: false, error });
      });
    return () => controller.abort();
  }, [path, version]);
  const current =
    state.path === path
      ? state
      : { data: null, loading: Boolean(path), error: null };
  return { ...current, reload: () => setVersion((n) => n + 1) };
}

// Keep failures actionable, including the active booking that blocks check-in.
export function ErrorBox({ error, retry }) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      <strong>{error.message}</strong>
      {error.fields && (
        <ul>
          {Object.entries(error.fields).map(([key, value]) => (
            <li key={key}>
              {key.replaceAll("_", " ")}: {value}
            </li>
          ))}
        </ul>
      )}
      {error.shortfall && (
        <p>
          Balance {money(error.wallet_balance)} · Cost {money(error.total_cost)}{" "}
          · Shortfall {money(error.shortfall)}
        </p>
      )}
      {error.active_booking_id && (
        <Link to={`/bookings/${error.active_booking_id}`}>
          View active booking →
        </Link>
      )}
      {error.recoveryHref && (
        <Link to={error.recoveryHref}>{error.recoveryLabel}</Link>
      )}
      {retry && <button onClick={retry}>Retry</button>}
    </div>
  );
}

// Reuse loading, error and empty presentation on every data screen.
export function LoadState({ state, empty, children }) {
  if (state.loading)
    return (
      <div className="notice" role="status">
        Loading…
      </div>
    );
  if (state.error) return <ErrorBox error={state.error} retry={state.reload} />;
  if (empty)
    return (
      <div className="notice">
        No matching results. Try changing your filters.
      </div>
    );
  return children;
}
export function Heading({ title, children }) {
  // Give every route a consistent title and short explanation.
  return (
    <div className="page-heading">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Field({ label, children }) {
  // Wrapping the control associates its visible label without generated IDs.
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Pager({ data, onChange }) {
  // A page contains at most 25 records; cursor history stays on the server contract.
  return (
    <div className="pager">
      <span>{data?.items?.length || 0} shown · 25 per page</span>
      <button
        disabled={!data?.previous_cursor}
        onClick={() => onChange(data.previous_cursor)}
      >
        ← Previous
      </button>
      <button
        disabled={!data?.next_cursor}
        onClick={() => onChange(data.next_cursor)}
      >
        Next →
      </button>
    </div>
  );
}
export function Metrics({ items }) {
  // Present the same metric-card pattern on wallet, booking and analytics pages.
  return (
    <div className="metrics">
      {items.map(([label, value]) => (
        <div className="card metric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
export function Badge({ status }) {
  // Status always has a text label as well as color.
  return (
    <span className={`badge ${status?.toLowerCase()}`}>
      {status?.replaceAll("_", " ")}
    </span>
  );
}
export function Catalog({ data }) {
  // Render flexible nested catalog fields instead of assuming every property has the same schema.
  if (!data)
    return (
      <p className="muted">
        Catalog information not provided for this property.
      </p>
    );
  return (
    <dl className="catalog">
      {Object.entries(data)
        .filter(([key]) => !["_id", "property_id"].includes(key))
        .map(([key, value]) => (
          <div key={key}>
            <dt>{key.replaceAll("_", " ")}</dt>
            <dd>
              {Array.isArray(value) ? (
                value
                  .map((item) => String(item).replaceAll("_", " "))
                  .join(" · ") || "Not provided"
              ) : value && typeof value === "object" ? (
                <Catalog data={value} />
              ) : typeof value === "boolean" ? (
                value ? (
                  "Yes"
                ) : (
                  "No"
                )
              ) : (
                String(value ?? "Not provided")
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}

// Search selectors request only a small page rather than loading thousands of options.
export function RecordPicker({
  type,
  value,
  onChange,
  label,
  allowAll = false,
  onMissing,
}) {
  const [search, setSearch] = useState(""),
    [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const state = useApi(`/${type}?${query({ q: term, limit: 25 })}`);
  const selected = useApi(value ? `/${type}/${value}` : null);
  useEffect(() => {
    if (selected.error?.status === 404 && onMissing) onMissing();
  }, [selected.error, onMissing]);
  const rows = state.data?.items || [];
  const options =
    value && selected.data && !rows.some((row) => row.id === value)
      ? [selected.data, ...rows]
      : rows;
  return (
    <div className="picker">
      <Field label={`Search ${label.toLowerCase()}`}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type to search…"
        />
      </Field>
      <Field label={label}>
        <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">{allowAll ? "All properties" : "Choose…"}</option>
          {options.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name || row.title}
            </option>
          ))}
        </select>
      </Field>
      {state.loading && <small role="status">Searching…</small>}
      <ErrorBox error={state.error} retry={state.reload} />
      {!state.error && (
        <ErrorBox error={selected.error} retry={selected.reload} />
      )}
      {!state.loading && !state.error && !rows.length && (
        <small>No matches.</small>
      )}
    </div>
  );
}
