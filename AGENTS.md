# Repository Guidelines

## Project Structure & Module Organization
- Root workspace with `api` (Express server at `api/server/index.js`), `client` (React + Vite), and `packages` (`data-provider`, `api`, `data-schemas`).
- Tests live in `api/` and `client/` (unit) and `e2e/` (Playwright). Config and scripts in `config/`. Deployment and infra in `docker-compose.yml`, `helm/`, and `redis-config/`.
- Typical paths: `client/src/components/...`, `packages/data-provider/src/...`, `e2e/specs/...`.

## Build, Test, and Development Commands
- Dev server (API): `npm run backend:dev` — starts Express with nodemon.
- Dev server (Client): `npm run frontend:dev` — starts Vite dev server.
- Build client + libs: `npm run frontend` — builds packages then client.
- Run API in prod mode: `npm run backend`.
- Unit tests: `npm run test:api`, `npm run test:client` (Jest).
- E2E tests: `npm run e2e` (local), `npm run e2e:ci` (CI config); open report with `npm run e2e:report`.
- Lint/format: `npm run lint`, `npm run lint:fix`, `npm run format`.

## Coding Style & Naming Conventions
- Prettier: 2 spaces, width 100, semicolons, single quotes, trailing commas, `arrowParens: always`.
- ESLint: React, Hooks, Jest, a11y rules; import cycles are errors. See `eslint.config.mjs`.
- Naming: React components `PascalCase`, hooks `useX`, files `kebab-case` or `PascalCase` for components. Variables/functions `camelCase`.

## Testing Guidelines
- Framework: Jest for unit tests; Playwright for E2E.
- Test files: `*.test.{js,jsx,ts,tsx}` or `*.spec.{js,jsx,ts,tsx}` adjacent to source.
- Run local E2E against dev server; Playwright config in `e2e/playwright.config.local.ts`.
- Aim for meaningful coverage on changed areas; include happy-path and error cases.

## Commit & Pull Request Guidelines
- Commits: concise, present tense with type prefix (e.g., `feat:`, `fix:`, `refactor:`). Emoji prefixes are common in history but optional.
- PRs: clear description, linked issues, test plan, and screenshots for UI changes. Note config or migration impacts.
- CI expects code to lint, build, and tests to pass.

## Security & Configuration Tips
- Copy `.env.example` to `.env` for local runs; avoid committing secrets.
- Start with minimal services; optional integrations configured via `librechat.example.yaml` and environment variables.
- Docker: `docker-compose.yml` for local; `deploy-compose.yml` for deployed mode; Helm charts in `helm/`.
