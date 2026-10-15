-- Persist refresh time across API restarts; null means no recorded refresh yet.
CREATE TABLE IF NOT EXISTS summary_refresh_metadata (
    name TEXT PRIMARY KEY,
    refreshed_at TIMESTAMPTZ
);
INSERT INTO summary_refresh_metadata(name) VALUES ('property_summary')
ON CONFLICT (name) DO NOTHING;

-- Speed up guest booking history without changing its results.
CREATE INDEX IF NOT EXISTS idx_bookings_guest_created ON bookings(guest_id, created_at DESC, id);
