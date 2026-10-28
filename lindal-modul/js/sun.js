/* Solposisjon (SunCalc-algoritmen) + skygge-geometri */
const Sun = (() => {
  const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
  const toDays = d => d.valueOf() / dayMs - 0.5 + J1970 - J2000;
  const dec = l => Math.asin(Math.sin(e) * Math.sin(l));
  const ra = l => Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l));

  /* returns { bearing: compass deg (0=N, 90=Ø), altitude: deg } */
  function position(date, lat, lon) {
    const lw = rad * -lon, phi = rad * lat, d = toDays(date);
    const M = rad * (357.5291 + 0.98560028 * d);
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + rad * 102.9372 + Math.PI;
    const δ = dec(L), α = ra(L);
    const H = rad * (280.16 + 360.9856235 * d) - lw - α;
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(δ) * Math.cos(phi));
    const alt = Math.asin(Math.sin(phi) * Math.sin(δ) + Math.cos(phi) * Math.cos(δ) * Math.cos(H));
    return { bearing: (az / rad + 180 + 360) % 360, altitude: alt / rad };
  }

  /* norsk tid (CET/CEST) -> Date */
  function lastSunday(y, m) { const d = new Date(Date.UTC(y, m + 1, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d; }
  function osloDate(y, m, day, hour) {
    const utcGuess = Date.UTC(y, m, day, 0, 0) + hour * 36e5;
    const dstStart = lastSunday(y, 2).getTime() + 1 * 36e5;   // 01:00 UTC
    const dstEnd = lastSunday(y, 9).getTime() + 1 * 36e5;
    const off = (utcGuess - 1 * 36e5 >= dstStart && utcGuess - 2 * 36e5 < dstEnd) ? 2 : 1;
    return new Date(utcGuess - off * 36e5);
  }

  /* skyggepolygon for et volum med fotavtrykk poly (lokale meter) og høyde h */
  function shadow(poly, h, sun) {
    if (sun.altitude <= 0.5) return null;
    const L = Math.min(h / Math.tan(sun.altitude * rad), 400);
    const v = Geo.bearingVec(sun.bearing + 180);
    const moved = poly.map(([x, y]) => [x + v[0] * L, y + v[1] * L]);
    return Geo.hull(poly.concat(moved));
  }

  /* er punkt p skyggelagt av noen hindringer [{poly,h}] ved gitt solposisjon */
  function shaded(p, sun, obstacles) {
    if (sun.altitude <= 0) return true;
    const dir = Geo.bearingVec(sun.bearing);
    const tanA = Math.tan(sun.altitude * rad);
    for (const o of obstacles) {
      if (Geo.inside(p, o.poly)) continue;
      const d = Geo.rayHit(p, dir, o.poly);
      if (d !== Infinity && o.h > d * tanA) return true;
    }
    return false;
  }

  /* soltimer på et punkt foran en fasade med gitt normal (bearing), dag = {y,m,d} */
  function sunHours(p, facing, day, lat, lon, obstacles, step = 0.5, needFacade = true) {
    let hrs = 0, firstSun = null, lastSun = null;
    for (let h = 4; h <= 23; h += step) {
      const s = position(osloDate(day.y, day.m, day.d, h), lat, lon);
      if (s.altitude <= 2) continue;
      if (needFacade && Geo.angDiff(s.bearing, facing) > 95) continue;
      if (shaded(p, s, obstacles)) continue;
      hrs += step;
      if (firstSun === null) firstSun = h;
      lastSun = h;
    }
    return { hours: hrs, first: firstSun, last: lastSun };
  }

  function dayLength(day, lat, lon) {
    let hrs = 0, rise = null, set = null;
    for (let h = 0; h <= 24; h += 0.25) {
      const s = position(osloDate(day.y, day.m, day.d, h), lat, lon);
      if (s.altitude > -0.83) { hrs += 0.25; if (rise === null) rise = h; set = h; }
    }
    return { hours: hrs, rise, set };
  }

  const fmt = h => h == null ? '–' : `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  return { position, osloDate, shadow, shaded, sunHours, dayLength, fmt };
})();
