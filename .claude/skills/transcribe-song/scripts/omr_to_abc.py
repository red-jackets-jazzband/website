#!/usr/bin/env python3
"""Turn an OMR MusicXML into a draft ABC melody (transposed, house style).

Saves the tedious part of a transcription: pitches, octaves, accidentals (with
in-bar persistence against the key signature), note lengths and barlines come out
ready to paste. You still add chords, ties, lyrics and fix what the checks flag.

Usage:
    omr_to_abc.py scan.musicxml --key Bb [--interval M-2] [--title "Name"]
                  [--unit 8] [--bars-per-line 4] [--meter 4/4]

    --interval  music21 interval to transpose by. Written-C sheet for a Bb
                instrument -> concert Bb:  --interval M-2
    --key       target key as Bb, F, C#, Am ... (default: none -> K:C)
    --unit      L: denominator (8 -> L:1/8, 4 -> L:1/4)

Prints the ABC to stdout; warnings go to stderr:
  * bars whose beats don't sum to the meter (a first short bar is treated as a
    pickup and written `x||`; a short last bar is allowed)
  * "possible tie" spots: OMR drops every tie, so equal pitches back to back
    across a barline, or inside a bar with a total no single note could have
    (e.g. 0.5+2 beats), are listed. Expect some false positives.
Ties are NOT added automatically - confirm each one on the scan, then add `-`.

Run with tools/OMR/.venv/bin/python3.
"""
import argparse, os, sys
from fractions import Fraction

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import music21 as m21
from _omr import load, bar_label

# beat counts one written note can have; a same-pitch pair summing to anything
# else is almost certainly a tie
SINGLE_VALUES = {Fraction(x) for x in ("1/4", "1/2", "3/4", "1", "3/2", "2", "3", "4", "6")}
ACC = {1: "^", -1: "_", 0: "=", 2: "^^", -2: "__"}


def abc_pitch(p, state, key_alter):
    """ABC note text for pitch p, updating per-bar accidental `state`."""
    alter = int(p.accidental.alter) if p.accidental else 0
    key = (p.step, p.octave)
    prefix = ""
    if state.get(key, key_alter.get(p.step, 0)) != alter:
        prefix = ACC[alter]
    state[key] = alter
    if p.octave >= 5:
        return prefix + p.step.lower() + "'" * (p.octave - 5)
    return prefix + p.step + "," * (4 - p.octave)


def abc_len(ql, unit_ql):
    x = Fraction(ql) / unit_ql
    if x == 1:
        return ""
    if x.denominator == 1:
        return str(x.numerator)
    if x.numerator == 1:
        return "/" if x.denominator == 2 else f"/{x.denominator}"
    return f"{x.numerator}/{x.denominator}"


def key_setup(key):
    """(K: text, {step: alter}) for a key name like Bb / F# / Am."""
    if not key:
        return "C", {}
    minor = key.endswith("m") and not key.endswith("dim")
    tonic = key[:-1] if minor else key
    tonic = tonic.replace("b", "-") if len(tonic) > 1 else tonic
    k = m21.key.Key(tonic, "minor" if minor else "major")
    alters = {p.step: int(p.accidental.alter) for p in k.alteredPitches}
    return (key if minor else key + "maj"), alters


def possible_ties(events, pickup, first_meas):
    out = []
    notes = [e for e in events if not e["rest"]]
    for a, b in zip(notes, notes[1:]):
        if [p.midi for p in a["pitches"]] != [p.midi for p in b["pitches"]]:
            continue
        if a["start"] + a["ql"] != b["start"]:
            continue
        if a["meas"] != b["meas"]:
            out.append(f"bar {bar_label(a['meas'], pickup, first_meas)}->"
                       f"{bar_label(b['meas'], pickup, first_meas)}")
        elif a["ql"] + b["ql"] not in SINGLE_VALUES:
            out.append(f"bar {bar_label(a['meas'], pickup, first_meas)} "
                       f"({float(a['ql']):g}+{float(b['ql']):g} beats)")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("musicxml")
    ap.add_argument("--interval")
    ap.add_argument("--key")
    ap.add_argument("--title", default="TITLE")
    ap.add_argument("--unit", type=int, default=8)
    ap.add_argument("--bars-per-line", type=int, default=4)
    ap.add_argument("--meter")
    a = ap.parse_args()

    ktext, key_alter = key_setup(a.key)
    events, measures, meter_ql, pickup = load(a.musicxml, a.interval, a.meter)
    unit_ql = Fraction(4, a.unit)
    first_meas = measures[0][0]

    by_meas = {}
    for e in events:
        by_meas.setdefault(e["meas"], []).append(e)

    bars = []
    for i, (num, total) in enumerate(measures):
        state = {}
        toks = []
        for e in by_meas.get(num, []):
            ln = abc_len(e["ql"], unit_ql)
            if e["rest"]:
                toks.append("z" + ln)
            elif len(e["pitches"]) > 1:
                toks.append("[" + "".join(abc_pitch(p, state, key_alter) for p in e["pitches"]) + "]" + ln)
            else:
                toks.append(abc_pitch(e["pitches"][0], state, key_alter) + ln)
        bars.append(" ".join(toks))
        last = i == len(measures) - 1
        short_ok = (i == 0 and pickup) or last
        if total != meter_ql and not short_ok:
            print(f"WARN bar {bar_label(num, pickup, first_meas)}: "
                  f"{float(total):g} beats, expected {float(meter_ql):g}", file=sys.stderr)

    out = ["X:1", f"T:{a.title}", "C:", f"M:{a.meter or '4/4'}",
           f"L:1/{a.unit}", f"K:{ktext}"]
    line, count, body = [], 0, []
    for i, b in enumerate(bars):
        if i == 0 and pickup:
            body.append(b + "||")
            continue
        line.append(b)
        count += 1
        if count == a.bars_per_line:
            body.append("|".join(line) + "|")
            line, count = [], 0
    if line:
        body.append("|".join(line) + "|")
    if body:
        body[-1] = body[-1][:-1] + "|]"
    # keep the pickup on the same source line as bar 1
    if pickup and len(body) > 1:
        body[0] += body.pop(1)
    print("\n".join(out + body))

    ties = possible_ties(events, pickup, first_meas)
    if ties:
        print("possible ties (OMR drops all ties - check the scan): " + "; ".join(ties),
              file=sys.stderr)


if __name__ == "__main__":
    main()
