# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Local dev server**: `hugo serve` (serves at http://localhost:1313)
- **Build**: `hugo` (outputs to `public/`)
- **Link checking**: `pip install linkchecker && linkchecker public/index.html` (run after `hugo`)
- **Lint the JS**: `npm run lint` (ESLint, scoped to `static/script/lib/`)
- **Unit tests**: `npm test` (Node's built-in test runner, `static/script/lib/*.test.js`)

The site itself has no build step beyond Hugo — it's a pure static site, and `package.json`/`node_modules` exist purely as **dev tooling** (lint + unit tests for the pure logic in `static/script/lib/`), never as part of the Hugo build or the GitHub Pages deploy.

## Architecture

**Red Jackets Jazzband** website: a Hugo static site with multi-language support (English, Dutch, German) and interactive music features powered by vanilla JavaScript.

### Hugo setup
- Config: [config.toml](config.toml) — base URL, languages (en/nl/de), theme params, privacy settings
- Theme: `Split` by escalate, managed via [dfetch](dfetch.yaml) (not a git submodule) into `themes/split/`
- Content: Markdown files with TOML frontmatter, language-suffixed filenames (e.g. `band.en.md`, `band.nl.md`)
- Deployed to a separate GitHub Pages repo (`red-jackets-jazzband.github.io`) via GitHub Actions on push to `master`

### Music interactive pages
The most complex parts of the site are the two interactive music pages:

**Songs page** ([static/script/render_abc.js](static/script/render_abc.js), ~1150 lines):
- Loads ABC notation files from [static/songs/](static/songs/) (118 songs) via XHR, index at `static/songs/index_of_songs.txt`
- Renders notation using [ABCjs](https://paulrosen.github.io/abcjs/) (library bundled in `static/script/`)
- Transposition: real-time for Concert, Alto Sax (+9), Bb Clarinet/Trumpet (+2), Tenor Sax (+2), Trombone (bass clef), Sousaphone (bass clef)
- Chord analysis: parses chords from ABC, converts to Roman numeral notation using [Tonal.js](https://github.com/tonaljs/tonal) (`static/script/tonal.min.js`)
- Audio playback via ABCjs SynthController with FatBoy soundfont (trumpet)
- iRealPro URL generation for mobile musicians

**Setlists page** ([static/script/render_setlists.js](static/script/render_setlists.js)):
- Band setlists are plain-text files in [static/setlists/](static/setlists/) (indexed by `index_of_setlists.txt`), read-only, with an optional key override per song and an optional `desc` line rendered as a print-only booklet cover page
- Personal setlists are stored in the browser's `localStorage` (`rj.setlists.v1`), fully editable (create/rename/delete, add/remove/reorder songs, per-song key overrides), and portable between devices only via manual `.txt` export/import — never synced to the server
- Opening either kind reuses `renderAbcFile(..., add_link=false)` per song (the same reuse pattern the old Songbook page pioneered), so printing a setlist produces a transposed booklet in the visitor's chosen instrument

### Static assets layout
- `static/songs/` — ABC notation files (one per song)
- `static/setlists/` — plain-text setlist files (one per band setlist) + `index_of_setlists.txt` manifest
- `static/script/` — All JavaScript: ABCjs library, Tonal.js, render_abc.js, render_setlists.js, export_panel.js, song_library.js, render_agenda.js
  - `static/script/lib/` — pure, side-effect-free ES modules (instrument table, chord parsing, iRealPro URL building, song-index/setlist-file parsing, music theory), each with a colocated `*.test.js`. Loaded via `import` from the per-page scripts, which are themselves `type="module"`. This is where new pure logic belongs; DOM/ABCjs orchestration stays in the per-page scripts.
- `static/assets/css/split.css` — Theme overrides/customizations
- `static/agenda/` — Event data files

### Layouts
- `layouts/partials/head.html` — SEO, fonts, Font Awesome, CSS/JS includes
- `layouts/partials/footer.html`, `layouts/partials/intro.html`
- Per-page layouts inherit from the Split theme

### CI/CD
GitHub Actions ([.github/workflows/publish.yaml](.github/workflows/publish.yaml)):
1. Builds with Hugo v0.155.2
2. Runs linkchecker on the output
3. On `master`: publishes `public/` to `red-jackets-jazzband/red-jackets-jazzband.github.io` using secret `GH_RJ_DEPLOY`
