/**
 * Full calculator smoke test (simulates file:// DOM + classic scripts).
 * Run: node tests/integration-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function makeElement(id, tag = "input") {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    className: "",
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: true,
    disabled: false,
    children: [],
    dataset: {},
    classList: {
      _classes: new Set(),
      add(c) {
        this._classes.add(c);
      },
      remove(c) {
        this._classes.delete(c);
      },
      toggle(c, on) {
        if (on) this._classes.add(c);
        else this._classes.delete(c);
      },
    },
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    querySelector(selector) {
      if (selector.startsWith(".")) {
        const cls = selector.slice(1);
        const stack = [...this.children];
        while (stack.length) {
          const node = stack.shift();
          if (node.className === cls) return node;
          if (node.children?.length) stack.push(...node.children);
        }
      }
      if (selector === "input") {
        return this.children.find((c) => c.tagName === "INPUT") ?? null;
      }
      return null;
    },
  };
  return el;
}

const elements = {
  "input-frequency": makeElement("input-frequency"),
  "input-distance": makeElement("input-distance"),
  "input-tx-power": makeElement("input-tx-power"),
  "input-tx-gain": makeElement("input-tx-gain"),
  "input-rx-gain": makeElement("input-rx-gain"),
  "input-system-losses": makeElement("input-system-losses"),
  "input-sensitivity": makeElement("input-sensitivity"),
  "error-frequency": makeElement("error-frequency", "p"),
  "error-distance": makeElement("error-distance", "p"),
  "error-tx-power": makeElement("error-tx-power", "p"),
  "error-tx-gain": makeElement("error-tx-gain", "p"),
  "error-rx-gain": makeElement("error-rx-gain", "p"),
  "error-system-losses": makeElement("error-system-losses", "p"),
  "error-sensitivity": makeElement("error-sensitivity", "p"),
  "results-container": makeElement("results-container", "div"),
  "out-status": makeElement("out-status", "div"),
  "out-status-icon": makeElement("out-status-icon", "span"),
  "out-status-label": makeElement("out-status-label", "span"),
  "out-recommendation": makeElement("out-recommendation", "div"),
  "out-recommendation-headline": makeElement("out-recommendation-headline", "p"),
  "out-recommendation-detail": makeElement("out-recommendation-detail", "p"),
  "message-warnings": makeElement("message-warnings", "ul"),
  "link-budget-form": makeElement("link-budget-form", "form"),
  "btn-reset": makeElement("btn-reset", "button"),
  "btn-copy": makeElement("btn-copy", "button"),
  "hero-logo-link": makeElement("hero-logo-link", "a"),
};

const fieldInputMap = {
  frequencyGHz: "input-frequency",
  distanceKm: "input-distance",
  transmitPowerDbm: "input-tx-power",
  txAntennaGainDbi: "input-tx-gain",
  rxAntennaGainDbi: "input-rx-gain",
  systemLossesDb: "input-system-losses",
  receiverSensitivityDbm: "input-sensitivity",
};

const fieldWrappers = {};
for (const [key, inputId] of Object.entries(fieldInputMap)) {
  const wrapper = makeElement(`field-${key}`, "div");
  wrapper.dataset.field = key;
  const input = elements[inputId];
  wrapper.querySelector = (sel) => (sel === "input" ? input : null);
  fieldWrappers[key] = wrapper;
}

const sandbox = {
  WAVTIUSLinkBudget: {},
  console,
  Math,
  Number,
  RangeError,
  Object,
  setTimeout,
  clearTimeout,
  document: {
    readyState: "complete",
    body: { appendChild() {}, removeChild() {} },
    createElement(tag) {
      return makeElement(`dynamic-${tag}`, tag);
    },
    getElementById(id) {
      return elements[id] ?? null;
    },
    querySelector(selector) {
      const match = selector.match(/\[data-field="(.+)"\]/);
      if (match) return fieldWrappers[match[1]] ?? null;
      return null;
    },
    addEventListener() {},
  },
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;

for (const file of [
  "js/domain/linkBudget.js",
  "js/application/calculateLinkBudget.js",
  "js/ui/app.js",
]) {
  vm.runInNewContext(readFileSync(join(root, file), "utf8"), sandbox, { filename: file });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`);
  }
}

function findResultNumber(container, index) {
  const card = container.children[index];
  return card?.querySelector(".result-card__number")?.textContent ?? "";
}

assertEqual(elements["input-frequency"].value, "18", "default frequency");
assertEqual(elements["input-distance"].value, "10", "default distance");
assertEqual(findResultNumber(elements["results-container"], 0), "58.00", "initial EIRP");
assertEqual(findResultNumber(elements["results-container"], 1), "137.56", "initial FSPL");
assertEqual(findResultNumber(elements["results-container"], 2), "-44.56", "initial RSL");
assertEqual(elements["out-status-label"].textContent, "PASS (sensitivity)", "initial status");
assertEqual(elements["btn-copy"].disabled, false, "copy enabled after calc");

elements["input-distance"].value = "35";
elements["input-frequency"].value = "23";
elements["input-tx-power"].value = "15";
elements["input-tx-gain"].value = "32";
elements["input-rx-gain"].value = "32";
elements["input-system-losses"].value = "5";
elements["input-sensitivity"].value = "-65";

sandbox.WAVTIUSLinkBudget.ui.recalculate();

assertEqual(findResultNumber(elements["results-container"], 2), "-76.57", "updated RSL");
assertEqual(findResultNumber(elements["results-container"], 3), "-11.57", "updated margin");
assertEqual(elements["out-status-label"].textContent, "FAIL (sensitivity)", "updated status");

console.log("Integration smoke test passed.");
