// Pure text-scanning helpers the service worker's own install step (sw.js)
// uses to discover which stylesheet and webfont URLs the /songs/ app shell
// actually needs precached — this can't just be a static list, since
// split.css is served from a build-time-fingerprinted URL (see head.html's
// `resources.Get | minify | fingerprint`) whose exact filename isn't known
// ahead of time. Plain indexOf/char scans, not a delimiter-spanning regex
// (see CLAUDE.md's "Regexes that scan for a closing delimiter" note), since
// both walk real but arbitrary-length HTML/CSS text.

// Every <link rel="stylesheet" href="..."> in a page's HTML — the site's own
// fingerprinted stylesheet and any cross-origin one (Font Awesome, from
// cdnjs) alike.
export function findStylesheetHrefs(html) {
  const hrefs = [];
  let searchFrom = 0;
  for (;;) {
    const tagStart = html.indexOf("<link", searchFrom);
    if (tagStart === -1) break;
    const tagEnd = html.indexOf(">", tagStart);
    if (tagEnd === -1) break;
    searchFrom = tagEnd + 1;
    const tag = html.slice(tagStart, tagEnd);
    const href = tag.includes('rel="stylesheet"') ? hrefAttr(tag) : null;
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function hrefAttr(tag) {
  const marker = 'href="';
  const valueStart = tag.indexOf(marker);
  if (valueStart === -1) return null;
  const start = valueStart + marker.length;
  const end = tag.indexOf('"', start);
  return end === -1 ? null : tag.slice(start, end);
}

// Every url(...) reference in a CSS file's text — @font-face's own `src`
// rules, in practice. Handles a bare, single- or double-quoted url() alike.
export function findCssUrls(css) {
  const urls = [];
  let searchFrom = 0;
  for (;;) {
    const open = css.indexOf("url(", searchFrom);
    if (open === -1) break;
    const close = css.indexOf(")", open + 4);
    if (close === -1) break;
    searchFrom = close + 1;
    const url = unquote(css.slice(open + 4, close).trim());
    if (url) urls.push(url);
  }
  return urls;
}

function unquote(value) {
  const quoted = value.length >= 2
    && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
  return quoted ? value.slice(1, -1) : value;
}
