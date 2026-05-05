# Foody — Copilot Instructions

## Project Overview
Foody is a personal pantry & shopping app. Monorepo with two apps:
- `apps/web` — Next.js 15 / React 19 / Tailwind v4 (frontend + BFF API routes)
- `apps/api` — NestJS 11 / TypeORM (REST API)
- `packages/types` — shared TypeScript types (`@foody/types`)

Production: https://foody-web-eight.vercel.app  
Dev: `pnpm dev` (web on :3000, api on :3001, Swagger at :3001/api/docs)

---

## Stack Rules

### Tailwind v4 (CSS-first)
- Config lives in `apps/web/src/app/globals.css` via `@theme { }` — NO `tailwind.config.js`
- Gradients: `bg-linear-to-r` NOT `bg-gradient-to-r`
- Custom shadows: `shadow-[0_0_6px_2px_var(--color-brand-400)]` (use CSS vars, not `theme()`)
- Dark mode: `.dark` class on `<html>` via `@custom-variant dark`

### Next.js 15
- `dynamic()` only works in **Client Components** — never use it in `async` Server Components
- Auth: `getSession()` / `getRouteUser()` for server, `getRouteUser(request)` for API routes
- API routes live in `apps/web/src/app/api/` — they proxy to NestJS or query Neon directly

### Database
- Use `@neondatabase/serverless` `sql` tagged template for direct queries from Next.js routes
- NestJS uses TypeORM entities + migrations in `apps/api/src/migrations/`
- Currency is always `'MXN'` unless specified otherwise

### Domain model
- `stockLevel: 'full' | 'half' | 'empty'` is the source of truth for product inventory
- Setting `half` or `empty` auto-adds to `shopping_list_items`; `full` removes it
- `POST /api/shopping-list/complete` resets stock to `full` and records purchases

---

## Lint / Code Style (enforced by Sonar + ESLint)

- **No** `parseFloat` — use `Number.parseFloat`
- **No** nested ternaries — extract to a named function
- **No** `window` — use `globalThis`
- **No** `typeof x === 'undefined'` — use `x === undefined`
- **No** `!= null` — use `=== null` / `!== null`
- **No** `aria-hidden="true"` on focusable elements — use `tabIndex={-1}` instead
- Use `String#replaceAll()` over `String#replace()` when replacing all occurrences
- Use `RegExp.exec()` instead of `String#match()` for single-match regexes
- Use `.at(-1)` instead of `[array.length - 1]`
- Use `??=` instead of `if (x === null) x = value`
- Props interfaces must be `readonly`
- `<label>` must have `htmlFor` matching the input `id`
- Prefer `<dialog>` native element over `role="dialog"` div
- Keep regex complexity ≤ 20 (split into multiple smaller regexes if needed)
- Keep function cognitive complexity ≤ 15 (extract helpers)
- No index as React `key` — use stable IDs

---

## Component Conventions

- All client components start with `'use client'`
- Dynamic imports (for SSR avoidance): `dynamic(() => import('...'), { ssr: false })`  
  Always also `import type` the exported type locally — `export type { X } from '...'` alone doesn't bring it into scope
- ActionSheet pattern: use native `<dialog>` for contextual menus (see `ProductCard.tsx`)
- Toast: `useToast()` hook from `@/components/ui/Toast`
- Haptics: `haptic(ms)` or `haptic([ms, ms, ms])` from `@/lib/haptic`
- API calls from client: `fetch('/api/proxy/...')` with `credentials: 'include'`

---

## Git / PR Rules

- Branch: **`main`** (all commits go to main in this repo)
- Commit style: `feat:`, `fix:`, `docs:`, `chore:` conventional commits
- After every implementation: run `get_errors` on changed files before committing
- Add new Spanish/technical words to `cspell.json` at the root
- For markdown files in Spanish: add `<!-- cspell:disable -->` at the top

---

## Key File Locations

| What | Path |
|---|---|
| Global styles / Tailwind theme | `apps/web/src/app/globals.css` |
| Auth session helpers | `apps/web/src/lib/route-helpers.ts` |
| Neon DB client | `apps/web/src/lib/db.ts` |
| API fetch helper | `apps/web/src/lib/api.ts` |
| Shared types | `packages/types/src/index.ts` |
| Shopping complete route | `apps/web/src/app/api/shopping-list/complete/route.ts` |
| Barcode lookup route | `apps/web/src/app/api/barcode/lookup/route.ts` |
| Receipt parser | `apps/web/src/lib/receipt-parser.ts` |
| Product card (ActionSheet) | `apps/web/src/components/products/ProductCard.tsx` |
| Supermarket mode view | `apps/web/src/components/shopping/SupermarketView.tsx` |
