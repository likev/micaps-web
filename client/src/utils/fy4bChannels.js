// fy4bChannels.js - FY-4B AGRI channel metadata (central wavelength + band type)
// Source: CMA FY-4B AGRI operational dataset manifest (channels C001..C015)

export const FY4B_CHANNELS = {
  1: { wl: "0.47", band: "Vis", desc: "Blue" },
  2: { wl: "0.65", band: "Vis", desc: "Red" },
  3: { wl: "0.83", band: "Vis", desc: "Vegetation NIR" },
  4: { wl: "1.37", band: "NIR", desc: "Cirrus SWIR" },
  5: { wl: "1.61", band: "SWIR", desc: "Snow/Ice" },
  6: { wl: "2.25", band: "SWIR", desc: "Cloud Phase" },
  7: { wl: "3.75", band: "MWIR", desc: "Shortwave IR" },
  8: { wl: "6.25", band: "Vapor", desc: "Upper Troposphere WV" },
  9: { wl: "6.95", band: "Vapor", desc: "Mid Troposphere WV" },
  10: { wl: "7.32", band: "Vapor", desc: "Lower Troposphere WV" },
  11: { wl: "8.5", band: "IR", desc: "Cloud Phase / Dust" },
  12: { wl: "10.8", band: "IR", desc: "Clean Window IR" },
  13: { wl: "12.0", band: "IR", desc: "Dirty Window IR" },
  14: { wl: "13.5", band: "IR", desc: "Cloud Top IR" },
  15: { wl: "13.5", band: "CO2", desc: "CO\u2082 Cloud Height" },
};

/** Formats channel option label, e.g. "C012 · 10.8µm IR · Clean Window IR" */
export function formatFy4bChannel(level) {
  const num = parseInt(level, 10);
  if (isNaN(num) || num < 1 || num > 15) return `${level}`;
  const id = `C${String(num).padStart(3, "0")}`;
  const ch = FY4B_CHANNELS[num];
  return `${id} \u00b7 ${ch.wl}\u00b5m ${ch.band} \u00b7 ${ch.desc}`;
}
