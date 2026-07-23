# Backend API

NestJS REST API for the supplier ordering app. See `/docs/ARCHITECTURE.md` and
`/docs/DATA_MODEL.md` at the repo root for the full picture.

## Local development

    docker compose up -d          # starts Postgres
    cp .env.example .env          # fill in JWT_SECRET and bootstrap admin credentials
    npm install
    npm run migration:run
    npm run start:dev

## Tests

    npm test

## Deployment

Deployed to Railway. Push to `main` triggers a build; `railway.json` runs
migrations (`releaseCommand`) before the new version starts serving traffic.
Environment variables (`DATABASE_URL`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_USERNAME`,
`BOOTSTRAP_ADMIN_PASSWORD`) are set in the Railway dashboard, not committed here.
