// Automated unit test for JS math & logic in lindal-modul
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Mock browser objects
global.window = global;
global.window.addEventListener = () => {};
global.document = {
  getElementById: (id) => ({
    value: '10',
    addEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} }
  }),
  addEventListener: () => {}
};

const vm = require('vm');

// 1. Load Geo
const geoCode = fs.readFileSync(path.join(__dirname, '../lindal-modul/js/geo.js'), 'utf8');
vm.runInThisContext(geoCode);

assert(typeof Geo !== 'undefined', 'Geo module defined');
Geo.setOrigin(58.6128, 8.901);
const xy = Geo.toXY(58.6138, 8.902);
assert(typeof xy[0] === 'number' && typeof xy[1] === 'number', 'toXY returns coordinates');
const ll = Geo.toLL(xy[0], xy[1]);
assert(Math.abs(ll[0] - 58.6138) < 1e-4, 'toLL roundtrip');

const poly = Geo.rect(0, 0, 10, 4, 0);
assert.strictEqual(poly.length, 4, 'rect returns 4 corners');
const a = Geo.area(poly);
assert(Math.abs(a - 40) < 1e-4, 'rect area 40');
console.log('PASS: Geo computations verified!');

// 2. Load Sun
const sunCode = fs.readFileSync(path.join(__dirname, '../lindal-modul/js/sun.js'), 'utf8');
vm.runInThisContext(sunCode);
assert(typeof Sun !== 'undefined', 'Sun module defined');
const day = { y: 2026, m: 2, d: 20 }; // equinox
const pos = Sun.position(Sun.osloDate(2026, 2, 20, 12), 58.61, 8.90);
assert(pos.altitude > 0, 'Midday solar altitude positive');
console.log('PASS: Sun calculations verified! Noon alt:', pos.altitude.toFixed(1) + '°', 'bearing:', pos.bearing.toFixed(1) + '°');

// 3. Load AI
const aiCode = fs.readFileSync(path.join(__dirname, '../lindal-modul/js/ai.js'), 'utf8');
vm.runInThisContext(aiCode);
assert(typeof AI !== 'undefined', 'AI module defined');
const carb = AI.carbonCalc(120);
assert(carb.woodVolumeM3 > 0, 'carbonCalc wood volume positive');
assert(carb.co2SavedTons > 0, 'carbonCalc co2 saved positive');
const localResp = AI.local('Hva koster et modulbygg?');
assert(localResp.includes('MNOK'), 'AI local responds with pricing info');

// Test ALL quick button queries from HTML
const quickQueries = [
  { q: 'Oppsummer tomteanalysen min', match: /tomteanalyse|planleggeren/i },
  { q: 'Beregn CO2-besparelse i tre', match: /karbon|co2/i },
  { q: 'Hva koster et modulbygg?', match: /MNOK|budsjett|kostnad/i },
  { q: 'Trenger jeg å søke om byggetillatelse?', match: /søknadspliktig|søke/i },
  { q: 'Hvilken leveranse fra Lindal passer meg?', match: /leveransemodeller|moduler/i },
  { q: 'Lag en sjekkliste for byggesøknad', match: /sjekkliste/i },
  { q: 'Hvor lang tid tar det å bygge?', match: /tidslinje|byggetid/i },
  { q: 'Skriv prosjektbeskrivelse til arkitekten', match: /prosjektbeskrivelse/i }
];

for (const { q, match } of quickQueries) {
  const resp = AI.local(q);
  assert(match.test(resp), `Query '${q}' must match ${match}, got: ${resp.slice(0, 60)}...`);
}
console.log('PASS: All 8 quick question queries verified!');

// 4. Load Viewer3D
let drawnOps = [];
global.document.getElementById = (id) => ({
  value: '3',
  getContext: () => ({
    clearRect: () => drawnOps.push('clearRect'),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => drawnOps.push('fill'),
    stroke: () => drawnOps.push('stroke'),
    scale: () => {},
    setTransform: () => {},
    fillText: () => {}
  }),
  getBoundingClientRect: () => ({ width: 350, height: 220 }),
  addEventListener: () => {}
});

const v3dCode = fs.readFileSync(path.join(__dirname, '../lindal-modul/js/viewer3d.js'), 'utf8');
vm.runInThisContext(v3dCode);
assert(typeof Viewer3D !== 'undefined', 'Viewer3D defined');
Viewer3D.init('module3D');
Viewer3D.render();
assert(drawnOps.includes('fill'), 'Viewer3D executed canvas fill operations');
Viewer3D.setMaterial('rod');
Viewer3D.setMaterial('mork');
Viewer3D.resetView();
console.log('PASS: Viewer3D canvas rendering and material switching verified!');

console.log('ALL JS MODULE TESTS PASSED!');
