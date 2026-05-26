# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # Vite dev server with hot reload
npm run build        # outputs to dist/, deployable to Cloudflare Pages as-is
npm run preview      # preview the production build locally
```

No test framework, no lint setup. The standard verification flow is `npm run build` to confirm the build passes, then `npm run dev` to exercise the change in a browser. Cloudflare Pages deployment: framework preset `Vite`, build command `npm run build`, output `dist`.

## Architecture

**Stack**: Vite + Vanilla JS (no React/Vue/etc.) + localStorage. `base: './'` in `vite.config.js` keeps asset paths relative so the build drops straight into Cloudflare Pages.

**Single-page, three screens**: `src/main.js` switches between three screens by overwriting `#app.innerHTML`. There is no router library.

- **Menu** (`src/modes/letters.js#mountMenu`) — grid of Lesson × Stage entry points
- **Practice** (`src/practice.js#mountPractice`) — practice screen; the entire sequence is rendered up front
- **Settings** (`src/settings.js#mountSettings`) — settings page

Each `mount*` function takes a `root` element plus callbacks (`onExit`, `onSelect`, `onNavigate`, etc.). When a callback fires, `main.js` re-mounts a different screen.

### Section concept

The app has two parallel practice **sections**, selected by a top-level toggle on the Menu:

- `'radical'` (default) — practice the 24 letters' canonical radicals (existing)
- `'aux'` — practice auxiliary character forms (variants), each cell shows an SVG of an example character with the relevant strokes highlighted

`section` is threaded as an explicit parameter through `main.js` → `mountMenu` / `mountPractice` → `buildSequence` / `STAGE_KEY` / `nextStageOf` / `stagesFor`. The default `'radical'` keeps existing call sites working. The current section is persisted to `cangjie:section` in localStorage.

### Core data model

`src/engine.js` is the pure-function core (no DOM). Two parallel data sets:

**Radical mode (existing):**
- **`LESSONS`**: 5 lessons (4 categorized radical groups + 1 synthetic "all 24"). Each lesson has `id`, `name`, `keys`, and an **optional `stages` array** whitelist (the all-24 lesson omits `crossover`).
- **`STAGES`**: 4 stage definitions — `warmup` / `forwardReverse` / `shuffle` / `crossover`.
- Radical cell shape: `{ key, radical }` — passed directly from `lesson.keys`.

**Auxiliary mode:**
- **`AUX_LESSONS`**: 5 lessons mirroring `LESSONS`' grouping. Each lesson additionally carries `poolBase` (aux index 0 examples), `poolVariants` (aux index ≥ 1), and `poolMixed` (both) — flat arrays of cells already expanded from `src/data/auxiliary.json`.
- **`AUX_STAGES`**: 3 stages — `auxBase` / `auxVariants` / `auxMixed`, all randomized.
- Aux cell shape: `{ key, radical, svg }`. `svg` is a filename like `Cjem-a0-1.svg` resolved against `public/auxiliary/`; `radical` is shown only by the hint feature (the displayed glyph is the SVG).

**Shared API (all take an optional `section` param, default `'radical'`):**
- **`buildSequence({ lessonId, stageId, settings, section })`** → `{ lines, canRegenerate }`. Practice renders the whole thing at once — there is no streaming generator.
- **`lessonsFor(section)`**, **`stagesFor(lesson, section)`**, **`nextStageOf(lessonId, stageId, section)`** — return the right set or compute the next target within the same section. `nextStageOf` returns `null` past the last lesson's last stage.
- **`STAGE_KEY(lessonId, stageId, section)`** — formats the visited key; aux gets the `aux:` prefix so it cannot collide with radical state.

### Practice screen constraint

`src/practice.js` registers a `keydown` listener on `window`. **Any exit path must call `cleanup()` to detach that listener** — otherwise keystrokes get intercepted after returning to the Menu. Existing exits (`exit()`, `navigate()`) already do this; new exit paths must too.

Finish-overlay keyboard shortcuts (only active when `finished === true`): R = replay, Space = next stage, F = new batch, Esc = back to menu.

### Storage

`src/storage.js` is a thin localStorage wrapper that auto-prefixes every key with `cangjie:`. Keys in use:

- `cangjie:visited` — `{ "L0.warmup": true, "aux:L0.auxBase": true, ... }`. Radical visits use the bare `L<id>.<stage>` form; aux visits use the `aux:L<id>.<stage>` prefix. The two namespaces cannot collide, so toggling sections preserves both progress sets.
- `cangjie:settings` — radical row counts (`warmupRepeat`, `forwardReverseRounds`, `shuffleRows`, `crossoverRows`) plus aux row counts (`auxBaseRows`, `auxVariantsRows`, `auxMixedRows`).
- `cangjie:section` — `'radical' | 'aux'`, the last-selected section toggle.

Visited is marked the moment the practice screen mounts (not on completion). Settings have bounds; always go through `getSettings()` / `updateSettings()`.

### Data sources

- `src/data/radicals.json` — single source of truth for the 24 radicals, 4 categories. X (special chars) and Z (duplicate selection) are intentionally out of scope. The key-to-radical mapping was verified against Wikipedia and should not be changed casually.
- `src/data/auxiliary.json` — manifest of auxiliary-form SVGs grouped by letter and aux index. Generated by `scripts/fetch-aux-svgs.mjs`, which downloads CC0 SVGs from Wikimedia Commons (contributor Cangjie6) to `public/auxiliary/`. The script is idempotent (skip-if-exists) and uses the Commons API to resolve CDN URLs in batches; do not point it at `Special:FilePath` directly — that endpoint rate-limits aggressively. 5th-gen Cangjie shapes (`Cjem-5e-*` / `Cjem-5s-*`) are deliberately excluded; this app targets 3rd gen.
- **Important Windows gotcha**: the directory is named `auxiliary`, not `aux`, because `AUX` is a reserved DOS device name on Windows. `git add` (and any tool calling raw `open()`) fails with `ENOENT` on files under a directory named `aux`, even though `ls`/`stat` work. If anyone ever proposes renaming this back to `aux/`, point them here.

### Versioning

`package.json#version` is the single source of truth for the app version. `vite.config.js` imports `package.json` at build time and injects the version string via `define` as `import.meta.env.VITE_APP_VERSION` — only the version string is inlined into the client bundle, not the rest of `package.json`. The Menu screen reads this value and renders it in the `.menu-version` footer. To bump the version, edit `package.json#version` only; do not hardcode the version anywhere in `src/`.

## Conventions

- UI copy is in Traditional Chinese (zh-Hant); code, identifiers, and CLAUDE.md itself are in English
- Avoid adding frameworks or build tooling — the project deliberately stays vanilla + Vite
- When adding a radical stage: update `STAGES`, the if-else dispatch in `buildSequence`'s radical branch, and the corresponding field in `settings.js`
- When adding an aux stage: update `AUX_STAGES`, the if-else dispatch in `buildAuxSequence`, and add a row-count field in `settings.js` (default 4, bounds 1–10)
- When adding a lesson: either edit `src/data/radicals.json` or append a synthetic entry (the "all 24" lesson is the reference pattern). `AUX_LESSONS` rebuilds automatically from the same `radicals.json` categories plus `auxiliary.json`
- New section types follow the same pattern: thread `section` through main → menu → practice, give it its own `LESSONS_*` / `STAGES_*` arrays and a buildSequence branch, and a `STAGE_KEY` prefix to keep visited state isolated
