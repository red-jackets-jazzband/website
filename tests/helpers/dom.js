import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const FIXTURE = fileURLToPath(new URL("../fixtures/songs-page.html", import.meta.url));

// Globals jsdom provides that the orchestration modules reach for. Assigned
// onto globalThis for the lifetime of a test, then removed by cleanup().
const EXPOSED = [
  "window", "document", "navigator", "location",
  "HTMLElement", "HTMLAnchorElement", "SVGElement", "Node", "Event", "CustomEvent",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
  "Blob", "FileReader", "URL", "localStorage",
];

/*
  Mount the songs-page DOM skeleton in a fresh jsdom and expose the browser
  globals the modules under test expect. Returns { window, document, cleanup };
  always call cleanup() in a test's finally / afterEach so suites stay isolated.
*/
/** @param {{ html?: string, url?: string }} [options] */
export function mountPage({ html, url = "https://example.test/songs/" } = {}) {
  const body = html ?? readFileSync(FIXTURE, "utf8");
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
    url,
    pretendToBeVisual: true,
  });

  // jsdom implements neither of these; the orchestration calls both.
  if (!dom.window.Element.prototype.scrollIntoView) {
    dom.window.Element.prototype.scrollIntoView = () => {};
  }
  if (!dom.window.Element.prototype.getBBox) {
    dom.window.Element.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
  }
  // jsdom ships no Pointer Capture API; the panel drag/resize handlers call it.
  for (const method of ["setPointerCapture", "releasePointerCapture", "hasPointerCapture"]) {
    if (!dom.window.Element.prototype[method]) {
      dom.window.Element.prototype[method] = method === "hasPointerCapture" ? () => false : () => {};
    }
  }

  const saved = new Map();
  for (const key of EXPOSED) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    const value = key === "window" ? dom.window : dom.window[key];
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }

  return {
    window: dom.window,
    document: dom.window.document,
    cleanup() {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
      dom.window.close();
    },
  };
}
