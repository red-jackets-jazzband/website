import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import {
  byId, qs, qsa, clear, setHidden, on, el, mount, downloadBlob, copyText,
} from "./dom.js";

function inDom(fn) {
  const page = mountPage({ html: "<div id='root'></div>" });
  try {
    return fn(page);
  } finally {
    page.cleanup();
  }
}

test("byId / qs / qsa read the document", () => {
  inDom(() => {
    assert.equal(byId("root").id, "root");
    assert.equal(byId("missing"), null);
    byId("root").innerHTML = "<span class='x'>a</span><span class='x'>b</span>";
    assert.equal(qs(".x").textContent, "a");
    assert.deepEqual(qsa(".x").map((n) => n.textContent), ["a", "b"]);
    // a null root is tolerated (a missing container)
    assert.equal(qs(".x", null), null);
    assert.deepEqual(qsa(".x", null), []);
  });
});

test("clear empties a node and tolerates null", () => {
  inDom(() => {
    const root = byId("root");
    root.append(el("span"), el("span"));
    clear(root);
    assert.equal(root.childElementCount, 0);
    assert.doesNotThrow(() => clear(null));
  });
});

test("setHidden toggles [hidden]", () => {
  inDom(() => {
    const root = byId("root");
    setHidden(root, true);
    assert.equal(root.hidden, true);
    setHidden(root, 0);
    assert.equal(root.hidden, false);
  });
});

test("on binds by id and reports a missing target", () => {
  inDom(({ window }) => {
    let hits = 0;
    const bound = on("root", "click", () => { hits += 1; });
    assert.equal(bound, byId("root"));
    byId("root").dispatchEvent(new window.Event("click"));
    assert.equal(hits, 1);
    assert.equal(on("nope", "click", () => {}), null);
  });
});

test("el builds an element from a props bag", () => {
  inDom(({ window }) => {
    let clicked = false;
    const node = el("button", {
      class: "btn primary",
      type: "button",
      text: "Go",
      dataset: { role: "submit" },
      attrs: { "aria-pressed": "false", "aria-hidden": null },
      on: { click: () => { clicked = true; } },
    });
    assert.equal(node.tagName, "BUTTON");
    assert.equal(node.className, "btn primary");
    assert.equal(node.type, "button");
    assert.equal(node.textContent, "Go");
    assert.equal(node.dataset.role, "submit");
    assert.equal(node.getAttribute("aria-pressed"), "false");
    assert.equal(node.hasAttribute("aria-hidden"), false);
    node.dispatchEvent(new window.Event("click"));
    assert.equal(clicked, true);
  });
});

test("el appends node, string and array children, skipping nullish", () => {
  inDom(() => {
    const node = el("div", {}, [
      el("span", { text: "one" }),
      "two",
      null,
      false,
      el("span", { text: "three" }),
    ]);
    assert.equal(node.childNodes.length, 3);
    assert.equal(node.textContent, "onetwothree");
  });
});

test("mount appends to an element or id and skips nullish", () => {
  inDom(() => {
    mount("root", el("span", { text: "a" }), null, el("span", { text: "b" }));
    assert.equal(byId("root").textContent, "ab");
  });
});

// jsdom implements neither URL.createObjectURL/revokeObjectURL nor a real
// anchor click's navigation, so both are stubbed for this one test.
test("downloadBlob clicks a throwaway object-URL anchor, then cleans it up", () => {
  inDom(() => {
    const created = [];
    const revoked = [];
    URL.createObjectURL = (blob) => { created.push(blob); return "blob:fake-url"; };
    URL.revokeObjectURL = (url) => revoked.push(url);
    let clickedHref = null;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click() { clickedHref = this.href; };
    try {
      const blob = new Blob(["hi"], { type: "text/plain" });
      downloadBlob("notes.txt", blob);
      assert.deepEqual(created, [blob]);
      assert.equal(clickedHref, "blob:fake-url");
      assert.deepEqual(revoked, ["blob:fake-url"]);
      assert.equal(document.querySelectorAll("a[download]").length, 0);
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });
});

test("copyText resolves true via the async Clipboard API", async () => {
  const page = mountPage({ html: "<div id='root'></div>" });
  try {
    const copied = [];
    Object.defineProperty(page.window.navigator, "clipboard", {
      value: { writeText: (t) => { copied.push(t); return Promise.resolve(); } },
      configurable: true,
    });
    assert.equal(await copyText("hello"), true);
    assert.deepEqual(copied, ["hello"]);
  } finally {
    page.cleanup();
  }
});

test("copyText falls back to the legacy path when the Clipboard API rejects", async () => {
  const page = mountPage({ html: "<div id='root'></div>" });
  try {
    Object.defineProperty(page.window.navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });
    // jsdom has no real execCommand, so this resolves false — the same
    // "neither mechanism worked" outcome a locked-down real browser would
    // produce, which is exactly what callers need to detect to fall back
    // further (e.g. a prompt() the user can copy out of by hand).
    assert.equal(await copyText("hello"), false);
  } finally {
    page.cleanup();
  }
});

test("copyText falls back to the legacy path when there's no Clipboard API at all", async () => {
  const page = mountPage({ html: "<div id='root'></div>" });
  try {
    Object.defineProperty(page.window.navigator, "clipboard", { value: undefined, configurable: true });
    assert.equal(await copyText("hello"), false);
  } finally {
    page.cleanup();
  }
});
