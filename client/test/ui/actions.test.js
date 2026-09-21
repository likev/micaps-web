// actions.test.js - Unit tests for Svelte actions and helpers
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { isTextInput, keyboardShortcuts } from "../../src/actions/keyboardShortcuts.js";
import { focusRestore } from "../../src/actions/focusRestore.js";

describe("Svelte Actions & Navigation Helpers", () => {
  describe("isTextInput helper", () => {
    test("returns false for falsy or normal non-input elements", () => {
      expect(isTextInput(null)).toBe(false);
      expect(isTextInput(undefined)).toBe(false);
      expect(isTextInput({ tagName: "DIV" })).toBe(false);
      expect(isTextInput({ tagName: "BUTTON" })).toBe(false);
    });

    test("returns true for contenteditable elements", () => {
      expect(isTextInput({ isContentEditable: true, tagName: "DIV" })).toBe(true);
    });

    test("returns true for TEXTAREA and SELECT", () => {
      expect(isTextInput({ tagName: "TEXTAREA" })).toBe(true);
      expect(isTextInput({ tagName: "SELECT" })).toBe(true);
    });

    test("returns true for text inputs and false for checkboxes/buttons", () => {
      expect(isTextInput({ tagName: "INPUT", type: "text" })).toBe(true);
      expect(isTextInput({ tagName: "INPUT", type: "search" })).toBe(true);
      expect(isTextInput({ tagName: "INPUT", type: "number" })).toBe(true);
      expect(isTextInput({ tagName: "INPUT", type: "checkbox" })).toBe(false);
      expect(isTextInput({ tagName: "INPUT", type: "button" })).toBe(false);
      expect(isTextInput({ tagName: "INPUT", type: "submit" })).toBe(false);
    });

    test("returns true if inside config editor container", () => {
      const mockEl = {
        tagName: "SPAN",
        closest: (selector) => selector === ".config-editor-modal" || selector === "#config-editor-panel",
      };
      expect(isTextInput(mockEl)).toBe(true);
    });
  });

  describe("keyboardShortcuts action", () => {
    let mockNode;
    let eventListeners;

    beforeEach(() => {
      eventListeners = new Map();
      mockNode = {
        addEventListener: (event, handler) => {
          eventListeners.set(event, handler);
        },
        removeEventListener: (event) => {
          eventListeners.delete(event);
        },
      };
    });

    test("attaches keydown listener and handles period stepping", async () => {
      let steppedDelta = 0;
      const action = keyboardShortcuts(mockNode, {
        onPeriodStep: (delta) => {
          steppedDelta = delta;
        },
      });

      const keyHandler = eventListeners.get("keydown");
      expect(keyHandler).toBeDefined();

      let defaultPrevented = false;
      await keyHandler({
        key: "ArrowRight",
        target: { tagName: "DIV" },
        preventDefault: () => {
          defaultPrevented = true;
        },
      });
      expect(steppedDelta).toBe(1);
      expect(defaultPrevented).toBe(true);

      defaultPrevented = false;
      await keyHandler({
        key: "ArrowLeft",
        target: { tagName: "DIV" },
        preventDefault: () => {
          defaultPrevented = true;
        },
      });
      expect(steppedDelta).toBe(-1);
      expect(defaultPrevented).toBe(true);

      action.destroy();
      expect(eventListeners.has("keydown")).toBe(false);
    });

    test("handles playback and layout split shortcuts", async () => {
      let playToggled = false;
      let splitToggled = false;
      let escFired = false;

      const action = keyboardShortcuts(mockNode, {
        onTogglePlay: () => {
          playToggled = true;
        },
        onToggleSplit: () => {
          splitToggled = true;
        },
        onEscape: () => {
          escFired = true;
        },
      });

      const keyHandler = eventListeners.get("keydown");

      // Space on div toggles play
      await keyHandler({
        key: " ",
        code: "Space",
        target: { tagName: "DIV" },
        preventDefault: () => {},
      });
      expect(playToggled).toBe(true);

      // Space on button is ignored to allow native button activation
      playToggled = false;
      await keyHandler({
        key: " ",
        code: "Space",
        target: { tagName: "BUTTON" },
        preventDefault: () => {},
      });
      expect(playToggled).toBe(false);

      // F4 or Alt+S toggles split
      await keyHandler({
        key: "F4",
        target: { tagName: "DIV" },
        preventDefault: () => {},
      });
      expect(splitToggled).toBe(true);

      // Escape triggers onEscape
      await keyHandler({
        key: "Escape",
        target: { tagName: "DIV" },
        preventDefault: () => {},
      });
      expect(escFired).toBe(true);

      action.destroy();
    });
  });

  describe("focusRestore action", () => {
    test("restores previous active element on destroy", () => {
      let focused = false;
      const prevElement = {
        focus: () => {
          focused = true;
        },
      };

      const origActive = document.activeElement;
      const origContains = document.body?.contains;
      try {
        Object.defineProperty(document, "activeElement", {
          value: prevElement,
          configurable: true,
        });
        if (document.body) {
          document.body.contains = () => true;
        }

        const mockModal = {
          querySelector: () => null,
        };

        const action = focusRestore(mockModal, { autofocus: false });
        expect(focused).toBe(false);

        action.destroy();
        expect(focused).toBe(true);
      } finally {
        Object.defineProperty(document, "activeElement", {
          value: origActive,
          configurable: true,
        });
        if (document.body && origContains) {
          document.body.contains = origContains;
        }
      }
    });
  });
});
