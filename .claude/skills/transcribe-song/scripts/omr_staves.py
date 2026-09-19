#!/usr/bin/env python3
"""Per-staff OMR -> concert ABC, straight from homr's own log (not the merged MusicXML).

homr prints one line per staff it reads:
    Stopping at attempt 1 with distance 0.077 Staff(G2/1 4/4 D4_eighth ... | ...|)
`G2/1` = clef (G2 treble, F4 bass) + key signature (sharps, negative = flats). The merged
MusicXML built from these lines is much worse on anything but a one-key, treble-only
sheet: it applies the FIRST staff's key signature to every staff (a mid-sheet key change
-- a natural sign cancelling F#, a new flat -- is lost), turns a treble staff it mistook for
bass clef into garbage, and mangles endings. The log lines don't have those problems, and
they let you fix them per staff.

Usage:
    omr_staves.py scan3.png    --interval M-2 --key F           # runs homr, keeps scan3.homr.log
    omr_staves.py scan3.homr.log --interval M-2 --key F         # re-use a saved log
        [--keysig 6:0,7:0,8:0,9:0]   staves whose key signature homr got wrong (sharps; -2 = 2 flats)
        [--clef 8:treble]            staves homr read as bass but are treble (shifts up 12 steps)
        [--unit 8] [--meter 4/4]

Output (stdout): one commented block of ABC bars per staff, already transposed to the
target key, key-signature- and in-bar-persistence-aware. Warnings (stderr):
  * confidence: homr's own edit-distance score per staff (>0.5 = it fell back to a worse
    attempt -- read that staff by eye)
  * bar-count outliers (a staff with fewer bars than its neighbours dropped one)
  * bars that don't sum to the meter: the log has NO RESTS, so a short bar gets a
    guessed leading `z` -- move it to where the scan shows the rest
  * chords glued with `&` (homr merging neighbours: a misread)
  * staves that are near-copies of each other (a written-out repeat): a difference
    between two copies is a misread in one of them -- compare both against the scan
Ties are never in the log -- add them from the scan.

Run with tools/OMR/.venv/bin/python3.
"""
import argparse, difflib, os, re, subprocess, sys
from fractions import Fraction

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import music21 as m21
from omr_to_abc import abc_pitch, abc_len, key_setup

HEAD_RE = re.compile(r"^([GFC])(\d)/(-?\d+)$")
NOTE_RE = re.compile(r"^([A-G])(\d)([#♮b♭]?)_(\w+?)(\.*)$")
DURS = {"whole": 4, "half": 2, "quarter": 1, "eighth": Fraction(1, 2),
        "sixteenth": Fraction(1, 4), "thirty_second": Fraction(1, 8)}
ACC = {"#": 1, "b": -1, "♭": -1, "♮": 0}
STEPS = "CDEFGAB"


def run_homr(png):
    here = os.path.dirname(os.path.abspath(__file__))
    homr = os.path.abspath(os.path.join(here, "..", "..", "..", "..", "tools", "OMR", ".venv", "bin", "homr"))
    if not os.path.exists(homr):
        homr = "homr"
    log = os.path.splitext(png)[0] + ".homr.log"
    with open(log, "w", encoding="utf8") as f:
        subprocess.run([homr, png], stdout=f, stderr=subprocess.STDOUT, check=True)
    return log


def parse_log(path):
    """[{clef, sharps, dist, bars: [[token,...],...]}] one per staff, last attempt wins."""
    staves = {}
    order = []
    cur = None
    for line in open(path, encoding="utf8", errors="replace"):
        m = re.search(r"Running TrOmr inference on staff image (\d+)", line)
        if m:
            cur = int(m.group(1))
            if cur not in order:
                order.append(cur)
            continue
        m = re.search(r"(?:Stopping|Taking) at attempt (\d+) with distance ([\d.]+) Staff\((.*)\)", line)
        if m and cur is not None:
            staves[cur] = (float(m.group(2)), m.group(3))
    out = []
    for n in order:
        if n not in staves:
            continue
        dist, body = staves[n]
        head, _, rest = body.strip().partition(" ")
        hm = HEAD_RE.match(head)
        clef, sharps = (hm.group(1) + hm.group(2), int(hm.group(3))) if hm else ("G2", 0)
        bars = [b.split() for b in rest.split("|")]
        bars = [[t for t in b if not re.fullmatch(r"\d+/\d+", t)] for b in bars]
        out.append(dict(clef=clef, sharps=sharps, dist=dist, bars=[b for b in bars if b]))
    return out


def parse_map(spec, cast=str):
    out = {}
    for part in (spec or "").split(","):
        if part.strip():
            k, _, v = part.partition(":")
            out[int(k)] = cast(v)
    return out


def build_bar(tokens, alters, shift, interval, key_alter, unit_ql):
    """-> (abc text, total quarter-lengths, flags)"""
    state, seen, toks, total, flags = {}, {}, [], Fraction(0), []
    for tok in tokens:
        parts = tok.split("&")
        if len(parts) > 1:
            flags.append("chord/merged notes")
        pitches, ql = [], None
        for part in parts:
            m = NOTE_RE.match(part)
            if not m:
                flags.append(f"unparsed {part!r}")
                continue
            step, octv, acc, dur, dots = m.groups()
            if shift:
                idx = int(octv) * 7 + STEPS.index(step) + shift
                octv, step = idx // 7, STEPS[idx % 7]
            key = (step, int(octv))
            if acc:
                seen[key] = ACC[acc]
            alter = seen.get(key, alters.get(step, 0))
            p = m21.pitch.Pitch(step + str(octv))
            p.accidental = m21.pitch.Accidental(alter) if alter else None
            if interval:
                p = p.transpose(interval)
            pitches.append(p)
            base = Fraction(DURS.get(dur, 0))
            length = base * (Fraction(2) - Fraction(1, 2 ** len(dots))) if dots else base
            ql = length if ql is None else min(ql, length)
        if not pitches or not ql:
            continue
        total += ql
        text = "".join(abc_pitch(p, state, key_alter) for p in pitches)
        toks.append((f"[{text}]" if len(pitches) > 1 else text) + abc_len(ql, unit_ql))
    return " ".join(toks), total, flags


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", help="scan image (runs homr) or a saved homr log")
    ap.add_argument("--interval")
    ap.add_argument("--key")
    ap.add_argument("--keysig", default="")
    ap.add_argument("--clef", default="")
    ap.add_argument("--unit", type=int, default=8)
    ap.add_argument("--meter", default="4/4")
    a = ap.parse_args()

    log = a.src if a.src.endswith(".log") else run_homr(a.src)
    staves = parse_log(log)
    if not staves:
        sys.exit(f"no 'Staff(...)' lines found in {log}")
    ksig, clefs = parse_map(a.keysig, int), parse_map(a.clef)
    ktext, key_alter = key_setup(a.key)
    interval = m21.interval.Interval(a.interval) if a.interval else None
    unit_ql = Fraction(4, a.unit)
    num, den = (int(x) for x in a.meter.split("/"))
    meter_ql = Fraction(num * 4, den)

    counts = sorted(len(s["bars"]) for s in staves)
    typical = counts[len(counts) // 2]
    print(f"K:{ktext}  % concert; {len(staves)} staves from {os.path.basename(log)}")
    fingerprints = []
    for i, s in enumerate(staves, 1):
        sharps = ksig.get(i, s["sharps"])
        shift = 12 if (clefs.get(i) == "treble" and s["clef"].startswith("F")) else 0
        alters = {p.step: int(p.accidental.alter) for p in m21.key.KeySignature(sharps).alteredPitches}
        notes = []
        bars, notes_flags = [], []
        for bi, toks in enumerate(s["bars"], 1):
            text, total, flags = build_bar(toks, alters, shift, interval, key_alter, unit_ql)
            if total < meter_ql and total > 0 and i == 1 and bi == 1:
                flags.append(f"{float(total):g}/{float(meter_ql):g} beats -> left as a pickup (a lead-in rest instead? check)")
            elif total < meter_ql and total > 0:
                text = ("z" + abc_len(meter_ql - total, unit_ql) + " " + text).strip()
                flags.append(f"{float(total):g}/{float(meter_ql):g} beats -> guessed leading rest")
            elif total > meter_ql:
                flags.append(f"{float(total):g} beats, over the {float(meter_ql):g} meter")
            for f in flags:
                notes_flags.append(f"staff {i} bar {bi}: {f}")
            bars.append(text)
            notes.append(re.sub(r"[^A-Ga-g^_=,']", "", text))
        fingerprints.append("|".join(notes))
        tags = [f"{s['clef']}/{sharps}"]
        if i in ksig:
            tags.append("keysig overridden")
        if shift:
            tags.append("bass->treble remap")
        print(f"% staff {i}: {', '.join(tags)}, homr distance {s['dist']:.2f}, {len(bars)} bars")
        print("|".join(bars) + "|")
        if s["dist"] > 0.5:
            print(f"WARN staff {i}: homr distance {s['dist']:.2f} (fell back to a worse attempt) -- read by eye",
                  file=sys.stderr)
        if len(bars) != typical:
            print(f"WARN staff {i}: {len(bars)} bars, most staves have {typical} -- one dropped or merged?",
                  file=sys.stderr)
        if s["clef"].startswith("F") and not shift:
            print(f"WARN staff {i}: read as bass clef -- if the scan is treble, rerun with --clef {i}:treble "
                  f"(but a bass misread usually also drops bars; check the bar count)", file=sys.stderr)
        for f in notes_flags:
            print("WARN " + f, file=sys.stderr)
    for i in range(len(staves)):
        for j in range(i + 1, len(staves)):
            r = difflib.SequenceMatcher(None, fingerprints[i], fingerprints[j]).ratio()
            if r > 0.6:
                print(f"NOTE staves {i + 1} and {j + 1} are {r:.0%} alike (written-out repeat?) -- "
                      f"where they differ, one is misread (a bass-clef misread that dropped bars shows up here: copy the twin)", file=sys.stderr)


if __name__ == "__main__":
    main()
