(function runPopup() {
  "use strict";

  const core = globalThis.VoiceTranscriberCore;
  const elements = {};
  const saveTimers = new Map();
  const keyValues = {};
  const connectionStates = {};
  const providerInfo = Object.freeze({
    gemini: { label: "Gemini", key: "geminiApiKey", tier: "Free tier", capability: "All modes", guide: ["Open Google AI Studio.", "Select Create API key.", "Copy the key and paste it above."], guideLabel: "Open Google AI Studio", guideUrl: "https://aistudio.google.com/apikey" },
    groq: { label: "Groq", key: "groqApiKey", tier: "Free tier", capability: "All modes", guide: ["Open Groq Console.", "Create an API key.", "Copy the key and paste it above."], guideLabel: "Open Groq Console", guideUrl: "https://console.groq.com/keys" },
    huggingface: { label: "Hugging Face", key: "huggingfaceApiKey", tier: "Free credits", capability: "Verbatim only", guide: ["Open Hugging Face access tokens.", "Create a fine-grained token with Inference Providers permission.", "Copy the token and paste it above."], guideLabel: "Open Hugging Face", guideUrl: "https://huggingface.co/settings/tokens" },
    openai: { label: "OpenAI", key: "openaiApiKey", tier: "Pay as you go", capability: "Verbatim only", guide: ["Open the OpenAI Platform.", "Add billing credits if required.", "Create a secret key and paste it above."], guideLabel: "Open OpenAI Platform", guideUrl: "https://platform.openai.com/api-keys" },
    xai: { label: "xAI", key: "xaiApiKey", tier: "Pay as you go", capability: "Verbatim only", guide: ["Open the xAI Console.", "Create an API key with API access.", "Copy the key and paste it above."], guideLabel: "Open xAI Console", guideUrl: "https://console.x.ai/" },
    elevenlabs: { label: "ElevenLabs", key: "elevenLabsApiKey", tier: "Free credits", capability: "Verbatim only", guide: ["Open ElevenLabs API Keys.", "Create or copy an API key.", "Paste the key above."], guideLabel: "Open ElevenLabs", guideUrl: "https://elevenlabs.io/app/settings/api-keys" },
    openrouter: { label: "OpenRouter", key: "openrouterApiKey", tier: "Pay as you go", capability: "Verbatim only", guide: ["Open OpenRouter Keys.", "Create an API key and add credits.", "Copy the key and paste it above."], guideLabel: "Open OpenRouter", guideUrl: "https://openrouter.ai/settings/keys" }
  });
  let primaryProvider = "gemini";
  let fallbackProviders = [];
  let providerModels = {};
  let clearConfirmationTimer;
  let currentTourSlide = 0;

  document.addEventListener("DOMContentLoaded", initialize);

  function initialize() {
    for (const id of ["primaryProvider", "providerTierBadge", "providerApiKey", "providerKeyLabel", "providerCapability", "toggleVisibilityBtn", "toggleGuideBtn", "guideAccordion", "guideSteps", "guideLink", "apiStatusPill", "testApiKeyBtn", "advancedSettingsToggle", "advancedSettingsContent", "fallbackEnabled", "fallbackContent", "routingList", "fallbackProviderSelect", "addFallbackBtn", "autoCopyClipboard", "customPrompt", "resetPromptBtn", "versionTag", "releaseNotesBtn", "releaseNotesModal", "releaseNotesCloseBtn", "releaseNotesVersion", "startTourBtn", "tourModal", "tourCloseBtn", "tourPrevBtn", "tourNextBtn", "clearDataBtn"]) {
      elements[id] = document.getElementById(id);
    }
    const installedVersion = chrome.runtime.getManifest().version;
    elements.versionTag.textContent = `v${installedVersion}`;
    elements.releaseNotesVersion.textContent = `v${installedVersion}`;
    bindEvents();
    restoreSettings();
  }

  function storageDefaults() {
    const defaults = { primaryProvider: "", fallbackEnabled: false, fallbackProviders: [], providerModels: {}, providerMode: "gemini", transcribeMode: "verbatim", autoCopyClipboard: true, customPrompt: "", hasSeenTour: false };
    for (const info of Object.values(providerInfo)) defaults[info.key] = "";
    return defaults;
  }

  function restoreSettings() {
    chrome.storage.local.get(storageDefaults(), (settings) => {
      for (const [provider, info] of Object.entries(providerInfo)) {
        keyValues[provider] = String(settings[info.key] || "");
        connectionStates[provider] = { type: "info", message: keyValues[provider] ? "Saved locally — not tested" : "Not configured" };
      }
      primaryProvider = settings.primaryProvider ? core.normalizeProvider(settings.primaryProvider) : core.resolveProviderOrder(settings)[0] || "gemini";
      fallbackProviders = settings.primaryProvider ? sanitizeFallbacks(settings.fallbackProviders) : core.resolveProviderOrder(settings).slice(1);
      providerModels = normalizeProviderModels(settings.providerModels, settings.preferredModel);
      elements.primaryProvider.value = primaryProvider;
      elements.fallbackEnabled.checked = Boolean(settings.primaryProvider ? settings.fallbackEnabled : fallbackProviders.length);
      elements.autoCopyClipboard.checked = settings.autoCopyClipboard;
      elements.customPrompt.value = settings.customPrompt;
      setFallbackMode(elements.fallbackEnabled.checked);
      setActiveMode(settings.transcribeMode);
      renderProvider();
      renderRouting();
      save({ primaryProvider, fallbackEnabled: elements.fallbackEnabled.checked, fallbackProviders, providerModels });
      if (!settings.hasSeenTour) openTour();
    });
  }

  function normalizeProviderModels(saved, oldPreferredModel) {
    const result = {};
    for (const provider of core.PROVIDERS) result[provider] = core.buildProviderModelOrder(provider, saved?.[provider]);
    if (!saved?.gemini && oldPreferredModel && oldPreferredModel !== "auto" && core.MODEL_CASCADE.includes(oldPreferredModel)) result.gemini = core.buildModelOrder(oldPreferredModel);
    return result;
  }

  function sanitizeFallbacks(values) {
    return Array.isArray(values) ? values.filter((provider, index) => core.PROVIDERS.includes(provider) && provider !== primaryProvider && values.indexOf(provider) === index) : [];
  }

  function bindEvents() {
    document.querySelectorAll(".mode-card").forEach((card) => card.addEventListener("click", () => {
      if (card.classList.contains("unsupported")) return;
      setActiveMode(card.dataset.mode);
      save({ transcribeMode: card.dataset.mode });
    }));
    elements.primaryProvider.addEventListener("change", () => {
      primaryProvider = core.normalizeProvider(elements.primaryProvider.value);
      fallbackProviders = sanitizeFallbacks(fallbackProviders);
      renderProvider();
      renderRouting();
      save({ primaryProvider, fallbackProviders });
    });
    elements.providerApiKey.addEventListener("input", () => {
      const provider = primaryProvider;
      const value = elements.providerApiKey.value.trim();
      keyValues[provider] = value;
      connectionStates[provider] = { type: "info", message: "Saving locally…" };
      renderStatus();
      save({ [providerInfo[provider].key]: value }, () => {
        connectionStates[provider] = { type: "info", message: value ? "Saved locally — not tested" : "Not configured" };
        if (provider === primaryProvider) renderStatus();
        renderRouting();
      });
    });
    elements.testApiKeyBtn.addEventListener("click", testApiKey);
    elements.toggleVisibilityBtn.addEventListener("click", toggleKeyVisibility);
    elements.toggleGuideBtn.addEventListener("click", toggleGuide);
    elements.advancedSettingsToggle.addEventListener("click", toggleAdvancedSettings);
    elements.fallbackEnabled.addEventListener("change", () => {
      setFallbackMode(elements.fallbackEnabled.checked);
      save({ fallbackEnabled: elements.fallbackEnabled.checked });
    });
    elements.addFallbackBtn.addEventListener("click", addFallback);
    elements.routingList.addEventListener("click", handleRoutingClick);
    elements.routingList.addEventListener("change", handleModelChange);
    elements.routingList.addEventListener("input", handleFallbackKeyInput);
    elements.autoCopyClipboard.addEventListener("change", () => save({ autoCopyClipboard: elements.autoCopyClipboard.checked }));
    elements.customPrompt.addEventListener("input", () => debounceSave("customPrompt", elements.customPrompt.value.trim()));
    elements.resetPromptBtn.addEventListener("click", () => { elements.customPrompt.value = ""; save({ customPrompt: "" }); });
    elements.releaseNotesBtn.addEventListener("click", openReleaseNotes);
    elements.releaseNotesCloseBtn.addEventListener("click", closeReleaseNotes);
    elements.startTourBtn.addEventListener("click", openTour);
    elements.clearDataBtn.addEventListener("click", clearSavedData);
    elements.tourCloseBtn.addEventListener("click", closeTour);
    elements.tourPrevBtn.addEventListener("click", () => showTourSlide(currentTourSlide - 1));
    elements.tourNextBtn.addEventListener("click", () => currentTourSlide === document.querySelectorAll(".tour-slide").length - 1 ? closeTour() : showTourSlide(currentTourSlide + 1));
    document.querySelectorAll(".tour-dot").forEach((dot) => dot.addEventListener("click", () => showTourSlide(Number(dot.dataset.dot))));
    document.addEventListener("keydown", handleModalKeydown);
  }

  function renderProvider() {
    const info = providerInfo[primaryProvider];
    elements.providerTierBadge.textContent = info.tier;
    elements.providerTierBadge.classList.toggle("paid", info.tier === "Pay as you go");
    elements.providerKeyLabel.textContent = `${info.label} API key`;
    elements.providerCapability.textContent = info.capability;
    elements.providerApiKey.value = keyValues[primaryProvider] || "";
    elements.providerApiKey.type = "password";
    elements.providerApiKey.placeholder = `Paste ${info.label} key…`;
    elements.toggleVisibilityBtn.textContent = "👁️";
    elements.toggleVisibilityBtn.setAttribute("aria-label", `Show ${info.label} API key`);
    elements.testApiKeyBtn.textContent = `Test ${info.label}`;
    elements.toggleGuideBtn.firstChild.textContent = `How to get a ${info.label} API key `;
    elements.guideSteps.replaceChildren(...info.guide.map((step) => { const item = document.createElement("li"); item.textContent = step; return item; }));
    elements.guideLink.href = info.guideUrl;
    elements.guideLink.textContent = `${info.guideLabel} ↗`;
    renderStatus();
    updateModeAvailability();
  }

  function renderStatus() {
    const state = connectionStates[primaryProvider] || { type: "info", message: "Not configured" };
    elements.apiStatusPill.hidden = state.type === "info";
    elements.apiStatusPill.className = `status-pill ${state.type}`;
    elements.apiStatusPill.querySelector(".pill-icon").textContent = { valid: "✅", invalid: "❌", checking: "⏳", info: "ℹ️" }[state.type] || "ℹ️";
    elements.apiStatusPill.querySelector(".pill-text").textContent = state.message;
  }

  function renderRouting() {
    const order = [primaryProvider, ...fallbackProviders];
    elements.routingList.replaceChildren(...order.map((provider, index) => createProviderCard(provider, index)));
    const available = core.PROVIDERS.filter((provider) => !order.includes(provider));
    elements.fallbackProviderSelect.replaceChildren(...available.map((provider) => new Option(`${providerInfo[provider].label} — ${providerInfo[provider].tier}`, provider)));
    elements.addFallbackBtn.disabled = available.length === 0;
    updateModeAvailability();
  }

  function updateModeAvailability() {
    const supportsProcessed = [primaryProvider, ...(elements.fallbackEnabled?.checked ? fallbackProviders : [])].some((provider) => ["gemini", "groq"].includes(provider));
    document.querySelectorAll('.mode-card[data-mode="clean"], .mode-card[data-mode="summary"]').forEach((card) => {
      card.classList.toggle("unsupported", !supportsProcessed);
      card.title = supportsProcessed ? "" : "Add Gemini or Groq to use processed transcription modes";
      card.querySelector("input").disabled = !supportsProcessed;
    });
    if (!supportsProcessed && !document.querySelector('.mode-card[data-mode="verbatim"]').classList.contains("active")) {
      setActiveMode("verbatim");
      save({ transcribeMode: "verbatim" });
    }
  }

  function createProviderCard(provider, index) {
    const info = providerInfo[provider];
    const card = document.createElement("article");
    const enabledModels = providerModels[provider] || [...core.PROVIDER_MODELS[provider]];
    const models = [...enabledModels, ...core.PROVIDER_MODELS[provider].filter((model) => !enabledModels.includes(model))];
    card.className = "route-card";
    card.dataset.provider = provider;

    const head = document.createElement("div");
    head.className = "route-card-head";
    const number = document.createElement("span");
    number.className = "route-number";
    number.textContent = String(index + 1);
    const name = document.createElement("div");
    name.className = "route-name";
    const label = document.createElement("strong");
    label.textContent = info.label;
    const capability = document.createElement("span");
    capability.textContent = `${info.tier} · ${info.capability}`;
    name.append(label, capability);
    const state = document.createElement("span");
    state.className = "route-state";
    state.classList.toggle("configured", Boolean(keyValues[provider]));
    state.textContent = keyValues[provider] ? "● Configured" : "○ No key";
    head.append(number, name, state);

    const actions = document.createElement("div");
    actions.className = "route-actions";
    if (index === 0) {
      const primary = document.createElement("span");
      primary.textContent = "Primary provider";
      actions.append(primary);
    } else {
      for (const [action, text, direction] of [["up", "↑", "up"], ["down", "↓", "down"], ["remove", "Remove", ""]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = action;
        button.textContent = text;
        if (direction) button.setAttribute("aria-label", `Move ${info.label} ${direction}`);
        actions.append(button);
      }
    }

    const details = document.createElement("details");
    details.className = "model-details";
    const summary = document.createElement("summary");
    summary.textContent = `Model fallback (${enabledModels.length} enabled)`;
    const modelList = document.createElement("div");
    modelList.className = "model-list";
    for (const [modelIndex, model] of models.entries()) {
      const checked = enabledModels.includes(model);
      const row = document.createElement("div");
      row.className = "model-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      input.dataset.model = model;
      input.setAttribute("aria-label", `Enable ${model}`);
      const code = document.createElement("code");
      code.textContent = model;
      row.append(input, code);
      for (const [action, text, direction, disabled] of [
        ["model-up", "↑", "up", !checked || modelIndex === 0],
        ["model-down", "↓", "down", !checked || modelIndex >= enabledModels.length - 1]
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = action;
        button.dataset.model = model;
        button.setAttribute("aria-label", `Move ${model} ${direction}`);
        button.disabled = disabled;
        button.textContent = text;
        row.append(button);
      }
      modelList.append(row);
    }
    details.append(summary, modelList);
    card.append(head, actions, details);
    if (index > 0) card.append(createFallbackKeyEditor(provider));
    return card;
  }

  function createFallbackKeyEditor(provider) {
    const info = providerInfo[provider];
    const details = document.createElement("details");
    details.className = "fallback-key-details";
    const summary = document.createElement("summary");
    summary.textContent = `Configure ${info.label} key`;
    const row = document.createElement("div");
    row.className = "fallback-key-row";
    const input = document.createElement("input");
    input.type = "password";
    input.value = keyValues[provider] || "";
    input.placeholder = `Paste ${info.label} key…`;
    input.dataset.providerKey = provider;
    input.setAttribute("aria-label", `${info.label} API key`);
    const testButton = document.createElement("button");
    testButton.type = "button";
    testButton.dataset.action = "test-provider";
    testButton.textContent = "Test";
    row.append(input, testButton);
    const link = document.createElement("a");
    link.href = info.guideUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${info.guideLabel} ↗`;
    details.append(summary, row, link);
    return details;
  }

  function addFallback() {
    const provider = elements.fallbackProviderSelect.value;
    if (!provider || fallbackProviders.includes(provider) || provider === primaryProvider) return;
    fallbackProviders.push(provider);
    renderRouting();
    save({ fallbackProviders });
  }

  function handleRoutingClick(event) {
    const button = event.target.closest("button[data-action]");
    const card = event.target.closest(".route-card");
    if (!button || !card) return;
    const provider = card.dataset.provider;
    const action = button.dataset.action;
    if (action === "test-provider") {
      testFallbackProvider(provider, button);
      return;
    }
    if (action === "remove") fallbackProviders = fallbackProviders.filter((item) => item !== provider);
    if (action === "up" || action === "down") {
      const current = fallbackProviders.indexOf(provider);
      const next = action === "up" ? current - 1 : current + 1;
      if (current >= 0 && next >= 0 && next < fallbackProviders.length) [fallbackProviders[current], fallbackProviders[next]] = [fallbackProviders[next], fallbackProviders[current]];
    }
    if (action === "model-up" || action === "model-down") {
      const models = providerModels[provider];
      const current = models.indexOf(button.dataset.model);
      const next = action === "model-up" ? current - 1 : current + 1;
      if (current >= 0 && next >= 0 && next < models.length) [models[current], models[next]] = [models[next], models[current]];
    }
    renderRouting();
    save({ fallbackProviders, providerModels });
  }

  function handleModelChange(event) {
    if (!event.target.matches("input[data-model]")) return;
    const provider = event.target.closest(".route-card").dataset.provider;
    const checked = [...event.target.closest(".model-list").querySelectorAll("input:checked")].map((input) => input.dataset.model);
    if (!checked.length) { event.target.checked = true; return; }
    providerModels[provider] = checked;
    renderRouting();
    save({ providerModels });
  }

  function handleFallbackKeyInput(event) {
    const provider = event.target.dataset.providerKey;
    if (!provider) return;
    const value = event.target.value.trim();
    keyValues[provider] = value;
    connectionStates[provider] = { type: "info", message: value ? "Saved locally — not tested" : "Not configured" };
    save({ [providerInfo[provider].key]: value });
    const state = event.target.closest(".route-card").querySelector(".route-state");
    state.textContent = value ? "● Configured" : "○ No key";
    state.classList.toggle("configured", Boolean(value));
  }

  async function testFallbackProvider(provider, button) {
    const input = button.closest(".fallback-key-row").querySelector("input");
    const apiKey = input.value.trim();
    if (!apiKey) { button.textContent = "Add key first"; return; }
    button.disabled = true;
    button.textContent = "Testing…";
    try {
      await requestProviderPermission(provider);
      await chrome.storage.local.set({ [providerInfo[provider].key]: apiKey });
      const result = await chrome.runtime.sendMessage({ action: "TEST_API_KEY", provider, apiKey });
      connectionStates[provider] = { type: result?.success ? "valid" : "invalid", message: result?.success ? "Connected" : result?.error || "Connection failed" };
      button.textContent = result?.success ? "Connected ✓" : "Failed";
    } catch (error) {
      connectionStates[provider] = { type: "invalid", message: error.message };
      button.textContent = "Failed";
    } finally {
      button.disabled = false;
    }
  }

  function setFallbackMode(enabled) {
    elements.fallbackContent.classList.toggle("collapsed", !enabled);
    elements.fallbackContent.setAttribute("aria-hidden", String(!enabled));
    elements.fallbackContent.inert = !enabled;
    elements.fallbackEnabled.setAttribute("aria-expanded", String(enabled));
    updateModeAvailability();
  }

  function setActiveMode(mode) {
    const validMode = Object.hasOwn(core.PROMPTS, mode) ? mode : "verbatim";
    document.querySelectorAll(".mode-card").forEach((card) => {
      const active = card.dataset.mode === validMode;
      card.classList.toggle("active", active);
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = active;
    });
  }

  async function testApiKey() {
    const provider = primaryProvider;
    const value = elements.providerApiKey.value.trim();
    if (!value) { connectionStates[provider] = { type: "invalid", message: "Enter an API key first" }; renderStatus(); return; }
    elements.testApiKeyBtn.disabled = true;
    connectionStates[provider] = { type: "checking", message: "Testing connection…" };
    renderStatus();
    try {
      await requestProviderPermission(provider);
      await chrome.storage.local.set({ [providerInfo[provider].key]: value });
      const result = await chrome.runtime.sendMessage({ action: "TEST_API_KEY", provider, apiKey: value });
      connectionStates[provider] = { type: result?.success ? "valid" : "invalid", message: result?.success ? "Connected" : result?.error || "Connection failed" };
    } catch (error) {
      connectionStates[provider] = { type: "invalid", message: error.message };
    } finally {
      elements.testApiKeyBtn.disabled = false;
      renderStatus();
      renderRouting();
    }
  }

  async function requestProviderPermission(provider) {
    const origins = core.PROVIDER_ORIGINS[provider] || [];
    if (!origins.length || !chrome.permissions?.request) return;
    const granted = await chrome.permissions.request({ origins });
    if (!granted) throw new Error(`Allow access to ${providerInfo[provider].label} to test and use this provider.`);
  }

  function toggleKeyVisibility() {
    const showing = elements.providerApiKey.type === "text";
    elements.providerApiKey.type = showing ? "password" : "text";
    elements.toggleVisibilityBtn.textContent = showing ? "👁️" : "🙈";
    elements.toggleVisibilityBtn.setAttribute("aria-label", `${showing ? "Show" : "Hide"} ${providerInfo[primaryProvider].label} API key`);
  }

  function toggleGuide() {
    elements.guideAccordion.classList.toggle("collapsed");
    const expanded = !elements.guideAccordion.classList.contains("collapsed");
    elements.toggleGuideBtn.querySelector("span").textContent = expanded ? "▴" : "▾";
    elements.toggleGuideBtn.setAttribute("aria-expanded", String(expanded));
    elements.guideAccordion.setAttribute("aria-hidden", String(!expanded));
    elements.guideAccordion.inert = !expanded;
  }

  function toggleAdvancedSettings() {
    elements.advancedSettingsContent.classList.toggle("collapsed");
    const expanded = !elements.advancedSettingsContent.classList.contains("collapsed");
    elements.advancedSettingsToggle.setAttribute("aria-expanded", String(expanded));
    elements.advancedSettingsContent.setAttribute("aria-hidden", String(!expanded));
    elements.advancedSettingsContent.toggleAttribute("inert", !expanded);
  }

  async function save(values, callback) {
    try { await chrome.storage.local.set(values); callback?.(); }
    catch {
      connectionStates[primaryProvider] = { type: "invalid", message: "Could not save changes. Try again." };
      renderStatus();
    }
  }

  function debounceSave(key, value, callback) {
    clearTimeout(saveTimers.get(key));
    saveTimers.set(key, setTimeout(() => { saveTimers.delete(key); save({ [key]: value }, callback); }, 350));
  }

  async function clearSavedData() {
    if (elements.clearDataBtn.dataset.confirming !== "true") {
      elements.clearDataBtn.dataset.confirming = "true";
      elements.clearDataBtn.textContent = "Click again to clear all data";
      clearTimeout(clearConfirmationTimer);
      clearConfirmationTimer = setTimeout(resetClearConfirmation, 4000);
      return;
    }
    await chrome.storage.local.clear();
    for (const provider of core.PROVIDERS) {
      keyValues[provider] = "";
      connectionStates[provider] = { type: "info", message: "Not configured" };
      providerModels[provider] = [...core.PROVIDER_MODELS[provider]];
    }
    primaryProvider = "gemini";
    fallbackProviders = [];
    elements.primaryProvider.value = primaryProvider;
    elements.fallbackEnabled.checked = false;
    elements.autoCopyClipboard.checked = true;
    elements.customPrompt.value = "";
    setFallbackMode(false);
    setActiveMode("verbatim");
    renderProvider();
    renderRouting();
    resetClearConfirmation();
  }

  function resetClearConfirmation() {
    clearTimeout(clearConfirmationTimer);
    delete elements.clearDataBtn.dataset.confirming;
    elements.clearDataBtn.textContent = "Clear saved keys and settings";
  }

  function setModalOpen(modal, trigger, open) {
    document.querySelectorAll(".popup-container > *").forEach((element) => {
      element.inert = open && element !== modal;
    });
    modal.hidden = !open;
    if (open) modal.querySelector(".tour-close-btn").focus();
    else trigger.focus();
  }

  function openReleaseNotes() {
    setModalOpen(elements.releaseNotesModal, elements.releaseNotesBtn, true);
  }

  function closeReleaseNotes() {
    setModalOpen(elements.releaseNotesModal, elements.releaseNotesBtn, false);
  }

  function openTour() {
    showTourSlide(0);
    setModalOpen(elements.tourModal, elements.startTourBtn, true);
    save({ hasSeenTour: true });
  }

  function closeTour() {
    setModalOpen(elements.tourModal, elements.startTourBtn, false);
  }

  function handleModalKeydown(event) {
    const modal = [elements.releaseNotesModal, elements.tourModal].find((candidate) => !candidate.hidden);
    if (!modal) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (modal === elements.releaseNotesModal) closeReleaseNotes();
      else closeTour();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll("button:not([disabled]), a[href]")]
      .filter((element) => element.offsetParent !== null || element === document.activeElement);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function showTourSlide(index) {
    const slides = [...document.querySelectorAll(".tour-slide")];
    currentTourSlide = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach((slide, position) => slide.classList.toggle("active", position === currentTourSlide));
    document.querySelectorAll(".tour-dot").forEach((dot, position) => {
      dot.classList.toggle("active", position === currentTourSlide);
      if (position === currentTourSlide) dot.setAttribute("aria-current", "step"); else dot.removeAttribute("aria-current");
    });
    elements.tourPrevBtn.style.display = currentTourSlide === 0 ? "none" : "inline-block";
    elements.tourNextBtn.textContent = currentTourSlide === slides.length - 1 ? "Done" : "Next ➔";
  }
})();
