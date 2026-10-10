import { mountPage } from "./dom.js";

/*
  A jsdom page whose SVG nodes measure as the test says: any element with a
  data-box="x,y,width,height" attribute reports that from getBBox() (others
  report an empty box), so overlay code that positions things off measured
  text can be driven without a layout engine.

    const { page, svg } = mountSvg(`<g>...</g>`, { viewBox: { x: 0, y: 40, width: 1000, height: 200 } });
    try { ... } finally { page.cleanup(); }

  jsdom has no SVGSVGElement#viewBox either; `viewBox` here defines it the
  way a browser exposes it ({ baseVal }), and setAttribute("viewBox", ...)
  keeps it in step.
*/
function boxOf(element) {
  const data = element.getAttribute("data-box");
  if (data === null) return { x: 0, y: 0, width: 0, height: 0 };
  const [x, y, width, height] = data.split(",").map(Number);
  return { x, y, width, height };
}

export function mountSvg(inner, { viewBox } = {}) {
  const page = mountPage({ html: `<div class="notation"><svg xmlns="http://www.w3.org/2000/svg">${inner}</svg></div>` });
  page.window.Element.prototype.getBBox = function getBBox() {
    return boxOf(this);
  };
  const svg = page.document.querySelector("svg");
  if (viewBox) {
    const base = { ...viewBox };
    Object.defineProperty(svg, "viewBox", { value: { baseVal: base }, configurable: true });
    const set = svg.setAttribute.bind(svg);
    svg.setAttribute = (name, value) => {
      if (name === "viewBox") {
        const [x, y, width, height] = String(value).split(/\s+/).map(Number);
        Object.assign(base, { x, y, width, height });
      }
      set(name, value);
    };
  }
  return { page, svg, notation: page.document.querySelector(".notation") };
}
