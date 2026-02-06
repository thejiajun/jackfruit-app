# Repository Guidelines

## Project Structure & Module Organization
- Root `package.json` defines npm workspaces for `character-app` (public client) and `admin-app` (internal console). Each app is a Vite + React project with its own `package.json`, `src`, `public`, and `vite.config.js`.
- Shared operational docs live at the repo root (`README.md`, `SPEC`, `docs/`, `supabase/`). Database schema and migration notes sit under `supabase/` and `UPDATE_STEP4_AI_DIALOGUE.sql`.
- Build artifacts land in each app’s `dist/`; keep generated files out of commits unless explicitly required.

## Build, Test, and Development Commands
- Install deps once at the root: `npm install` (leverages workspaces).
- Run character app locally: `npm run dev:character` (serves from `character-app`).
- Run admin app locally: `npm run dev:admin` (serves from `admin-app`).
- Production builds: `npm run build:character` and `npm run build:admin` (outputs to each app’s `dist/`).
- App-specific utilities (from inside each app):
  - `npm run lint` — eslint over the project.
  - `npm run preview` — preview the production build.

## Coding Style & Naming Conventions
- Language: TypeScript/JavaScript with React. Prefer functional components and hooks.
- Formatting: follow eslint defaults in `eslint.config.js`; use 2-space indentation; prefer single quotes; avoid unused imports/vars.
- Naming: components in `PascalCase`, hooks in `useCamelCase`, files co-located with features; route components under `src/routes` or `src/pages` (app-specific).
- Env/config: keep secrets out of source; use `.env` per Vite conventions and the supplied Supabase configs in `supabase/`.

## Testing Guidelines
- Primary check is lint (`npm run lint` in each app). Add unit tests alongside source when introducing logic-heavy code; mirror path and name files `*.test.ts(x)` or `*.spec.ts(x)`.
- For manual verification, exercise critical flows noted in onboarding and integration docs in the repo (e.g., GEMINI/NOVA notes).

## Commit & Pull Request Guidelines
- Existing history favors Conventional Commit prefixes (`feat`, `refactor`, etc.) with concise scope; keep messages in English unless tying to documented work items.
- Commits should be scoped and reversible; avoid mixing formatting with logic changes.
- PRs: include a brief summary, screenshots for UI changes (desktop + mobile when relevant), affected commands, and linked issue/task IDs. Note any new env vars, migrations under `supabase/`, or follow-up work.

## Security & Configuration Tips
- Do not commit `.env*` files or Supabase service keys. Use project-level secrets in deployment targets.
- When adding third-party SDKs (GenAI, Supabase, DnD, etc.), document required permissions and rate limits in the PR description or `docs/`.
