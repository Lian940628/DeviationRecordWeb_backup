---
name: Cloudflare Worker origin checks
description: Origin allowlist behavior for the DeviationRecord identity-verification Worker.
---

The `/verify` Worker rejects requests with a missing or unlisted `Origin`. A same-origin API proxy must forward the browser's exact origin; allowing arbitrary origins is not an acceptable workaround.

**Why:** Direct and server-proxied verification both returned `Origin not allowed` until the original browser origin was forwarded. The user explicitly requires avoiding an all-origins CORS policy.

**How to apply:** Before validating the Worker from Replit or a static deployment, add only the exact preview and production site origins to the Worker allowlist. Keep forwarding the request origin through the proxy and surface origin rejection separately from Firebase token rejection.

The Replit screenshot preview may load the app through `127.0.0.1`, not the user's `.replit.dev` hostname. A Worker origin rejection in that capture can therefore be a screenshot-proxy artifact; do not add localhost or broaden CORS to make the capture pass.

**Why:** The screenshot tool used a loopback origin and triggered a Worker 403 even though it was displaying the user's Replit preview.

**How to apply:** Use the user's real `.replit.dev` preview for origin-sensitive verification. Treat screenshot-only 403s as a limitation of the capture proxy unless the real preview also fails.
