import React, { useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  useApi,
  useGuest,
  Heading,
  Field,
  LoadState,
  Pager,
  Metrics,
  Catalog,
  money,
  stamp,
  shortId,
  query,
} from "./shared";

// Property browsing keeps filters and pagination in the URL, including browser Back support.
export function Browse() {
  const { role } = useGuest();
  const [params, setParams] = useSearchParams();
  const state = useApi(`/properties?${params}`);
  function filter(event) {
    // Reset pagination whenever the search or price range changes.
    event.preventDefault();
    setParams(query(Object.fromEntries(new FormData(event.currentTarget))));
  }
  return (
    <>
      <Heading title="Find your next stay">
        Browse properties, inspect amenities, and book using your wallet.
      </Heading>
      <form className="filters" onSubmit={filter}>
        <Field label="Search properties">
          <input
            name="q"
            defaultValue={params.get("q") || ""}
            placeholder="Search by title"
          />
        </Field>
        <Field label="Minimum nightly price">
          <input
            name="min_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={params.get("min_price") || ""}
          />
        </Field>
        <Field label="Maximum nightly price">
          <input
            name="max_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={params.get("max_price") || ""}
          />
        </Field>
        <Field label="Sort">
          <select name="sort" defaultValue={params.get("sort") || "title_asc"}>
            <option value="title_asc">Title A–Z</option>
            <option value="title_desc">Title Z–A</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
        </Field>
        <button className="primary">Search</button>
      </form>
      <div className="tabs">
        <Link className="button primary" to="/properties">
          Properties
        </Link>
        {role === "staff" && (
          <Link className="button" to="/guests">
            Guests
          </Link>
        )}
        <Link className="button" to="/bookings">
          Bookings
        </Link>
      </div>
      <LoadState state={state} empty={state.data?.items.length === 0}>
        <div className="property-grid">
          {state.data?.items.map((p) => (
            <article className="card property-card" key={p.id}>
              <span className="eyebrow">VACATION RENTAL</span>
              <h2>{p.title}</h2>
              <p>
                <strong>{money(p.base_price)}</strong> / night
              </p>
              <p className="muted">
                {p.latitude.toFixed(3)}°, {p.longitude.toFixed(3)}°
              </p>
              <Link className="button" to={`/properties/${p.id}`}>
                View property →
              </Link>
            </article>
          ))}
        </div>
      </LoadState>
      <Pager
        data={state.data}
        onChange={(cursor) =>
          setParams(query({ ...Object.fromEntries(params), cursor }))
        }
      />
    </>
  );
}

// Combine relational property details with its flexible MongoDB amenities document.
export function Property() {
  const { id } = useParams(),
    { guestId } = useGuest();
  const state = useApi(`/properties/${id}`),
    catalog = useApi(`/properties/${id}/amenities`),
    guest = useApi(guestId ? `/guests/${guestId}` : null);
  return (
    <>
      <Heading title={state.data?.title || "Property details"}>
        Browse / Properties / Details
      </Heading>
      <LoadState state={state}>
        <div className="split">
          <section className="card">
            <h2>A closer look</h2>
            <div className="large-number">
              {money(state.data?.base_price)} <small>/ night</small>
            </div>
            <p>
              Location: {state.data?.latitude.toFixed(4)}°,{" "}
              {state.data?.longitude.toFixed(4)}°
            </p>
            <LoadState state={catalog}>
              <Catalog data={catalog.data} />
            </LoadState>
          </section>
          <section className="card">
            <h2>Plan a stay</h2>
            <LoadState state={guest}>
              <h3>Wallet: {money(guest.data?.wallet_balance)}</h3>
            </LoadState>
            <p>Choose your dates and review the charge before confirming.</p>
            {guestId ? (
              <Link className="button primary" to={`/properties/${id}/book`}>
                Review booking →
              </Link>
            ) : (
              <p>Choose a guest first.</p>
            )}
            <p>
              <Link to={`/reviews?property_id=${id}`}>
                View review analytics →
              </Link>
            </p>
          </section>
        </div>
      </LoadState>
      <Link to="/properties">← Back to properties</Link>
    </>
  );
}

// Let platform staff browse guests without silently changing the active demo actor.
export function Guests() {
  const { setGuestId } = useGuest(),
    [filters, setFilters] = useState({}),
    [selected, setSelected] = useState("");
  const detailPanel = useRef(null);
  const state = useApi(`/guests?${query(filters)}`),
    detail = useApi(selected ? `/guests/${selected}` : null);
  function viewGuest(id) {
    setSelected(id);
    // Bring the result into view, including when the same guest is selected again.
    requestAnimationFrame(() => {
      detailPanel.current?.focus({ preventScroll: true });
      detailPanel.current?.scrollIntoView({ block: "start" });
    });
  }
  function search(event) {
    // Search both names and emails on the server.
    event.preventDefault();
    setFilters({ q: new FormData(event.currentTarget).get("q") });
  }
  return (
    <>
      <Heading title="Guests">
        Find a guest, inspect their wallet, and switch the selected guest.
      </Heading>
      <form className="filters" onSubmit={search}>
        <Field label="Search guests">
          <input name="q" placeholder="Search by guest name" />
        </Field>
        <button className="primary">Search</button>
      </form>
      {selected && (
        <section
          className="card"
          ref={detailPanel}
          tabIndex={-1}
          aria-label="Selected guest details"
        >
          <LoadState state={detail}>
            <h2>{detail.data?.name}</h2>
            <h3>Wallet balance: {money(detail.data?.wallet_balance)}</h3>
            <p title={selected}>Guest ID: {shortId(selected)}</p>
            <div className="actions">
              <button className="primary" onClick={() => setGuestId(selected)}>
                Select guest
              </button>
              <Link className="button" to={`/bookings?guest_id=${selected}`}>
                View bookings
              </Link>
              <Link className="button" to={`/wallet?guest_id=${selected}`}>
                View wallet history
              </Link>
            </div>
          </LoadState>
        </section>
      )}
      <LoadState state={state} empty={state.data?.items.length === 0}>
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Guest</th>
                <th>Wallet</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.data?.items.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td>{money(g.wallet_balance)}</td>
                  <td>
                    <button onClick={() => viewGuest(g.id)}>
                      View guest →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LoadState>
      <Pager
        data={state.data}
        onChange={(cursor) => setFilters({ ...filters, cursor })}
      />
    </>
  );
}

// Show stored balances after each change rather than reconstructing history from zero.
export function Wallet() {
  const { guestId } = useGuest(),
    [params] = useSearchParams(),
    id = params.get("guest_id") || guestId;
  const [filters, setFilters] = useState({});
  const guest = useApi(id ? `/guests/${id}` : null),
    state = useApi(id ? `/guests/${id}/audit?${query(filters)}` : null);
  function filter(event) {
    // Date changes reset the current page and update period totals on the server.
    event.preventDefault();
    setFilters(Object.fromEntries(new FormData(event.currentTarget)));
  }
  if (!id)
    return (
      <Heading title="Wallet & audit trail">
        Choose a guest to view their history.
      </Heading>
    );
  return (
    <>
      <Heading title="Wallet & audit trail">
        {guest.data?.name} · Read-only history of balance changes
      </Heading>
      {state.data && !state.loading && !state.error && (
        <Metrics
          items={[
            ["Current wallet balance", money(state.data?.wallet_balance)],
            ["Selected period debits", money(state.data?.debits)],
            ["Selected period credits", money(state.data?.credits)],
          ]}
        />
      )}
      <form className="filters" onSubmit={filter}>
        <Field label="From">
          <input name="from" type="date" />
        </Field>
        <Field label="To">
          <input name="to" type="date" />
        </Field>
        <button className="primary">Apply dates</button>
      </form>
      <LoadState state={state} empty={state.data?.items.length === 0}>
        <section className="card table-wrap">
          <h2>Wallet history</h2>
          <table>
            <thead>
              <tr>
                <th>Recorded at</th>
                <th>Action</th>
                <th>Amount</th>
                <th>Balance after</th>
                <th>Audit entry</th>
              </tr>
            </thead>
            <tbody>
              {state.data?.items.map((a) => (
                <tr key={a.id}>
                  <td>{stamp(a.timestamp)}</td>
                  <td>{a.action}</td>
                  <td>
                    {a.action === "DEBIT" ? "−" : "+"}
                    {money(a.amount)}
                  </td>
                  <td>{money(a.balance_after)}</td>
                  <td title={a.id}>{shortId(a.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            Balance after each change is the recorded running balance. No edit
            or delete actions.
          </p>
        </section>
      </LoadState>
      <Pager
        data={state.data}
        onChange={(cursor) => setFilters({ ...filters, cursor })}
      />
    </>
  );
}
