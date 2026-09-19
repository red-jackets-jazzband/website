#!/usr/bin/env python3
"""Check a hand-edited ABC against the OMR draft and its own lyrics — as text.

Compares the ABC's real note stream (abcjs's flattener, so accidentals, ties,
keys and octaves are resolved exactly as the site plays them) with the OMR
MusicXML's, after transposing it. Reports only what differs, by bar, so you look
at crops of just those bars instead of re-reading every system as an image.

Usage:
    check_abc.py song.abc --musicxml scan.musicxml [--interval M-2] [--meter 4/4]
    check_abc.py song.abc                     # lyrics check only

Report:
  PITCH     OMR and ABC disagree on the note at that onset (OMR error or yours)
  MISSING   OMR has a note the ABC doesn't (dropped/extra rest, shifted rhythm)
  EXTRA     ABC has a note the OMR doesn't
  DURATION  same note, but the ABC holds it a different length (tie or rhythm)
  ties      OMR notes absorbed into a longer ABC note — expected where you tied

Lyrics: for each music line with a w: line, the number of note slots vs
syllable slots (`-`-split syllables, `_`, `*`; ties consume a slot). abcjs
silently drops extra syllables, so the count is done here as well.

Exit status 1 if anything but `ties` is reported. Run with tools/OMR/.venv/bin/python3.
"""
import argparse, json, os, re, subprocess, sys
from fractions import Fraction

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _omr import load, bar_label

HERE = os.path.dirname(os.path.abspath(__file__))
EPS = Fraction(1, 1000)


def abc_stream(path):
    out = subprocess.run(["node", os.path.join(HERE, "abc_notes.mjs"), path],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def line_col(text, char):
    before = text[:char].split("\n")
    return len(before), len(before[-1]) + 1


def syllable_slots(w):
    n = 0
    for tok in w.split():
        if tok == "|":
            continue
        n += len([p for p in tok.split("-") if p]) or 1
    return n


def body_music_lines(text):
    """(line_no, [w: texts]) for each music line, in order."""
    lines, in_body, out = text.split("\n"), False, []
    for i, raw in enumerate(lines, 1):
        s = raw.strip()
        if not in_body:
            in_body = s.startswith("K:")
            continue
        if not s or s.startswith("%"):
            continue
        if s.startswith("w:"):
            if out:
                out[-1][1].append(s[2:])
            continue
        if re.match(r"^[A-Za-z]:", s):
            continue
        out.append((i, []))
    return out


def check_lyrics(text, data):
    problems = 0
    music = body_music_lines(text)
    for (line_no, ws), info in zip(music, data["lyricLines"]):
        if not ws:
            continue
        slots = sum(syllable_slots(w) for w in ws) if len(ws) == 1 else syllable_slots(ws[0])
        notes = info["notes"]
        if slots != notes or info["withLyric"] != notes:
            problems += 1
            print(f"LYRICS line {line_no}: {notes} notes, {slots} syllable slots, "
                  f"{info['withLyric']} notes given a syllable by abcjs")
    if not any(ws for _, ws in music):
        print("lyrics: no w: lines")
    elif not problems:
        print("lyrics: every w: line matches its note count")
    return problems


def compare(text, data, args):
    events, measures, meter_ql, pickup = load(args.musicxml, args.interval, args.meter)
    first = measures[0][0]
    pickup_ql = measures[0][1] if pickup else Fraction(0)

    def abc_time(e):
        # Align each OMR bar to the ABC bar grid on its own, so one misread bar
        # (wrong length) can't shift and flood the report for everything after it.
        lab = bar_label(e["meas"], pickup, first)
        base = 0 if lab == 0 else pickup_ql + (lab - 1) * meter_ql
        return base + e["local"]

    abc = [(Fraction(n["start"]).limit_denominator(256) * 4,
            Fraction(n["dur"]).limit_denominator(256) * 4, n["pitch"], n["startChar"])
           for n in data["tracks"][0]]
    by_start = {}
    for s, d, p, c in abc:
        by_start.setdefault(s, []).append((d, p, c))

    omr = [dict(e, t=abc_time(e), lab=bar_label(e["meas"], pickup, first))
           for e in events if not e["rest"]]
    problems, ties = [], 0
    for i, e in enumerate(omr):
        pitches = sorted(p.midi for p in e["pitches"])
        cand = by_start.get(e["t"], [])
        beat = f"beat {float(e['local']) + 1:g}"
        if cand:
            ap = sorted(p for _, p, _ in cand)
            ln, col = line_col(text, cand[0][2])
            if ap != pitches:
                problems.append((e["lab"], "PITCH", f"{beat}: OMR "
                                 f"{[midi_name(x) for x in pitches]} vs ABC "
                                 f"{[midi_name(x) for x in ap]} (ABC line {ln}:{col})"))
                continue
            end, j = e["t"] + e["ql"], i
            abc_end = e["t"] + cand[0][0]
            while (end < abc_end - EPS and j + 1 < len(omr)
                   and sorted(p.midi for p in omr[j + 1]["pitches"]) == pitches
                   and omr[j + 1]["t"] == end):
                j += 1
                end = omr[j]["t"] + omr[j]["ql"]
            if abs(end - abc_end) > EPS:
                problems.append((e["lab"], "DURATION", f"{beat} {midi_name(pitches[0])}: OMR "
                                 f"{float(e['ql']):g} beats vs ABC {float(cand[0][0]):g} "
                                 f"(ABC line {ln}:{col})"))
            continue
        covered = any(a_s < e["t"] - EPS and a_s + d > e["t"] + EPS and p in pitches
                      for a_s, d, p, _ in abc)
        if covered:
            ties += 1
        else:
            problems.append((e["lab"], "MISSING", f"{beat}: OMR "
                             f"{[midi_name(x) for x in pitches]} ({float(e['ql']):g} beats) "
                             f"has no ABC note at that onset"))
    omr_times = {e["t"] for e in omr}
    for s, d, p, c in abc:
        if s not in omr_times:
            ln, col = line_col(text, c)
            bar = int((s - pickup_ql) // meter_ql) + 1 if s >= pickup_ql else 0
            problems.append((bar, "EXTRA", f"ABC {midi_name(p)} at {ln}:{col} has no OMR note at that onset"))
    problems.sort(key=lambda x: x[0])
    for lab, kind, msg in problems:
        print(f"{kind:<8} bar {lab}: {msg}")
    print(f"notes: OMR {len(omr)}, ABC {len(abc)}; {ties} OMR notes absorbed into ties; "
          f"{len(problems)} problem(s)")
    return len(problems)


NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def midi_name(m):
    return f"{NAMES[m % 12]}{m // 12 - 1}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("abc")
    ap.add_argument("--musicxml")
    ap.add_argument("--interval")
    ap.add_argument("--meter")
    a = ap.parse_args()
    text = open(a.abc, encoding="utf8").read()
    data = abc_stream(a.abc)
    for w in data["warnings"]:
        print("abcjs warning:", w)
    bad = check_lyrics(text, data)
    if a.musicxml:
        bad += compare(text, data, a)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
