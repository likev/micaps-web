// toastBridge.test.js - Legacy showErrorToast routes through the Svelte store
// when bridged, and falls back to direct DOM otherwise (no duplicate nodes)
import { describe, test, expect, afterEach } from "bun:test";
import { showErrorToast, setToastBridge, ensureErrorToast } from "../../src/ui/toast.js";

afterEach(() => {
  setToastBridge(null);
  if (showErrorToast._tid) {
    clearTimeout(showErrorToast._tid);
    showErrorToast._tid = null;
  }
});

describe("toast bridge", () => {
  test("bridged calls route to the store bridge, touching no DOM", () => {
    const seen = [];
    const prevDoc = globalThis.document;
    // Even with a document present, the bridge wins (single renderer)
    globalThis.document = {
      getElementById: () => { throw new Error("must not touch DOM when bridged"); },
    };
    try {
      setToastBridge((msg) => seen.push(msg));
      showErrorToast("boom");
      expect(seen).toEqual(["boom"]);
    } finally {
      if (prevDoc !== undefined) globalThis.document = prevDoc;
      else delete globalThis.document;
    }
  });

  test("unbridged falls back to direct DOM (tests / non-Svelte)", () => {
    const els = new Map();
    const prevDoc = globalThis.document;
    const body = { appendChild(el) { els.set(el.id, el); } };
    const mkClass = () => {
      const s = new Set();
      return { add: (c) => s.add(c), remove: (c) => s.delete(c), has: (c) => s.has(c) };
    };
    globalThis.document = {
      getElementById: (id) => els.get(id) || null,
      createElement: () => ({ id: "", className: "", style: {}, classList: mkClass(), setAttribute() {}, textContent: "" }),
      body,
    };
    try {
      showErrorToast("fallback");
      const el = els.get("error-toast");
      expect(el.textContent).toBe("fallback");
      expect(ensureErrorToast()).toBe(el); // no duplicate node
    } finally {
      if (prevDoc !== undefined) globalThis.document = prevDoc;
      else delete globalThis.document;
    }
  });
});
