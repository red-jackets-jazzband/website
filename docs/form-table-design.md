# Form table: drop-outs, solo order and feel (design)

A proposal for three additions to the round-by-round form table (`W:| round | parts | what plays |`,
see **Arrangement notes** in [leadsheet-style-guide.md](leadsheet-style-guide.md)). Each one fills
something the jazz structure datasets record and our table only has as free text:

| # | Addition | Prior art |
|---|---|---|
| 1 | `-Instrument`: who sits out | JSD (Balke et al., TISMIR 2022) records the solo *and* the accompanying instruments for every segment |
| 2 | `solos:` who solos, in which order, for how long | JSD and the Weimar Jazz Database name each solo's player; the WJD counts its choruses |
| 3 | `feel:` how the band plays the round | the WJD annotates a rhythm feel per solo (two-beat, swing, Latin, …) |

Everything here is **backward compatible**: a row that uses none of it parses and draws exactly
as today, and no existing file has to change for the parser to keep working.

## The one principle that keeps the three apart

A row answers three different questions, and each gets exactly one place:

| Question | Where | Example |
|---|---|---|
| **Who** plays (and who doesn't) | the lead, `+X`, `-X`, `solos:` | `collective; -rhythm` |
| **How** the beat goes | `feel:` | `feel: stop time` |
| **What** extra is played | `riff:` and the free asides (unchanged) | `riff: "Whole note"` |

So "no rhythm" is a *who* (`-rhythm`), not a feel; "drum solo" is a *who* (`solos: drums`), and the
band's stop-time hits under it are a *how* (`feel: stop time`). This avoids two spellings for one
fact, which is the inconsistency the review found in the repeat counts.

## Syntax, in the existing `;` pieces

The row's text is still split on `;`. The first piece is still the lead, unless it is one of the
typed pieces below. A piece is recognised by its **prefix only**; anything else stays an aside, so
an aside that happens to contain a colon (`bar 12 pickup: drums …`, `intro: sousaphone`) is not
misread.

```
+<instrument>[ <when>]         joins during the round          (exists today)
-<instrument>[ <when>]         sits out the round              (new)
solos: <soloist>, <soloist>…   the solo order                  (new)
feel: <term>, <term>…          how the band plays the round    (new)
riff: <text>                   unchanged, still an aside
```

The `riff:` and `feel:`/`solos:` keys are case-insensitive and matched only at the start of a
piece, followed by a colon.

### 1. Drop-outs: `-Instrument`

```
W:| 3 | A | collective; -rhythm |
W:| 6 | A B | collective; -drums for the first 8 bars of the B |
```

- **Scope: one row.** `+` and `-` describe that round only, against the full band. They are not
  cumulative: a row without `-rhythm` has the rhythm section back. That's how a band reads
  a strip (one arrow at a time), and it means a row never depends on the rows before it.
- **One instrument per piece**; what follows the name (`for the first 8 bars of the B`,
  `from the 2nd line`) is shown as written. The parser does not try to read the timing. It only
  needs the sign and the text.
- **Groups**: `rhythm` (banjo, sousaphone, drums/washboard) and `horns` (the front line) are
  allowed as names, because that's how the band talks ("no rhythm").
- **Drawn** as `− rhythm` below `+ …` lines, in the same small type, not struck through (a
  strikethrough reads as "deleted text" in print). The minus is U+2212, so it doesn't look like
  a hyphen.
- **Lint** (cheap, worth having): the same instrument both `+` and `-` in one row is an error.

### 2. Solo order: `solos:`

```
W:| 5 | B 4x | solos: sax/tbn, tpt 2x, tpt; + banjo; no riff |
W:| 3 | E E ... | solos: each 1x |
W:| 4 | A B ... | solos: tpt, clt, tbn; riff: "On 2 and 4" from the start |
W:| 3 | Chorus | solos: drums; feel: stop time |
```

- **A soloist** is an instrument name or abbreviation, optionally followed by a count `2x`. With no
  count, one solo = **one pass through the row's parts** (the whole row). A count multiplies that.
- **`a/b`** means "whichever of the two is on the gig" (dippermouth's `sax/tbn`); it is one slot.
- **`each 1x` / `each 2x`** is for an open list ("repeat E for each soloist"): the number of
  soloists isn't fixed, only how long each one gets.
- **`...` stays where it is**, in the part column, and keeps meaning "open, until the cue". A row
  with both `...` and a fixed `solos:` list is allowed: the list is the plan, `...` says the
  leader may stretch it.
- **It replaces the lead.** When the first piece is `solos: …`, the lead shown is "Solos"
  (translated), with the list drawn under it as a numbered sequence:
  `1 tpt ×2 → 2 clt → 3 tbn`. Writing `Solos; solos: …` is not needed and lint can say so.
- **Lint**: when the row has a numeric repeat (`B 4x`) and every soloist has a known count, the
  counts must add up to it (dippermouth: 1 + 2 + 1 = 4). That catches the most likely slip.

**Names.** The table stays readable to people, so full names stay allowed. For a solo list,
where space is tight, the style guide lists the abbreviations already in use: `tpt`, `tpt2`,
`clt`, `sax`, `tbn`, `sou`, `bjo`, `dr`, `wb` (washboard), `voc`. The parser does not need a
closed list. A lint warning for an unknown name would catch typos, but is optional.

### 3. Feel: `feel:`

This is the part that needs the most care, because "feel" mixes three independent things in
how musicians talk, and conflating them is what makes the current free text hard to scan.

#### Three axes

| Axis | What it describes | How long it holds |
|---|---|---|
| **Groove** | the beat pattern of the rhythm section | **sticky**: until the next groove term |
| **Texture** | how much of that beat is played | **this row only** |
| **Dynamics** | how loud | **this row only** |

Why the different scope: a groove is normally the same for the whole tune and changes at a
point of the routine ("from here on, four"), so writing it again on every row would be noise,
and forgetting it on one row would wrongly suggest a change. Stop time, breaks and "softly behind
the vocals" are events that belong to one round and are over by the next. That's also how
the WJD treats rhythm feel (one value per solo, not per bar).

A row with no `feel:` is: the groove still in force, full texture, normal level. A table with no
groove term at all means "as the tune goes" (the `R:` field and the music decide), which is the
case for nearly every tune today.

#### Vocabulary

Closed lists, English ids (identity stays English, like instrument values), each translated when
drawn (`js_feel_*` keys, so `/nl/songs/` shows Dutch).

**Groove** (sticky):

| Term | Meaning |
|---|---|
| `two-beat` | bass on 1 and 3: the trad default |
| `four` | four to the bar, walking/even |
| `march` | parade 2/4, snare-led |
| `second line` | the New Orleans street beat |
| `shuffle` | shuffle eighths |
| `straight` | even eighths, not swung |
| `latin` | rumba/habanera/calypso-type, written with a detail when it matters: `latin (rumba)` |
| `dirge` | slow funeral march |
| `hymn` | slow and chordal, like a church or Salvation Army band |
| `half feel` / `double feel` | the beat felt at half / twice the tempo, for a round |

`half feel` and `double feel` are the one exception to "grooves are sticky": they change the
beat *relative* to the groove in force, so they hold for their row only, like a texture.

**Texture** (one row):

| Term | Meaning |
|---|---|
| `stop time` | the band plays only fixed hits, the soloist or singer fills; default hits are beat 1 of every bar, other patterns as detail: `stop time (every 2 bars)`, `stop time (Charleston)` |
| `breaks` | the band stops for the written breaks (normally 2 bars), the soloist fills |
| `light` | time kept quietly: drums on the rim or hi-hat ("drums tick"), banjo out or soft |
| `vamp` | the rhythm section repeats one chord or a short figure until the cue |
| `pedal` | the bass holds one note under changing chords |

**Dynamics** (one row), drawn as the musical sign a player already reads:

| Term | Drawn as |
|---|---|
| `soft` | *p* |
| `loud` | *f* |
| `build` | *cresc.* (or a hairpin) |

The out-chorus, shout chorus and tag stay in the lead text: they are *what* the round is,
not how it's played.

#### Scope inside a row

A term can be limited to part of the round with `in <parts>` after it, in the same words the
part column uses:

```
W:| 5 | B B | collective; feel: breaks in the 2nd B |
W:| 4 | A B ... | solos; feel: stop time in A, soft |
```

`in …` is shown as written, like an instrument's timing. A future version could check that the
named part is in the row's part column.

#### Parsing

```
feel: <item>, <item>, …
item  = <term> [ "(" detail ")" ] [ " in " <where> ]
```

Each item is matched against the three lists, longest term first (`second line` before
anything shorter). An unknown term is kept and drawn as plain text, never dropped, so a new idea
doesn't vanish from the sheet; lint reports it as an error, so it gets added to the vocabulary
(with a translation) or rewritten. That's the same contract as `lint:i18n`: the vocabulary
lives in one place, and the lint keeps the songs and the vocabulary in step.

`parseFormStep` grows these fields (all empty when unused):

```js
{
  number, part, repeat, lead, adds, notes,      // as today
  drops: ["rhythm"],                            // 1
  solos: [{ who: "tpt", count: 2 }, …] | null,  // 2 (count null = one pass; who "each" for an open list)
  feel: {                                       // 3
    groove: { term: "four", detail: "", where: "" } | null,  // set on this row
    texture: [{ term: "stop time", detail: "every 2 bars", where: "A" }],
    dynamics: [{ term: "soft", detail: "", where: "" }],
    unknown: ["Salvation army style"],
  },
}
```

and the stickiness is resolved once for the table, not per row: a small `resolveGrooves(steps)`
adds `groove.inForce` to each step, plus `groove.changed` on the rows where it changes. The
strip only draws the groove at a change.

#### Drawing in the form strip

The strip is greyscale on purpose (it prints), so feel uses position and type, not colour:

- **Groove change**: a small label **on top of the arrow** where it starts (`♩ four`), so a
  glance along the strip shows where the beat changes, and nowhere else.
- **Texture**: one line under the lead, in small caps (`STOP TIME · BREAKS in the 2nd B`),
  so it doesn't read as another instrument.
- **Dynamics**: the sign (*p*, *f*, *cresc.*) right after the round number in the arrow,
  where a player looks first.

## What the existing tables become

Mechanical where the meaning is clear; the rows marked **?** need the band's word first.

| Song, row | Today | Proposed |
|---|---|---|
| second_line 3 | `A` · `No rhythm` | `A` · `collective; -rhythm` |
| second_line 4 | `A` · `With rhythm` | `A` · `collective` |
| second_line 5 | `B B` · `Stop in the break of the 2nd B` | `B B` · `collective; feel: breaks in the 2nd B` |
| bei_mir_bist_du_schon 3 | `Stop time for drum solo` | `solos: drums; feel: stop time` |
| bei_mir_bist_du_schon 1 | `"Salvation army" style` | `feel: hymn` **?** (or a riff/arrangement aside) |
| dippermouth_blues 5 | `B 4x` · `sax/tbn 1x, tpt 2x, tpt 1x; …` | `B 4x` · `solos: sax/tbn, tpt 2x, tpt; …` |
| south_rampart_street_parade 3 | `Solos; repeat E for each soloist` | `E E ...` · `solos: each 1x` |
| bellamina 1 | `Collective; drums tick` | `collective; feel: light` |
| bellamina 6 | `…; last 4 bars of the 2nd: lead 8va, straight out` | **?** "straight out": even eighths (`feel: straight in …`) or end without a tag (stays an aside)? |
| lilly_of_the_valley 4 | `Solos; rhythm break` | `solos; feel: breaks` **?** (or the rhythm section's own break) |
| lilly_of_the_valley 1 | `Vamp on the first chord` | `Intro; feel: vamp` |
| all_over_now 1 | `Sousaphone alone; bass drum joins on the 2nd line` | `Sousaphone; +bass drum from the 2nd line` |
| go_down_to_new_orleans 6 | `…; drums solo first 8 bars of the B, band back in bar 9; …` | `…; -horns for the first 8 bars of the B` plus the drum break as an aside **?** |
| dippermouth_blues 4 | `A no repeat` | unchanged (a repeat note, not a feel) |

The groove axis has no existing row to migrate: no table changes the beat mid-tune today. The
`R:` field (`R:Second line`, `R:March`, `R:Rumba`, `R:New Orleans (Double feel)`) mixes genre
and groove; it is left alone here.

## Open questions for the band

1. "Salvation army style": a slow, chordal hymn feel, or something else (straight eighths,
   march)?
2. "straight out" (bellamina): even eighths, or ending without a tag/ritardando?
3. "rhythm break" (lilly_of_the_valley): the band stops for the soloist's breaks, or the rhythm
   section gets the break?
4. Are `tpt`/`clt`/`tbn`-style abbreviations fine on the sheet, or should solo lists use full names?
5. Should a groove change also be offered as the Practice/Comping feel later (e.g. comping in
   `four` from that round)? Not part of this design; noted because the parsed groove would make it
   possible.

## Implementation steps (when agreed)

1. `lib/music/words-table.js`: `parseFormStep` fields above, `resolveGrooves`, the vocabulary as
   one exported table; unit tests per piece kind, including asides with colons that must stay
   asides.
2. `songs/sheet/sheet.js` `formStep`: draw drops, the solo sequence, the groove label, texture
   line and dynamics sign; `split.css` under the form-strip rules.
3. `i18n/{en,nl,de,fr}.toml`: `js_feel_*`, `js_form_solos`; `npm run lint:i18n`.
4. `scripts/lint-abc-style.js`: unknown feel term, `+X`/`-X` clash, solo counts vs the row repeat.
5. Migrate the rows above, after the open questions are answered.
6. `leadsheet-style-guide.md`: the syntax and vocabulary, replacing the free-text examples.
