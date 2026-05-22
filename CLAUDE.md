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

### Core data model

`src/engine.js` is the pure-function core (no DOM):

- **`LESSONS`**: 5 lessons (4 categorized radical groups + 1 synthetic "all 24" lesson). Each lesson has `id`, `name`, `keys`, and an **optional `stages` array** that restricts which stages are available for that lesson (the all-24 lesson omits `crossover`).
- **`STAGES`**: 4 stage definitions — `warmup` / `forwardReverse` / `shuffle` / `crossover`
- **`buildSequence({ lessonId, stageId, settings })`** → `{ lines, canRegenerate }`: produces the full practice sequence as a 2D array (lines × cells). Practice renders the whole thing at once — there is no streaming generator.
- **`stagesFor(lesson)`**: filters `STAGES` by the lesson's optional `stages` whitelist
- **`nextStageOf(lessonId, stageId)`**: computes the "next stage" target, crossing lesson boundaries; returns `null` past the end

### Practice screen constraint

`src/practice.js` registers a `keydown` listener on `window`. **Any exit path must call `cleanup()` to detach that listener** — otherwise keystrokes get intercepted after returning to the Menu. Existing exits (`exit()`, `navigate()`) already do this; new exit paths must too.

Finish-overlay keyboard shortcuts (only active when `finished === true`): R = replay, Space = next stage, F = new batch, Esc = back to menu.

### Storage

`src/storage.js` is a thin localStorage wrapper that auto-prefixes every key with `cangjie:`. Keys in use:

- `cangjie:visited` — `{ "L0.warmup": true, ... }`, tracks which lesson×stage pairs have been entered
- `cangjie:settings` — `{ warmupRepeat, forwardReverseRounds, shuffleRows, crossoverRows }`

Visited is marked the moment the practice screen mounts (not on completion). Settings have bounds; always go through `getSettings()` / `updateSettings()`.

### Radical data

`src/data/radicals.json` is the single source of truth for radicals — 4 categories, 24 characters (X is reserved for special chars, Z for duplicate selection; neither is in scope). The key-to-radical mapping was verified against Wikipedia and should not be changed casually.

### Versioning

`package.json#version` is the single source of truth for the app version. `vite.config.js` imports `package.json` at build time and injects the version string via `define` as `import.meta.env.VITE_APP_VERSION` — only the version string is inlined into the client bundle, not the rest of `package.json`. The Menu screen reads this value and renders it in the `.menu-version` footer. To bump the version, edit `package.json#version` only; do not hardcode the version anywhere in `src/`.

## Conventions

- UI copy is in Traditional Chinese (zh-Hant); code, identifiers, and CLAUDE.md itself are in English
- Avoid adding frameworks or build tooling — the project deliberately stays vanilla + Vite
- When adding a stage: update `STAGES`, the if-else dispatch in `buildSequence`, and (if relevant) the corresponding field in `settings.js`
- When adding a lesson: either edit `src/data/radicals.json` or append a synthetic entry to `LESSONS` (the "all 24" lesson is the reference pattern for synthetic lessons)
