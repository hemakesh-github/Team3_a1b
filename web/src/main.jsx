import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
} from "react-router-dom";
import { GuestContext, RecordPicker, useApi, ErrorBox, Field } from "./shared";
import { Browse, Property, Guests, Wallet } from "./pages";
import { BookingForm, Bookings } from "./bookings";
import { Analytics, Reviews } from "./reports";
import { Hotspots } from "./hotspots";
import "./style.css";

// The shell owns demo actor selection; switching actors remounts views to clear stale forms.
function App() {
  const [role, setRole] = useState(
    localStorage.getItem("stayspot-role") === "staff" ? "staff" : "guest",
  );
  const [guestId, setGuestId] = useState(
    localStorage.getItem("stayspot-guest") || "",
  );
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const initialGuest = useApi(guestId ? null : "/guests?limit=1");
  useEffect(() => {
    const first = initialGuest.data?.items[0];
    if (!guestId && first) {
      setGuestId(first.id);
      localStorage.setItem("stayspot-guest", first.id);
    }
  }, [guestId, initialGuest.data]);
  // Confirm before discarding a partially entered booking when changing the demo actor.
  function switchGuest(id) {
    if (
      /^\/properties\/[^/]+\/book$/.test(window.location.pathname) &&
      !window.confirm("Switch guest and discard any unfinished booking form?")
    )
      return;
    setGuestId(id);
    localStorage.setItem("stayspot-guest", id);
  }
  return (
    <GuestContext.Provider
      value={{
        role,
        guestId,
        setGuestId: switchGuest,
        revision,
        refreshGuest: () => setRevision((n) => n + 1),
      }}
    >
      <header>
        <NavLink className="brand" to="/properties">
          StaySpot<span>A place for every stay.</span>
        </NavLink>
        <div className="actor role-controls">
          <Field label="View as">
            <select
              value={role}
              onChange={(event) => {
                if (
                  /^\/properties\/[^/]+\/book$/.test(
                    window.location.pathname,
                  ) &&
                  !window.confirm(
                    "Switch role and discard any unfinished booking form?",
                  )
                )
                  return;
                setRole(event.target.value);
                localStorage.setItem("stayspot-role", event.target.value);
                setOpen(false);
              }}
            >
              <option value="guest">Guest</option>
              <option value="staff">Staff</option>
            </select>
          </Field>
          {role === "guest" && (
            <RecordPicker
              type="guests"
              label="Selected guest"
              value={guestId}
              onChange={switchGuest}
              onMissing={() => {
                localStorage.removeItem("stayspot-guest");
                setGuestId("");
              }}
            />
          )}
        </div>
        <button
          className="menu-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          Menu
        </button>
      </header>
      <div className="workspace">
        <aside className={open ? "open" : ""}>
          <small>WORKSPACE</small>
          <nav>
            {[
              ["/properties", "Browse"],
              ["/bookings", "Bookings"],
              ["/guests", "Guests"],
              ["/wallet", "Wallet & audit"],
              ["/analytics", "Analytics"],
              ["/hotspots", "Search hotspots"],
              ["/reviews", "Reviews"],
            ]
              .filter(([path]) => path !== "/guests" || role === "staff")
              .map(([path, title]) => (
                <NavLink key={path} to={path} onClick={() => setOpen(false)}>
                  {title}
                </NavLink>
              ))}
          </nav>
        </aside>
        <main key={`${role}:${guestId}`}>
          <ErrorBox error={initialGuest.error} retry={initialGuest.reload} />
          <Routes>
            <Route path="/" element={<Navigate to="/properties" replace />} />
            <Route path="/properties" element={<Browse />} />
            <Route path="/properties/:id" element={<Property />} />
            <Route path="/properties/:id/book" element={<BookingForm />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/bookings/:id" element={<Bookings />} />
            <Route
              path="/guests"
              element={
                role === "staff" ? (
                  <Guests />
                ) : (
                  <Navigate to="/properties" replace />
                )
              }
            />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/hotspots" element={<Hotspots />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route
              path="*"
              element={
                <>
                  <h1>Page not found</h1>
                  <NavLink to="/properties">Browse properties</NavLink>
                </>
              }
            />
          </Routes>
        </main>
      </div>
    </GuestContext.Provider>
  );
}

// Mount the single-page application with client-side navigation.
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
