// levelStepIds.js - Canonical ID and naming resolver for vertical level stepping
export function buildLevelStepIds(element, targetLevel) {
  const elem = (element || "HGT").toUpperCase();
  const id = `contour-sounding-${elem.toLowerCase()}-${targetLevel}`;
  const elemName = elem === "HGT"
    ? "Geopotential Height"
    : (elem === "TMP"
      ? "Temperature"
      : (elem === "DTD"
        ? "Dew-Point Depression"
        : (elem === "VOR"
          ? "Relative Vorticity"
          : (elem === "DIV"
            ? "Divergence"
            : elem))));
  const name = `${targetLevel} hPa Derived ${elemName}`;
  const stationId = `upperair-obs-${targetLevel}`;
  return { id, name, stationId, elemName };
}
