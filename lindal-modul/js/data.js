/* Åpne datakilder: Kartverket/Geonorge + OpenStreetMap
   Integrerte åpne Geonorge API-endepunkter:
   - https://ws.geonorge.no/adresser/v1/sok (adressesøk og koordinater)
   - https://ws.geonorge.no/eiendom/v1/punkt/omrader (matrikkelteig og eiendomsgrenser)
   - https://ws.geonorge.no/hoydedata/v1/punkt (Kartverket DTM1 terrenghøydeprofil)
*/
const Data = (() => {
  const GN = 'https://ws.geonorge.no';

  async function json(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }

  async function searchAddress(q) {
    if (!q || q.length < 3) return [];
    const gnr = q.match(/^\s*(\d+)\s*\/\s*(\d+)\s*(.*)$/);
    let url;
    if (gnr) {
      url = `${GN}/adresser/v1/sok?gardsnummer=${gnr[1]}&bruksnummer=${gnr[2]}${gnr[3] ? '&kommunenavn=' + encodeURIComponent(gnr[3].trim()) : ''}&treffPerSide=8`;
    } else {
      url = `${GN}/adresser/v1/sok?sok=${encodeURIComponent(q)}&fuzzy=true&treffPerSide=8`;
    }
    const j = await json(url);
    return (j.adresser || []).map(a => ({
      text: a.adressetekst, sted: `${a.postnummer} ${a.poststed}`, kommune: a.kommunenavn, knr: a.kommunenummer,
      gnr: a.gardsnummer, bnr: a.bruksnummer, lat: a.representasjonspunkt.lat, lon: a.representasjonspunkt.lon
    }));
  }

  async function reverse(lat, lon) {
    try {
      const j = await json(`${GN}/adresser/v1/punktsok?lat=${lat}&lon=${lon}&radius=60&treffPerSide=1`);
      const a = j.adresser && j.adresser[0];
      return a ? { text: a.adressetekst, sted: `${a.postnummer} ${a.poststed}`, kommune: a.kommunenavn } : null;
    } catch { return null; }
  }

  /* eiendomsteig som dekker punktet */
  async function parcel(lat, lon) {
    const j = await json(`${GN}/eiendom/v1/punkt/omrader?nord=${lat}&ost=${lon}&koordsys=4258&radius=1&utkoordsys=4258`);
    const feats = (j.features || []).filter(f => f.geometry);
    if (!feats.length) return null;
    feats.sort((a, b) => (a.properties.meterFraPunkt || 0) - (b.properties.meterFraPunkt || 0));
    const f = feats[0];
    let ring;
    if (f.geometry.type === 'Polygon') ring = f.geometry.coordinates[0];
    else if (f.geometry.type === 'MultiPolygon') ring = f.geometry.coordinates.sort((a, b) => b[0].length - a[0].length)[0][0];
    else return null;
    return { ring: ring.map(([x, y]) => [y, x]), props: f.properties };
  }

  /* terrenghøyder for liste [lat,lon] (batch á 50) */
  async function heights(points) {
    const out = [];
    for (let i = 0; i < points.length; i += 50) {
      const chunk = points.slice(i, i + 50);
      const p = '[' + chunk.map(([la, lo]) => `[${lo.toFixed(7)},${la.toFixed(7)}]`).join(',') + ']';
      const j = await json(`${GN}/hoydedata/v1/punkt?koordsys=4258&punkter=${encodeURIComponent(p)}&geojson=false`);
      for (const pt of j.punkter) out.push(pt.z);
    }
    return out;
  }

  /* nabobygg + veier fra OpenStreetMap */
  async function surroundings(lat, lon, radius = 140) {
    const q = `[out:json][timeout:10];(way["building"](around:${radius},${lat},${lon});way["highway"]["highway"!~"footway|path|steps|cycleway|track"](around:${radius},${lat},${lon}););out geom;`;
    const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 6000);
        const j = await json(ep, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(q),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: controller.signal
        });
        clearTimeout(tid);
        const buildings = [], roads = [];
        for (const el of j.elements || []) {
          if (!el.geometry) continue;
          const ll = el.geometry.map(g => [g.lat, g.lon]);
          const t = el.tags || {};
          if (t.building) {
            let h = parseFloat(t.height);
            if (!h) {
              const lv = parseFloat(t['building:levels']);
              if (lv) h = lv * 3 + 1.5;
              else if (/garage|shed|carport|hut|roof|garages/.test(t.building)) h = 3;
              else if (/apartments|commercial|industrial|school|church/.test(t.building)) h = 11;
              else h = 7;
            }
            buildings.push({ ll, h, type: t.building });
          } else if (t.highway) roads.push({ ll, type: t.highway, name: t.name });
        }
        return { buildings, roads };
      } catch (e) { console.warn('Overpass', ep, e); }
    }
    return { buildings: [], roads: [] };
  }

  return { searchAddress, reverse, parcel, heights, surroundings };
})();
