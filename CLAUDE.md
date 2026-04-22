# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Local dev server**: `hugo serve` (serves at http://localhost:1313)
- **Build**: `hugo` (outputs to `public/`)
- **Link checking**: `pip install linkchecker && linkchecker public/index.html` (run after `hugo`)

No package.json, no Node build step — this is a pure Hugo static site.

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

**Songbook page** ([static/script/render_book.js](static/script/render_book.js)):
- Generates printable songbooks from ABC files across instrument transpositions

### Static assets layout
- `static/songs/` — ABC notation files (one per song)
- `static/script/` — All JavaScript: ABCjs library, Tonal.js, render_abc.js, render_book.js, render_agenda.js
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
