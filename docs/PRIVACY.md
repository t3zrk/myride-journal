# Privacy and Security

MyRide can operate entirely in one browser without an account. This document describes where information goes when optional features are enabled.

## Local Data

Motorcycles, trips, GPS points, photos, expenses, fuel, maintenance, weather, profile fields, emergency contacts, and settings are stored in IndexedDB. A saved device OpenAI key is stored separately in local storage.

Anyone with access to the device, browser profile, origin storage, or scripts running on the same origin may be able to read local information. Use a trusted device and keep the deployment free of untrusted scripts.

## Cloud Sync

When Supabase is configured and the rider signs in, journal records and photos can be synchronized to that project. Authentication identifies the owner; RLS and database constraints enforce ownership. Deployment owners are responsible for configuring, validating, monitoring, and backing up their Supabase project.

## AI

Ask MyRide computes factual answers locally. By default, no journal data is sent to an AI provider.

When OpenAI is selected, only the completed local answer is sent for a short explanation. The original question, complete journal, profile, emergency contacts, medical notes, and private safety fields are not included. Sensitive questions remain local even when AI explanations are enabled.

Device API keys are convenient but not equivalent to a native operating-system keychain. For a shared or public deployment, prefer the owner-restricted Supabase Edge Function.

## Backups

JSON archive exports may contain precise routes, timestamps, photos, health information, and emergency contacts. Archives are not encrypted. Store them in an encrypted location and inspect them before sharing.

## External Requests

- Map tiles reveal requested map regions to the configured tile provider.
- Location searches send the typed location to the configured Nominatim endpoint.
- Fuel-station searches send the current search area to the configured public data provider.
- Weather requests send recorded coordinates and time ranges to Open-Meteo.

Review the policies and rate limits of each provider before operating a public deployment.

## Clearing Data

**Clear device data** removes MyRide's local database, cached browser records, and saved device API key for the current origin. Cloud copies remain subject to the configured Supabase account and project retention settings.
