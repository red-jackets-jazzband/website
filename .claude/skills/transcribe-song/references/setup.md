# Environment setup

Read this only if a tool is missing — the common case (an environment that already
has everything) needs none of it.

## Tool table

| Tool | Where | Use |
|---|---|---|
| `midi2abc`, `abc2midi` | `/usr/bin` | quick MIDI dump; **validate** the final ABC |
| `homr` | `tools/OMR/.venv/bin/homr` | OMR: `homr scan.png` writes `scan.musicxml` beside it |
| `music21` | `tools/OMR/.venv` | parse MusicXML/MIDI, transpose, dump measures |
| `mscore` (MuseScore) | `/usr/bin/mscore` | render MusicXML/ABC to PNG for visual check |
| `pdftoppm`, PyMuPDF (`fitz`) | `/usr/bin`, venv | PDF -> PNG |
| Python + PIL + numpy (+ scipy) | venv | crop / zoom / annotate the scan, find barlines & chords |

If any of `abc2midi`/`midi2abc`, `pdftoppm`, or `mscore` are missing (`which` them first — a
from-scratch remote environment can have none of the three): `sudo apt-get install -y abcmidi
poppler-utils musescore3` installs all of them; then `sudo ln -sf /usr/bin/mscore3 /usr/bin/mscore`
since that package ships the binary as `mscore3`.

Helper scripts live in `.claude/skills/transcribe-song/scripts/`. Set up shell vars:

```
VP=tools/OMR/.venv/bin/python3            # venv Python — run every script with this
SK=.claude/skills/transcribe-song/scripts
```

## If `tools/OMR/.venv` doesn't exist

Seen on a fresh Claude Code on the web / remote container — the table above describes the
common case, not a guarantee. The `_staff.py`/`zoom.py`/`crop_systems.py`/`chord_map.py`/
`notehead.py` family needs only `pip install pillow numpy` (or a plain `python3` if those
are already present) — run them with that, not `$VP`, and skip the `VP=` var entirely for
this half of the toolkit.

For real OMR, `pip install homr music21` works from a scratch venv:

```
python3 -m venv /tmp/omrvenv && /tmp/omrvenv/bin/pip install --upgrade pip setuptools wheel
/tmp/omrvenv/bin/pip install homr music21
/tmp/omrvenv/bin/homr --init   # one-time, downloads ~130MB of models
```

Upgrading `setuptools`/`wheel` **before** `pip install homr` matters — an old setuptools fails
building `antlr4-python3-runtime` with a cryptic `install_layout` AttributeError. Use that
venv's `python3`/`homr` in place of `$VP`/`homr` throughout; this doesn't touch the repo's own
`node_modules` or `package.json`.

`render_site.mjs` needs Playwright too, and it resolves the package from the current
working directory first, then falls back to `~/.npm/_npx/*/node_modules/playwright` —
if neither has it, `cd` into a scratch dir, `npm install playwright --no-save` there,
and run `node <repo-path>/render_site.mjs ...` **from that scratch dir** so the cwd
lookup finds it. Pass `--browser` pointing at the environment's pre-installed browser
(commonly `$PLAYWRIGHT_BROWSERS_PATH/chromium-<rev>/chrome-linux/chrome` — `find
"$PLAYWRIGHT_BROWSERS_PATH" -iname chrome` to get the exact path; never `playwright
install`, the browser is already there) — the script forwards it straight to
`chromium.launch({ executablePath })`.

## Other gotchas

- `mscore` needs `QT_QPA_PLATFORM=offscreen` in this headless environment; its
  PNG output can be huge (10k px) — downscale with PIL before Read.
- `render.py`'s mscore-PNG step needs two fixes on a from-scratch environment, both already
  applied in the script: (1) this MuseScore build exports **transparent-background PNGs**, so
  `Image.open(p).convert("RGB")` silently drops the alpha channel and keeps whatever's under
  it — black — turning the whole proof image solid black with no error; composite onto a white
  background first (`bg.paste(im, mask=im.split()[3])` when `im.mode == "RGBA"`). (2) music21's
  ABC→MusicXML conversion picks a clef automatically (its `bestClef` tessitura heuristic) when
  the ABC doesn't set one — which is always, since this repo's ABC files never specify a clef —
  and a low-tessitura tune can come out in **bass clef**, wildly displaced on ledger lines even
  though abcjs always renders these lead sheets in treble on the live site. Force
  `m21.clef.TrebleClef()` on every part before writing the MusicXML.
- Invoking the venv Python by a relative `../../..` path prints a harmless
  `Unexpected value in sys.prefix` warning; run from the repo root with
  `VP=tools/OMR/.venv/bin/python3` as at the top to avoid it.
- The custom `omr` CLI in `tools/OMR/` is currently broken (no source, only
  `__pycache__`). Call `homr` directly and post-process with `music21` — that
  path works.
