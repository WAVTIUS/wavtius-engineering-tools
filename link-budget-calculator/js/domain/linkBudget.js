/**
 * WAVTIUS Link Budget Calculator — RF Domain Module
 * Pure engineering functions for microwave free-space link budget analysis.
 *
 * Assumptions:
 * - P_TX is conducted power at the transmit antenna port (after TX feedline losses).
 * - L_sys covers remaining path losses (RX feedline, connectors, radome, etc.).
 * - Free-space propagation only (no terrain, rain, or atmospheric effects).
 */
(function (global) {
  "use strict";

  /** FSPL constant: 20·log10(4π/c) with c in km/s, equivalent SI form. */
  const FSPL_CONSTANT = 92.45;

  /**
   * Effective Isotropic Radiated Power (EIRP).
   * EIRP(dBm) = P_TX + G_TX  (at antenna port)
   */
  function calculateEIRP(transmitPowerDbm, txAntennaGainDbi) {
    if (!Number.isFinite(transmitPowerDbm) || !Number.isFinite(txAntennaGainDbi)) {
      throw new RangeError("Transmit power and TX antenna gain must be finite numbers.");
    }
    return transmitPowerDbm + txAntennaGainDbi;
  }

  /**
   * Free Space Path Loss (FSPL).
   * FSPL(dB) = 92.45 + 20·log₁₀(f_GHz) + 20·log₁₀(d_km)
   */
  function calculateFSPL(frequencyGHz, distanceKm) {
    if (!Number.isFinite(frequencyGHz) || frequencyGHz <= 0) {
      throw new RangeError("Frequency must be a finite number greater than 0 GHz.");
    }
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      throw new RangeError("Distance must be a finite number greater than 0 km.");
    }
    return FSPL_CONSTANT + 20 * Math.log10(frequencyGHz) + 20 * Math.log10(distanceKm);
  }

  /**
   * Received Signal Level (RSL).
   * P_RX(dBm) = P_TX + G_TX + G_RX − FSPL − L_sys
   */
  function calculateReceivedPower(
    transmitPowerDbm,
    txAntennaGainDbi,
    rxAntennaGainDbi,
    fsplDb,
    systemLossesDb
  ) {
    const args = [
      transmitPowerDbm,
      txAntennaGainDbi,
      rxAntennaGainDbi,
      fsplDb,
      systemLossesDb,
    ];
    if (args.some((v) => !Number.isFinite(v))) {
      throw new RangeError("All received-power arguments must be finite numbers.");
    }
    if (systemLossesDb < 0) {
      throw new RangeError("System losses must be zero or greater.");
    }
    return (
      transmitPowerDbm +
      txAntennaGainDbi +
      rxAntennaGainDbi -
      fsplDb -
      systemLossesDb
    );
  }

  /**
   * Link margin relative to receiver sensitivity.
   * Link Margin(dB) = P_RX − P_sensitivity
   */
  function calculateLinkMargin(receivedPowerDbm, receiverSensitivityDbm) {
    if (!Number.isFinite(receivedPowerDbm) || !Number.isFinite(receiverSensitivityDbm)) {
      throw new RangeError("Received power and sensitivity must be finite numbers.");
    }
    return receivedPowerDbm - receiverSensitivityDbm;
  }

  /** PASS / FAIL relative to receiver sensitivity only — not deployment readiness. */
  function evaluateLinkStatus(linkMarginDb) {
    if (!Number.isFinite(linkMarginDb)) {
      throw new RangeError("Link margin must be a finite number.");
    }
    const pass = linkMarginDb >= 0;
    return {
      pass,
      label: pass ? "PASS (sensitivity)" : "FAIL (sensitivity)",
      shortLabel: pass ? "PASS" : "FAIL",
    };
  }

  const FREE_SPACE_SCOPE =
    "Based on free-space calculations only. Rain attenuation, multipath, diffraction, " +
    "terrain, atmospheric absorption, and ITU-R availability are not included.";

  /**
   * Engineering recommendation based on free-space link margin above sensitivity.
   * Thresholds are advisory; they do not imply deployment readiness.
   */
  function getLinkRecommendation(linkMarginDb) {
    if (!Number.isFinite(linkMarginDb)) {
      throw new RangeError("Link margin must be a finite number.");
    }

    if (linkMarginDb < 0) {
      return {
        tier: "fail",
        headline: "Below receiver sensitivity (free-space model).",
        detail:
          FREE_SPACE_SCOPE +
          " Received signal level is below the entered receiver sensitivity in this free-space model. " +
          "Adjust link parameters or verify inputs.",
      };
    }

    if (linkMarginDb > 25) {
      return {
        tier: "excellent",
        headline: "Strong free-space margin above sensitivity.",
        detail:
          FREE_SPACE_SCOPE +
          " Free-space margin exceeds 25 dB above the entered receiver sensitivity. " +
          "Production paths typically require additional fade margin from separate propagation analysis.",
      };
    }

    if (linkMarginDb >= 15) {
      return {
        tier: "good",
        headline: "Adequate free-space margin above sensitivity.",
        detail:
          FREE_SPACE_SCOPE +
          " Free-space margin is 15–25 dB above sensitivity. " +
          "Verify rain fade, multipath, and availability using appropriate propagation models before deployment.",
      };
    }

    if (linkMarginDb >= 10) {
      return {
        tier: "marginal",
        headline: "Limited free-space margin above sensitivity.",
        detail:
          FREE_SPACE_SCOPE +
          " Free-space margin is 10–15 dB above sensitivity. " +
          "Additional losses from rain, multipath, or obstruction are not modelled here.",
      };
    }

    return {
      tier: "critical",
      headline: "Low free-space margin above sensitivity.",
      detail:
        FREE_SPACE_SCOPE +
        " Free-space margin is below 10 dB above sensitivity. " +
        "Consider increasing antenna gain, transmit power, or reducing losses — then re-evaluate with full path models.",
    };
  }

  /** Run the full link-budget chain from validated numeric inputs. */
  function computeLinkBudget(inputs) {
    const {
      frequencyGHz,
      distanceKm,
      transmitPowerDbm,
      txAntennaGainDbi,
      rxAntennaGainDbi,
      systemLossesDb,
      receiverSensitivityDbm,
    } = inputs;

    const eirpDbm = calculateEIRP(transmitPowerDbm, txAntennaGainDbi);
    const fsplDb = calculateFSPL(frequencyGHz, distanceKm);
    const receivedPowerDbm = calculateReceivedPower(
      transmitPowerDbm,
      txAntennaGainDbi,
      rxAntennaGainDbi,
      fsplDb,
      systemLossesDb
    );
    const linkMarginDb = calculateLinkMargin(receivedPowerDbm, receiverSensitivityDbm);
    const status = evaluateLinkStatus(linkMarginDb);
    const recommendation = getLinkRecommendation(linkMarginDb);

    return {
      eirpDbm,
      fsplDb,
      receivedPowerDbm,
      linkMarginDb,
      status,
      recommendation,
    };
  }

  global.WAVTIUSLinkBudget = global.WAVTIUSLinkBudget || {};
  global.WAVTIUSLinkBudget.domain = {
    FSPL_CONSTANT,
    calculateEIRP,
    calculateFSPL,
    calculateReceivedPower,
    calculateLinkMargin,
    evaluateLinkStatus,
    getLinkRecommendation,
    computeLinkBudget,
  };
})(typeof window !== "undefined" ? window : globalThis);
