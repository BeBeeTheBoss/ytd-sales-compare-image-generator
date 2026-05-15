const fs = require("fs");
const path = require("path");

/**
 * Draw Myanmar outline from GeoJSON onto a Canvas 2D context.
 * Bounds/projection match `getMyanmarMapFromGeoJSON` in dashboardSvg.js (0.78 / 0.9 width-height scale).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {{
 *   geoJsonPath?: string,
 *   fillStyle?: string,
 *   strokeStyle?: string,
 *   lineWidth?: number,
 *   background?: string
 * }} [options]
 * @returns {boolean} true if the map was drawn; false if file missing or invalid
 */
function drawMyanmarRealMap(ctx, x, y, w, h, options = {}) {
  const geoJsonPath = options.geoJsonPath || path.join(__dirname, "..", "data-myanmar.geo.json");
  const fillStyle = options.fillStyle ?? "#d9c9a0";
  const strokeStyle = options.strokeStyle ?? "#bd9f5a";
  const lineWidth = options.lineWidth ?? 2;
  const background = options.background;

  try {
    if (!fs.existsSync(geoJsonPath)) return false;

    const raw = fs.readFileSync(geoJsonPath, "utf8");
    const geo = JSON.parse(raw);

    let geometry = null;
    if (geo.type === "FeatureCollection" && Array.isArray(geo.features) && geo.features.length) {
      geometry = geo.features[0].geometry;
    } else if (geo.type === "Feature" && geo.geometry) {
      geometry = geo.geometry;
    } else if (geo.type === "Polygon" || geo.type === "MultiPolygon") {
      geometry = geo;
    }
    if (!geometry) return false;

    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    polygons.forEach((poly) => {
      const ring = poly[0] || [];
      ring.forEach(([lon, lat]) => {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      });
    });

    const lonRange = maxLon - minLon || 1;
    const latRange = maxLat - minLat || 1;
    const scale = Math.min((w * 0.78) / lonRange, (h * 0.9) / latRange);
    const ox = x + (w - lonRange * scale) / 2;
    const oy = y + (h - latRange * scale) / 2;

    const px = (lon) => ox + (lon - minLon) * scale;
    const py = (lat) => oy + (maxLat - lat) * scale;

    if (background) {
      ctx.save();
      ctx.fillStyle = background;
      ctx.fillRect(x - 2, y - 4, w + 4, h + 8);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";

    polygons.forEach((poly) => {
      const ring = poly[0] || [];
      if (ring.length < 2) return;
      ctx.beginPath();
      ring.forEach(([lon, lat], i) => {
        const cx = px(lon);
        const cy = py(lat);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();

    return true;
  } catch (_err) {
    return false;
  }
}

module.exports = { drawMyanmarRealMap };
