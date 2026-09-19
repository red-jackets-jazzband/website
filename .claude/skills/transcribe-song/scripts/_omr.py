"""Shared: load an OMR MusicXML as a flat, optionally transposed event list.

Each event: dict(meas, start, local, ql, rest, pitches) where `start`/`local`/`ql`
are Fractions of a quarter note: `start` cumulative from the first note, `local`
the offset inside its own measure, and
`pitches` is a list of music21 Pitch objects (empty for a rest).

`interval` is a music21 interval string, e.g. "M-2" (down a major 2nd, written
C -> concert Bb), "m-3", "P8". Diatonic intervals keep sensible spelling
(C# down M2 -> B natural, D# -> C#).
"""
from fractions import Fraction
import music21 as m21


def load(path, interval=None, meter=None):
    """Return (events, measures, meter_ql, pickup) for the first part."""
    score = m21.converter.parse(path)
    part = score.parts[0]
    if interval:
        part = part.transpose(interval)
    if meter is None:
        ts = part.recurse().getElementsByClass(m21.meter.TimeSignature)
        meter = ts[0].ratioString if ts else "4/4"
    num, den = (int(x) for x in meter.split("/"))
    meter_ql = Fraction(num * 4, den)

    events, measures, t = [], [], Fraction(0)
    for m in part.getElementsByClass("Measure"):
        total = Fraction(0)
        for n in m.recurse().notesAndRests:
            ql = Fraction(n.quarterLength).limit_denominator(64)
            if n.isRest:
                pitches = []
            elif n.isChord:
                pitches = list(n.pitches)
            else:
                pitches = [n.pitch]
            events.append(dict(meas=m.number, start=t + total, local=total, ql=ql,
                               rest=n.isRest, pitches=pitches))
            total += ql
        measures.append((m.number, total))
        t += total
    pickup = bool(measures) and measures[0][1] < meter_ql
    return events, measures, meter_ql, pickup


def bar_label(meas, pickup, first_meas):
    """Human bar number: pickup = bar 0, first full bar = bar 1."""
    idx = meas - first_meas
    return idx if pickup else idx + 1
