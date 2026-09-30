# Architecture

MyRide is a local-first single-rider journal. The browser database is the primary runtime store; optional cloud infrastructure synchronizes owned records without becoming a prerequisite for the core product.

## Data Flow

```text
React pages and components
        |
TanStack Query hooks
        |
Local repository and domain validation
        |
Dexie transactions -> IndexedDB tables
        |
Synchronization queue (optional)
        |
Supabase Auth + PostgreSQL + private Storage
```

Zustand stores transient interface state such as the navigation drawer and synchronization message. Persistent journal data does not live in Zustand.

## Ownership Boundaries

- Every persistent record has an immutable ID.
- Child records retain an explicit `tripId` or `motorcycleId`.
- Repository validation rejects orphaned and mismatched relationships.
- Local mutations and their queue entries share a Dexie transaction.
- Supabase RLS restricts records to the authenticated owner.
- Parent-ownership policies prevent a user from attaching child records to another user's entities.
- Partial unique indexes preserve one active trip, one active motorcycle, one live profile, and one live settings record per rider.

## Local Database

`src/db/myrideDb.ts` defines the Dexie schema. `src/repositories/localRepository.ts` is the persistence boundary used by pages and services. Domain validation is shared by ordinary writes, archive imports, and cloud pulls.

Deleted synchronized entities use tombstones so deletion can propagate. Newer pending local changes are protected from older cloud records.

## Synchronization

Synchronization is disabled when Supabase is not configured.

1. Validate the authenticated user.
2. Read and order queued mutations by parent dependency.
3. Push local rows with stable IDs.
4. Upload private photo blobs when required.
5. Pull each user-owned table in pages.
6. Compare update times while respecting pending local writes.
7. Validate every remote record before committing it locally.
8. Remove resolved queue entries and refresh React Query.

The initial pull completes before an authenticated journal is shown. Network failures preserve local records and pending queue items for a later retry.

## Domain Calculations

Fuel mileage, distance, costs, maintenance state, weather exposure, and achievements are deterministic services under `src/services`. The optional AI layer does not calculate or replace these values.

## External Services

- Browser Geolocation provides recorded positions.
- Nominatim provides deliberate, throttled location search.
- OpenStreetMap tiles and Leaflet render routes.
- Open-Meteo provides weather observations for recorded coordinates.
- Supabase optionally provides authentication, PostgreSQL, Storage, and Edge Functions.
- OpenAI optionally explains a locally computed answer.

Failures return explicit unavailable states; MyRide does not invent missing external data.

## Offline Model

The service worker caches the application shell and lazy route bundles. IndexedDB supports reading and writing while offline. Network-only services degrade independently. Browser lifecycle rules still limit GPS capture when the app is suspended or closed.

## Testing Layers

- Domain and repository behavior is exercised through Playwright in a real browser database.
- axe-core checks primary and populated screens.
- Responsive tests cover 320 px, mobile, tablet, and desktop viewports.
- PGlite executes the schema and migrations and validates RLS and constraints.
- A Supabase-style mock verifies two-device sync, conflicts, retries, and photo transfer.
- Production preview tests verify the PWA shell and offline journal access.
