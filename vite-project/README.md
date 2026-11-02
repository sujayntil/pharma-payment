# Pharma Sales & Collection

The production frontend is a React app built with Vite, Mantine, Redux Toolkit, and React Router. It uses the existing FastAPI API and database; it does not introduce a frontend database or migration.

## Run locally

1. Install Node.js 20.19+ or 22.12+.
2. Copy `.env.example` to `.env` and set `VITE_API_BASE` to the backend URL you want to use.
3. Run `npm ci`, then `npm run dev`.

The app uses hash-based routes, so it works on Render Static Sites without route rewrites. Push notifications continue to use the existing backend VAPID keys and subscription endpoints. iOS users need to install the site to the Home Screen before enabling web push.

## Checks

- `npm run lint`
- `npm run build`

## Render Static Site

Use the existing static service and connect it to the GitHub `main` branch:

- Root directory: `vite-project`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Build environment variable: `VITE_API_BASE=https://pharma-payment.onrender.com`

The Vite build outputs the complete static site, including the web app manifest, service worker, and icons, to `dist`.
