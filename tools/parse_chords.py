#!/usr/bin/env python3
"""
parse_chords.py — Add Nashville chord sequences to setlist2026.csv.

Usage:
    python3 tools/parse_chords.py

Reads:  static/songs/setlist2026.csv
        static/songs/<filename>.abc  (for each non-empty ABC column)
Writes: static/songs/setlist2026.csv  (adds/overwrites 'Chords' column)
"""

import csv
import re
import sys
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent
SONGS_DIR = REPO_ROOT / "static" / "songs"
CSV_PATH  = SONGS_DIR / "setlist2026.csv"

# ── Music theory constants ─────────────────────────────────────────────────────

NOTE_SEMI = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# Mirrors MAJOR_MAP / MINOR_MAP from render_abc.js:457–460
MAJOR_MAP = {
    0: (0, ""),  1: (1, "b"), 2: (1, ""),  3: (2, "b"), 4: (2, ""),
    5: (3, ""),  6: (3, "#"), 7: (4, ""),  8: (5, "b"), 9: (5, ""),
    10: (6, "b"), 11: (6, ""),
}
MINOR_MAP = {
    0: (0, ""),  1: (1, "b"), 2: (1, ""),  3: (2, ""),  4: (2, "#"),
    5: (3, ""),  6: (4, "b"), 7: (4, ""),  8: (5, ""),  9: (5, "#"),
    10: (6, ""), 11: (6, "#"),
}
DEGREE_NAMES = ["1", "2", "3", "4", "5", "6", "7"]

# Chord validation regex — mirrors JS render_abc.js line 310
CHORD_RE = re.compile(
    r"^([A-G])([#b]?)"
    r"(maj|m|min|dim|aug|sus|add)?"
    r"(Ø)?"
    r"(\d)?"
    r"([#b])?"
    r"(\d)?"
    r"(?:/[A-Ga-g][#b]?\d?)?$"
)

# ── Key parsing ────────────────────────────────────────────────────────────────

def parse_key(k_value: str) -> tuple[str, bool]:
    """
    Parse an ABC K: field value into (root_note, is_minor).
    Handles: 'Bbmaj', 'Gm', 'Dmin', 'Eb', 'F', 'Abmaj', 'Cm', etc.
    """
    k = k_value.strip()
    is_minor = False
    if k.lower().endswith("min"):
        k, is_minor = k[:-3], True
    elif k.lower().endswith("maj"):
        k = k[:-3]
    elif len(k) > 1 and k.endswith("m") and k[-2].isalpha():
        k, is_minor = k[:-1], True
    return k, is_minor

# ── Semitone arithmetic ────────────────────────────────────────────────────────

def note_to_semi(note: str) -> int:
    """'Bb' → 10, 'F#' → 6, 'G' → 7"""
    base = NOTE_SEMI[note[0]]
    for ch in note[1:]:
        if ch == "#":
            base += 1
        elif ch == "b":
            base -= 1
    return base % 12

# ── Nashville conversion ───────────────────────────────────────────────────────

def chord_to_nashville(chord_str: str, key_note: str, is_minor: bool) -> str | None:
    """
    Convert a chord symbol to its Nashville number relative to key_note.
    Returns None if chord_str is not a valid chord (skipped silently).
    Slash-chord bass notes are ignored; only the root chord is used.
    Mirrors the quality logic from render_abc.js:467–480.
    """
    m = CHORD_RE.match(chord_str)
    if not m:
        return None

    root_letter = m.group(1)
    root_acc    = m.group(2) or ""
    qual        = m.group(3) or ""   # maj / m / min / dim / aug / sus / add
    half_dim    = m.group(4) or ""   # Ø
    ext1        = m.group(5) or ""   # first digit
    ext_acc     = m.group(6) or ""   # accidental before second digit
    ext2        = m.group(7) or ""   # second digit

    interval = (note_to_semi(root_letter + root_acc) - note_to_semi(key_note)) % 12
    idx, prefix = (MINOR_MAP if is_minor else MAJOR_MAP)[interval]
    degree = prefix + DEGREE_NAMES[idx]

    # Quality suffix — order matters: check half-dim before minor
    if half_dim:
        quality = "Ø"
    elif qual in ("m", "min"):
        quality = "m"
    elif qual == "dim":
        quality = "dim"
    elif qual == "maj":
        quality = "maj"
    elif qual in ("aug", "sus", "add"):
        quality = qual
    else:
        quality = ""

    quality += ext_acc + ext1 + ext2
    return degree + quality

# ── ABC file parsing ───────────────────────────────────────────────────────────

def extract_key_from_abc(abc_path: Path) -> tuple[str, bool]:
    """Return (root_note, is_minor) from the first K: field in the file."""
    for line in abc_path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^K:\s*(.+)", line.strip())
        if m:
            return parse_key(m.group(1))
    return "C", False


def extract_chords_from_abc(abc_path: Path) -> list[str]:
    """
    Return all valid chord symbol strings from the ABC body in order.

    Voice handling: only lines belonging to voice 1 are processed.
      - [V:1] / [V:2] inline prefix → effective voice for that line
      - Bare 'V: N' line in the body → switches current_voice
      - No voice declarations → everything is voice 1
    """
    lines = abc_path.read_text(encoding="utf-8").splitlines()
    in_body = False
    current_voice = "1"
    chords: list[str] = []

    for line in lines:
        stripped = line.strip()

        if not in_body:
            if re.match(r"^K:", stripped):
                in_body = True
            continue

        if not stripped or stripped.startswith("%"):
            continue

        # Bare voice-switch line: "V: 1", "V:2 name=..."
        m_bare = re.match(r"^V:\s*(\S+)", stripped)
        if m_bare:
            current_voice = m_bare.group(1).split()[0]
            continue

        # Other information fields (w:, N:, P:, F:, R:, Q:, T:, …) — skip
        if re.match(r"^[A-Za-z]:", stripped) and not stripped.startswith("["):
            continue

        # Inline voice prefix [V:N] at start of line
        m_inline = re.match(r"^\[V:(\S+?)\]", stripped)
        effective_voice = m_inline.group(1) if m_inline else current_voice

        if effective_voice != "1":
            continue

        # Extract quoted strings and filter to valid chords
        for raw in re.findall(r'"([^"]+)"', stripped):
            raw = raw.strip()
            if not raw or raw[0] in ("^", "@", "_"):
                continue
            if CHORD_RE.match(raw):
                chords.append(raw)

    return chords

# ── Full pipeline ──────────────────────────────────────────────────────────────

def abc_to_nashville_string(abc_path: Path) -> str:
    """
    Read an ABC file, extract chords, convert to Nashville numbers,
    collapse consecutive duplicates, and return a space-joined string.
    """
    key_note, is_minor = extract_key_from_abc(abc_path)
    raw_chords = extract_chords_from_abc(abc_path)

    nashville: list[str] = []
    for ch in raw_chords:
        n = chord_to_nashville(ch, key_note, is_minor)
        if n is not None:
            nashville.append(n)

    if not nashville:
        return ""

    collapsed = [nashville[0]]
    for x in nashville[1:]:
        if x != collapsed[-1]:
            collapsed.append(x)

    return " ".join(collapsed)

# ── CSV update ─────────────────────────────────────────────────────────────────

def process_csv(csv_path: Path, songs_dir: Path) -> None:
    with csv_path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        original_fields = list(reader.fieldnames or [])
        rows = list(reader)

    out_fields = original_fields if "Chords" in original_fields else original_fields + ["Chords"]

    for row in rows:
        abc_name = (row.get("ABC") or "").strip()
        if not abc_name:
            row["Chords"] = ""
            continue
        abc_path = songs_dir / abc_name
        if not abc_path.exists():
            print(f"Warning: not found: {abc_path}", file=sys.stderr)
            row["Chords"] = ""
            continue
        try:
            row["Chords"] = abc_to_nashville_string(abc_path)
            print(f"  {abc_name:<45} {row['Chords']}")
        except Exception as exc:
            print(f"Error processing {abc_name}: {exc}", file=sys.stderr)
            row["Chords"] = ""

    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=out_fields, lineterminator="\n", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nWrote {len(rows)} rows → {csv_path}")

# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    process_csv(CSV_PATH, SONGS_DIR)
