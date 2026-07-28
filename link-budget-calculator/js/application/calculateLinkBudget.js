/**
 * WAVTIUS Link Budget Calculator — Application Layer
 * Validates inputs, applies engineering guidance, orchestrates domain calculations.
 */
(function (global) {
  "use strict";

  const { computeLinkBudget } = global.WAVTIUSLinkBudget.domain;

  const DEFAULT_INPUTS = Object.freeze({
    frequencyGHz: 18,
    distanceKm: 10,
    transmitPowerDbm: 20,
    txAntennaGainDbi: 38,
    rxAntennaGainDbi: 38,
    systemLossesDb: 3,
    receiverSensitivityDbm: -70,
  });

  /** Typical microwave planning ranges — soft warnings only. */
  const GUIDANCE_RANGES = Object.freeze({
    frequencyGHz: { min: 1, max: 100, unit: "GHz" },
    distanceKm: { min: 0.1, max: 100, unit: "km" },
    transmitPowerDbm: { min: -10, max: 40, unit: "dBm" },
    txAntennaGainDbi: { min: 0, max: 55, unit: "dBi" },
    rxAntennaGainDbi: { min: 0, max: 55, unit: "dBi" },
    systemLossesDb: { min: 0, max: 30, unit: "dB" },
    receiverSensitivityDbm: { min: -120, max: -20, unit: "dBm" },
  });

  /** Hard limits to reject non-physical or numerically unsafe values. */
  const ABSOLUTE_LIMITS = Object.freeze({
    frequencyGHz: { min: 1e-6, max: 1e6, unit: "GHz" },
    distanceKm: { min: 1e-6, max: 1e6, unit: "km" },
    transmitPowerDbm: { min: -200, max: 200, unit: "dBm" },
    txAntennaGainDbi: { min: -10, max: 100, unit: "dBi" },
    rxAntennaGainDbi: { min: -10, max: 100, unit: "dBi" },
    systemLossesDb: { min: 0, max: 200, unit: "dB" },
    receiverSensitivityDbm: { min: -200, max: 100, unit: "dBm" },
  });

  const FIELD_LABELS = Object.freeze({
    frequencyGHz: "Frequency",
    distanceKm: "Distance",
    transmitPowerDbm: "Transmit Power",
    txAntennaGainDbi: "Transmit Antenna Gain",
    rxAntennaGainDbi: "Receive Antenna Gain",
    systemLossesDb: "System Losses",
    receiverSensitivityDbm: "Receiver Sensitivity",
  });

  const FIELD_RULES = Object.freeze({
    frequencyGHz: { requirePositive: true },
    distanceKm: { requirePositive: true },
    transmitPowerDbm: {},
    txAntennaGainDbi: {},
    rxAntennaGainDbi: {},
    systemLossesDb: { requireNonNegative: true },
    receiverSensitivityDbm: {},
  });

  const RESULT_DEFINITIONS = Object.freeze([
    {
      key: "eirpDbm",
      name: "Effective Isotropic Radiated Power",
      abbr: "EIRP",
      unit: "dBm",
      explanation:
        "Equivalent radiated power at the transmit antenna port: P_TX + G_TX.",
    },
    {
      key: "fsplDb",
      name: "Free Space Path Loss",
      abbr: "FSPL",
      unit: "dB",
      explanation:
        "Free-space propagation loss over a line-of-sight path. Valid only in the far field.",
    },
    {
      key: "receivedPowerDbm",
      name: "Received Signal Level",
      abbr: "RSL",
      unit: "dBm",
      explanation:
        "Estimated power at the receiver input after antenna gains, FSPL, and system losses.",
    },
    {
      key: "linkMarginDb",
      name: "Link Margin",
      abbr: "Margin",
      unit: "dB",
      explanation:
        "Headroom above the entered receiver sensitivity. Values ≥ 0 dB exceed sensitivity in this free-space model only — not a deployment readiness assessment.",
    },
  ]);

  const FIELD_KEYS = Object.freeze(Object.keys(FIELD_LABELS));

  function validateField(key, rawValue) {
    const label = FIELD_LABELS[key] ?? key;
    const rules = FIELD_RULES[key] ?? {};
    const limits = ABSOLUTE_LIMITS[key];
    const trimmed = String(rawValue ?? "").trim();

    if (trimmed === "") {
      return { ok: false, message: `${label} is required.` };
    }

    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
      return { ok: false, message: `${label} must be a valid number.` };
    }
    if (rules.requirePositive && value <= 0) {
      return { ok: false, message: `${label} must be greater than zero.` };
    }
    if (rules.requireNonNegative && value < 0) {
      return { ok: false, message: `${label} must be zero or greater.` };
    }
    if (limits && (value < limits.min || value > limits.max)) {
      return {
        ok: false,
        message: `${label} must be between ${limits.min} and ${limits.max} ${limits.unit}.`,
      };
    }

    return { ok: true, value };
  }

  function parseAndValidateInputs(raw) {
    const errors = [];
    const fieldErrors = {};
    const inputs = {};

    for (const key of FIELD_KEYS) {
      const result = validateField(key, raw[key]);
      if (!result.ok) {
        errors.push(result.message);
        fieldErrors[key] = result.message;
        inputs[key] = NaN;
      } else {
        inputs[key] = result.value;
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors, fieldErrors };
    }

    return { ok: true, inputs, fieldErrors: {} };
  }

  function collectEngineeringWarnings(computed) {
    const warnings = [];

    if (computed.fsplDb < 0) {
      warnings.push(
        "FSPL is negative — path length and frequency violate far-field assumptions (near-field conditions). " +
          "Free-space results are not valid for path planning."
      );
    }

    return warnings;
  }

  function collectGuidanceWarnings(inputs) {
    const warnings = [];

    for (const [key, range] of Object.entries(GUIDANCE_RANGES)) {
      const value = inputs[key];
      if (!Number.isFinite(value)) continue;
      if (value < range.min || value > range.max) {
        warnings.push(
          `${FIELD_LABELS[key]} (${formatEngineering(value)} ${range.unit}) is outside the typical range ` +
            `${range.min}–${range.max} ${range.unit}. Calculation still proceeds.`
        );
      }
    }

    return warnings;
  }

  function formatEngineering(value) {
    if (!Number.isFinite(value)) return "—";
    return value.toFixed(2);
  }

  function buildResultCards(computed) {
    const values = {
      eirpDbm: computed.eirpDbm,
      fsplDb: computed.fsplDb,
      receivedPowerDbm: computed.receivedPowerDbm,
      linkMarginDb: computed.linkMarginDb,
    };

    return RESULT_DEFINITIONS.map((def) => ({
      key: def.key,
      name: def.name,
      abbr: def.abbr,
      unit: def.unit,
      explanation: def.explanation,
      value: values[def.key],
      display: formatEngineering(values[def.key]),
    }));
  }

  function formatResultsForCopy(results, inputs) {
    const lines = [
      "WAVTIUS Link Budget Calculator — Results",
      "Free-space model only. See documentation for limitations.",
      "────────────────────────────────────────",
      "",
      "Inputs",
      `  Frequency:            ${formatEngineering(inputs.frequencyGHz)} GHz`,
      `  Distance:             ${formatEngineering(inputs.distanceKm)} km`,
      `  TX Power (Antenna Port): ${formatEngineering(inputs.transmitPowerDbm)} dBm`,
      `  TX Antenna Gain:      ${formatEngineering(inputs.txAntennaGainDbi)} dBi`,
      `  RX Antenna Gain:      ${formatEngineering(inputs.rxAntennaGainDbi)} dBi`,
      `  System Losses:        ${formatEngineering(inputs.systemLossesDb)} dB`,
      `  Receiver Sensitivity: ${formatEngineering(inputs.receiverSensitivityDbm)} dBm`,
      "",
      "Results",
    ];

    for (const card of results.cards) {
      lines.push(
        `  ${card.abbr.padEnd(6)} ${card.display.padStart(8)} ${card.unit}  — ${card.name}`
      );
    }

    lines.push(
      "",
      `Status:          ${results.statusLabel}`,
      `Recommendation:  ${results.recommendation.headline}`,
      `                 ${results.recommendation.detail}`,
      "",
      "Powering Wireless Innovation — WAVTIUS"
    );

    return lines.join("\n");
  }

  function calculateLinkBudgetUseCase(rawInputs) {
    const parsed = parseAndValidateInputs(rawInputs);
    if (!parsed.ok) {
      return { ok: false, errors: parsed.errors, fieldErrors: parsed.fieldErrors };
    }

    let computed;
    try {
      computed = computeLinkBudget(parsed.inputs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Calculation failed.";
      return {
        ok: false,
        errors: [message],
        fieldErrors: {},
      };
    }

    const warnings = [
      ...collectEngineeringWarnings(computed),
      ...collectGuidanceWarnings(parsed.inputs),
    ];
    const cards = buildResultCards(computed);

    const results = {
      eirpDbm: computed.eirpDbm,
      fsplDb: computed.fsplDb,
      receivedPowerDbm: computed.receivedPowerDbm,
      linkMarginDb: computed.linkMarginDb,
      pass: computed.status.pass,
      statusLabel: computed.status.label,
      recommendation: computed.recommendation,
      cards,
      display: {
        eirpDbm: formatEngineering(computed.eirpDbm),
        fsplDb: formatEngineering(computed.fsplDb),
        receivedPowerDbm: formatEngineering(computed.receivedPowerDbm),
        linkMarginDb: formatEngineering(computed.linkMarginDb),
        status: computed.status.label,
      },
      copyText: "",
    };

    results.copyText = formatResultsForCopy(results, parsed.inputs);

    return {
      ok: true,
      warnings,
      inputs: parsed.inputs,
      results,
    };
  }

  global.WAVTIUSLinkBudget.application = {
    DEFAULT_INPUTS,
    GUIDANCE_RANGES,
    ABSOLUTE_LIMITS,
    FIELD_LABELS,
    FIELD_RULES,
    RESULT_DEFINITIONS,
    FIELD_KEYS,
    validateField,
    parseAndValidateInputs,
    collectGuidanceWarnings,
    collectEngineeringWarnings,
    formatEngineering,
    formatResultsForCopy,
    calculateLinkBudgetUseCase,
  };
})(typeof window !== "undefined" ? window : globalThis);
