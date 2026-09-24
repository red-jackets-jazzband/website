// True for a setlist item that is a set divider ("break") rather than a song.
export function isSetlistDivider(item) {
  return Boolean(item) && item.divider !== undefined && item.file === undefined;
}

// A song line is always "<file>.abc" optionally followed by ",<key>" — used
// during the header scan below to tell a song line apart from free-text desc
// prose (which never looks like this).
const SONG_LINE_RE = /^[^,]+\.abc(?:\s*,.*)?$/i;

/*
  Setlist files are small markdown-flavored documents:

    # Setlist 2026

    Optional free-text intro/notes for the printed cover page. Can span
    multiple lines and paragraphs.

    ## Set 1
    bourbon_street_parade.abc,Bb
    > Ben solos the 2nd chorus, watch the key change into the outro.
    five_foot_two.abc,

    ## Set 2
    ...

  - The first "# <text>" line (a single #, not ##) is the setlist title.
  - Any other line before the first "##" heading or song line is free-text
    description, paragraphs kept apart by blank lines.
  - "## <text>" (or bare "##") splits the list into sets — the same role the
    old "# break,<label>" comment line played. Set 1 is everything before the
    first one.
  - A song line is unchanged: "<file>.abc,<key>", key optional.
  - One or more "> <text>" lines directly under a song line attach as that
    song's note (a printed-setlist-only aside, e.g. who solos) — multi-line,
    joined by "\n"; a bare ">" is a blank line inside the note. A "> " line
    anywhere else (nothing to attach to) is dropped.

  For backward compatibility with files exported before this format existed,
  the old single-line comment forms are still read (but never written): a
  bare "#" line only becomes the title the first time one hasn't been found
  yet — so wherever the OLD forms below appear, they're matched first:
    "# name,<Display Name>", "# desc,<text>", "# break" / "# break,<label>".
*/
function parseOldComment(line) {
  const commentBody = line.slice(1).trim();
  const commaIdx = commentBody.indexOf(",");
  const key = (commaIdx === -1 ? commentBody : commentBody.slice(0, commaIdx)).trim().toLowerCase();
  const value = commaIdx === -1 ? "" : commentBody.slice(commaIdx + 1).trim();
  return { key, value, hasComma: commaIdx !== -1 };
}

function songLineItem(line) {
  const parts = line.split(",");
  const file = parts[0] ? parts[0].trim() : "";
  const key = parts[1] !== undefined ? parts[1].trim() : "";
  return file ? { file, key } : null;
}

// One line of a "># text" note continuation: drop the leading "># " marker
// and at most one following space (so "> Ben solos" -> "Ben solos", and a
// bare ">" -> "", a blank line inside the note).
function noteContinuationText(line) {
  return line.slice(1).replace(/^ /, "");
}

function isDividerLine(line) {
  return line.slice(0, 2) === "##";
}

export function parseSetlistFile(text) {
  let name = null;
  let legacyDesc = null;
  const descLines = [];
  const songs = [];
  let inHeader = true;
  let lastSongItem = null;

  function pushDivider(label) {
    songs.push({ divider: label });
    lastSongItem = null;
  }

  function pushSong(line) {
    const item = songLineItem(line);
    if (item) {
      songs.push(item);
      lastSongItem = item;
    }
  }

  function attachNote(line) {
    if (!lastSongItem) return; // nothing to attach a stray "> " line to
    const noteLine = noteContinuationText(line);
    lastSongItem.note = lastSongItem.note ? `${lastSongItem.note}\n${noteLine}` : noteLine;
  }

  // Old-style "#"-prefixed comment, valid in either phase. Returns true once
  // it recognizes (and handles) the line.
  function handleOldComment(line) {
    const { key, value, hasComma } = parseOldComment(line);
    if (key === "break") {
      pushDivider(value);
      return true;
    }
    if (hasComma && key === "name") {
      name = value;
      return true;
    }
    if (hasComma && key === "desc") {
      legacyDesc = value;
      return true;
    }
    return false;
  }

  function handleHeaderLine(line) {
    if (line.length === 0) {
      if (descLines.length && descLines[descLines.length - 1] !== "") descLines.push("");
      return;
    }
    if (isDividerLine(line)) {
      inHeader = false;
      pushDivider(line.slice(2).trim());
      return;
    }
    if (line.charAt(0) === "#") {
      if (handleOldComment(line)) return;
      // A lone "#" line: the new-style title, the first time one shows up.
      // Anything after that is ignored, same as an unrecognized comment
      // always was.
      if (name === null) name = line.slice(1).trim();
      return;
    }
    if (line.charAt(0) === ">") return; // nothing to attach to yet
    if (!SONG_LINE_RE.test(line)) {
      descLines.push(line);
      return;
    }
    inHeader = false;
    pushSong(line);
  }

  function handleListLine(line) {
    if (line.length === 0) return;
    if (isDividerLine(line)) {
      pushDivider(line.slice(2).trim());
      return;
    }
    if (line.charAt(0) === "#") {
      handleOldComment(line);
      return;
    }
    if (line.charAt(0) === ">") {
      attachNote(line);
      return;
    }
    pushSong(line);
  }

  text.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (inHeader) handleHeaderLine(line);
    else handleListLine(line);
  });

  while (descLines.length && descLines[descLines.length - 1] === "") descLines.pop();
  let desc = descLines.length ? descLines.join("\n") : null;
  if (legacyDesc !== null) desc = legacyDesc;

  return { name, desc, songs };
}

// Serializes back to the new markdown-flavored format (see the doc comment
// above) — the one format this ever writes, even when reading a file that
// used the old comment syntax. Shared verbatim by band setlists (committed to
// the repo) and personal setlists (localStorage -> downloadable .txt
// export/import).
export function serializeSetlistFile(setlist) {
  const lines = [];
  if (setlist.name) lines.push(`# ${setlist.name}`);
  if (setlist.desc) {
    lines.push("");
    setlist.desc.split("\n").forEach((l) => lines.push(l));
  }

  const songs = setlist.songs || [];
  if (lines.length && songs.length) lines.push("");
  songs.forEach((item) => {
    if (isSetlistDivider(item)) {
      lines.push(item.divider ? `## ${item.divider}` : "##");
      return;
    }
    lines.push(`${item.file},${item.key || ""}`);
    if (item.note) item.note.split("\n").forEach((l) => lines.push(`> ${l}`));
  });
  return `${lines.join("\n")}\n`;
}
