/* Geometry helpers – local metric plane (x = øst, y = nord, meter) */
const Geo = (() => {
  let origin = { lat: 59.9, lon: 10.75 };
  const M_LAT = 111132.954;
  const mLon = () => 111319.488 * Math.cos(origin.lat * Math.PI / 180);

  function setOrigin(lat, lon) { origin = { lat, lon }; }
  function toXY(lat, lon) { return [(lon - origin.lon) * mLon(), (lat - origin.lat) * M_LAT]; }
  function toLL(x, y) { return [origin.lat + y / M_LAT, origin.lon + x / mLon()]; }

  function area(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
    return Math.abs(a / 2);
  }
  function centroid(poly) {
    let x = 0, y = 0, a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
      x += (poly[j][0] + poly[i][0]) * f; y += (poly[j][1] + poly[i][1]) * f; a += f;
    }
    if (Math.abs(a) < 1e-9) return poly[0];
    return [x / (3 * a), y / (3 * a)];
  }
  function inside(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function distSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function distToEdges(p, poly) {
    let d = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distSeg(p, poly[j], poly[i]));
    return d;
  }
  /* min distance between two polygon outlines */
  function polyDist(A, B) {
    let d = Infinity;
    for (const p of A) d = Math.min(d, distToEdges(p, B));
    for (const p of B) d = Math.min(d, distToEdges(p, A));
    return d;
  }
  function segInter(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  function polysIntersect(A, B) {
    for (let i = 0, j = A.length - 1; i < A.length; j = i++)
      for (let k = 0, l = B.length - 1; k < B.length; l = k++)
        if (segInter(A[j], A[i], B[l], B[k])) return true;
    return inside(A[0], B) || inside(B[0], A);
  }
  /* distance along ray from p in direction (dx,dy) until it exits/hits polygon edges */
  function rayHit(p, dir, poly) {
    let best = Infinity;
    const [px, py] = p, [dx, dy] = dir;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i];
      const ex = bx - ax, ey = by - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((ax - px) * ey - (ay - py) * ex) / den;
      const u = ((ax - px) * dy - (ay - py) * dx) / den;
      if (t > 1e-6 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    return best;
  }
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  function bbox(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1 };
  }
  /* rectangle footprint. facing = compass bearing (deg) of main facade normal. W along facade, D depth */
  function rect(cx, cy, W, D, facing) {
    const f = facing * Math.PI / 180;
    const n = [Math.sin(f), Math.cos(f)], t = [Math.cos(f), -Math.sin(f)];
    const hw = W / 2, hd = D / 2;
    return [
      [cx + t[0] * hw + n[0] * hd, cy + t[1] * hw + n[1] * hd],
      [cx - t[0] * hw + n[0] * hd, cy - t[1] * hw + n[1] * hd],
      [cx - t[0] * hw - n[0] * hd, cy - t[1] * hw - n[1] * hd],
      [cx + t[0] * hw - n[0] * hd, cy + t[1] * hw - n[1] * hd]
    ];
  }
  function bearingVec(deg) { const r = deg * Math.PI / 180; return [Math.sin(r), Math.cos(r)]; }
  function angDiff(a, b) { let d = Math.abs(((a - b) % 360 + 360) % 360); return d > 180 ? 360 - d : d; }
  /* inward offset approximation of polygon (for drawing the byggegrense) */
  function offsetInward(poly, d) {
    const ccw = (() => { let s = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[i][0] - poly[j][0]) * (poly[i][1] + poly[j][1]); return s < 0; })();
    const n = poly.length, out = [];
    for (let i = 0; i < n; i++) {
      const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
      const e1 = norm([p1[0] - p0[0], p1[1] - p0[1]]), e2 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
      const s = ccw ? 1 : -1;
      const n1 = [-e1[1] * s, e1[0] * s], n2 = [-e2[1] * s, e2[0] * s];
      let b = norm([n1[0] + n2[0], n1[1] + n2[1]]);
      const cos = b[0] * n1[0] + b[1] * n1[1];
      const k = cos > 0.25 ? d / cos : d / 0.25;
      out.push([p1[0] + b[0] * k, p1[1] + b[1] * k]);
    }
    return out;
  }
  function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
  function simplify(poly, tol = 0.15) {
    if (poly.length < 5) return poly;
    const out = [poly[0]];
    for (let i = 1; i < poly.length - 1; i++) {
      if (distSeg(poly[i], out[out.length - 1], poly[i + 1]) > tol) out.push(poly[i]);
    }
    out.push(poly[poly.length - 1]);
    return out;
  }
  return { setOrigin, toXY, toLL, area, centroid, inside, distSeg, distToEdges, polyDist, polysIntersect, rayHit, hull, bbox, rect, bearingVec, angDiff, offsetInward, simplify, get origin() { return origin; } };
})();
