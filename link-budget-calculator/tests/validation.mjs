/**
 * Input validation edge-case tests.
 * Run: node tests/validation.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadScripts() {
  const sandbox = {
    WAVTIUSLinkBudget: {},
    console,
    Math,
    Number,
    RangeError,
    Object,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  for (const file of [
    "js/domain/linkBudget.js",
    "js/application/calculateLinkBudget.js",
  ]) {
    vm.runInNewContext(readFileSync(join(root, file), "utf8"), sandbox, { filename: file });
  }

  return sandbox.WAVTIUSLinkBudget;
}

const { domain, application } = loadScripts();
const { validateField, calculateLinkBudgetUseCase, DEFAULT_INPUTS } = application;
const { calculateFSPL, getLinkRecommendation } = domain;

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(result, label) {
  if (!result.ok) {
    throw new Error(`${label}: expected ok=true, got ${result.message ?? JSON.stringify(result)}`);
  }
}

function assertFail(result, label) {
  if (result.ok) {
    throw new Error(`${label}: expected ok=false`);
  }
}

const validDefaults = Object.fromEntries(
  Object.entries(DEFAULT_INPUTS).map(([k, v]) => [k, String(v)])
);

// --- Empty and invalid characters ---
assertFail(validateField("frequencyGHz", ""), "empty frequency");
assertFail(validateField("frequencyGHz", "   "), "whitespace frequency");
assertFail(validateField("frequencyGHz", "abc"), "alpha frequency");
assertFail(validateField("frequencyGHz", "1.2.3"), "malformed number");
assertFail(validateField("frequencyGHz", "NaN"), "NaN string");
assertFail(validateField("frequencyGHz", "Infinity"), "Infinity string");
assertFail(validateField("frequencyGHz", "-Infinity"), "negative Infinity string");

// --- Zero and negative ---
assertFail(validateField("frequencyGHz", "0"), "zero frequency");
assertFail(validateField("frequencyGHz", "-5"), "negative frequency");
assertFail(validateField("distanceKm", "0"), "zero distance");
assertFail(validateField("distanceKm", "-1"), "negative distance");
assertFail(validateField("systemLossesDb", "-0.1"), "negative system losses");

// --- Valid edge decimals ---
assertOk(validateField("frequencyGHz", "0.001"), "small valid frequency");
assertOk(validateField("distanceKm", "0.001"), "small valid distance");
assertOk(validateField("transmitPowerDbm", "-10.5"), "negative dBm power");
assertOk(validateField("receiverSensitivityDbm", "-120"), "lower sensitivity bound");

// --- Absolute limits ---
assertFail(validateField("frequencyGHz", "2000000"), "frequency above absolute max");
assertFail(validateField("distanceKm", "2000000"), "distance above absolute max");
assertFail(validateField("systemLossesDb", "250"), "losses above absolute max");

// --- Use-case integration ---
const emptyForm = calculateLinkBudgetUseCase({});
assertEqual(emptyForm.ok, false, "empty form rejected");

const partialForm = calculateLinkBudgetUseCase({ ...validDefaults, frequencyGHz: "" });
assertEqual(partialForm.ok, false, "partial form rejected");
assertEqual(typeof partialForm.fieldErrors.frequencyGHz, "string", "partial form field error");

const hugeValid = calculateLinkBudgetUseCase({
  ...validDefaults,
  frequencyGHz: "99999",
  distanceKm: "99999",
});
assertEqual(hugeValid.ok, true, "large but in-limit values accepted");

// --- Domain throws on invalid numeric inputs ---
let threw = false;
try {
  calculateFSPL(0, 10);
} catch {
  threw = true;
}
assertEqual(threw, true, "domain rejects zero frequency");

// --- Recommendation boundaries ---
assertEqual(getLinkRecommendation(25).tier, "good", "margin exactly 25 is good");
assertEqual(getLinkRecommendation(25.01).tier, "excellent", "margin above 25 is excellent");
assertEqual(getLinkRecommendation(15).tier, "good", "margin exactly 15 is good");
assertEqual(getLinkRecommendation(10).tier, "marginal", "margin exactly 10 is marginal");
assertEqual(getLinkRecommendation(0).tier, "critical", "margin exactly 0 is critical");
assertEqual(getLinkRecommendation(-0.01).tier, "fail", "margin below 0 is fail");

const nearField = calculateLinkBudgetUseCase({
  frequencyGHz: "0.001",
  distanceKm: "0.001",
  transmitPowerDbm: "0",
  txAntennaGainDbi: "0",
  rxAntennaGainDbi: "0",
  systemLossesDb: "0",
  receiverSensitivityDbm: "-100",
});
assertEqual(nearField.ok, true, "near-field inputs accepted");
assertEqual(
  nearField.warnings.some((w) => w.includes("FSPL is negative")),
  true,
  "near-field FSPL warning emitted"
);

console.log("All validation edge-case tests passed.");
