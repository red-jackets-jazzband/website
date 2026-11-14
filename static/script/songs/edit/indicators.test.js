import { test } from "node:test";
import assert from "node:assert/strict";
import { mountPage } from "../../../../tests/helpers/dom.js";
import { applyPatchIndicators } from "./indicators.js";

const PATCHED_CLASS = "rj-patched-note";

function inDom(fn) {
  const page = mountPage();
  try {
    fn(document.createElement("div"));
  } finally {
    page.cleanup();
  }
}

test("applyPatchIndicators flags exactly the notes/rests at the given flat positions", () => {
  inDom((container) => {
    container.innerHTML = `
      <g class="abcjs-note abcjs-v0"></g>
      <g class="abcjs-note abcjs-v0"></g>
      <g class="abcjs-rest abcjs-v0"></g>`;
    applyPatchIndicators(container, [1, 2]);
    const groups = container.querySelectorAll("g");
    assert.equal(groups[0].classList.contains(PATCHED_CLASS), false);
    assert.equal(groups[1].classList.contains(PATCHED_CLASS), true);
    assert.equal(groups[2].classList.contains(PATCHED_CLASS), true);
  });
});

test("applyPatchIndicators ignores a different voice's note even at the same flat position", () => {
  inDom((container) => {
    container.innerHTML = '<g class="abcjs-note abcjs-v1"></g>';
    applyPatchIndicators(container, [0]);
    assert.equal(container.querySelector("g").classList.contains(PATCHED_CLASS), false);
  });
});

test("applyPatchIndicators is a no-op for a missing container or an empty key list", () => {
  assert.doesNotThrow(() => applyPatchIndicators(null, [0]));
  inDom((container) => {
    container.innerHTML = '<g class="abcjs-note abcjs-v0"></g>';
    applyPatchIndicators(container, []);
    assert.equal(container.querySelector("g").classList.contains(PATCHED_CLASS), false);
  });
});
