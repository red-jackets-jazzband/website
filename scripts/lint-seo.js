// Lints the built Hugo output in public/ for the on-page SEO tags this site
// relies on: a unique <title>/description/canonical per page, exactly one
// <h1>, a correct per-language <html lang>, og:url/canonical agreement, and
// hreflang alternates on every page that has translations. Runs against
// public/ (not the templates) so it catches whatever Hugo actually emitted,
// the same way `linkchecker` already does in CI - see the "Check SEO" step
// in .github/workflows/publish.yaml. Requires `hugo` to have run first.
//
// Every tag/attribute lookup below is a manual indexOf-based scan rather
// than a "delimiter ... * ... delimiter" regex (`"[^"]*"` and friends) -
// see the "Regexes that scan for a closing delimiter" note in CLAUDE.md.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const LANG_CODES = new Set(["en", "nl", "de", "fr"]);
const DEFAULT_LANG = "en";
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 160;
const TITLE_MAX = 70;

function readBaseUrl(configText) {
  const idx = configText.indexOf("baseURL");
  if (idx === -1) return null;
  const quoteStart = configText.indexOf('"', idx);
  if (quoteStart === -1) return null;
  const quoteEnd = configText.indexOf('"', quoteStart + 1);
  if (quoteEnd === -1) return null;
  return configText.slice(quoteStart + 1, quoteEnd);
}

function comparePaths(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function listHtmlFiles(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listHtmlFiles(full, base));
    } else if (entry.name.endsWith(".html")) {
      files.push(full.slice(base.length + 1));
    }
  }
  return files.sort(comparePaths);
}

// Finds every `<tagName ...>` tag (start tag only) and returns its raw text.
function findTags(html, tagName) {
  const tags = [];
  const prefix = `<${tagName}`;
  let from = 0;
  for (;;) {
    const start = html.indexOf(prefix, from);
    if (start === -1) break;
    const boundary = html[start + prefix.length];
    if (boundary !== undefined && boundary !== ">" && boundary !== " " && boundary !== "/") {
      from = start + prefix.length;
      continue;
    }
    const end = html.indexOf(">", start);
    if (end === -1) break;
    tags.push(html.slice(start, end + 1));
    from = end + 1;
  }
  return tags;
}

function findUnquotedEnd(tag, start) {
  let i = start;
  while (i < tag.length && tag[i] !== " " && tag[i] !== ">") i += 1;
  return i;
}

function extractAttr(tag, name) {
  const marker = `${name}=`;
  let from = 0;
  for (;;) {
    const idx = tag.indexOf(marker, from);
    if (idx === -1) return null;
    const before = tag[idx - 1];
    if (before !== " " && before !== "\t" && before !== "\n") {
      from = idx + marker.length;
      continue;
    }
    const valueStart = idx + marker.length;
    const quote = tag[valueStart];
    if (quote === '"' || quote === "'") {
      const end = tag.indexOf(quote, valueStart + 1);
      return end === -1 ? null : tag.slice(valueStart + 1, end);
    }
    return tag.slice(valueStart, findUnquotedEnd(tag, valueStart));
  }
}

function textBetween(html, openTag, closeTag) {
  const openIdx = html.indexOf(openTag);
  if (openIdx === -1) return null;
  const contentStart = openIdx + openTag.length;
  const closeIdx = html.indexOf(closeTag, contentStart);
  if (closeIdx === -1) return null;
  return html.slice(contentStart, closeIdx);
}

function metaContent(html, attr, value) {
  const matches = findTags(html, "meta").filter((tag) => extractAttr(tag, attr) === value);
  return matches.map((tag) => extractAttr(tag, "content"));
}

function pagePathInfo(relPath, baseUrl) {
  const segments = relPath.split(sep);
  const dirSegments = segments.slice(0, -1);
  let lang = DEFAULT_LANG;
  let slugSegments = dirSegments;
  if (dirSegments.length > 0 && LANG_CODES.has(dirSegments[0]) && dirSegments[0] !== DEFAULT_LANG) {
    [lang] = dirSegments;
    slugSegments = dirSegments.slice(1);
  }
  const expectedPath = `/${dirSegments.join("/")}${dirSegments.length ? "/" : ""}`;
  return { lang, slug: slugSegments.join("/"), permalink: new URL(expectedPath, baseUrl).toString() };
}

function checkTitle(html, issues) {
  const title = textBetween(html, "<title>", "</title>");
  if (!title) {
    issues.push("missing <title>");
  } else if (title.length > TITLE_MAX) {
    issues.push(`<title> is ${title.length} chars, longer than ${TITLE_MAX}: "${title}"`);
  }
}

function checkDescription(html, issues) {
  const [description, ...rest] = metaContent(html, "name", "description");
  if (rest.length > 0) issues.push("more than one meta description");
  if (!description) {
    issues.push("missing meta description");
    return null;
  }
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    issues.push(
      `meta description is ${description.length} chars, expected ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}: "${description}"`,
    );
  }
  return description;
}

function checkHeading(html, issues) {
  const h1s = findTags(html, "h1");
  if (h1s.length !== 1) issues.push(`expected exactly one <h1>, found ${h1s.length}`);
}

function checkHtmlLang(html, expectedLang, issues) {
  const [htmlTag] = findTags(html, "html");
  const lang = htmlTag ? extractAttr(htmlTag, "lang") : null;
  if (!lang) {
    issues.push("missing <html lang>");
  } else if (!lang.toLowerCase().startsWith(expectedLang)) {
    issues.push(`<html lang="${lang}"> doesn't match this page's language (${expectedLang})`);
  }
}

function checkImagesHaveAlt(html, issues) {
  for (const tag of findTags(html, "img")) {
    const alt = extractAttr(tag, "alt");
    if (!alt) issues.push(`<img> without alt text: ${tag}`);
  }
}

function checkCanonicalAndOgUrl(html, expectedPermalink, issues) {
  const canonicalLinks = findTags(html, "link").filter((tag) => extractAttr(tag, "rel") === "canonical");
  if (canonicalLinks.length !== 1) {
    issues.push(`expected exactly one canonical link, found ${canonicalLinks.length}`);
  } else {
    const href = extractAttr(canonicalLinks[0], "href");
    if (href !== expectedPermalink) {
      issues.push(`canonical is "${href}", expected "${expectedPermalink}"`);
    }
  }
  const [ogUrl] = metaContent(html, "property", "og:url");
  if (ogUrl !== expectedPermalink) {
    issues.push(`og:url is "${ogUrl}", expected "${expectedPermalink}"`);
  }
}

function checkOpenGraphBasics(html, issues) {
  for (const property of ["og:title", "og:description", "og:type"]) {
    const [value] = metaContent(html, "property", property);
    if (!value) issues.push(`missing meta property="${property}"`);
  }
}

function checkRobotsMeta(html, issues) {
  const [robots] = metaContent(html, "name", "robots");
  if (robots?.toLowerCase().includes("noindex")) {
    issues.push(`meta robots unexpectedly says "${robots}"`);
  }
}

function lintContentPage(relPath, html, baseUrl) {
  const issues = [];
  const { lang, permalink } = pagePathInfo(relPath, baseUrl);
  checkTitle(html, issues);
  const description = checkDescription(html, issues);
  checkHeading(html, issues);
  checkHtmlLang(html, lang, issues);
  checkImagesHaveAlt(html, issues);
  checkCanonicalAndOgUrl(html, permalink, issues);
  checkOpenGraphBasics(html, issues);
  checkRobotsMeta(html, issues);
  return { issues, description };
}

function checkHreflangGroups(pages, issues) {
  const bySlug = new Map();
  for (const page of pages) {
    const group = bySlug.get(page.slug) ?? [];
    group.push(page);
    bySlug.set(page.slug, group);
  }
  for (const group of bySlug.values()) {
    if (group.length < 2) continue;
    for (const page of group) {
      const hreflangCount = findTags(page.html, "link").filter(
        (tag) => extractAttr(tag, "rel") === "alternate" && extractAttr(tag, "hreflang"),
      ).length;
      if (hreflangCount < group.length) {
        issues.push(
          `${page.relPath}: expected hreflang alternates for all ${group.length} translations, found ${hreflangCount}`,
        );
      }
    }
  }
}

function checkDuplicateDescriptions(pages, issues) {
  const byDescription = new Map();
  for (const page of pages) {
    if (!page.description) continue;
    const files = byDescription.get(page.description) ?? [];
    files.push(page.relPath);
    byDescription.set(page.description, files);
  }
  for (const [description, files] of byDescription) {
    if (files.length > 1) {
      issues.push(`meta description reused across ${files.join(", ")}: "${description}"`);
    }
  }
}

function checkRobotsTxt(issues) {
  const robotsPath = join(PUBLIC_DIR, "robots.txt");
  if (!existsSync(robotsPath)) {
    issues.push("public/robots.txt is missing");
    return;
  }
  const content = readFileSync(robotsPath, "utf8");
  if (!content.includes("Sitemap:")) issues.push("public/robots.txt has no Sitemap: line");
}

function checkSitemap(issues) {
  if (!existsSync(join(PUBLIC_DIR, "sitemap.xml"))) issues.push("public/sitemap.xml is missing");
}

function isRedirectStub(html) {
  return html.toLowerCase().includes("http-equiv=refresh") || html.toLowerCase().includes('http-equiv="refresh"');
}

function resolveBaseUrlOrExit() {
  const configText = readFileSync(join(ROOT, "config.toml"), "utf8");
  const baseUrl = readBaseUrl(configText);
  if (!baseUrl) {
    console.error("Could not find baseURL in config.toml");
    process.exit(1);
  }
  return baseUrl;
}

function collectContentPages(baseUrl, perPageIssues) {
  const contentPages = [];
  for (const relPath of listHtmlFiles(PUBLIC_DIR)) {
    const html = readFileSync(join(PUBLIC_DIR, relPath), "utf8");
    if (isRedirectStub(html) || relPath === "404.html") continue;
    const { issues, description } = lintContentPage(relPath, html, baseUrl);
    if (issues.length > 0) perPageIssues.set(relPath, issues);
    const { lang, slug } = pagePathInfo(relPath, baseUrl);
    contentPages.push({ relPath, html, lang, slug, description });
  }
  return contentPages;
}

function report(globalIssues, perPageIssues, crossPageIssues, pageCount) {
  if (globalIssues.length > 0) {
    console.error("\nSite-wide:");
    for (const issue of globalIssues) console.error(`  ${issue}`);
  }
  for (const [relPath, issues] of perPageIssues) {
    console.error(`\n${relPath}`);
    for (const issue of issues) console.error(`  ${issue}`);
  }
  if (crossPageIssues.length > 0) {
    console.error("\nCross-page:");
    for (const issue of crossPageIssues) console.error(`  ${issue}`);
  }

  const hasIssues = globalIssues.length > 0 || perPageIssues.size > 0 || crossPageIssues.length > 0;
  if (hasIssues) {
    console.error("\nSEO lint failed: issues found above.");
    process.exit(1);
  }
  console.error(`SEO lint passed: ${pageCount} pages checked, no issues.`);
}

function main() {
  if (!existsSync(PUBLIC_DIR)) {
    console.error("public/ not found - run `hugo` before `npm run lint:seo`.");
    process.exit(1);
  }
  const baseUrl = resolveBaseUrlOrExit();

  const globalIssues = [];
  checkRobotsTxt(globalIssues);
  checkSitemap(globalIssues);

  const perPageIssues = new Map();
  const contentPages = collectContentPages(baseUrl, perPageIssues);

  const crossPageIssues = [];
  checkHreflangGroups(contentPages, crossPageIssues);
  checkDuplicateDescriptions(contentPages, crossPageIssues);

  report(globalIssues, perPageIssues, crossPageIssues, contentPages.length);
}

main();
