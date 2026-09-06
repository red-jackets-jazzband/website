import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../tests/helpers/dom.js";
import { createInspiration } from "./inspiration.js";

function inDom(fn) {
  const page = mountPage();
  try {
    return fn(page);
  } finally {
    page.cleanup();
  }
}

test("updateLink creates the Inspiration button for a tune with a reference", () => {
  inDom(() => {
    const insp = createInspiration();
    insp.updateLink("https://youtu.be/abcdefghijk", "Louis Armstrong");
    const btn = document.getElementById("inspirationLink");
    assert.ok(btn);
    assert.equal(btn.textContent, "Inspiration");
    assert.equal(btn.dataset.url, "https://youtu.be/abcdefghijk");
    assert.equal(btn.dataset.title, "Louis Armstrong");
    assert.ok(document.getElementById("inspirationSlot").contains(btn));
  });
});

test("updateLink updates the existing button in place, without duplicating it", () => {
  inDom(() => {
    const insp = createInspiration();
    insp.updateLink("https://youtu.be/one11111111", "One");
    insp.updateLink("https://youtu.be/two22222222", "Two");
    assert.equal(document.querySelectorAll("#inspirationLink").length, 1);
    assert.equal(document.getElementById("inspirationLink").dataset.url, "https://youtu.be/two22222222");
  });
});

test("updateLink(undefined) removes the button for a tune without a reference", () => {
  inDom(() => {
    const insp = createInspiration();
    insp.updateLink("https://youtu.be/abcdefghijk", "X");
    insp.updateLink(undefined);
    assert.equal(document.getElementById("inspirationLink"), null);
  });
});

test("init wires the close button without a player attached", () => {
  inDom(() => {
    const insp = createInspiration();
    insp.init();
    const panel = document.getElementById("inspirationPanel");
    panel.hidden = false;
    document.getElementById("inspirationCloseBtn").dispatchEvent(new window.Event("click"));
    assert.equal(panel.hidden, true);
  });
});

test("the size button steps the panel width and wraps back round", () => {
  inDom(({ window }) => {
    window.localStorage.clear();
    const insp = createInspiration();
    insp.init();
    const panel = document.getElementById("inspirationPanel");
    const btn = document.getElementById("inspirationSizeBtn");

    assert.equal(panel.style.width, "320px");
    const widths = [];
    for (let i = 0; i < 4; i += 1) {
      btn.dispatchEvent(new window.Event("click"));
      widths.push(panel.style.width);
    }
    assert.deepEqual(widths, ["420px", "540px", "680px", "320px"]);
  });
});

test("init restores a persisted panel width", () => {
  inDom(({ window }) => {
    window.localStorage.setItem("rj.inspirationWidth", "540");
    const insp = createInspiration();
    insp.init();
    assert.equal(document.getElementById("inspirationPanel").style.width, "540px");
    window.localStorage.clear();
  });
});

test("dragging the left edge resizes the panel and persists the new width", () => {
  inDom(({ window }) => {
    window.localStorage.clear();
    const insp = createInspiration();
    insp.init();
    const panel = document.getElementById("inspirationPanel");
    const handle = document.getElementById("inspirationResizeHandle");
    panel.getBoundingClientRect = () => ({ right: 800, left: 480, width: 320, top: 100, bottom: 400, height: 300 });

    handle.dispatchEvent(new window.PointerEvent("pointerdown", { pointerId: 1, clientX: 480 }));
    handle.dispatchEvent(new window.PointerEvent("pointermove", { pointerId: 1, clientX: 300 }));
    assert.equal(panel.style.width, "500px");

    handle.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 1, clientX: 300 }));
    assert.equal(window.localStorage.getItem("rj.inspirationWidth"), "500");
  });
});

test("edge resize floors the panel at MIN_PANEL_WIDTH", () => {
  inDom(({ window }) => {
    window.localStorage.clear();
    const insp = createInspiration();
    insp.init();
    const panel = document.getElementById("inspirationPanel");
    const handle = document.getElementById("inspirationResizeHandle");
    panel.getBoundingClientRect = () => ({ right: 800, left: 480, width: 320, top: 100, bottom: 400, height: 300 });

    handle.dispatchEvent(new window.PointerEvent("pointerdown", { pointerId: 1, clientX: 480 }));
    handle.dispatchEvent(new window.PointerEvent("pointermove", { pointerId: 1, clientX: 790 }));
    assert.equal(panel.style.width, "240px");
  });
});
