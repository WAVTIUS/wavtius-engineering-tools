/**
 * WAVTIUS Link Budget Calculator — UI Layer
 */
(function () {
  "use strict";

  const { DEFAULT_INPUTS, RESULT_DEFINITIONS, calculateLinkBudgetUseCase } =
    window.WAVTIUSLinkBudget.application;

  const FIELD_IDS = Object.freeze({
    frequencyGHz: "input-frequency",
    distanceKm: "input-distance",
    transmitPowerDbm: "input-tx-power",
    txAntennaGainDbi: "input-tx-gain",
    rxAntennaGainDbi: "input-rx-gain",
    systemLossesDb: "input-system-losses",
    receiverSensitivityDbm: "input-sensitivity",
  });

  const ERROR_IDS = Object.freeze({
    frequencyGHz: "error-frequency",
    distanceKm: "error-distance",
    transmitPowerDbm: "error-tx-power",
    txAntennaGainDbi: "error-tx-gain",
    rxAntennaGainDbi: "error-rx-gain",
    systemLossesDb: "error-system-losses",
    receiverSensitivityDbm: "error-sensitivity",
  });

  const PRIMARY_RESULT_KEYS = new Set(["receivedPowerDbm", "linkMarginDb"]);
  const INPUT_DEBOUNCE_MS = 120;

  let lastCopyText = "";
  let debounceTimer = null;
  let cardElements = null;
  let fieldElements = null;

  function $(id) {
    return document.getElementById(id);
  }

  function readFormValues() {
    const raw = {};
    for (const [key, id] of Object.entries(FIELD_IDS)) {
      raw[key] = $(id)?.value;
    }
    return raw;
  }

  function applyDefaults() {
    for (const [key, id] of Object.entries(FIELD_IDS)) {
      const el = $(id);
      if (el && DEFAULT_INPUTS[key] !== undefined) {
        el.value = String(DEFAULT_INPUTS[key]);
      }
    }
  }

  function cacheFieldElements() {
    fieldElements = {};
    for (const key of Object.keys(FIELD_IDS)) {
      fieldElements[key] = {
        field: document.querySelector(`[data-field="${key}"]`),
        error: $(ERROR_IDS[key]),
        input: $(FIELD_IDS[key]),
      };
    }
  }

  function renderFieldErrors(fieldErrors) {
    if (!fieldElements) return;

    for (const [key, refs] of Object.entries(fieldElements)) {
      const message = fieldErrors?.[key];
      const { field, error, input } = refs;
      if (!field || !error) continue;

      if (message) {
        error.textContent = message;
        error.hidden = false;
        field.classList.add("field--invalid");
        input?.setAttribute("aria-invalid", "true");
      } else {
        error.textContent = "";
        error.hidden = true;
        field.classList.remove("field--invalid");
        input?.removeAttribute("aria-invalid");
      }
    }
  }

  function showWarnings(warnings) {
    const warnBox = $("message-warnings");
    if (!warnBox) return;

    warnBox.replaceChildren();
    if (warnings?.length) {
      warnBox.hidden = false;
      for (const warning of warnings) {
        const li = document.createElement("li");
        li.textContent = warning;
        warnBox.appendChild(li);
      }
    } else {
      warnBox.hidden = true;
    }
  }

  function buildResultCardElement(def, index) {
    const article = document.createElement("article");
    article.className = `result-card${PRIMARY_RESULT_KEYS.has(def.key) ? " result-card--primary" : ""}`;
    article.dataset.resultKey = def.key;
    if (index === 0) article.classList.add("result-card--initial");

    const header = document.createElement("header");
    header.className = "result-card__header";

    const name = document.createElement("h3");
    name.className = "result-card__name";
    name.textContent = def.name;

    const abbr = document.createElement("span");
    abbr.className = "result-card__abbr";
    abbr.textContent = def.abbr;

    header.appendChild(name);
    header.appendChild(abbr);

    const valueRow = document.createElement("div");
    valueRow.className = "result-card__value";

    const number = document.createElement("span");
    number.className = "result-card__number";
    number.textContent = "—";

    const unit = document.createElement("span");
    unit.className = "result-card__unit";
    unit.textContent = def.unit;

    valueRow.appendChild(number);
    valueRow.appendChild(unit);

    const explanation = document.createElement("p");
    explanation.className = "result-card__explanation";
    explanation.textContent = def.explanation;

    article.appendChild(header);
    article.appendChild(valueRow);
    article.appendChild(explanation);
    return { article, number };
  }

  function initResultCards() {
    const container = $("results-container");
    if (!container) return;

    container.replaceChildren();
    cardElements = {};

    RESULT_DEFINITIONS.forEach((def, index) => {
      const { article, number } = buildResultCardElement(def, index);
      container.appendChild(article);
      cardElements[def.key] = { article, number };
    });
  }

  function updateResultCards(cards) {
    if (!cardElements) return;

    for (const card of cards) {
      const refs = cardElements[card.key];
      if (refs) {
        refs.number.textContent = card.display;
      }
    }
  }

  function clearResults() {
    if (cardElements) {
      for (const refs of Object.values(cardElements)) {
        refs.number.textContent = "—";
      }
    }

    const statusEl = $("out-status");
    const recEl = $("out-recommendation");
    const copyBtn = $("btn-copy");

    if (statusEl) statusEl.hidden = true;
    if (recEl) recEl.hidden = true;
    if (copyBtn) copyBtn.disabled = true;

    lastCopyText = "";
  }

  function renderVerdict(results) {
    const statusEl = $("out-status");
    const iconEl = $("out-status-icon");
    const labelEl = $("out-status-label");
    const recEl = $("out-recommendation");
    const headlineEl = $("out-recommendation-headline");
    const detailEl = $("out-recommendation-detail");
    const copyBtn = $("btn-copy");

    if (!statusEl || !iconEl || !labelEl || !recEl) return;

    const pass = results.pass;
    statusEl.hidden = false;
    statusEl.classList.toggle("verdict__status--pass", pass);
    statusEl.classList.toggle("verdict__status--fail", !pass);
    iconEl.textContent = pass ? "✓" : "✗";
    labelEl.textContent = results.statusLabel;
    statusEl.setAttribute(
      "aria-label",
      pass
        ? "Receiver sensitivity pass — free-space model only"
        : "Receiver sensitivity fail — free-space model only"
    );

    recEl.hidden = false;
    recEl.className = `verdict__recommendation verdict__recommendation--${results.recommendation.tier}`;
    headlineEl.textContent = results.recommendation.headline;
    detailEl.textContent = results.recommendation.detail;

    lastCopyText = results.copyText;
    if (copyBtn) copyBtn.disabled = false;
  }

  function renderResults(results) {
    updateResultCards(results.cards);
    renderVerdict(results);
  }

  function recalculate() {
    const outcome = calculateLinkBudgetUseCase(readFormValues());

    renderFieldErrors(outcome.fieldErrors ?? {});

    if (!outcome.ok) {
      clearResults();
      showWarnings([]);
      return;
    }

    showWarnings(outcome.warnings);
    renderResults(outcome.results);
  }

  function scheduleRecalculate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recalculate, INPUT_DEBOUNCE_MS);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }

  async function copyResults() {
    if (!lastCopyText) return;

    const copyBtn = $("btn-copy");
    const originalHtml = copyBtn?.innerHTML;

    try {
      await copyToClipboard(lastCopyText);
      if (copyBtn) {
        copyBtn.classList.add("btn--copied");
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.classList.remove("btn--copied");
          if (originalHtml) copyBtn.innerHTML = originalHtml;
        }, 2000);
      }
    } catch {
      if (copyBtn) {
        copyBtn.textContent = "Copy failed";
        setTimeout(() => {
          if (originalHtml) copyBtn.innerHTML = originalHtml;
        }, 2000);
      }
    }
  }

  function bindEvents() {
    const form = $("link-budget-form");
    if (!form) {
      console.error("WAVTIUS Link Budget: form #link-budget-form not found.");
      return;
    }

    form.addEventListener("input", scheduleRecalculate);
    form.addEventListener("change", recalculate);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      recalculate();
    });

    $("btn-reset")?.addEventListener("click", () => {
      applyDefaults();
      recalculate();
    });

    $("btn-copy")?.addEventListener("click", copyResults);

    $("hero-logo-link")?.addEventListener("click", (event) => {
      event.preventDefault();
    });
  }

  function init() {
    if (!window.WAVTIUSLinkBudget?.application || !window.WAVTIUSLinkBudget?.domain) {
      console.error(
        "WAVTIUS Link Budget: required scripts did not load. " +
          "Ensure linkBudget.js and calculateLinkBudget.js are included before app.js."
      );
      return;
    }

    cacheFieldElements();
    initResultCards();
    applyDefaults();
    bindEvents();
    recalculate();
  }

  window.WAVTIUSLinkBudget.ui = { recalculate, copyResults };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
