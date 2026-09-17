// domMock.js - Headless DOM element & document mocking for UI tests

export function setupMockDOM() {
  const elementsMap = new Map();

  function getOrRegister(id, cls = "", tag = "div") {
    if (!id) return createMockElement("", cls, tag, elementsMap);
    if (!elementsMap.has(id)) {
      elementsMap.set(id, createMockElement(id, cls, tag, elementsMap));
    }
    return elementsMap.get(id);
  }

  function parseAndRegisterElements(html) {
    const idRegex = /id="([^"]+)"/g;
    let match;
    while ((match = idRegex.exec(html)) !== null) {
      getOrRegister(match[1]);
    }
  }

  const doc = {
    createElement: (tag) => createMockElement("", "", tag, elementsMap, parseAndRegisterElements),
    getElementById: (id) => elementsMap.get(id) || null,
    querySelector: (sel) => {
      if (sel.startsWith("#")) return doc.getElementById(sel.slice(1));
      for (const el of elementsMap.values()) {
        if (el.matchesSelector && el.matchesSelector(sel)) return el;
      }
      return null;
    },
    querySelectorAll: (sel) => {
      const results = [];
      for (const el of elementsMap.values()) {
        if (el.matchesSelector && el.matchesSelector(sel)) results.push(el);
      }
      return results;
    },
    body: createMockElement("body", "", "BODY", elementsMap),
  };

  globalThis.document = doc;
  if (!globalThis.window) {
    globalThis.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
    };
  }

  return { doc, elementsMap, getOrRegister };
}

export function createMockElement(id = "", className = "", tagName = "DIV", elementsMap = null, parseHtml = null) {
  const classes = new Set();
  if (className) {
    className.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
  }

  const el = {
    id,
    tagName: tagName.toUpperCase(),
    classes,
    style: {},
    attributes: new Map(),
    dataset: {},
    children: [],
    options: [],
    value: "",
    selectedIndex: 0,
    textContent: "",
    _html: "",
    get innerHTML() { return this._html; },
    set innerHTML(val) {
      this._html = val;
      if (typeof val === "string" && parseHtml) {
        parseHtml(val);
      }
    },
    setAttribute(k, v) { this.attributes.set(k, String(v)); },
    getAttribute(k) { return this.attributes.get(k) || null; },
    removeAttribute(k) { this.attributes.delete(k); },
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      if (this.tagName === "SELECT") {
        this.options.push(child);
      }
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
      child.parentNode = null;
      return child;
    },
    insertBefore(newNode) {
      this.children.push(newNode);
      newNode.parentNode = this;
      return newNode;
    },
    remove() {
      if (elementsMap && id) elementsMap.delete(id);
      if (this.parentNode && this.parentNode.removeChild) {
        this.parentNode.removeChild(this);
      }
    },
    addEventListener(evt, fn) {
      if (!this._listeners) this._listeners = new Map();
      if (!this._listeners.has(evt)) this._listeners.set(evt, []);
      this._listeners.get(evt).push(fn);
    },
    removeEventListener(evt, fn) {
      if (!this._listeners?.has(evt)) return;
      this._listeners.set(evt, this._listeners.get(evt).filter((f) => f !== fn));
    },
    click() {
      if (this.onclick) this.onclick();
      this._listeners?.get("click")?.forEach((fn) => fn({ target: this, preventDefault() {} }));
    },
    dispatchEvent(evt) {
      this._listeners?.get(evt.type)?.forEach((fn) => fn(evt));
    },
    matchesSelector(sel) {
      if (sel.startsWith("#")) return this.id === sel.slice(1);
      if (sel.startsWith(".")) return this.classes.has(sel.slice(1));
      return this.tagName.toLowerCase() === sel.toLowerCase();
    },
    querySelector(sel) {
      if (sel.startsWith(".")) {
        const cName = sel.slice(1);
        return this.children.find((c) => c.classes?.has(cName)) || null;
      }
      return null;
    },
    querySelectorAll() { return []; },
    getBoundingClientRect: () => ({ width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800 }),
    focus: () => {},
  };

  el.classList = {
    add: (...names) => names.forEach((n) => classes.add(n)),
    remove: (...names) => names.forEach((n) => classes.delete(n)),
    toggle: (name, force) => {
      if (force !== undefined) {
        if (force) classes.add(name);
        else classes.delete(name);
        return force;
      }
      if (classes.has(name)) {
        classes.delete(name);
        return false;
      }
      classes.add(name);
      return true;
    },
    contains: (name) => classes.has(name),
  };

  if (elementsMap && id) {
    elementsMap.set(id, el);
  }

  return el;
}
