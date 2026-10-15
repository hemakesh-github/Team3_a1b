# Step 2 — Design before you build

[Figma: StaySpot UX & Wireframes](https://www.figma.com/design/gTOkIC3vtMfNP2le4hF9ed)

- [User descriptions](user_descriptions.md): main Guest and Admin/Platform Staff responsibilities.
- [Users and flows](users_and_flows.md): users, goals, journeys, navigation and assumptions.
- [Visual system](visual_system.md): colors, typography, reusable controls, responsiveness and states.
- [Figma manifest](figma_manifest.json): frame IDs and dimensions.
- `wireframes/`: destination for the user's downloaded Figma exports.

## Screen inventory

| Frame | Purpose | Assignment coverage |
|---|---|---|
| 01 | Browse properties | Search, filters, server pagination |
| 02 | Property detail | Detail view, flexible catalog, entry to booking |
| 03 | Booking form | Workflow 1, dates, pricing and wallet preview |
| 04 | Booking success | Before/after balance and new trigger audit entry |
| 05 | Bookings and check-in | Browse/detail, status transitions, active-stay constraint |
| 06 | Guests and guest detail | Actor browsing/detail and demo switching |
| 07 | Wallet and audit | Read-only history, date filter and balance after each change |
| 08 | Revenue analytics | Workflow 2, ranks, materialized summary and refresh |
| 09 | Search hotspots | Workflow 3, selectable origin, 5 km radius, nearest list, polling |
| 10 | Reviews and amenities | Workflow 4 and flexible PropertyAmenities document |
| 11–13 | Mobile browse, booking and map | Representative small-screen adaptations |
| 14 | Loading, empty and error states | Validation, insufficient funds, active-stay conflict, stale/pending requests |
| 15 | Visual foundations and controls | Consistent colors, type, spacing and component examples |

The Figma file currently contains all 15 boards. These are static editable wireframes,
not a wired clickable prototype or a working frontend. All sample names, amounts,
charts and map positions are illustrative. The map is schematic.

## Review status

Initial layout review caught and corrected horizontal auto-layout height problems.
Browse, property detail, booking form, and analytics were visually checked afterward.
Further refinement/review is pending: Figma's Starter-plan MCP quota blocked further
calls, and the alternate browser session needs sign-in for editing. Do not treat
this as a claim that all 15 boards have passed final visual QA.

The user will download the final boards and put the files in this directory. Suggested
filenames follow the frame number, e.g. `01-browse-properties.png`, or use one PDF of
all frames. Keep this Figma link as the editable source. No database changes were made
as part of Step 2, and the deferred audit-permission changes remain unapplied.
