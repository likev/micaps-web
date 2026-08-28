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
      fillContent = `<line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}" stroke="#e6edf3" stroke-width="1.5"/><line x1="${cx + r}" y1="${cy - r}" x2="${cx - r}" y2="${cy + r}" stroke="#e6edf3" stroke-width="1.5"/>`;
  }

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(13,17,23,0.8)" stroke="#e6edf3" stroke-width="1.5"/>
      ${fillContent}
    </svg>
  `;
}

export function getWindBarbSVG(speed = 0, dir = 0, size = 48) {
  const cx = size / 2;
  const cy = size / 2;

  // Convert speed from m/s to knots if needed (1 m/s ~ 1.94 kts)
  const kts = speed < 0.8 ? 0 : Math.round(speed * 1.94384);

  if (kts < 3) {
    // Calm: concentric light ring around center circle
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${cx}" cy="${cy}" r="11" fill="none" stroke="#58a6ff" stroke-width="1.2" stroke-dasharray="2,2"/>
      </svg>
    `;
  }

  // Draw staff pointing into the wind from the outer edge of sky cover circle (r = 8)
  const skyRadius = 8;
  const staffLength = size * 0.45;
  const angleRad = ((dir - 90) * Math.PI) / 180;
  const xStart = cx + skyRadius * Math.cos(angleRad);
  const yStart = cy + skyRadius * Math.sin(angleRad);
  const xEnd = cx + staffLength * Math.cos(angleRad);
  const yEnd = cy + staffLength * Math.sin(angleRad);

  let barbsSVG = "";
  let remKts = kts;
  let pos = staffLength;

  // 50-knot pennant flags
  while (remKts >= 48) {
    const pX = cx + pos * Math.cos(angleRad);
    const pY = cy + pos * Math.sin(angleRad);
    const barbAngle = angleRad + Math.PI / 2.5;
    const fX = pX + 8.5 * Math.cos(barbAngle);
    const fY = pY + 8.5 * Math.sin(barbAngle);
    const pX2 = cx + (pos - 5) * Math.cos(angleRad);
    const pY2 = cy + (pos - 5) * Math.sin(angleRad);
    barbsSVG += `<polygon points="${pX},${pY} ${fX},${fY} ${pX2},${pY2}" fill="#58a6ff"/>`;
    pos -= 6;
    remKts -= 50;
  }

  // 10-knot full barbs
  while (remKts >= 8) {
    const pX = cx + pos * Math.cos(angleRad);
    const pY = cy + pos * Math.sin(angleRad);
    const barbAngle = angleRad + Math.PI / 2.5;
    const bX = pX + 7.5 * Math.cos(barbAngle);
    const bY = pY + 7.5 * Math.sin(barbAngle);
    barbsSVG += `<line x1="${pX}" y1="${pY}" x2="${bX}" y2="${bY}" stroke="#58a6ff" stroke-width="1.6"/>`;
    pos -= 4.5;
    remKts -= 10;
  }

  // 5-knot half barb
  if (remKts >= 3) {
    const pX = cx + pos * Math.cos(angleRad);
    const pY = cy + pos * Math.sin(angleRad);
    const barbAngle = angleRad + Math.PI / 2.5;
    const bX = pX + 4 * Math.cos(barbAngle);
    const bY = pY + 4 * Math.sin(barbAngle);
    barbsSVG += `<line x1="${pX}" y1="${pY}" x2="${bX}" y2="${bY}" stroke="#58a6ff" stroke-width="1.6"/>`;
  }

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <line x1="${xStart}" y1="${yStart}" x2="${xEnd}" y2="${yEnd}" stroke="#58a6ff" stroke-width="1.6"/>
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
