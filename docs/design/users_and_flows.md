# StaySpot users and flows

Design scope: Assignment 1b, Step 2. The figures in the wireframes are illustrative;
the screens are not connected to a live API. Real login is outside the assignment.

## Main users

| User | Wants to do | Design response |
|---|---|---|
| Guest | Find properties, understand amenities/rules, book within their wallet balance, see the charge and booking status | Searchable property cards, property detail, date form, pre/post balance, confirmation with new audit entry |
| Operations user | Find guests/bookings, check guests in/out, explain conflicts, investigate wallet changes | Paginated directories, detail panels, forward status transitions, read-only audit with date filters |
| Operations user reviewing performance | Compare revenue, refresh summaries, inspect search demand and review feedback | Moving-average chart, ranked table, summary refresh time/action, map plus distance list, rating/tag analytics |

These are task-oriented views, not implemented authorization roles. A demo actor
selector is consistently available. Switching actor clears actor-specific selections
and refetches balances/history; unsaved forms should prompt before being discarded.

## Main journeys

1. **Book a stay:** Browse → property detail → enter dates → review price and balance
   → confirm → see booking, updated balance, and automatic audit entry → booking detail.
   The server rechecks balance and pricing. Failure preserves input and charges nothing.
2. **Manage a stay:** Bookings → select booking → CONFIRMED → CHECKED_IN → COMPLETED.
   If another booking is checked in for the guest, show the conflict and a link to
   that booking. Keep the attempted booking confirmed. Status changes do not debit again.
3. **Explain a wallet change:** Guests → guest detail → wallet history → date filter
   → inspect action, amount, recorded time, and stored balance_after. No edit/delete UI.
4. **Understand performance:** Analytics → choose property/date range → inspect
   moving-average chart and all-history ranks → inspect summary → request refresh.
   Disable repeat refresh while pending and update its timestamp only after success.
5. **Inspect demand:** Search hotspots → set coordinates → 5 km map and nearest-pin
   list → poll for recent searches → optionally pause or add a demo pin. Expired pins
   disappear; retain stale results with a timestamp if polling fails.
6. **Understand feedback:** Reviews → choose property → ratings, top tags and mean
   → inspect flexible amenities. All-properties analytics prompts for a property
   before displaying its catalog document.

## Navigation and responsive behavior

Desktop uses persistent navigation: Browse, Bookings, Guests, Wallet & audit,
Analytics, Search hotspots, Reviews. Browse defaults to properties; directories
are server-paginated. On phones, move navigation into a menu, stack paired panels,
keep the primary action reachable, and replace wide rows with labeled record cards.
Charts retain a readable data-table alternative; map and distance list stack.

## Scope and assumptions

Completed stays now include a guest review form in booking details (rating, optional
tags and comment), followed by a saved-review display. This extends the original
wireframes.

No cancellation, refunds, photo uploads, account signup, payment gateway, or host
property editing is designed because the inherited backend does not support them.
The schema has no currency field: amounts are currency units, with a single chosen
currency to be documented before implementation. Property coordinates and the
Bengaluru search origin reflect separate seeded data sets, not a shared live catalog.
The inherited average excludes days without bookings; radius bands are not spatial
neighborhood clusters. API changes needed for the map and refresh metadata are
recorded in ../api_endpoints.md.
