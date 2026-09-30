# Security Policy

## Supported Version

Security updates are applied to the latest release on the `main` branch.

## Reporting a Vulnerability

Please use GitHub's private security advisory feature for vulnerabilities, privacy issues, authentication bypasses, cross-user data access, or accidental credential exposure. Do not include secrets, exported journals, medical details, emergency contacts, or precise GPS histories in a public issue.

Include reproduction steps, affected versions, expected impact, and a minimal proof of concept when possible. Acknowledgement and remediation timing will depend on severity and reproducibility.

## Security Model

- Local data is stored in the browser's IndexedDB and is available to scripts running on the same origin.
- Device OpenAI keys are stored in local storage by explicit user choice. They are excluded from sync and archives but are not hardware-backed secrets.
- Cloud records rely on Supabase Auth, row-level security, relationship constraints, and a private storage bucket.
- Frontend builds must contain only Supabase client-safe publishable keys. Never expose service-role keys or server API secrets.
- Archive exports can contain photos, GPS routes, medical notes, and emergency contacts. They are not encrypted.

Before operating a public deployment, review [docs/PRIVACY.md](docs/PRIVACY.md), validate the deployed RLS policies, and test with two independent user accounts.
