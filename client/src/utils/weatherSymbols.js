// weatherSymbols.js - WMO & NOAA standard station plot glyph generators

export function getSkyCoverSVG(octas = 0, size = 18) {
  const r = size / 2 - 1.5;
  const cx = size / 2;
  const cy = size / 2;

  let fillContent = "";
  switch (Math.min(8, Math.max(0, octas))) {
    case 0: // Clear (open circle)
      fillContent = "";
      break;
    case 1:
    case 2: // 1/4 filled pie slice
      fillContent = `<path d="M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z" fill="#e6edf3"/>`;
      break;
    case 3:
    case 4: // 1/2 vertical split
      fillContent = `<path d="M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} Z" fill="#e6edf3"/>`;
      break;
    case 5:
    case 6: // 3/4 filled
      fillContent = `<path d="M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z" fill="#e6edf3"/>`;
      break;
    case 7:
    case 8: // Overcast (solid)
      fillContent = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e6edf3"/>`;
      break;
    default: // Obscured / missing
      fillContent = `<line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}" stroke="#e6edf3" stroke-width="2.0"/><line x1="${cx + r}" y1="${cy - r}" x2="${cx - r}" y2="${cy + r}" stroke="#e6edf3" stroke-width="2.0"/>`;
  }

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(13,17,23,0.8)" stroke="#e6edf3" stroke-width="2.0"/>
      ${fillContent}
    </svg>
  `;
}

export function getWindBarbSVG(speed = 0, dir = 0, size = 100) {
  const cx = size / 2;
  const cy = size / 2;

  // Speed in m/s (CMA / Chinese Standard: 4 m/s full barb, 2 m/s half barb, 20 m/s pennant flag)
  if (speed < 1.5) {
    // Calm: concentric light ring around center
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="#58a6ff" stroke-width="1.3" stroke-dasharray="2.5,2.5"/>
      </svg>
    `;
  }

  // Sized at 70% of 3X
  const skyRadius = 8;
  const staffLength = 41;
  const angleRad = ((dir - 90) * Math.PI) / 180;
  const xStart = cx + skyRadius * Math.cos(angleRad);
  const yStart = cy + skyRadius * Math.sin(angleRad);
  const xEnd = cx + staffLength * Math.cos(angleRad);
  const yEnd = cy + staffLength * Math.sin(angleRad);

  let barbsSVG = "";
  let remSpeed = Math.round(speed);
  let pos = staffLength;
  // 110° angle relative to inward staff toward station (slanted backward towards tail per NOAA WPC standard)
  const barbAngle = angleRad + ((70 * Math.PI) / 180);

  // 1. Pennant flag (20 m/s each)
  while (remSpeed >= 18) {
    const pX = cx + pos * Math.cos(angleRad);
    const pY = cy + pos * Math.sin(angleRad);
    const fX = pX + 17 * Math.cos(barbAngle);
    const fY = pY + 17 * Math.sin(barbAngle);
    const posNext = pos - 10;
    const pX2 = cx + posNext * Math.cos(angleRad);
    const pY2 = cy + posNext * Math.sin(angleRad);
    barbsSVG += `<polygon points="${pX},${pY} ${fX},${fY} ${pX2},${pY2}" fill="#58a6ff" stroke="#58a6ff" stroke-width="1.0"/>`;
    pos -= 11;
    remSpeed -= 20;
  }

  // 2. Full barb / long feather (4 m/s each)
  while (remSpeed >= 3.5) {
    const pX = cx + pos * Math.cos(angleRad);
    const pY = cy + pos * Math.sin(angleRad);
    const bX = pX + 15 * Math.cos(barbAngle);
    const bY = pY + 15 * Math.sin(barbAngle);
    barbsSVG += `<line x1="${pX}" y1="${pY}" x2="${bX}" y2="${bY}" stroke="#58a6ff" stroke-width="2.2" stroke-linecap="round"/>`;
    pos -= 6.5;
    remSpeed -= 4;
  }

  // 3. Half barb / short feather (2 m/s)
  if (remSpeed >= 1.5) {
    // If only 1 short barb, indent from staff tip per WMO/NOAA convention
    const barbPos = pos === staffLength ? staffLength - 6 : pos;
    const pX = cx + barbPos * Math.cos(angleRad);
    const pY = cy + barbPos * Math.sin(angleRad);
    const bX = pX + 8 * Math.cos(barbAngle);
    const bY = pY + 8 * Math.sin(barbAngle);
    barbsSVG += `<line x1="${pX}" y1="${pY}" x2="${bX}" y2="${bY}" stroke="#58a6ff" stroke-width="2.2" stroke-linecap="round"/>`;
  }

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <!-- Wind Staff -->
      <line x1="${xStart}" y1="${yStart}" x2="${xEnd}" y2="${yEnd}" stroke="#58a6ff" stroke-width="2.2" stroke-linecap="round"/>
      <!-- Feathers & Flags (4 m/s full, 2 m/s half, 20 m/s pennant) -->
      ${barbsSVG}
    </svg>
  `;
}

export function getWeatherSymbol(code = 0) {
  if (code >= 50 && code <= 55) return ","; // Drizzle
  if (code >= 60 && code <= 65) return "•"; // Rain
  if (code >= 70 && code <= 75) return "✶"; // Snow
  if (code === 10 || code === 40 || code === 45) return "≡"; // Fog
  if (code === 5 || code === 6) return "∞"; // Haze
  if (code >= 95 && code <= 99) return "☈"; // Thunderstorm
  return "";
}

export function getPressureTendencyGlyph(code = 0) {
  switch (code) {
    case 1:
    case 2:
      return "╱"; // Rising
    case 3:
      return "⎺"; // Steady
    case 4:
      return "╭╮"; // Rising then falling
    case 6:
    case 7:
    case 8:
      return "╲"; // Falling
    default:
      return "―";
  }
}
