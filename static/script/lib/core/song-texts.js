/*
  The page's one store of song (.abc) texts, by filename. With a setlist open,
  three parts of the page want the same files: the rows' key badges
  (setlists/keys.js), the print booklet (setlists/print.js) and opening a song
  from the list (setlists/view.js). Each used to fetch them itself, so a
  setlist was downloaded twice when it opened and a song a third time when
  picked. Now each file is fetched once, everyone asking while it's in flight
  waits on that one request, and a song picked from an open setlist shows
  without any request at all.

  `read(path, onText, onError)` is the page's file reader (ctx.readFile).
  Answers are always asynchronous, like a real read. A failed read isn't
  kept, so the next ask tries again. `clear()` forgets every text: opening a
  setlist starts from what the server has now.
*/
function notifySafely(notify, waiter) {
  try {
    notify(waiter);
  } catch (error) {
    console.error(error);
  }
}

export function createSongTexts(read) {
  const texts = new Map();
  const waiting = new Map();

  // One shared read answers several callers (a row's key badge, the booklet,
  // the sheet); one of them throwing mustn't leave the others waiting forever,
  // as it couldn't when each made its own request.
  function settle(file, notify) {
    const waiters = waiting.get(file) || [];
    waiting.delete(file);
    waiters.forEach((waiter) => notifySafely(notify, waiter));
  }

  function get(file, onText, onError) {
    const waiter = { onText, onError: onError || (() => {}) };
    if (texts.has(file)) {
      const text = texts.get(file);
      setTimeout(() => waiter.onText(text), 0);
      return;
    }
    if (waiting.has(file)) {
      waiting.get(file).push(waiter);
      return;
    }
    waiting.set(file, [waiter]);
    read(`/songs/${file}`, (text) => {
      texts.set(file, text);
      settle(file, (w) => w.onText(text));
    }, (status) => settle(file, (w) => w.onError(status)));
  }

  return {
    get,
    clear: () => texts.clear(),
  };
}
