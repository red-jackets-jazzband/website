// Render an ABC file exactly the way the /songs/ sheet does (abcjs 6.7.0 vendored
// bundle, staffwidth 1000 + responsive "resize", MuseJazzText, jazz chords, one
// SVG per line) and screenshot it. Use this to judge line density / readability;
// render.py (MuseScore) breaks lines differently from the site.
//
//   node render_site.mjs song.abc out.png [--width 800] [--lyrics-off]
//
// Needs Playwright: it is not a repo dependency, so this looks for the copy in the
// npx cache (~/.npm/_npx/*/node_modules/playwright) and browsers in ~/.cache/ms-playwright.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const [src, out] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--width"));
const width = Number(opt("--width", 800));

const npx = join(homedir(), ".npm/_npx");
const pwDir = existsSync(npx)
  ? readdirSync(npx).map((d) => join(npx, d, "node_modules")).find((d) => existsSync(join(d, "playwright")))
  : null;
if (!pwDir) throw new Error("playwright not found in ~/.npm/_npx/*/node_modules");
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(homedir(), ".cache/ms-playwright");
const { chromium } = createRequire(join(pwDir, "x.js"))("playwright");

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const abcjs = join(repo, "static/script/abcjs_midi_6.7.0-min.js");
const font = `data:font/woff;base64,${readFileSync(join(repo, "static/fonts/MuseJazzText.woff")).toString("base64")}`;
const abc = readFileSync(src, "utf8");

const roles = ["annotationfont italic", "composerfont", "footerfont", "gchordfont", "headerfont",
  "historyfont", "infofont", "measurefont", "partsfont italic", "repeatfont", "subtitlefont",
  "tabgracefont", "tablabelfont", "tabnumberfont", "tempofont", "textfont", "titlefont 4",
  "tripletfont", "vocalfont", "voicefont", "wordsfont"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: width + 40, height: 900 } });
await page.setContent(`<!doctype html><meta charset=utf-8><style>
@font-face{font-family:MuseJazzText;src:url('${font}')}
body{margin:20px;background:#fff}#n{width:${width}px}
</style><div id=n></div>`);
await page.addScriptTag({ path: abcjs });
await page.evaluate(() => document.fonts.load("16px MuseJazzText"));
await page.evaluate(([text, roles, lyricsOff]) => {
  const format = {};
  for (const spec of roles) { const [r, ...rest] = spec.split(" "); format[r] = ["MuseJazzText", ...rest].join(" "); }
  const t = lyricsOff ? text.replace(/^w:.*$/gm, "") : text;
  window.ABCJS.renderAbc("n", t, {
    responsive: "resize", staffwidth: 1000, paddingTop: 0, paddingBottom: 0,
    add_classes: true, jazzchords: true, oneSvgPerLine: true, format,
  });
}, [abc, roles, flag("--lyrics-off")]);
await page.waitForTimeout(300);
await page.locator("#n").screenshot({ path: out });
await browser.close();
console.log("wrote", out);
