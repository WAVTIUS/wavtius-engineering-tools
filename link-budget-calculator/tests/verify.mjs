/**
 * Golden-value checks for the RF domain and application layers.
 * Run: node tests/verify.mjs
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
const {
  calculateEIRP,
  calculateFSPL,
  calculateReceivedPower,
  calculateLinkMargin,
  evaluateLinkStatus,
  getLinkRecommendation,
  computeLinkBudget,
} = domain;
const { calculateLinkBudgetUseCase, DEFAULT_INPUTS } = application;

function assertClose(actual, expected, tol, label) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label}: expected ≈ ${expected}, got ${actual}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

// --- Domain: Example A (defaults) ---
const eirpA = calculateEIRP(20, 38);
assertClose(eirpA, 58, 0.01, "calculateEIRP Example A");

const fsplA = calculateFSPL(18, 10);
assertClose(fsplA, 137.56, 0.02, "calculateFSPL Example A");

const rxA = calculateReceivedPower(20, 38, 38, fsplA, 3);
assertClose(rxA, -44.56, 0.02, "calculateReceivedPower Example A");

const marginA = calculateLinkMargin(rxA, -70);
assertClose(marginA, 25.44, 0.02, "calculateLinkMargin Example A");
assertEqual(evaluateLinkStatus(marginA).pass, true, "evaluateLinkStatus pass A");
assertEqual(evaluateLinkStatus(marginA).label, "PASS (sensitivity)", "evaluateLinkStatus label A");
assertEqual(getLinkRecommendation(marginA).tier, "excellent", "getLinkRecommendation tier A");

// --- Domain: Example B (not feasible) ---
const fullB = computeLinkBudget({
  frequencyGHz: 23,
  distanceKm: 35,
  transmitPowerDbm: 15,
  txAntennaGainDbi: 32,
  rxAntennaGainDbi: 32,
  systemLossesDb: 5,
  receiverSensitivityDbm: -65,
});
assertClose(fullB.eirpDbm, 47, 0.01, "computeLinkBudget EIRP Example B");
assertClose(fullB.fsplDb, 150.57, 0.05, "computeLinkBudget FSPL Example B");
assertClose(fullB.receivedPowerDbm, -76.57, 0.05, "computeLinkBudget P_RX Example B");
assertClose(fullB.linkMarginDb, -11.57, 0.05, "computeLinkBudget margin Example B");
assertEqual(fullB.status.pass, false, "computeLinkBudget status Example B");
assertEqual(fullB.status.label, "FAIL (sensitivity)", "computeLinkBudget label Example B");
assertEqual(fullB.recommendation.tier, "fail", "computeLinkBudget recommendation Example B");

// --- Recommendation tiers ---
assertEqual(getLinkRecommendation(20).tier, "good", "recommendation good tier");
assertEqual(getLinkRecommendation(12).tier, "marginal", "recommendation marginal tier");
assertEqual(getLinkRecommendation(5).tier, "critical", "recommendation critical tier");

// --- Application use-case ---
const useCaseA = calculateLinkBudgetUseCase(
  Object.fromEntries(Object.entries(DEFAULT_INPUTS).map(([k, v]) => [k, String(v)]))
);
assertEqual(useCaseA.ok, true, "calculateLinkBudgetUseCase ok");
assertEqual(useCaseA.results.display.eirpDbm, "58.00", "use-case EIRP display");
assertEqual(useCaseA.results.display.fsplDb, "137.56", "use-case FSPL display");
assertEqual(useCaseA.results.display.receivedPowerDbm, "-44.56", "use-case RX display");
assertEqual(useCaseA.results.display.linkMarginDb, "25.44", "use-case margin display");
assertEqual(useCaseA.results.pass, true, "use-case pass");
assertEqual(useCaseA.results.statusLabel, "PASS (sensitivity)", "use-case status label");
assertEqual(useCaseA.results.cards.length, 4, "use-case result cards");
assertEqual(useCaseA.results.recommendation.tier, "excellent", "use-case recommendation");

// --- Validation errors ---
const invalid = calculateLinkBudgetUseCase({ frequencyGHz: "", distanceKm: "10" });
assertEqual(invalid.ok, false, "validation rejects invalid input");
assertEqual(typeof invalid.fieldErrors.frequencyGHz, "string", "field-level error present");

console.log("All RF verification checks passed.");
