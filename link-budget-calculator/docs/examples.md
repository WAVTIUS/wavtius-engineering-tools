# Worked Examples

These examples use the same equations as the calculator. Values are rounded to 2 decimals for display.

---

## Example A — Default scenario (passes sensitivity check)

| Input | Value |
|-------|-------|
| Frequency | 18 GHz |
| Distance | 10 km |
| Transmit Power | 20 dBm |
| TX Antenna Gain | 38 dBi |
| RX Antenna Gain | 38 dBi |
| System Losses | 3 dB |
| Receiver Sensitivity | −70 dBm |

### Step 1 — EIRP

\[
\mathrm{EIRP} = 20 + 38 = 58.00\ \mathrm{dBm}
\]

### Step 2 — FSPL

\[
\mathrm{FSPL} = 92.45 + 20\log_{10}(18) + 20\log_{10}(10)
\]

\[
\mathrm{FSPL} = 92.45 + 25.11 + 20.00 = 137.56\ \mathrm{dB}
\]

### Step 3 — Received power

\[
P_{\mathrm{RX}} = 20 + 38 + 38 - 137.56 - 3 = -44.56\ \mathrm{dBm}
\]

### Step 4 — Link margin

\[
\mathrm{Margin} = -44.56 - (-70) = 25.44\ \mathrm{dB}
\]

**Status:** PASS (sensitivity) — strong free-space margin above sensitivity

---

## Example B — Longer hop / lower gains (fails sensitivity check)

| Input | Value |
|-------|-------|
| Frequency | 23 GHz |
| Distance | 35 km |
| Transmit Power | 15 dBm |
| TX Antenna Gain | 32 dBi |
| RX Antenna Gain | 32 dBi |
| System Losses | 5 dB |
| Receiver Sensitivity | −65 dBm |

### Step 1 — EIRP

\[
\mathrm{EIRP} = 15 + 32 = 47.00\ \mathrm{dBm}
\]

### Step 2 — FSPL

\[
\mathrm{FSPL} = 92.45 + 20\log_{10}(23) + 20\log_{10}(35)
= 92.45 + 27.23 + 30.88 = 150.57\ \mathrm{dB}
\]

### Step 3 — Received power

\[
P_{\mathrm{RX}} = 15 + 32 + 32 - 150.57 - 5 = -76.57\ \mathrm{dBm}
\]

### Step 4 — Link margin

\[
\mathrm{Margin} = -76.57 - (-65) = -11.57\ \mathrm{dB}
\]

**Status:** FAIL (sensitivity) — below receiver sensitivity in free-space model

---

## Classroom tip

Ask students to change **one** input at a time (distance, frequency, or antenna gain) and predict whether margin improves or degrades before looking at the result.
