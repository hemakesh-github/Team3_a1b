import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  request,
  Heading,
  Field,
  ErrorBox,
  stamp,
  shortId,
  query,
} from "./shared";

// Leaflet owns only this map element; React owns the surrounding controls and accessible list.
function SearchMap({ origin, pins }) {
  const element = useRef(null),
    map = useRef(null),
    markers = useRef(null);
  useEffect(() => {
    map.current = L.map(element.current).setView(
      [origin.latitude, origin.longitude],
      12,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map.current);
    markers.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    markers.current.clearLayers();
    const center = [Number(origin.latitude), Number(origin.longitude)];
    L.circle(center, {
      radius: 5000,
      color: "#246b60",
      dashArray: "7 7",
      fillOpacity: 0.035,
    }).addTo(markers.current);
    L.circleMarker(center, { radius: 5, color: "#242424" })
      .addTo(markers.current)
      .bindTooltip("Selected origin");
    pins.forEach((pin) => {
      // Tooltip content is plain text derived from the server's generated identifier and distance.
      const text = document.createElement("span");
      text.textContent = `${shortId(pin.id)} · ${(pin.distance_meters / 1000).toFixed(2)} km`;
      L.circleMarker([pin.coordinates[1], pin.coordinates[0]], {
        radius: 6,
        color: "#246b60",
        fillOpacity: 0.8,
      })
        .addTo(markers.current)
        .bindTooltip(text);
    });
  }, [origin, pins]);
  useEffect(() => {
    map.current.setView(
      [Number(origin.latitude), Number(origin.longitude)],
      12,
    );
  }, [origin]);
  return (
    <div
      className="map"
      ref={element}
      aria-label="Search pins within five kilometres of the selected origin"
    />
  );
}

// Poll the current result page and keep its last good result visible if the connection fails.
export function Hotspots() {
  const [origin, setOrigin] = useState({
    latitude: 12.9716,
    longitude: 77.5946,
  });
  const [data, setData] = useState(null),
    [cursor, setCursor] = useState(null),
    [paused, setPaused] = useState(false);
  const [pinError, setPinError] = useState(null);
  const [error, setError] = useState(null),
    [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function load() {
      // Schedule the next poll only after this request finishes, preventing overlapping reads.
      try {
        const result = await request(
          `/search/hotspots?${query({ ...origin, cursor })}`,
          "GET",
          undefined,
          controller.signal,
        );
        setData(result);
        setError(null);
      } catch (error) {
        if (error.name !== "AbortError") setError(error);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (!paused) timer = setTimeout(load, 10000);
        }
      }
    }
    load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [origin, cursor, paused, revision]);
  function search(event) {
    // Applying a new origin clears pins from the old area immediately.
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setOrigin({
      latitude: Number(values.latitude),
      longitude: Number(values.longitude),
    });
    setCursor(null);
    setData(null);
    setLoading(true);
  }
  async function addPin() {
    // A fresh search at the origin makes the two-hour TTL dataset easy to demonstrate.
    setPending(true);
    setPinError(null);
    try {
      await request("/search/sessions", "POST", origin);
      setCursor(null);
      setRevision((n) => n + 1);
    } catch (error) {
      setPinError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Heading title="Where guests are searching">
        Recent search pins within 5 km of your selected origin.
      </Heading>
      <form className="filters" onSubmit={search}>
        <Field label="Latitude">
          <input
            name="latitude"
            type="number"
            step="any"
            min="-90"
            max="90"
            required
            defaultValue={origin.latitude}
          />
        </Field>
        <Field label="Longitude">
          <input
            name="longitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            required
            defaultValue={origin.longitude}
          />
        </Field>
        <button className="primary">Search this area</button>
        <button
          type="button"
          disabled={pending || pinError?.uncertain}
          onClick={addPin}
        >
          {pending ? "Adding…" : "Add search pin"}
        </button>
      </form>
      <ErrorBox error={error} retry={() => setRevision((n) => n + 1)} />
      <ErrorBox error={pinError} />
      {pinError?.uncertain && (
        <button
          onClick={() => {
            setCursor(null);
            setRevision((n) => n + 1);
            setPinError(null);
          }}
        >
          Refresh pins
        </button>
      )}
      <div className="split">
        <section className="card">
          <h2>Search area</h2>
          <SearchMap origin={origin} pins={data?.items || []} />
          <p className="muted">Dashed circle = 5 km radius</p>
        </section>
        <section className="card">
          <h2>Nearest search pins</h2>
          <p className={error ? "error-text" : "accent"}>
            {paused ? "Paused" : "Live"} · Updated {stamp(data?.updated_at)}
            {error && data && " · Showing last successful results"}
          </p>
          {loading ? (
            <p role="status">Loading pins…</p>
          ) : !data?.items.length ? (
            <p>
              No recent searches here. Try another origin or add a search pin.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Pin</th>
                  <th>Distance</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td title={p.id}>{shortId(p.id)}</td>
                    <td>{(p.distance_meters / 1000).toFixed(2)} km</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="actions">
            <button
              disabled={!data?.previous_cursor}
              onClick={() => {
                setCursor(data.previous_cursor);
                setData(null);
                setLoading(true);
              }}
            >
              Previous pins
            </button>
            <button
              disabled={!data?.next_cursor}
              onClick={() => {
                setCursor(data.next_cursor);
                setData(null);
                setLoading(true);
              }}
            >
              Next pins →
            </button>
          </div>
          <button onClick={() => setPaused(!paused)}>
            {paused ? "Resume live updates" : "Pause live updates"}
          </button>
          <p className="muted">
            Only searches from the last two hours appear. Older pins disappear
            automatically.
          </p>
        </section>
      </div>
      <section className="card">
        <h2>Search activity by distance band</h2>
        <div className="actions">
          {[0, 1000, 2000, 3000, 4000].map((b) => (
            <span key={b}>
              {b / 1000}–{b / 1000 + 1} km:{" "}
              <strong>
                {data?.bands.find((x) => x._id === b)?.count || 0}
              </strong>
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
