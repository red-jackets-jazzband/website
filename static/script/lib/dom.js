// A tiny DOM toolkit for the songs-page orchestration modules: enough to stop
// every builder from hand-rolling `document.createElement` + a dozen property
// assignments, and every wiring site from repeating the `getElementById` +
// null-check dance. No framework, no vdom — thin sugar over the platform.

export const byId = (id) => document.getElementById(id);

export const qs = (selector, root = document) => root.querySelector(selector);

export const qsa = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

// Empty a node; returns it for chaining. No-op on null.
export function clear(node) {
  if (node) node.replaceChildren();
  return node;
}

// Toggle [hidden]; returns the node. No-op on null.
export function setHidden(node, hidden) {
  if (node) node.hidden = Boolean(hidden);
  return node;
}

/*
  Guarded event binding. `target` is an element id or an element; returns the
  element (so callers can chain / detect a missing node), or null when the id
  resolved to nothing.
*/
export function on(target, event, handler, options) {
  const node = typeof target === "string" ? byId(target) : target;
  if (!node) return null;
  node.addEventListener(event, handler, options);
  return node;
}

function appendChildren(node, children) {
  if (children == null) return;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
}

/*
  Element factory. `props` keys:
    class / className   -> element.className
    text / textContent  -> element.textContent
    html / innerHTML    -> element.innerHTML (trusted markup only)
    dataset             -> Object.assign(element.dataset, value)
    style               -> Object.assign(element.style, value)
    attrs               -> setAttribute for each entry (nullish skipped)
    on                  -> addEventListener for each { event: handler } entry
    anything else       -> assigned as a direct property (id, type, href, ...)
  `children` is a node, a string, or an array of them; nullish / false skipped.
*/
export function el(tag, props = {}, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === "class" || key === "className") {
      node.className = value;
    } else if (key === "text" || key === "textContent") {
      node.textContent = value;
    } else if (key === "html" || key === "innerHTML") {
      node.innerHTML = value;
    } else if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else if (key === "style") {
      Object.assign(node.style, value);
    } else if (key === "attrs") {
      for (const [name, val] of Object.entries(value)) {
        if (val != null) node.setAttribute(name, val);
      }
    } else if (key === "on") {
      for (const [event, handler] of Object.entries(value)) {
        node.addEventListener(event, handler);
      }
    } else {
      node[key] = value;
    }
  }
  appendChildren(node, children);
  return node;
}

// Append nodes (nullish skipped) to an element or element id; returns the parent.
export function mount(parent, ...nodes) {
  const target = typeof parent === "string" ? byId(parent) : parent;
  if (target) {
    for (const node of nodes) {
      if (node != null) target.append(node);
    }
  }
  return target;
}
