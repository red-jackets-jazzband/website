"use strict";

// True for a setlist item that is a set divider ("break") rather than a song.
export function isSetlistDivider(item) {
  return !!item && item.divider !== undefined && item.file === undefined;
}

// Parses a setlist file: optional leading "# name,<Display Name>" and
// "# desc,<short text>" comment lines, then one "file.abc,KEY" per song
// (KEY optional — blank means the song's own native key). A "# break" line
// (optionally "# break,<label>") splits the list into sets — set 1 before
// the first break, set 2 after it, and so on. Blank lines and any other
// "#"-prefixed line are ignored.
export function parseSetlistFile(text) {
  var name = null;
  var desc = null;
  var songs = [];

  text.split("\n").forEach(function(rawLine) {
    var line = rawLine.trim();
    if (line.length === 0) return;

    if (line.charAt(0) === "#") {
      var commentBody = line.slice(1).trim();
      var commaIdx = commentBody.indexOf(",");
      var key = (commaIdx === -1 ? commentBody : commentBody.slice(0, commaIdx)).trim().toLowerCase();
      var value = commaIdx === -1 ? "" : commentBody.slice(commaIdx + 1).trim();
      if (key === "break") songs.push({ divider: value });
      else if (commaIdx !== -1 && key === "name") name = value;
      else if (commaIdx !== -1 && key === "desc") desc = value;
      return;
    }

    var parts = line.split(",");
    var file = parts[0] ? parts[0].trim() : "";
    var key2 = parts[1] !== undefined ? parts[1].trim() : "";
    if (file) songs.push({ file: file, key: key2 });
  });

  return { name: name, desc: desc, songs: songs };
}

// Serializes back to the same format. Shared verbatim by band setlists
// (committed to the repo) and personal setlists (Milestone 8's
// localStorage → downloadable .txt export/import).
export function serializeSetlistFile(setlist) {
  var lines = [];
  if (setlist.name) lines.push("# name," + setlist.name);
  if (setlist.desc) lines.push("# desc," + setlist.desc);
  (setlist.songs || []).forEach(function(item) {
    if (isSetlistDivider(item)) {
      lines.push(item.divider ? "# break," + item.divider : "# break");
    } else {
      lines.push(item.file + "," + (item.key || ""));
    }
  });
  return lines.join("\n") + "\n";
}
