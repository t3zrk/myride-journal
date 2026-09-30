# Contributing to MyRide

Thank you for helping improve MyRide. Contributions should preserve its local-first behavior, record ownership guarantees, privacy boundaries, and honest handling of unavailable data.

## Development Setup

```bash
npm install
npx playwright install chromium
npm run dev
```

The application works without environment variables. Copy `.env.example` to `.env.local` only when testing optional integrations.

## Working Principles

- Keep IndexedDB as the local source of truth.
- Associate persistent records by immutable IDs, never list position, title, or date.
- Never substitute mock or unrelated records when data is missing.
- Keep private profile and emergency fields out of external AI requests.
- Preserve offline behavior and queue writes atomically with local mutations.
- Treat mileage, distance, costs, and achievements as derived facts, not generated content.
- Add migrations instead of editing the history of an already-released schema.
- Keep controls keyboard accessible and usable at 320 px.

## Pull Requests

1. Create a focused branch from `main`.
2. Keep changes scoped and explain any data-model or privacy impact.
3. Add or update tests for behavior changes.
4. Run `npm run verify` before opening the pull request.
5. Include screenshots for visible interface changes.

Do not commit `.env.local`, credentials, personal journal exports, test results, `dist`, or `node_modules`.

## Database Changes

Update `supabase/schema.sql` for fresh installations and add a new dated migration for existing installations. Run `npm run test:schema` to verify fresh setup, migration replay, RLS, ownership, and domain constraints.

## Reporting Problems

Use a GitHub issue for reproducible bugs and feature proposals. Follow [SECURITY.md](SECURITY.md) for vulnerabilities or accidental secret exposure.
