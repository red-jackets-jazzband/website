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
`/songs/` and `/setlists/` ([content/songs.md](content/songs.md), [content/setlists.md](content/setlists.md)) share one interactive shell — a library sidebar with a **Library / Setlists** tab switcher, plus a single-song sheet — rather than being two unrelated apps. Both pages load the same bootstrap (`render_abc.js`, `song_library.js`, `export_panel.js`); the only difference is which tab starts active (`data-default-tab` on `.rj-songs-layout`).

**Library tab** ([static/script/song_library.js](static/script/song_library.js) + [static/script/render_abc.js](static/script/render_abc.js), ~1,730 lines):
- Loads ABC notation files from [static/songs/](static/songs/) (146+ songs) via XHR, index at `static/songs/index_of_songs.txt`
- Search-first list with an A-Z scroll rail; picking a song renders it into the shared sheet
- Sheet header (left to right): the **Instrument** dropdown, **Key** and **Tempo** steppers, **Play**, a contextual **Inspiration** button, and **More** for everything else (Stop, mute melody, Print, Export, iRealPro). Instrument lives here (not the sidebar) since it's the same button bar as Key/Tempo/Play; the row wraps onto a second line when it doesn't all fit, same as the mobile layout. Key's caption reads "semitones" and Tempo's reads real bpm (seeded from the tune's own `Q:` field), not an abstract percentage
- Renders notation using [ABCjs](https://paulrosen.github.io/abcjs/) (library bundled in `static/script/`)
- Transposition: real-time for Concert, Alto Sax (+9), Bb Clarinet/Trumpet (+2), Tenor Sax (+2), Trombone (bass clef), Sousaphone (bass clef). The Key stepper's semitone offset transposes **both** the printed notation (ABCJS `visualTranspose`) and the audio (ABCJS `midiTranspose`, set independently — `visualTranspose` alone is notation-only and never reaches the synth); the instrument's own offset is folded into `visualTranspose` only, so playback always sounds the same concert pitch no matter which instrument's part is on screen
- Chord analysis: parses chords from ABC, converts to Roman numeral notation using [Tonal.js](https://github.com/tonaljs/tonal) (`static/script/tonal.min.js`)
- Audio playback via ABCjs SynthController with FatBoy soundfont (trumpet); the Tempo stepper holds a real bpm value, converted to ABCjs's "warp" percentage (`bpm / nativeQpm * 100`) and applied via `SynthController.setWarp`, which re-primes the MIDI buffer and resumes playback itself. `setTune`'s `qpm` option does **not** work — SynthController's `go()` drives playback purely from the tune's `millisecondsPerMeasure` and `warp`. `setWarp` internally writes to a `.abcjs-midi-tempo` DOM element, so the player is loaded with `displayWarp: true` (the `#abc-player-container` is `display:none`, so nothing shows)
- iRealPro URL generation for mobile musicians
- Inspiration: when a song's ABC has an `F:` field, a per-song button opens a docked, draggable picture-in-picture panel (`#inspirationPanel`, built in `render_abc.js`) embedding a privacy-enhanced YouTube player (URL parsing/embed-building in `static/script/lib/youtube.js`) — it keeps playing across song navigation until explicitly closed, instead of leaving the page

**Setlists tab** (also [static/script/song_library.js](static/script/song_library.js)):
- Band setlists are plain-text files in [static/setlists/](static/setlists/) (indexed by `index_of_setlists.txt`), read-only, with an optional key override per song and an optional `desc` line rendered as a print-only booklet cover page
- Personal setlists are stored in the browser's `localStorage` (`rj.setlists.v1`), fully editable (create/rename/delete, add/remove/reorder songs, per-song key overrides), and portable between devices only via manual `.txt` export/import — never synced to the server
- Opening a setlist swaps the sidebar's list to its songs, in order; clicking one opens it in the **same** interactive sheet a Library song opens in (pre-seeded with the setlist's key override), not a separate flattened view
- "Print booklet" is the only place the old "stack every song's title+chords+staff" pattern still runs, into a print-only hidden container (`#setlistPrintBooklet`) — reusing the same pattern `export_panel.js`'s multi-song booklet export uses (`#exportBooklet`)

### Static assets layout
- `static/songs/` — ABC notation files (one per song)
- `static/setlists/` — plain-text setlist files (one per band setlist) + `index_of_setlists.txt` manifest
- `static/script/` — All JavaScript: ABCjs library, Tonal.js, render_abc.js, song_library.js, export_panel.js, render_agenda.js
  - `static/script/lib/` — pure, side-effect-free ES modules (instrument table, chord parsing, iRealPro URL building, song-index/setlist-file parsing, music theory, personal-setlist storage, YouTube URL/embed parsing), each with a colocated `*.test.js`. Loaded via `import` from the per-page scripts, which are themselves `type="module"`. This is where new pure logic belongs; DOM/ABCjs orchestration stays in the per-page scripts.
- `static/assets/css/split.css` — Theme overrides/customizations
- `static/agenda/` — Event data files

### Layouts
- `layouts/partials/head.html` — SEO, fonts, Font Awesome, CSS/JS includes
- `layouts/partials/footer.html`, `layouts/partials/intro.html`
- Per-page layouts inherit from the Split theme

### CI/CD
GitHub Actions ([.github/workflows/publish.yaml](.github/workflows/publish.yaml)) runs on every push, in three gated jobs:
1. `lint-and-test` — `npm ci`, `npm run lint`, `npm test`
2. `build` (needs `lint-and-test`) — builds with Hugo via `lowply/build-hugo@v0.161.1`, runs linkchecker on the output, uploads `public/` as an artifact
3. `publish` (needs `build`) — only `if: github.ref == 'refs/heads/master'`: downloads that artifact and publishes it to `red-jackets-jazzband/red-jackets-jazzband.github.io` using secret `GH_RJ_DEPLOY`
