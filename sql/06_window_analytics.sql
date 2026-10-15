-- ============================================================
-- StaySpot :: 06_window_analytics.sql
-- Workflow 2: 7-day moving average of booking revenue per property,
-- ranked with DENSE_RANK().
-- ============================================================

WITH daily_revenue AS (
    SELECT
        b.property_id,
        b.created_at::DATE AS booking_day,
        SUM(b.total_cost) AS daily_total
    FROM bookings b
    GROUP BY b.property_id, b.created_at::DATE
),
moving_avg AS (
    SELECT
        property_id,
        booking_day,
        daily_total,
        AVG(daily_total) OVER (
            PARTITION BY property_id
            ORDER BY booking_day
            RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
        ) AS moving_avg_7d
    FROM daily_revenue
),
property_totals AS (
    SELECT
        property_id,
        SUM(daily_total) AS total_revenue
    FROM daily_revenue
    GROUP BY property_id
),
ranked_properties AS (
    SELECT
        property_id,
        total_revenue,
        DENSE_RANK() OVER (ORDER BY total_revenue DESC) AS revenue_rank
    FROM property_totals
)
SELECT
    m.property_id,
    p.title,
    m.booking_day,
    m.daily_total,
    ROUND(m.moving_avg_7d, 2) AS moving_avg_7d,
    r.revenue_rank
FROM moving_avg m
JOIN ranked_properties r ON r.property_id = m.property_id
JOIN properties p ON p.id = m.property_id
ORDER BY r.revenue_rank, m.property_id, m.booking_day;
