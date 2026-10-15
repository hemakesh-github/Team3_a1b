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
