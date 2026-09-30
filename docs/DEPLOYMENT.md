# Deployment

MyRide is a Vite single-page application. Deploy it over HTTPS so service workers and browser geolocation can operate outside localhost.

## Vercel

1. Import the GitHub repository into Vercel.
2. Keep the framework preset as Vite.
3. Use `npm run build` as the build command.
4. Use `dist` as the output directory.
5. Deploy without environment variables for local-only mode.

The included `vercel.json` rewrites client-side routes to `index.html`.

## Optional Environment Variables

Set only client-safe values in the hosting dashboard:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_NOMINATIM_URL=
```

Do not configure `OPENAI_API_KEY` or a Supabase service-role key in the frontend deployment.

## Supabase

1. Run `supabase/schema.sql` for a fresh project.
2. Confirm RLS is enabled for all journal tables.
3. Confirm the `trip-photos` bucket is private.
4. Configure allowed Auth redirect URLs for the production hostname.
5. Test with two independent accounts to confirm cross-owner reads and writes fail.
6. If AI explanations are required, deploy `explain-myride` with JWT verification and configure its server-only secrets.

## Release Verification

```bash
npm ci
npx playwright install chromium
npm run verify
```

After deployment, verify:

- Direct loading of nested routes
- PWA installation and update behavior
- Offline reload after visiting each lazy-loaded page
- GPS and camera permissions on a real mobile device
- Archive export and restore
- Supabase login, photo upload, two-device synchronization, and deletion
- RLS rejection with a second account
- Device-key removal and cloud-AI fallback behavior

## Cache Updates

The service worker uses automatic updates. A newly deployed build is downloaded in the background and activated according to Workbox lifecycle behavior. Avoid changing IndexedDB semantics without a compatible Dexie migration.
