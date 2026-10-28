/* AI-tomteplanlegger: kart, modulkonfigurator, optimalisering, sol/skygge, regelsjekk */
const Planner = (() => {
  const S = {
    address: null, plot: null, terrain: null, env: { buildings: [], roads: [] },
    house: { cx: 0, cy: 0, facing: 180 }, day: null, hour: 15, suggestions: [], drawing: null, activeSugg: -1
  };
  let map, L_plot, L_setback, L_env, L_shadow, L_house, L_sun, handle, topo, sat;
  const $ = id => document.getElementById(id);
  const fmt = (n, d = 1) => Number(n).toLocaleString('nb-NO', { maximumFractionDigits: d, minimumFractionDigits: d });

  const PRESETS = [
    { id: 'hytte', name: 'Hytte kompakt', desc: '2 moduler · 1 etg', n: 2, len: 8.4, w: 3.9, floors: 1, roof: 'saltak' },
    { id: 'enebolig', name: 'Enebolig', desc: '3 moduler · 2 etg', n: 3, len: 10.2, w: 3.9, floors: 2, roof: 'saltak' },
    { id: 'stor', name: 'Enebolig stor', desc: '4 moduler · 2 etg', n: 4, len: 11, w: 3.9, floors: 2, roof: 'saltak' },
    { id: 'tomanns', name: 'Tomannsbolig', desc: '6 moduler · 2 etg', n: 6, len: 10.2, w: 3.9, floors: 2, roof: 'saltak' },
    { id: 'rekke', name: 'Rekkehus (4)', desc: '8 moduler · 2 etg', n: 8, len: 9.6, w: 3.9, floors: 2, roof: 'flatt' },
    { id: 'anneks', name: 'Anneks / hybel', desc: '1 modul · 1 etg', n: 1, len: 7.2, w: 3.9, floors: 1, roof: 'pult' }
  ];
  const LEVELS = {
    modul: { name: 'Komplette moduler', kr: [32000, 42000], perWeek: 3, site: 'Montasje av moduler: 1–3 dager med kran' },
    kledd: { name: 'Elementer ferdig kledd', kr: [28000, 38000], perWeek: 0, site: 'Tett bygg på ca. 1 uke' },
    ukledd: { name: 'Elementer uten kledning', kr: [26000, 36000], perWeek: 0, site: 'Tett bygg på ca. 1–2 uker' },
    precut: { name: 'Prekapp kjerne', kr: [24000, 34000], perWeek: 0, site: 'Reising med egne/innleide tømrere, 3–6 uker' }
  };

  /* ---------- map ---------- */
  function initMap() {
    map = L.map('map', { zoomControl: true, maxZoom: 21 }).setView([58.6128, 8.901], 16);
    topo = L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', { maxZoom: 21, maxNativeZoom: 18, attribution: '© Kartverket' }).addTo(map);
    sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19, attribution: 'Flyfoto © Esri' });
    map.createPane('shadows').style.zIndex = 390;
    L_env = L.layerGroup().addTo(map);
    L_shadow = L.layerGroup().addTo(map);
    L_plot = L.layerGroup().addTo(map);
    L_setback = L.layerGroup().addTo(map);
    L_house = L.layerGroup().addTo(map);
    L_sun = L.layerGroup().addTo(map);
    map.on('click', onMapClick);
    $('layerTopo').onclick = () => { map.removeLayer(sat); topo.addTo(map); $('layerTopo').classList.add('active'); $('layerSat').classList.remove('active'); };
    $('layerSat').onclick = () => { map.removeLayer(topo); sat.addTo(map); $('layerSat').classList.add('active'); $('layerTopo').classList.remove('active'); };
  }
  function toast(msg, ms = 3500) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._h); if (ms) t._h = setTimeout(() => t.classList.add('hidden'), ms);
  }
  const ll = xy => Geo.toLL(xy[0], xy[1]);

  function onMapClick(e) {
    if (S.drawing) {
      S.drawing.push([e.latlng.lat, e.latlng.lng]);
      L_plot.clearLayers();
      L.polyline(S.drawing, { color: '#4D87BD', dashArray: '6 4' }).addTo(L_plot);
      S.drawing.forEach(p => L.circleMarker(p, { radius: 4, color: '#4D87BD' }).addTo(L_plot));
      return;
    }
    if (currentStep() === 1 || !S.plot) loadPlotAt(e.latlng.lat, e.latlng.lng, null);
  }

  /* ---------- plot ---------- */
  async function loadPlotAt(lat, lon, addr) {
    toast('Henter tomtegrense fra Kartverket…', 0);
    try {
      const [par, rev] = await Promise.all([Data.parcel(lat, lon), addr ? Promise.resolve(addr) : Data.reverse(lat, lon)]);
      S.address = addr || rev || { text: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, sted: '', kommune: '' };
      S.address.lat = lat; S.address.lon = lon;
      if (!par) { toast('Fant ingen eiendomsteig her. Tegn tomta selv.'); startDraw(); return; }
      setPlot(par.ring, par.props);
    } catch (err) {
      console.error(err); toast('Kunne ikke hente tomt: ' + err.message);
    }
  }

  async function setPlot(ring, props) {
    if (ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring = ring.slice(0, -1);
    const lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length, lon0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    Geo.setOrigin(lat0, lon0);
    let xy = Geo.simplify(ring.map(([la, lo]) => Geo.toXY(la, lo)), 0.1);
    S.plot = { ring, xy, area: Geo.area(xy), props: props || {}, bbox: Geo.bbox(xy) };
    S.suggestions = []; $('suggestions').innerHTML = '';
    const c = Geo.centroid(xy);
    S.house.cx = c[0]; S.house.cy = c[1]; S.house.facing = 180;
    drawPlot();
    map.fitBounds(L.polygon(ring).getBounds().pad(0.6), { maxZoom: 19 });
    toast('Henter terreng, nabobygg og veier…', 0);
    const [terr, env] = await Promise.allSettled([loadTerrain(), loadEnv(lat0, lon0)]);
    if (terr.status === 'rejected') console.warn(terr.reason);
    toast('Tomt lastet ✔', 2000);
    renderPlotInfo();
    S.house.cx = c[0]; S.house.cy = c[1];
    refresh();
    document.dispatchEvent(new CustomEvent('plot-loaded'));
  }

  function drawPlot() {
    L_plot.clearLayers();
    L.polygon(S.plot.ring, { color: '#4D87BD', weight: 3, dashArray: '8 5', fill: false, interactive: false }).addTo(L_plot);
    drawSetback();
  }
  function drawSetback() {
    L_setback.clearLayers();
    if (!S.plot) return;
    const d = requiredSetback();
    const off = Geo.offsetInward(S.plot.xy, d);
    if (Geo.area(off) > 4) L.polygon(off.map(ll), { color: '#4D87BD', weight: 1, fillColor: '#4D87BD', fillOpacity: .12, interactive: false }).addTo(L_setback);
  }

  async function loadTerrain() {
    const b = S.plot.bbox, pad = 4, n = 9;
    const x0 = b.x0 - pad, y0 = b.y0 - pad, dx = (b.x1 - b.x0 + 2 * pad) / (n - 1), dy = (b.y1 - b.y0 + 2 * pad) / (n - 1);
    const pts = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push(ll([x0 + i * dx, y0 + j * dy]));
    const z = await Data.heights(pts);
    const zz = z.map(v => v == null ? NaN : v);
    const valid = zz.filter(v => !isNaN(v));
    const mean = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
    for (let i = 0; i < zz.length; i++) if (isNaN(zz[i])) zz[i] = mean;
    // plot-internal min/max
    let zmin = Infinity, zmax = -Infinity;
    S.terrain = { x0, y0, dx, dy, n, z: zz };
    for (let j = 0; j < 15; j++) for (let i = 0; i < 15; i++) {
      const p = [b.x0 + (b.x1 - b.x0) * i / 14, b.y0 + (b.y1 - b.y0) * j / 14];
      if (!Geo.inside(p, S.plot.xy)) continue;
      const v = zAt(p[0], p[1]); zmin = Math.min(zmin, v); zmax = Math.max(zmax, v);
    }
    S.terrain.zmin = zmin; S.terrain.zmax = zmax;
  }
  function zAt(x, y) {
    const T = S.terrain; if (!T) return 0;
    let fi = (x - T.x0) / T.dx, fj = (y - T.y0) / T.dy;
    fi = Math.max(0, Math.min(T.n - 1.0001, fi)); fj = Math.max(0, Math.min(T.n - 1.0001, fj));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const g = (a, b) => T.z[b * T.n + a];
    return g(i, j) * (1 - u) * (1 - v) + g(i + 1, j) * u * (1 - v) + g(i, j + 1) * (1 - u) * v + g(i + 1, j + 1) * u * v;
  }

  async function loadEnv(lat, lon) {
    const env = await Data.surroundings(lat, lon, 150);
    S.env.buildings = env.buildings.map(b => {
      const xy = b.ll.map(([a, c]) => Geo.toXY(a, c));
      if (xy.length > 2 && xy[0][0] === xy[xy.length - 1][0]) xy.pop();
      const cen = Geo.centroid(xy);
      return { ...b, xy, cen, onPlot: Geo.inside(cen, S.plot.xy), area: Geo.area(xy) };
    });
    S.env.roads = env.roads.map(r => ({ ...r, xy: r.ll.map(([a, c]) => Geo.toXY(a, c)) }));
    drawEnv();
  }
  function drawEnv() {
    L_env.clearLayers();
    for (const b of S.env.buildings) {
      const demolish = b.onPlot && $('clearPlot').checked;
      L.polygon(b.ll, { color: demolish ? '#b3262f' : '#555', weight: 1, fillColor: demolish ? '#fff' : '#888', fillOpacity: demolish ? .3 : .55, dashArray: demolish ? '3 3' : null, interactive: false }).addTo(L_env);
    }
  }

  function startDraw() {
    S.drawing = []; L_plot.clearLayers();
    $('btnFinishDraw').classList.remove('hidden');
    toast('Klikk hjørnene på tomta i kartet, trykk «Ferdig tegnet».', 6000);
  }
  function finishDraw() {
    if (!S.drawing || S.drawing.length < 3) { toast('Minst 3 punkter trengs.'); return; }
    const ring = S.drawing; S.drawing = null;
    $('btnFinishDraw').classList.add('hidden');
    if (!S.address) { const c = ring[0]; S.address = { text: 'Egen-tegnet tomt', sted: '', kommune: '', lat: c[0], lon: c[1] }; }
    setPlot(ring, { matrikkelnummertekst: 'egendefinert' });
  }

  function renderPlotInfo() {
    const p = S.plot, a = S.address || {}, T = S.terrain;
    const slope = T && isFinite(T.zmax) ? T.zmax - T.zmin : null;
    const nOn = S.env.buildings.filter(b => b.onPlot).length;
    $('plotInfo').classList.remove('hidden');
    $('plotInfo').innerHTML = `<h4>${a.text || 'Tomt'} ${a.sted ? '· ' + a.sted : ''}</h4>
      <div class="kv"><span>Gnr/bnr</span><b>${p.props.matrikkelnummertekst || '–'} ${p.props.kommunenummer ? '(' + p.props.kommunenummer + ')' : ''}</b></div>
      <div class="kv"><span>Tomteareal</span><b>${fmt(p.area, 0)} m²</b></div>
      <div class="kv"><span>Høydeforskjell på tomta</span><b>${slope != null ? fmt(slope) + ' m' : '–'}</b></div>
      <div class="kv"><span>Terreng (moh.)</span><b>${T && isFinite(T.zmin) ? fmt(T.zmin, 0) + '–' + fmt(T.zmax, 0) : '–'}</b></div>
      <div class="kv"><span>Eksisterende bygg på tomta</span><b>${nOn}</b></div>
      <div class="kv"><span>Nabobygg i 150 m</span><b>${S.env.buildings.length - nOn}</b></div>
      <div class="kv"><span>Nøyaktighet grense</span><b>${p.props['nøyaktighetsklasseteig'] || '–'}</b></div>
      <button class="btn btn-red full" onclick="Planner.goStep(2)">Neste: velg hus →</button>`;
  }

  /* ---------- house ---------- */
  function houseSpec() {
    const n = +$('modCount').value || 1, len = +$('modLen').value || 10, w = +$('modWidth').value || 3.9;
    const floors = +$('floors').value || 1, roof = $('roof').value, level = $('level').value;
    const a = n * w, W = Math.max(a, len), D = Math.min(a, len);
    const gesims = floors * 2.9 + 0.6;
    const rise = roof === 'saltak' ? (D / 2) * Math.tan(27 * Math.PI / 180) : roof === 'pult' ? D * Math.tan(8 * Math.PI / 180) : 0.4;
    const mone = gesims + rise;
    const shadowH = roof === 'saltak' ? gesims + rise * 0.55 : roof === 'pult' ? gesims + rise * 0.5 : mone;
    const footprint = W * D, bra = footprint * floors * 0.9;
    return { n, len, w, floors, roof, level, W, D, gesims, mone, shadowH, footprint, bra, modules: n * floors };
  }
  function requiredSetback() {
    const sb = +$('setback').value;
    const h = houseSpec();
    return sb >= 4 ? Math.max(sb, h.gesims / 2) : sb;
  }
  function renderHouseSummary() {
    const h = houseSpec(), L0 = LEVELS[h.level];
    const lo = h.bra * L0.kr[0], hi = h.bra * L0.kr[1];
    const weeks = L0.perWeek ? Math.ceil(h.modules / L0.perWeek) : Math.ceil(h.footprint * h.floors / 120);
    $('houseSummary').innerHTML = `<h4>${L0.name}</h4>
      <div class="kv"><span>Fotavtrykk</span><b>${fmt(h.W)} × ${fmt(h.D)} m = ${fmt(h.footprint, 0)} m² BYA</b></div>
      <div class="kv"><span>Bruksareal (ca.)</span><b>${fmt(h.bra, 0)} m² BRA</b></div>
      <div class="kv"><span>Antall moduler</span><b>${h.modules}</b></div>
      <div class="kv"><span>Gesims / møne</span><b>${fmt(h.gesims)} / ${fmt(h.mone)} m</b></div>
      <div class="kv"><span>Fabrikkproduksjon</span><b>ca. ${weeks} uke${weeks > 1 ? 'r' : ''}</b></div>
      <div class="kv"><span>På byggeplass</span><b>${L0.site}</b></div>
      <div class="kv"><span>Grovt kostnadsanslag*</span><b>${fmt(lo / 1e6)}–${fmt(hi / 1e6)} MNOK</b></div>
      <p class="hint">*Veiledende bransjesnitt eks. tomt og grunnarbeid. Ikke et tilbud – be om pris fra Lindal Modul.</p>`;
    if ($('ecoStats') && typeof AI !== 'undefined' && AI.carbonCalc) {
      const c = AI.carbonCalc(h.bra);
      $('ecoStats').innerHTML = `<b>${c.co2SavedTons} tonn CO2</b> bundet i konstruksjonstre (${c.woodVolumeM3} m³ virke). Sparer ca. <b>${c.netSavingsTons} tonn CO2-ekvivalenter</b> mot tradisjonelt betongbygg. PEFC-sertifisert norsk trelast.`;
    }
    if (typeof Viewer3D !== 'undefined' && Viewer3D.render) {
      Viewer3D.render();
    }
  }

  /* ---------- evaluation ---------- */
  function obstaclesNear(cx, cy, r = 110) {
    const clear = $('clearPlot').checked;
    return S.env.buildings.filter(b => !(clear && b.onPlot) && Math.hypot(b.cen[0] - cx, b.cen[1] - cy) < r).map(b => ({ poly: b.xy, h: b.h }));
  }
  function geomFor(cx, cy, facing, h) {
    const poly = Geo.rect(cx, cy, h.W, h.D, facing);
    const n = Geo.bearingVec(facing);
    const front = [cx + n[0] * h.D / 2, cy + n[1] * h.D / 2];
    const terrace = [cx + n[0] * (h.D / 2 + 2.5), cy + n[1] * (h.D / 2 + 2.5)];
    return { poly, n, front, terrace };
  }
  function cheapValid(g, req, blockers) {
    for (const p of g.poly) if (!Geo.inside(p, S.plot.xy)) return { ok: false, inside: false };
    const minDist = Geo.polyDist(g.poly, S.plot.xy);
    if (minDist < req - 0.01) return { ok: false, inside: true, minDist };
    for (const b of blockers) if (Geo.polysIntersect(g.poly, b)) return { ok: false, inside: true, minDist, overlap: true };
    return { ok: true, inside: true, minDist };
  }
  function partialScores(cx, cy, facing, g, h) {
    const zs = g.poly.map(p => zAt(p[0], p[1])).concat([zAt(cx, cy)]);
    const terrainDiff = Math.max(...zs) - Math.min(...zs);
    const garden = Math.min(Geo.rayHit(g.front, g.n, S.plot.xy), 40);
    let roadDist = null;
    if (S.env.roads.length) {
      roadDist = Infinity;
      for (const r of S.env.roads) for (let i = 1; i < r.xy.length; i++) for (const p of g.poly) roadDist = Math.min(roadDist, Geo.distSeg(p, r.xy[i - 1], r.xy[i]));
    }
    const T = S.terrain, zc = zAt(cx, cy);
    const view = T && T.zmax > T.zmin ? (zc - T.zmin) / (T.zmax - T.zmin) : 0.5;
    return {
      terrainDiff, garden, roadDist, zc,
      s: {
        terrain: 1 - Math.min(terrainDiff, 4) / 4,
        garden: Math.min(garden, 20) / 20,
        access: roadDist == null ? 0.5 : 1 - Math.max(0, Math.min(1, (roadDist - 5) / 40)),
        view: Math.max(0, Math.min(1, view)),
        sunApprox: Math.max(0, Math.cos(Geo.angDiff(facing, 200) * Math.PI / 180))
      }
    };
  }
  function weights() {
    return { sun: +$('wSun').value, garden: +$('wGarden').value, terrain: +$('wTerrain').value, access: +$('wAccess').value, view: +$('wView').value };
  }
  const equinox = () => ({ y: new Date().getFullYear(), m: 2, d: 20 });
  const midsummer = () => ({ y: new Date().getFullYear(), m: 5, d: 21 });
  let maxSunCache = null;
  function maxSun() {
    if (maxSunCache && maxSunCache.k === Geo.origin.lat) return maxSunCache.v;
    const o = Geo.origin; let v = 0;
    for (const f of [180, 200, 220, 240]) v = Math.max(v, Sun.sunHours([0, 0], f, equinox(), o.lat, o.lon, []).hours);
    maxSunCache = { k: o.lat, v }; return v;
  }

  function fullEval(cx, cy, facing) {
    const h = houseSpec(), g = geomFor(cx, cy, facing, h), req = requiredSetback();
    const clear = $('clearPlot').checked;
    const blockers = S.env.buildings.filter(b => !(clear && b.onPlot) && b.onPlot).map(b => b.xy);
    const v = cheapValid(g, req, blockers);
    let minDist = v.minDist; if (minDist == null) minDist = Geo.polyDist(g.poly, S.plot.xy);
    const overlap = blockers.some(b => Geo.polysIntersect(g.poly, b));
    const ps = partialScores(cx, cy, facing, g, h);
    const obs = obstaclesNear(cx, cy);
    const o = Geo.origin;
    const eq = Sun.sunHours(g.terrace, facing, equinox(), o.lat, o.lon, obs);
    const su = Sun.sunHours(g.terrace, facing, midsummer(), o.lat, o.lon, obs);
    const sun15 = !Sun.shaded(g.terrace, Sun.position(Sun.osloDate(equinox().y, 2, 20, 15), o.lat, o.lon), obs.concat([{ poly: g.poly, h: h.shadowH }]));
    const s = { ...ps.s, sun: Math.min(1, eq.hours / (maxSun() || 1)) };
    const w = weights(), ws = w.sun + w.garden + w.terrain + w.access + w.view || 1;
    const score = 100 * (w.sun * s.sun + w.garden * s.garden + w.terrain * s.terrain + w.access * s.access + w.view * s.view) / ws;
    return { cx, cy, facing, g, h, req, valid: v.inside && minDist >= req - 0.01 && !overlap, inside: v.inside !== false && g.poly.every(p => Geo.inside(p, S.plot.xy)), minDist, overlap, ...ps, s, eq, su, sun15, score };
  }

  /* ---------- AI optimizer ---------- */
  async function optimize() {
    if (!S.plot) { toast('Velg en tomt først.'); return; }
    const btn = $('btnOptimize'); btn.disabled = true;
    const bar = $('optProgress'); bar.classList.remove('hidden');
    const h = houseSpec(), req = requiredSetback(), b = S.plot.bbox;
    const clear = $('clearPlot').checked;
    const blockers = S.env.buildings.filter(x => x.onPlot && !clear).map(x => x.xy);
    const step = Math.max(0.75, Math.sqrt(S.plot.area) / 28);
    const facings = new Set(); for (let f = 0; f < 360; f += 10) facings.add(f);
    const P = S.plot.xy;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const len = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]); if (len < 6) continue;
      const brg = (Math.atan2(P[i][0] - P[j][0], P[i][1] - P[j][1]) * 180 / Math.PI + 360) % 360;
      for (const k of [90, 270]) facings.add(Math.round((brg + k) % 360));
    }
    const fl = [...facings];
    const w = weights(), ws = w.sun + w.garden + w.terrain + w.access + w.view || 1;
    const cands = []; let tested = 0;
    for (let fi = 0; fi < fl.length; fi++) {
      const f = fl[fi];
      for (let y = b.y0; y <= b.y1; y += step) for (let x = b.x0; x <= b.x1; x += step) {
        tested++;
        if (!Geo.inside([x, y], P)) continue;
        const g = geomFor(x, y, f, h);
        if (!cheapValid(g, req, blockers).ok) continue;
        const ps = partialScores(x, y, f, g, h);
        const sc = (w.sun * ps.s.sunApprox + w.garden * ps.s.garden + w.terrain * ps.s.terrain + w.access * ps.s.access + w.view * ps.s.view) / ws;
        cands.push({ x, y, f, sc });
      }
      bar.firstElementChild.style.width = (60 * (fi + 1) / fl.length) + '%';
      if (fi % 3 === 0) await new Promise(r => setTimeout(r));
    }
    if (!cands.length) {
      btn.disabled = false; bar.classList.add('hidden');
      $('suggestions').innerHTML = `<div class="info-card"><h4>Ingen lovlig plassering funnet</h4>Huset (${fmt(h.W)}×${fmt(h.D)} m) får ikke plass med ${fmt(req)} m avstand til nabogrense${blockers.length ? ' uten å treffe eksisterende bygg' : ''}. Prøv færre moduler, kortere moduler, kryss av for riving – eller snakk med arkitekten om dispensasjon/nabosamtykke.</div>`;
      return;
    }
    cands.sort((a, c) => c.sc - a.sc);
    const top = cands.slice(0, 260), full = [];
    for (let i = 0; i < top.length; i++) {
      full.push(fullEval(top[i].x, top[i].y, top[i].f));
      if (i % 20 === 0) { bar.firstElementChild.style.width = (60 + 40 * i / top.length) + '%'; await new Promise(r => setTimeout(r)); }
    }
    full.sort((a, c) => c.score - a.score);
    const picks = [];
    for (const c of full) {
      if (picks.every(p => Math.hypot(p.cx - c.cx, p.cy - c.cy) > 5 || Geo.angDiff(p.facing, c.facing) > 40)) picks.push(c);
      if (picks.length === 3) break;
    }
    S.suggestions = picks;
    bar.firstElementChild.style.width = '100%';
    setTimeout(() => bar.classList.add('hidden'), 500);
    btn.disabled = false;
    renderSuggestions(tested, cands.length);
    applySuggestion(0);
  }
  function compassName(b) { return ['nord', 'nordøst', 'øst', 'sørøst', 'sør', 'sørvest', 'vest', 'nordvest'][Math.round(b / 45) % 8]; }
  function explain(c) {
    const parts = [];
    parts.push(`Hovedfasaden vender mot ${compassName(c.facing)} (${Math.round(c.facing)}°)`);
    parts.push(`terrassen får ${fmt(c.eq.hours)} soltimer ved jevndøgn og ${fmt(c.su.hours)} t ved sankthans${c.su.last ? ' (sol til ' + Sun.fmt(c.su.last) + ')' : ''}`);
    parts.push(`${fmt(c.garden, 0)} m hage foran huset`);
    parts.push(c.terrainDiff < 1 ? 'nesten flatt under huset' : `${fmt(c.terrainDiff)} m terrengfall under huset${c.terrainDiff > 2 ? ' – egner seg for sokkel/underetasje' : ''}`);
    if (c.roadDist != null) parts.push(`${fmt(c.roadDist, 0)} m til vei`);
    return parts.join(', ') + '.';
  }
  function renderSuggestions(tested, valid) {
    const lab = { sun: '☀️ Sol', garden: '🌳 Hage', terrain: '⛰️ Terreng', access: '🚗 Adkomst', view: '🏔️ Utsikt' };
    $('suggestions').innerHTML = `<p class="hint">AI testet ${tested.toLocaleString('nb-NO')} plasseringer, ${valid.toLocaleString('nb-NO')} var lovlige. Topp ${S.suggestions.length}:</p>` +
      S.suggestions.map((c, i) => `<div class="sugg" data-i="${i}">
        <div class="sugg-head"><b>Forslag ${String.fromCharCode(65 + i)}</b><span class="score">${Math.round(c.score)}/100</span></div>
        <div class="bars">${Object.keys(lab).map(k => `<div class="bar"><span>${lab[k]}</span><i><em style="width:${Math.round(c.s[k] * 100)}%"></em></i><span>${Math.round(c.s[k] * 100)}</span></div>`).join('')}</div>
        <p class="why">${explain(c)}</p></div>`).join('');
    document.querySelectorAll('.sugg').forEach(el => el.onclick = () => applySuggestion(+el.dataset.i));
  }
  function applySuggestion(i) {
    const c = S.suggestions[i]; if (!c) return;
    S.activeSugg = i;
    S.house.cx = c.cx; S.house.cy = c.cy; S.house.facing = c.facing;
    document.querySelectorAll('.sugg').forEach(el => el.classList.toggle('active', +el.dataset.i === i));
    $('rotSlider').value = Math.round(c.facing);
    refresh();
  }

  /* ---------- rendering ---------- */
  let rafPending = false;
  function refresh() {
    if (rafPending) return; rafPending = true;
    requestAnimationFrame(() => { rafPending = false; render(); });
  }
  function render() {
    renderHouseSummary();
    if (!S.plot) return;
    drawSetback();
    const h = houseSpec(), H = S.house, g = geomFor(H.cx, H.cy, H.facing, h);
    const o = Geo.origin, day = S.day || equinox();
    const date = Sun.osloDate(day.y, day.m, day.d, S.hour);
    const sun = Sun.position(date, o.lat, o.lon);
    // shadows
    L_shadow.clearLayers();
    const clear = $('clearPlot').checked;
    const casters = S.env.buildings.filter(b => !(clear && b.onPlot)).map(b => ({ poly: b.xy, h: b.h })).concat([{ poly: g.poly, h: h.shadowH }]);
    for (const c of casters) {
      const sh = Sun.shadow(c.poly, c.h, sun);
      if (sh) L.polygon(sh.map(ll), { pane: 'shadows', stroke: false, fillColor: '#000', fillOpacity: .26, interactive: false }).addTo(L_shadow);
    }
    // house
    L_house.clearLayers();
    L.polygon(g.poly.map(ll), { color: '#fff', weight: 2, fillColor: '#75151E', fillOpacity: .9 }).addTo(L_house)
      .bindTooltip(`${fmt(h.W)} × ${fmt(h.D)} m · ${h.floors} etg`, { direction: 'top' });
    L.polyline([g.poly[0], g.poly[1]].map(ll), { color: '#f2b705', weight: 5, interactive: false }).addTo(L_house);
    L.circleMarker(ll(g.terrace), { radius: 6, color: '#fff', weight: 2, fillColor: '#f2b705', fillOpacity: 1 }).addTo(L_house).bindTooltip('Terrasse / uteplass');
    // module divisions
    for (let k = 1; k < h.n; k++) {
      const a = (h.n * h.w >= h.len);
      if (!a) continue;
      const t = k / h.n, p0 = lerp(g.poly[1], g.poly[0], t), p1 = lerp(g.poly[2], g.poly[3], t);
      L.polyline([p0, p1].map(ll), { color: '#fff', weight: 1, opacity: .6, dashArray: '2 3', interactive: false }).addTo(L_house);
    }
    if (!handle) {
      handle = L.marker(ll([H.cx, H.cy]), { draggable: true, icon: L.divIcon({ className: 'house-handle', iconSize: [20, 20] }), zIndexOffset: 1000 }).addTo(map);
      handle.on('drag', e => { const p = Geo.toXY(e.latlng.lat, e.latlng.lng); S.house.cx = p[0]; S.house.cy = p[1]; S.activeSugg = -1; document.querySelectorAll('.sugg').forEach(el => el.classList.remove('active')); refresh(); });
    } else handle.setLatLng(ll([H.cx, H.cy]));
    // sun ray
    L_sun.clearLayers();
    if (sun.altitude > 0) {
      const v = Geo.bearingVec(sun.bearing), end = [H.cx + v[0] * 45, H.cy + v[1] * 45];
      L.polyline([ll([H.cx, H.cy]), ll(end)], { color: '#f2b705', weight: 2, dashArray: '4 6', interactive: false }).addTo(L_sun);
      L.marker(ll(end), { icon: L.divIcon({ className: 'sun-icon', html: '☀️', iconSize: [28, 28] }), interactive: false }).addTo(L_sun);
    }
    document.querySelector('#compass .needle').style.transform = `rotate(${sun.bearing}deg)`;
    $('rotLbl').textContent = `${Math.round(H.facing)}° (${compassName(H.facing)})`;
    $('timeLbl').textContent = Sun.fmt(S.hour);
    renderChecks(sun, day);
  }
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  function renderChecks(sun, day) {
    const H = S.house, c = fullEval(H.cx, H.cy, H.facing), h = c.h, o = Geo.origin;
    S.current = c;
    const dl = Sun.dayLength(day, o.lat, o.lon);
    const obs = obstaclesNear(H.cx, H.cy).concat([{ poly: c.g.poly, h: h.shadowH }]);
    const terrSunNow = sun.altitude > 0 && !Sun.shaded(c.g.terrace, sun, obs);
    const dayHrs = Sun.sunHours(c.g.terrace, H.facing, day, o.lat, o.lon, obstaclesNear(H.cx, H.cy));
    $('sunInfo').innerHTML = `<div class="kv"><span>Solhøyde / retning</span><b>${fmt(sun.altitude)}° / ${Math.round(sun.bearing)}° ${compassName(sun.bearing)}</b></div>
      <div class="kv"><span>Soloppgang – nedgang</span><b>${Sun.fmt(dl.rise)} – ${Sun.fmt(dl.set)}</b></div>
      <div class="kv"><span>Terrassen nå</span><b>${terrSunNow ? '☀️ Sol' : '🌥️ Skygge'}</b></div>
      <div class="kv"><span>Soltimer terrasse denne dagen</span><b>${fmt(dayHrs.hours)} t (${Sun.fmt(dayHrs.first)}–${Sun.fmt(dayHrs.last)})</b></div>`;
    const existing = $('clearPlot').checked ? 0 : S.env.buildings.filter(b => b.onPlot).reduce((s, b) => s + b.area, 0);
    const byaTot = h.footprint + 36 + existing, byaPct = 100 * byaTot / S.plot.area, maxBya = +$('maxBya').value;
    const rows = [];
    const add = (st, title, txt) => rows.push(`<div class="check ${st}"><span class="ic">${st === 'ok' ? '✓' : st === 'warn' ? '!' : '✕'}</span><div><b>${title}</b><br>${txt}</div></div>`);
    add(c.inside ? 'ok' : 'bad', 'Innenfor tomtegrensen', c.inside ? 'Hele huset står på egen tomt.' : 'Deler av huset står utenfor tomta.');
    add(c.minDist >= c.req - 0.01 ? 'ok' : (c.minDist >= 1 ? 'warn' : 'bad'), 'Avstand til nabogrense (PBL § 29-4)', `Minste avstand ${fmt(c.minDist)} m, krav ${fmt(c.req)} m${c.minDist < c.req ? ' – krever nabosamtykke eller dispensasjon.' : '.'}`);
    add(byaPct <= maxBya ? 'ok' : 'bad', `Utnyttelse (BYA maks ${maxBya} %)`, `${fmt(byaTot, 0)} m² = ${fmt(byaPct)} % inkl. 2 p-plasser á 18 m²${existing ? ' og eksisterende bygg' : ''}.`);
    add(h.gesims <= 8 ? 'ok' : 'bad', 'Gesimshøyde ≤ 8 m', `${fmt(h.gesims)} m${h.gesims > 8 ? ' – krever hjemmel i reguleringsplan.' : '.'}`);
    add(h.mone <= 9 ? 'ok' : 'bad', 'Mønehøyde ≤ 9 m', `${fmt(h.mone)} m${h.mone > 9 ? ' – krever hjemmel i reguleringsplan.' : '.'}`);
    add(!c.overlap ? 'ok' : 'bad', 'Konflikt med eksisterende bygg', c.overlap ? 'Huset overlapper et eksisterende bygg. Flytt huset eller kryss av for riving.' : 'Ingen konflikt.');
    add(c.terrainDiff < 1.5 ? 'ok' : 'warn', 'Terreng under huset', `${fmt(c.terrainDiff)} m høydeforskjell${c.terrainDiff >= 1.5 ? ' – vurder sokkel, underetasje eller terrengtilpasning.' : ' – enkel grunnmur.'}`);
    add(c.sun15 ? 'ok' : 'warn', 'Sol på uteplass kl. 15 ved vårjevndøgn', c.sun15 ? 'Oppfyller vanlig kommunalt krav til solforhold på uteoppholdsareal.' : 'Uteplassen ligger i skygge – mange kommuner krever sol her.');
    add(c.eq.hours >= 5 ? 'ok' : c.eq.hours >= 3 ? 'warn' : 'bad', 'Soltimer terrasse (jevndøgn)', `${fmt(c.eq.hours)} timer.`);
    add(h.w <= 4.2 ? 'ok' : 'warn', 'Modultransport', h.w <= 4.2 ? `Modulbredde ${fmt(h.w)} m – vanlig transport med kranbil.` : `Modulbredde ${fmt(h.w)} m krever spesialtransport.`);
    if (c.roadDist != null) add(c.roadDist <= 30 ? 'ok' : 'warn', 'Adkomst for kranbil', `${fmt(c.roadDist, 0)} m fra huset til nærmeste vei.`);
    $('checks').innerHTML = rows.join('');
  }

  /* ---------- context for AI ---------- */
  function context() {
    if (!S.plot) return null;
    const c = S.current || fullEval(S.house.cx, S.house.cy, S.house.facing), h = c.h;
    return {
      adresse: S.address ? `${S.address.text}${S.address.sted ? ', ' + S.address.sted : ''}` : null,
      kommune: S.address && S.address.kommune, gnrbnr: S.plot.props.matrikkelnummertekst,
      tomteareal_m2: Math.round(S.plot.area), hoydeforskjell_tomt_m: S.terrain ? +(S.terrain.zmax - S.terrain.zmin).toFixed(1) : null,
      eksisterende_bygg_paa_tomta: S.env.buildings.filter(b => b.onPlot).length, nabobygg: S.env.buildings.filter(b => !b.onPlot).length,
      hus: { type: LEVELS[h.level].name, moduler: h.modules, etasjer: h.floors, tak: h.roof, fotavtrykk: `${h.W.toFixed(1)} x ${h.D.toFixed(1)} m`, BYA_m2: Math.round(h.footprint), BRA_m2: Math.round(h.bra), gesims_m: +h.gesims.toFixed(1), mone_m: +h.mone.toFixed(1) },
      plassering: { hovedfasade_mot: `${Math.round(c.facing)}° (${compassName(c.facing)})`, min_avstand_nabogrense_m: +c.minDist.toFixed(1), krav_avstand_m: +c.req.toFixed(1), hage_foran_m: Math.round(c.garden), terrengfall_under_hus_m: +c.terrainDiff.toFixed(1), vei_avstand_m: c.roadDist != null ? Math.round(c.roadDist) : null, soltimer_jevndogn: c.eq.hours, soltimer_sankthans: c.su.hours, sol_kl15_jevndogn: c.sun15, ai_score: Math.round(c.score), gyldig: c.valid },
      bya_prosent_inkl_parkering: +(100 * (h.footprint + 36) / S.plot.area).toFixed(1), maks_bya: +$('maxBya').value
    };
  }

  /* ---------- report ---------- */
  function svgSketch() {
    const P = S.plot.xy, c = S.current, b = Geo.bbox(P), pad = 8;
    const w = b.x1 - b.x0 + 2 * pad, hgt = b.y1 - b.y0 + 2 * pad;
    const tx = p => `${(p[0] - b.x0 + pad).toFixed(2)},${(b.y1 + pad - p[1]).toFixed(2)}`;
    const blds = S.env.buildings.filter(x => x.xy.some(p => p[0] > b.x0 - pad && p[0] < b.x1 + pad && p[1] > b.y0 - pad && p[1] < b.y1 + pad));
    return `<svg viewBox="0 0 ${w} ${hgt}" width="100%" style="max-height:120mm;border:1px solid #ccc" xmlns="http://www.w3.org/2000/svg">
      ${blds.map(x => `<polygon points="${x.xy.map(tx).join(' ')}" fill="#bbb" stroke="#777" stroke-width=".2"/>`).join('')}
      <polygon points="${P.map(tx).join(' ')}" fill="none" stroke="#4D87BD" stroke-width=".5" stroke-dasharray="1.5 1"/>
      <polygon points="${Geo.offsetInward(P, c.req).map(tx).join(' ')}" fill="rgba(77,135,189,.12)" stroke="none"/>
      <polygon points="${c.g.poly.map(tx).join(' ')}" fill="#75151E"/>
      <line x1="${tx(c.g.poly[0]).split(',')[0]}" y1="${tx(c.g.poly[0]).split(',')[1]}" x2="${tx(c.g.poly[1]).split(',')[0]}" y2="${tx(c.g.poly[1]).split(',')[1]}" stroke="#f2b705" stroke-width=".8"/>
      <g transform="translate(${w - 5},6)"><path d="M0,-4 L2,3 L0,2 L-2,3 Z" fill="#000"/><text y="-5" font-size="3" text-anchor="middle">N</text></g>
      <g transform="translate(3,${hgt - 3})"><rect width="10" height=".8" fill="#000"/><text y="-1" font-size="2.4">10 m</text></g></svg>`;
  }
  function printReport() {
    if (!S.plot) { toast('Ingen tomt valgt.'); return; }
    const cx = context(), c = S.current;
    const checks = $('checks').innerHTML;
    $('report').innerHTML = `<h1>Tomterapport – Lindal Modul Arkitekter</h1>
      <p><b>${cx.adresse || ''}</b> · Gnr/bnr ${cx.gnrbnr || '–'} · Generert ${new Date().toLocaleDateString('nb-NO')}</p>
      ${svgSketch()}
      <h2>Nøkkeltall</h2><table>
      <tr><td>Tomteareal</td><td>${cx.tomteareal_m2} m²</td></tr>
      <tr><td>Hus</td><td>${cx.hus.type}, ${cx.hus.moduler} moduler, ${cx.hus.etasjer} etg, ${cx.hus.fotavtrykk}</td></tr>
      <tr><td>BYA / BRA</td><td>${cx.hus.BYA_m2} m² / ${cx.hus.BRA_m2} m²</td></tr>
      <tr><td>Gesims / møne</td><td>${cx.hus.gesims_m} / ${cx.hus.mone_m} m</td></tr>
      <tr><td>Hovedfasade</td><td>${cx.plassering.hovedfasade_mot}</td></tr>
      <tr><td>Soltimer terrasse</td><td>${cx.plassering.soltimer_jevndogn} t (jevndøgn) · ${cx.plassering.soltimer_sankthans} t (sankthans)</td></tr>
      <tr><td>AI-score</td><td>${cx.plassering.ai_score}/100</td></tr></table>
      <h2>AI-vurdering</h2><p>${explain(c)}</p>
      <h2>Regelsjekk</h2>${checks}
      <p style="font-size:9pt;color:#666">Veiledende analyse basert på åpne data fra Kartverket/Geonorge og OpenStreetMap. Gjeldende reguleringsplan og kommunens saksbehandling går foran. Kontakt Lindal Modul Arkitekter, tlf. 901 70 100.</p>`;
    setTimeout(() => window.print(), 100);
  }

  /* ---------- steps ---------- */
  function currentStep() { const a = document.querySelector('.step.active'); return a ? +a.dataset.step : 1; }
  function goStep(n) {
    document.querySelectorAll('.step').forEach(s => { const k = +s.dataset.step; s.classList.toggle('active', k === n); s.classList.toggle('done', k < n); });
    document.querySelectorAll('.step-body').forEach(b => b.classList.toggle('hidden', +b.dataset.body !== n));
    if (n === 2 && typeof Viewer3D !== 'undefined') {
      setTimeout(() => {
        if (Viewer3D.resize) Viewer3D.resize();
        else if (Viewer3D.render) Viewer3D.render();
      }, 50);
    }
    if (n === 4) refresh();
  }

  function init() {
    initMap();
    // presets
    $('presets').innerHTML = PRESETS.map(p => `<button class="preset" data-id="${p.id}"><b>${p.name}</b>${p.desc}</button>`).join('');
    document.querySelectorAll('.preset').forEach(btn => btn.onclick = () => {
      const p = PRESETS.find(x => x.id === btn.dataset.id);
      $('modCount').value = p.n; $('modLen').value = p.len; $('modWidth').value = p.w; $('floors').value = p.floors; $('roof').value = p.roof;
      document.querySelectorAll('.preset').forEach(b => b.classList.toggle('active', b === btn));
      S.suggestions = []; $('suggestions').innerHTML = ''; refresh();
    });
    document.querySelector('.preset[data-id="enebolig"]').classList.add('active');
    ['modCount', 'modLen', 'modWidth', 'floors', 'roof', 'level', 'setback', 'maxBya'].forEach(id => $(id).addEventListener('input', refresh));
    $('clearPlot').addEventListener('change', () => { drawEnv(); refresh(); });
    document.querySelectorAll('.step').forEach(s => s.onclick = () => goStep(+s.dataset.step));
    $('btnOptimize').onclick = optimize;
    $('btnDrawPlot').onclick = startDraw;
    $('btnFinishDraw').onclick = finishDraw;
    $('rotSlider').addEventListener('input', e => { S.house.facing = +e.target.value; refresh(); });
    $('timeSlider').addEventListener('input', e => { S.hour = +e.target.value; refresh(); });
    S.day = equinox();
    $('dateInput').value = `${S.day.y}-03-20`;
    document.querySelectorAll('.date-presets .chip').forEach(ch => ch.onclick = () => {
      const [m, d] = ch.dataset.date.split('-').map(Number);
      S.day = { y: new Date().getFullYear(), m: m - 1, d };
      $('dateInput').value = `${S.day.y}-${ch.dataset.date}`;
      document.querySelectorAll('.date-presets .chip').forEach(x => x.classList.toggle('active', x === ch));
      refresh();
    });
    $('dateInput').addEventListener('change', e => {
      const [y, m, d] = e.target.value.split('-').map(Number); if (!y) return;
      S.day = { y, m: m - 1, d }; document.querySelectorAll('.date-presets .chip').forEach(x => x.classList.remove('active')); refresh();
    });
    let playing = null;
    $('btnPlay').onclick = () => {
      if (playing) { clearInterval(playing); playing = null; $('btnPlay').textContent = '▶ Spill av dagen'; return; }
      $('btnPlay').textContent = '⏸ Stopp';
      playing = setInterval(() => {
        S.hour += 0.25; if (S.hour > 23) S.hour = 4;
        $('timeSlider').value = S.hour; refresh();
      }, 120);
    };
    $('btnReport').onclick = printReport;
    renderHouseSummary();
  }

  return { init, loadPlotAt, goStep, context, explain: () => S.current && explain(S.current), get state() { return S; }, LEVELS, toast };
})();
