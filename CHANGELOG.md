# Changelog

All notable changes to MyRide are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Refined the interface with an editorial motorcycle-journal design across navigation, dashboard, trip archive, garage, fuel, expenses, forms, and responsive states.
- Updated portfolio screenshots to reflect the current desktop and mobile experience.

## [1.0.0] - 2026-09-30

### Added

- Offline-first motorcycle, trip, GPS, event, photo, fuel, expense, maintenance, weather, readiness, profile, and settings records.
- Full-tank mileage calculations, range estimates, cost summaries, lifetime statistics, and proven milestones.
- Journey maps, elevation, timeline, media association, and replay.
- Optional Supabase authentication, synchronization, private photo storage, RLS, and conflict handling.
- Local deterministic assistant answers with optional device-key or server-side OpenAI explanations.
- JSON archive import/export, local data clearing, and persistent-storage requests.
- Installable PWA behavior and offline application shell.
- Responsive and accessible interface for desktop, tablet, and mobile.
- Browser, accessibility, synchronization, schema, Edge Function, and PWA verification suites.

### Security

- Private safety fields remain local unless explicitly permitted for local assistant answers.
- OpenAI receives only an already-computed non-sensitive answer.
- Device API keys are excluded from cloud synchronization and archive exports.
