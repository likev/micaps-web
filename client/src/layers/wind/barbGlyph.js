// barbGlyph.js - Shared meteorological wind barb glyph drawing (CMA / GB/T 35663 standard)

/**
 * Draws wind barb feathers (pennants, full barbs, half barbs) on a canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} startX Starting X coordinate along the staff (tip where feathers begin)
 * @param {number} startY Starting Y coordinate along the staff
 * @param {number} dx Direction cosine along staff (towards base)
 * @param {number} dy Direction sine along staff (towards base)
 * @param {number} nx Normal cosine perpendicular to staff (feather direction)
 * @param {number} ny Normal sine perpendicular to staff (feather direction)
 * @param {number} speed Wind speed in m/s
 * @param {number} featherLen Length of full feather in pixels
 * @param {number} barbSpacing Spacing between successive barbs along staff
 */
export function drawBarbFeathers(ctx, startX, startY, dx, dy, nx, ny, speed, featherLen = 8, barbSpacing = 3.5) {
  let spd = speed;
  let pos = 0;

  // 20 m/s pennants (triangles) - CMA / MICAPS standard
  while (spd >= 18) {
    const px = startX - dx * pos * barbSpacing;
    const py = startY - dy * pos * barbSpacing;
    const px2 = startX - dx * (pos + 1.5) * barbSpacing;
    const py2 = startY - dy * (pos + 1.5) * barbSpacing;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + nx * featherLen, py + ny * featherLen);
    ctx.lineTo(px2, py2);
    ctx.closePath();
    ctx.fill();
    pos += 1.8;
    spd -= 20;
  }

  // 4 m/s full barbs
  while (spd >= 3.5) {
    const px = startX - dx * pos * barbSpacing;
    const py = startY - dy * pos * barbSpacing;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + nx * featherLen, py + ny * featherLen);
    ctx.stroke();
    pos += 1;
    spd -= 4;
  }

  // 2 m/s half barbs
  if (spd >= 1.5) {
    const px = startX - dx * pos * barbSpacing;
    const py = startY - dy * pos * barbSpacing;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + nx * (featherLen * 0.5), py + ny * (featherLen * 0.5));
    ctx.stroke();
  }
}
