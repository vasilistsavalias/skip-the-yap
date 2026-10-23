(function exposeContentCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VoiceTranscriberContentCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createContentCore() {
  "use strict";

  const PLAY_CONTROL_SELECTOR = [
    'button[aria-label*="Play" i]',
    'button[aria-label*="Pause" i]',
    'button[aria-label*="Αναπαραγωγή" i]',
    'button[aria-label*="Παύση" i]',
    '[role="button"][aria-label*="Play" i]',
    '[role="button"][aria-label*="Pause" i]',
    '[role="button"][aria-label*="Αναπαραγωγή" i]',
    '[role="button"][aria-label*="Παύση" i]'
  ].join(",");

  const INSTAGRAM_CONTROL_SELECTOR = 'button, [role="button"]';

  const COMPOSER_SELECTOR = [
    'div[data-lexical-editor="true"][contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'textarea[placeholder*="Message" i]',
    'textarea[placeholder*="Μήνυμα" i]',
    'textarea[aria-label*="Message" i]',
    'textarea[aria-label*="Μήνυμα" i]'
  ].join(",");

  function isPureVoiceDuration(text) {
    const match = String(text || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return false;
    return Number(match[1]) <= 30 && Number(match[2]) < 60;
  }

  function findDuration(element) {
    const matches = [...String(element?.textContent || "").matchAll(/(?:^|[^\d])(\d{1,2}:\d{2})(?!\d)/g)];
    return matches.map((match) => match[1]).find(isPureVoiceDuration) || null;
  }

  function isInstagramDocument(documentObject) {
    return /(^|\.)instagram\.com$/i.test(documentObject?.location?.hostname || "");
  }

  function isVoiceContainer(element) {
    if (!element || element === element.ownerDocument?.body) return false;
    if (element.closest?.('[contenteditable="true"]')) return false;
    if (element.querySelector?.("video")) return false;
    if (element.querySelector?.("audio")) return true;
    const hasLabeledControl = Boolean(element.querySelector?.(PLAY_CONTROL_SELECTOR));
    const hasInstagramControl = isInstagramDocument(element.ownerDocument) &&
      Boolean(element.querySelector?.(INSTAGRAM_CONTROL_SELECTOR));
    if (!findDuration(element) || (!hasLabeledControl && !hasInstagramControl)) return false;

    const rect = element.getBoundingClientRect?.();
    if (rect && rect.width > 0 && (rect.width < 60 || rect.width > 460 || rect.height < 18 || rect.height > 140)) {
      return false;
    }
    return true;
  }

  function findVoiceContainer(control) {
    if (control?.closest?.(".vt-transcribe-trigger")) return null;
    let current = control?.parentElement;
    let outerVisibleContainer = null;
    for (let depth = 0; depth < 12 && current && current !== current.ownerDocument?.body; depth += 1) {
      if (isVoiceContainer(current)) {
        const rect = current.getBoundingClientRect?.();
        if (!rect?.width) return outerVisibleContainer || current;
        outerVisibleContainer = current;
      }
      current = current.parentElement;
    }
    return outerVisibleContainer;
  }

  function findPlayControl(container) {
    const labeledControl = container?.querySelector?.(PLAY_CONTROL_SELECTOR);
    if (labeledControl) return labeledControl;
    if (!isInstagramDocument(container?.ownerDocument)) return null;

    const controls = [...container.querySelectorAll(INSTAGRAM_CONTROL_SELECTOR)]
      .filter((control) => {
        const label = [
          control.getAttribute?.("aria-label"),
          control.getAttribute?.("title"),
          control.textContent
        ].filter(Boolean).join(" ");
        return !/transcript|μεταγραφ|more|options|menu|reply|react|forward|delete|unsend|info|περισσότερ|επιλογ/i.test(label);
      });

    return controls.find((control) => findDuration(control.parentElement)) || controls[0] || null;
  }

  function findVoiceAnchor(container) {
    const playControl = findPlayControl(container);
    if (!playControl) return container;

    let current = playControl.parentElement;
    let fallback = container;
    while (current && current !== container.parentElement) {
      const rect = current.getBoundingClientRect?.();
      if (findDuration(current) && (!rect?.width || (rect.width >= 60 && rect.width <= 460))) {
        fallback = current;
        const background = current.ownerDocument?.defaultView?.getComputedStyle?.(current)?.backgroundColor || "";
        if (background && background !== "transparent" && !/^rgba\([^)]*,\s*0\s*\)$/i.test(background)) {
          return current;
        }
      }
      if (current === container) break;
      current = current.parentElement;
    }
    return fallback;
  }

  function isUsableComposer(element, view) {
    if (!element) return false;
    if (element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
    const label = `${element.getAttribute?.("aria-label") || ""} ${element.getAttribute?.("placeholder") || ""}`;
    if (/search|αναζήτηση/i.test(label)) return false;
    const style = view?.getComputedStyle?.(element);
    return !style || (style.display !== "none" && style.visibility !== "hidden");
  }

  function findComposer(documentObject) {
    const candidates = [...documentObject.querySelectorAll(COMPOSER_SELECTOR)]
      .filter((element) => isUsableComposer(element, documentObject.defaultView));
    if (!candidates.length) return null;

    return candidates
      .map((element, index) => {
        const label = `${element.getAttribute("aria-label") || ""} ${element.getAttribute("placeholder") || ""}`;
        const rect = element.getBoundingClientRect?.() || { bottom: 0 };
        const score = (element.dataset?.lexicalEditor === "true" ? 100 : 0) +
          (element.getAttribute("role") === "textbox" ? 40 : 0) +
          (/message|μήνυμα|aa/i.test(label) ? 30 : 0) + rect.bottom + index;
        return { element, score };
      })
      .sort((a, b) => b.score - a.score)[0].element;
  }

  function composerText(composer) {
    return composer && "value" in composer ? composer.value : composer?.textContent || "";
  }

  function dispatchInput(composer, text) {
    const ViewInputEvent = composer.ownerDocument?.defaultView?.InputEvent || Event;
    composer.dispatchEvent(new ViewInputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text
    }));
  }

  async function insertTranscript(documentObject, text, options = {}) {
    const transcript = String(text || "").trim();
    if (!transcript) return false;
    const composer = findComposer(documentObject);
    if (!composer) return false;

    const wasActive = documentObject.activeElement === composer;
    composer.focus();
    const before = composerText(composer);
    const prefix = before && !/\s$/.test(before) ? " " : "";
    const insertion = `${prefix}${transcript}`;

    if ("value" in composer) {
      const start = wasActive && Number.isInteger(composer.selectionStart) ? composer.selectionStart : composer.value.length;
      const end = wasActive && Number.isInteger(composer.selectionEnd) ? composer.selectionEnd : start;
      composer.setRangeText(insertion, start, end, "end");
      dispatchInput(composer, insertion);
    } else {
      const selection = documentObject.getSelection?.();
      if (selection) {
        const range = documentObject.createRange();
        range.selectNodeContents(composer);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      const execCommand = options.execCommand || documentObject.execCommand?.bind(documentObject);
      if (execCommand) execCommand("insertText", false, insertion);
      if (!composerText(composer).includes(transcript)) {
        composer.append(documentObject.createTextNode(insertion));
        dispatchInput(composer, insertion);
      }
    }

    const waitForPaint = options.waitForPaint || (() => new Promise((resolve) => setTimeout(resolve, 0)));
    await waitForPaint();
    return composerText(composer).includes(transcript);
  }

  return {
    COMPOSER_SELECTOR,
    INSTAGRAM_CONTROL_SELECTOR,
    PLAY_CONTROL_SELECTOR,
    findComposer,
    findDuration,
    findPlayControl,
    findVoiceAnchor,
    findVoiceContainer,
    insertTranscript,
    isInstagramDocument,
    isPureVoiceDuration,
    isVoiceContainer
  };
});
