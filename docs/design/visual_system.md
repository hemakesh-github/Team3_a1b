# StaySpot visual system

A restrained, neutral interface prioritizes booking clarity and readable operational
data. The Figma file uses editable layers and Simple Design System instances for
buttons, input fields, and property cards. Custom panels and charts use auto-layout
and local color variables. This is a wireframe-level specification, not a finished
production component library.

## Foundations

| Role | Value | Usage |
|---|---|---|
| Canvas | #F7F7F5 | Page background |
| Surface | #FFFFFF | Panels, cards, header |
| Primary text | #242424 | Titles, body, amounts |
| Secondary text | #626262 | Supporting copy |
| Border | #D8D8D3 | Panel boundaries and dividers |
| Soft surface | #EFEFEB | Status labels, schematic map |
| Data/success accent | #246B60 | Charts, pins, positive indicators |
| Error | #A12828 | Actionable error text |

Primary buttons follow the imported control library's charcoal treatment. Neutral
buttons have a light background and border; subtle buttons are reserved for lower
priority navigation. Do not use color alone to identify booking or request status.

Typeface: **Inter**, with a system sans-serif fallback in the eventual web app.
Page heading 32/45 px; section heading 20/28; body 16/22; small text 13/18.
Use semibold headings, regular body text, and tabular numerals for money/tables.
Spacing scale: 4, 8, 16, 24, 40 px. Corners: 6–12 px. Controls: at least 44 px high.
Desktop reference width: 1440 px; mobile reference width: 390 px. Layout must also
work at 360 px. Use a content maximum and flexible columns, not fixed page overflow.

## Reusable components

| Component | Content / variants | Behavior |
|---|---|---|
| Button | Primary, neutral, subtle; default/hover/disabled | One primary action per task area; pending action disables repeat submission |
| Labeled field | Text/search/date; default/error/disabled | Persistent label, adjacent error, preserved input |
| Property card | Title, nightly price, coordinates, detail action | Entire record has a clear detail target; no invented photo requirement |
| Metric panel | Label, value, optional freshness | Use consistent number formatting and scope labels |
| Data table / mobile record | Header, rows, status, detail action | Server pagination; accessible captions; mobile reflow |
| Status label | Confirmed / checked in / completed | Always show text; do not imply cancellation exists |
| Notice | Loading, empty, success, error, stale | Explain the outcome and one useful recovery action |
| Navigation / actor selector | Active route, selected guest | Visible active state; searchable actor picker at scale |

## States and accessibility

Every route needs loading, empty and failure behavior. Browse offers clear filters;
audit says no changes in the selected period; analytics says no revenue data; reviews
show no reviews rather than a fabricated zero-star average; maps explain the two-hour
window and offer a different origin or fresh demo pin. Failed polling retains the
last valid results with a stale timestamp. Booking errors distinguish bad dates,
insufficient funds, and an unknown request outcome; never blindly resubmit after a
network timeout without checking whether the booking committed.

Keyboard focus must be visible (2 px ring), tab order follows visual order, and
labels/errors are programmatically associated with fields. Announce result updates
without stealing focus. Provide textual chart values and a distance list alongside
the map. Target WCAG AA contrast during implementation; the wireframes are not a
claim of a completed accessibility audit. Mobile forms use a single column and
labels must remain visible when the on-screen keyboard opens.
