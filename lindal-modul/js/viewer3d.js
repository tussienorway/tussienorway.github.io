/* 3D Modulvisualisator for Lindal Modul
   Tegner prefabrikkerte husmoduler i ekte 3D på HTML5 Canvas med rotasjon,
   arkitektonisk lyssetting, takformer, vinduer, modulskjøter og materialer */
const Viewer3D = (() => {
  let canvas, ctx, width, height;
  let angleX = 25 * Math.PI / 180;
  let angleY = 45 * Math.PI / 180;
  let zoom = 1.0;
  let isDragging = false;
  let lastMouseX = 0, lastMouseY = 0;
  let material = 'furu'; // 'furu', 'mork', 'rod', 'eik'

  const MATERIALS = {
    furu: {
      name: 'Malmfuru',
      wall: '#C8A97E',
      wallDark: '#9F8055',
      wallLight: '#DFBF92',
      roof: '#2D3130',
      trim: '#33261D',
      glass: '#A5C9D8',
      glassFrame: '#2A2A2A',
      door: '#4A3525'
    },
    mork: {
      name: 'Brent tre',
      wall: '#383633',
      wallDark: '#242321',
      wallLight: '#4D4A46',
      roof: '#1A1918',
      trim: '#151515',
      glass: '#8EB6C8',
      glassFrame: '#111111',
      door: '#7B5C3E'
    },
    rod: {
      name: 'Falu Rød',
      wall: '#75151E',
      wallDark: '#560F16',
      wallLight: '#8F1E28',
      roof: '#2E2D2B',
      trim: '#FFFFFF',
      glass: '#A5C9D8',
      glassFrame: '#FFFFFF',
      door: '#FFFFFF'
    },
    eik: {
      name: 'Lys Eik',
      wall: '#D7BC93',
      wallDark: '#B1966C',
      wallLight: '#E8D2AF',
      roof: '#343A40',
      trim: '#2B2B2B',
      glass: '#99C2D4',
      glassFrame: '#1F2421',
      door: '#343A40'
    }
  };

  // Solretning for arkitektonisk skyggelegging (kommer fra syd-sydvest høyt på himmelen)
  const LIGHT_DIR = normalizeVector([0.45, 0.85, 0.55]);

  function normalizeVector(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function crossProduct(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function shadeColor(hex, factor) {
    let clean = hex.replace('#', '');
    if (clean.length === 3) {
      clean = clean.split('').map(c => c + c).join('');
    }
    const num = parseInt(clean, 16) || 0;
    const r = Math.min(255, Math.max(0, Math.round(((num >> 16) & 255) * factor)));
    const g = Math.min(255, Math.max(0, Math.round(((num >> 8) & 255) * factor)));
    const b = Math.min(255, Math.max(0, Math.round((num & 255) * factor)));
    return `rgb(${r},${g},${b})`;
  }

  function init(canvasId) {
    canvas = document.getElementById(canvasId);
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    canvas.addEventListener('mousedown', e => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    canvas.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      angleY += dx * 0.008;
      angleX = Math.max(0.08, Math.min(Math.PI / 2.15, angleX + dy * 0.008));
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      render();
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      zoom = Math.max(0.4, Math.min(2.8, zoom - e.deltaY * 0.0012));
      render();
    }, { passive: false });

    // Touch support for mobile devices
    let lastTouchDist = 0;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
      if (e.cancelable) e.preventDefault();
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - lastMouseX;
        const dy = e.touches[0].clientY - lastMouseY;
        angleY += dx * 0.008;
        angleX = Math.max(0.08, Math.min(Math.PI / 2.15, angleX + dy * 0.008));
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
        render();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (lastTouchDist > 0) {
          zoom = Math.max(0.4, Math.min(2.8, zoom + (dist - lastTouchDist) * 0.005));
          render();
        }
        lastTouchDist = dist;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => { isDragging = false; lastTouchDist = 0; });

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
          resize();
        }
      });
      ro.observe(canvas);
    }
  }

  function resize() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    width = canvas.width = Math.round(rect.width * dpr);
    height = canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    render();
  }

  function setMaterial(mat) {
    if (MATERIALS[mat]) {
      material = mat;
      render();
    }
  }

  // 3D Point projection
  function project(x, y, z, cx, cy, scale) {
    const cosY = Math.cos(angleY), sinY = Math.sin(angleY);
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;

    const cosX = Math.cos(angleX), sinX = Math.sin(angleX);
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;

    const px = cx + x1 * scale;
    const py = cy - y2 * scale;
    return { x: px, y: py, depth: z2 };
  }

  function render() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (rect.width > 0 && rect.height > 0 && (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr))) {
      resize();
      return;
    }
    const w = rect.width || (width ? width / dpr : 300);
    const h = rect.height || (height ? height / dpr : 220);
    ctx.clearRect(0, 0, w, h);

    // Hent bygningskonfigurasjon fra UI
    const count = parseInt(document.getElementById('modCount')?.value || 3, 10);
    const modLen = parseFloat(document.getElementById('modLen')?.value || 10.2);
    const modWidth = parseFloat(document.getElementById('modWidth')?.value || 3.9);
    const floors = parseInt(document.getElementById('floors')?.value || 2, 10);
    const roof = document.getElementById('roof')?.value || 'saltak';

    const mat = MATERIALS[material] || MATERIALS.furu;

    // Totale dimensjoner
    const totalW = count * modWidth;
    const totalL = modLen;
    const floorH = 2.9; // meter per etasje
    const totalH = floors * floorH;
    const plinthH = 0.3; // fundamenthøyde

    // Sentrering og skalering
    const cx = w / 2;
    const cy = h / 2 + 35;
    const maxDim = Math.max(totalW, totalL, totalH + 4);
    const baseScale = (Math.min(w, h) * 0.44 / maxDim) * zoom;

    // 1. Bakkeplan & terrengnett
    drawGroundPlane(totalW, totalL, cx, cy, baseScale);

    // 2. Samle og sortere alle polygoner (Painter's algorithm for perfekt 360-graders visning)
    const polygonList = [];

    // Hjelper for å legge til polygon
    function addPoly(pts3D, baseColor, strokeColor = 'rgba(0,0,0,0.2)', isFlat = false, details = null) {
      const proj = pts3D.map(p => project(p[0], p[1], p[2], cx, cy, baseScale));
      // Beregn normalvektor
      const e1 = [pts3D[1][0] - pts3D[0][0], pts3D[1][1] - pts3D[0][1], pts3D[1][2] - pts3D[0][2]];
      const e2 = [pts3D[2][0] - pts3D[0][0], pts3D[2][1] - pts3D[0][1], pts3D[2][2] - pts3D[0][2]];
      const normal = normalizeVector(crossProduct(e1, e2));

      // 2D Winding check for backface culling (hvis normal peker bort fra kamera)
      const cross2D = (proj[1].x - proj[0].x) * (proj[2].y - proj[0].y) - (proj[1].y - proj[0].y) * (proj[2].x - proj[0].x);
      if (cross2D >= 0 && !isFlat) {
        return; // Flaten peker bort fra kameraet, kutt overdraw
      }

      // Beregn solbelysningsfaktor
      const dot = Math.max(0, normal[0] * LIGHT_DIR[0] + normal[1] * LIGHT_DIR[1] + normal[2] * LIGHT_DIR[2]);
      const brightness = 0.60 + 0.40 * dot;
      const shadedFill = baseColor.startsWith('#') ? shadeColor(baseColor, brightness) : baseColor;

      const avgDepth = proj.reduce((sum, p) => sum + p.depth, 0) / proj.length;

      polygonList.push({
        proj,
        fill: shadedFill,
        stroke: strokeColor,
        depth: avgDepth,
        details
      });
    }

    // A. Fundamentsokkel
    const pX0 = -totalW / 2 - 0.15, pX1 = totalW / 2 + 0.15;
    const pZ0 = -totalL / 2 - 0.15, pZ1 = totalL / 2 + 0.15;
    addBoxPolys(pX0, 0, pZ0, pX1, plinthH, pZ1, '#B0B2B5', '#8C8E90', '#D0D2D5', addPoly);

    // B. Moduler (etasje for etasje, modul for modul)
    for (let fl = 0; fl < floors; fl++) {
      const y0 = plinthH + fl * floorH;
      const y1 = y0 + floorH;

      for (let m = 0; m < count; m++) {
        const x0 = -totalW / 2 + m * modWidth;
        const x1 = x0 + modWidth;
        const z0 = -totalL / 2;
        const z1 = totalL / 2;

        addModulePolys(x0, y0, z0, x1, y1, z1, mat, m, fl, count, floors, addPoly);
      }
    }

    // C. Tak
    const roofY = plinthH + totalH;
    if (roof === 'saltak') {
      const pitchH = (modLen / 2) * Math.tan(27 * Math.PI / 180);
      addGabledRoofPolys(-totalW / 2 - 0.35, roofY, -totalL / 2 - 0.35, totalW / 2 + 0.35, roofY + pitchH, totalL / 2 + 0.35, mat, addPoly);
    } else if (roof === 'pult') {
      const pitchH = modLen * Math.tan(9 * Math.PI / 180);
      addMonoRoofPolys(-totalW / 2 - 0.35, roofY, -totalL / 2 - 0.35, totalW / 2 + 0.35, roofY + pitchH, totalL / 2 + 0.35, mat, addPoly);
    } else {
      // Flatt tak med moderne gesimskant
      const parapetH = 0.45;
      addBoxPolys(-totalW / 2 - 0.2, roofY, -totalL / 2 - 0.2, totalW / 2 + 0.2, roofY + parapetH, totalL / 2 + 0.2, mat.roof, shadeColor(mat.roof, 0.7), shadeColor(mat.roof, 1.2), addPoly);
    }

    // Sorter alle polygoner fra bakerst til fremst
    polygonList.sort((a, b) => a.depth - b.depth);

    // Tegn polygoner
    for (const poly of polygonList) {
      drawProjectedPoly(poly.proj, poly.fill, poly.stroke);
      if (poly.details) {
        poly.details();
      }
    }

    // 3. Dimensjonsangivelser
    const roofAddH = roof === 'saltak' ? (modLen / 2) * Math.tan(27 * Math.PI / 180) : roof === 'pult' ? modLen * Math.tan(9 * Math.PI / 180) : 0.45;
    drawDimensions(totalW, totalL, totalH + plinthH, roofAddH, cx, cy, baseScale);
  }

  function drawGroundPlane(totalW, totalL, cx, cy, scale) {
    const size = Math.max(totalW, totalL) * 1.6;
    const g0 = project(-size / 2, 0, -size / 2, cx, cy, scale);
    const g1 = project(size / 2, 0, -size / 2, cx, cy, scale);
    const g2 = project(size / 2, 0, size / 2, cx, cy, scale);
    const g3 = project(-size / 2, 0, size / 2, cx, cy, scale);

    // Bakkeplate
    ctx.beginPath();
    ctx.moveTo(g0.x, g0.y);
    ctx.lineTo(g1.x, g1.y);
    ctx.lineTo(g2.x, g2.y);
    ctx.lineTo(g3.x, g3.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(240, 243, 240, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(195, 205, 195, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Rutenett
    ctx.strokeStyle = 'rgba(180, 195, 180, 0.35)';
    ctx.lineWidth = 1;
    const steps = 6;
    for (let i = -steps; i <= steps; i++) {
      const pos = (i / steps) * (size / 2);
      const ga = project(pos, 0, -size / 2, cx, cy, scale);
      const gb = project(pos, 0, size / 2, cx, cy, scale);
      ctx.beginPath(); ctx.moveTo(ga.x, ga.y); ctx.lineTo(gb.x, gb.y); ctx.stroke();
      const gc = project(-size / 2, 0, pos, cx, cy, scale);
      const gd = project(size / 2, 0, pos, cx, cy, scale);
      ctx.beginPath(); ctx.moveTo(gc.x, gc.y); ctx.lineTo(gd.x, gd.y); ctx.stroke();
    }

    // Myk skygge direkte under fundamentet
    const sh0 = project(-totalW / 2 - 0.5, 0.02, -totalL / 2 - 0.5, cx, cy, scale);
    const sh1 = project(totalW / 2 + 0.5, 0.02, -totalL / 2 - 0.5, cx, cy, scale);
    const sh2 = project(totalW / 2 + 0.5, 0.02, totalL / 2 + 0.5, cx, cy, scale);
    const sh3 = project(-totalW / 2 - 0.5, 0.02, totalL / 2 + 0.5, cx, cy, scale);
    ctx.beginPath();
    ctx.moveTo(sh0.x, sh0.y);
    ctx.lineTo(sh1.x, sh1.y);
    ctx.lineTo(sh2.x, sh2.y);
    ctx.lineTo(sh3.x, sh3.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fill();
  }

  function drawProjectedPoly(pts, fill, stroke) {
    if (pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function addBoxPolys(x0, y0, z0, x1, y1, z1, colFront, colSide, colTop, addPoly) {
    // Sør (+Z)
    addPoly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], colFront);
    // Nord (-Z)
    addPoly([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], colFront);
    // Øst (+X)
    addPoly([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], colSide);
    // Vest (-X)
    addPoly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], colSide);
    // Topp (+Y)
    addPoly([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], colTop);
  }

  function addModulePolys(x0, y0, z0, x1, y1, z1, mat, modIdx, floorIdx, totalMods, totalFloors, addPoly) {
    const jointStroke = 'rgba(40, 20, 15, 0.45)';

    // Sør-fasade (+Z)
    addPoly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], mat.wall, jointStroke);
    // Panoramavindu for stue/oppholdsrom på sørfasade (ekte 3D polygon i samme koordinatsystem)
    const winW = (x1 - x0) * 0.54;
    const winH = (y1 - y0) * 0.56;
    const wx0 = x0 + ((x1 - x0) - winW) / 2;
    const wy0 = y0 + 0.65;
    addPoly([[wx0, wy0, z1 + 0.02], [wx0 + winW, wy0, z1 + 0.02], [wx0 + winW, wy0 + winH, z1 + 0.02], [wx0, wy0 + winH, z1 + 0.02]], mat.glass, mat.glassFrame);

    // Nord-fasade (-Z)
    addPoly([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], mat.wallDark, jointStroke);
    // Vinduer nordfasade
    const nWinW = (x1 - x0) * 0.40;
    const nWinH = (y1 - y0) * 0.45;
    const nWx0 = x0 + ((x1 - x0) - nWinW) / 2;
    const nWy0 = y0 + 0.90;
    addPoly([[nWx0 + nWinW, nWy0, z0 - 0.02], [nWx0, nWy0, z0 - 0.02], [nWx0, nWy0 + nWinH, z0 - 0.02], [nWx0 + nWinW, nWy0 + nWinH, z0 - 0.02]], mat.glass, mat.glassFrame);

    // Øst-fasade (+X) - kun yttervegg på siste modul
    if (modIdx === totalMods - 1) {
      addPoly([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], mat.wallDark, jointStroke);
      const eWinW = (z1 - z0) * 0.35;
      const eWinH = (y1 - y0) * 0.48;
      const eWz0 = z0 + ((z1 - z0) - eWinW) / 2;
      const eWy0 = y0 + 0.80;
      addPoly([[x1 + 0.02, eWy0, eWz0 + eWinW], [x1 + 0.02, eWy0, eWz0], [x1 + 0.02, eWy0 + eWinH, eWz0], [x1 + 0.02, eWy0 + eWinH, eWz0 + eWinW]], mat.glass, mat.glassFrame);
    }

    // Vest-fasade (-X) - yttervegg på første modul med inngangsdør og overetasjevindu
    if (modIdx === 0) {
      addPoly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], mat.wallLight, jointStroke);
      if (floorIdx === 0) {
        // Inngangsdør i 1. etasje
        const doorW = (z1 - z0) * 0.18;
        const doorH = (y1 - y0) * 0.72;
        const dz0 = z0 + (z1 - z0) * 0.35;
        addPoly([[x0 - 0.02, y0, dz0], [x0 - 0.02, y0, dz0 + doorW], [x0 - 0.02, y0 + doorH, dz0 + doorW], [x0 - 0.02, y0 + doorH, dz0]], mat.door, mat.trim);
        // Inngangstak / baldakin over døren
        const canW = doorW + 0.35;
        const canD = 0.75;
        const canY = y0 + doorH + 0.10;
        const canZ0 = dz0 - 0.15;
        addPoly([[x0, canY, canZ0], [x0 - canD, canY, canZ0], [x0 - canD, canY, canZ0 + canW], [x0, canY, canZ0 + canW]], mat.trim, '#111');
      } else {
        // Vindu i overetasje vest
        const wWinW = (z1 - z0) * 0.32;
        const wWinH = (y1 - y0) * 0.48;
        const wWz0 = z0 + (z1 - z0) * 0.35;
        const wWy0 = y0 + 0.80;
        addPoly([[x0 - 0.02, wWy0, wWz0], [x0 - 0.02, wWy0, wWz0 + wWinW], [x0 - 0.02, wWy0 + wWinH, wWz0 + wWinW], [x0 - 0.02, wWy0 + wWinH, wWz0]], mat.glass, mat.glassFrame);
      }
    }

    // Takflate over øverste etasje
    if (floorIdx === totalFloors - 1) {
      addPoly([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], mat.wallLight, jointStroke);
    }
  }

  function addGabledRoofPolys(x0, y0, z0, x1, yRidge, z1, mat, addPoly) {
    const midZ = (z0 + z1) / 2;

    // Sør-takflate (front slope)
    addPoly([
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, yRidge, midZ],
      [x0, yRidge, midZ]
    ], mat.roof, '#111');

    // Nord-takflate (back slope)
    addPoly([
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, yRidge, midZ],
      [x1, yRidge, midZ]
    ], mat.roof, '#111');

    // Gavler (trekanter på øst- og vest-side) - Korrekt CCW winding med normaler rettet utover
    addPoly([
      [x1, y0, z0],
      [x1, yRidge, midZ],
      [x1, y0, z1]
    ], mat.wallDark, '#222');

    addPoly([
      [x0, y0, z1],
      [x0, yRidge, midZ],
      [x0, y0, z0]
    ], mat.wallLight, '#222');
  }

  function addMonoRoofPolys(x0, y0, z0, x1, yHigh, z1, mat, addPoly) {
    // Pulttakflate - Korrekt CCW winding sett ovenfra slik at flaten ikke forsvinner
    addPoly([
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, yHigh, z1],
      [x1, yHigh, z1]
    ], mat.roof, '#111');

    // Høy frontvegg (+Z)
    addPoly([
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, yHigh, z1],
      [x0, yHigh, z1]
    ], mat.wall, '#111');

    // Øst-gavl - Korrekt CCW winding mot +X
    addPoly([
      [x1, y0, z0],
      [x1, yHigh, z1],
      [x1, y0, z1]
    ], mat.wallDark, '#222');

    // Vest-gavl - Korrekt CCW winding mot -X
    addPoly([
      [x0, y0, z1],
      [x0, yHigh, z1],
      [x0, y0, z0]
    ], mat.wallLight, '#222');
  }

  function drawDimensions(w, l, h, roofAdd, cx, cy, scale) {
    ctx.font = '600 12px "Open Sans", sans-serif';
    ctx.fillStyle = '#75151E';

    // Breddeindikator
    const pW0 = project(-w / 2, 0, l / 2 + 1.2, cx, cy, scale);
    const pW1 = project(w / 2, 0, l / 2 + 1.2, cx, cy, scale);
    ctx.strokeStyle = '#75151E';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pW0.x, pW0.y); ctx.lineTo(pW1.x, pW1.y); ctx.stroke();
    ctx.fillText(`${w.toFixed(1)} m bredde`, (pW0.x + pW1.x) / 2 - 32, (pW0.y + pW1.y) / 2 + 16);

    // Lengdeindikator
    const pL0 = project(w / 2 + 1.2, 0, l / 2, cx, cy, scale);
    const pL1 = project(w / 2 + 1.2, 0, -l / 2, cx, cy, scale);
    ctx.beginPath(); ctx.moveTo(pL0.x, pL0.y); ctx.lineTo(pL1.x, pL1.y); ctx.stroke();
    ctx.fillText(`${l.toFixed(1)} m lengde`, (pL0.x + pL1.x) / 2 + 8, (pL0.y + pL1.y) / 2);

    // Høydeindikator
    const pH0 = project(-w / 2 - 1.2, 0, -l / 2, cx, cy, scale);
    const pH1 = project(-w / 2 - 1.2, h + roofAdd, -l / 2, cx, cy, scale);
    ctx.beginPath(); ctx.moveTo(pH0.x, pH0.y); ctx.lineTo(pH1.x, pH1.y); ctx.stroke();
    ctx.fillText(`${(h + roofAdd).toFixed(1)} m totalhøyde`, pH1.x - 76, (pH0.y + pH1.y) / 2);
  }

  function resetView() {
    angleX = 25 * Math.PI / 180;
    angleY = 45 * Math.PI / 180;
    zoom = 1.0;
    render();
  }

  /* BIM & CAD Eksport: IFC2x3 og Wavefront OBJ */
  function exportIFC() {
    const count = parseInt(document.getElementById('modCount')?.value || 3, 10);
    const modLen = parseFloat(document.getElementById('modLen')?.value || 10.2);
    const modWidth = parseFloat(document.getElementById('modWidth')?.value || 3.9);
    const floors = parseInt(document.getElementById('floors')?.value || 2, 10);
    const roof = document.getElementById('roof')?.value || 'saltak';
    const totalW = count * modWidth;
    const totalL = modLen;
    const totalH = floors * 2.9;
    const matObj = MATERIALS[material] || MATERIALS.furu;

    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    const ifcContent = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');
FILE_NAME('LindalModul_${count}x${floors}.ifc','${timestamp}',('Arne Austena'),('Lindal Modul AS'),'Lindal Modul AI Platform','Lindal Modul BIM Exporter','');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
#1=IFCORGANIZATION($,'Lindal Modul AS','Industriell tre- og elementproduksjon',$,$);
#2=IFCAPPLICATION(#1,'2026.1','Lindal Modul AI','LMAI');
#3=IFCPERSON($,'Austen\\X\\E5','Arne',$,$,$,$,$);
#4=IFCPERSONANDORGANIZATION(#3,#1,$);
#5=IFCOWNERHISTORY(#4,#2,$,.ADDED.,$,$,$,$);
#6=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#7=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#8=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#9=IFCUNITASSIGNMENT((#6,#7,#8));
#10=IFCPROJECT('10000000-0000-0000-0000-000000000001',#5,'Lindal Modul Prosjekt - ${count} moduler ${floors} etg',$,$,$,$,(#11),#9);
#11=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#12,$);
#12=IFCAXIS2PLACEMENT3D(#13,$,$);
#13=IFCCARTESIANPOINT((0.,0.,0.));
#14=IFCSITE('10000000-0000-0000-0000-000000000002',#5,'Byggetomt',$,$,#15,$,$,.ELEMENT.,$,$,$,$,$);
#15=IFCLOCALPLACEMENT($,#12);
#16=IFCBUILDING('10000000-0000-0000-0000-000000000003',#5,'Lindal Modulbygg (${matObj.name})',$,$,#17,$,$,.ELEMENT.,$,$,$);
#17=IFCLOCALPLACEMENT(#15,#12);
#18=IFCRELAGGREGATES('10000000-0000-0000-0000-000000000004',#5,'ProjectToSite',$,#10,(#14));
#19=IFCRELAGGREGATES('10000000-0000-0000-0000-000000000005',#5,'SiteToBuilding',$,#14,(#16));
#20=IFCPROPERTYSINGLEVALUE('Materiale','Kledning',IFCTEXT('${matObj.name}'),$);
#21=IFCPROPERTYSINGLEVALUE('ModulBredde','Bredde per modul i meter',IFCLENGTHMEASURE(${modWidth.toFixed(2)}),$);
#22=IFCPROPERTYSINGLEVALUE('ModulLengde','Lengde per modul i meter',IFCLENGTHMEASURE(${modLen.toFixed(2)}),$);
#23=IFCPROPERTYSINGLEVALUE('Taktype','Type takkonstruksjon',IFCTEXT('${roof}'),$);
#24=IFCPROPERTYSET('10000000-0000-0000-0000-000000000006',#5,'Pset_LindalModulSpec',$,(#20,#21,#22,#23));
#25=IFCRELDEFINESBYPROPERTIES('10000000-0000-0000-0000-000000000007',#5,$,$,(#16),#24);
#30=IFCBUILDINGSTOREY('10000000-0000-0000-0000-000000000010',#5,'1. Etasje',$,$,#17,$,$,.ELEMENT.,0.);
#31=IFCRELAGGREGATES('10000000-0000-0000-0000-000000000011',#5,'BuildingToStorey',$,#16,(#30));
#40=IFCBUILDINGELEMENTPROXY('10000000-0000-0000-0000-000000000020',#5,'Lindal Modulpakke (${totalW.toFixed(1)}x${totalL.toFixed(1)}m)',$,'Prefabrikkert modulenhet',#17,$,$,.USERDEFINED.);
#41=IFCRELCONTAINEDINSPATIALSTRUCTURE('10000000-0000-0000-0000-000000000021',#5,'StoreyElements',$,(#40),#30);
ENDSEC;
END-ISO-10303-21;`;

    downloadFile(ifcContent, `LindalModul_${count}mod_${floors}etg_${roof}.ifc`, 'application/x-step');
  }

  function exportOBJ() {
    const count = parseInt(document.getElementById('modCount')?.value || 3, 10);
    const modLen = parseFloat(document.getElementById('modLen')?.value || 10.2);
    const modWidth = parseFloat(document.getElementById('modWidth')?.value || 3.9);
    const floors = parseInt(document.getElementById('floors')?.value || 2, 10);
    const roof = document.getElementById('roof')?.value || 'saltak';
    const totalW = count * modWidth;
    const totalL = modLen;
    const floorH = 2.9;
    const totalH = floors * floorH;
    const plinthH = 0.3;

    let obj = `# Lindal Modul 3D Modell Wavefront OBJ\n# Produsert av Lindal Modul AI Platform (Lindal Modul AS, Tvedestrand)\n# Offisiell representant: Arne Austena\n\no LindalModulBygg\n`;

    const verts = [];
    const faces = [];
    function addV(x, y, z) {
      verts.push([x, y, z]);
      return verts.length;
    }
    function addQuad(p1, p2, p3, p4) {
      faces.push([p1, p2, p3, p4]);
    }
    function addTri(p1, p2, p3) {
      faces.push([p1, p2, p3]);
    }

    // Sokkel
    const sx0 = -totalW / 2 - 0.15, sx1 = totalW / 2 + 0.15;
    const sz0 = -totalL / 2 - 0.15, sz1 = totalL / 2 + 0.15;
    const v1 = addV(sx0, 0, sz1), v2 = addV(sx1, 0, sz1), v3 = addV(sx1, plinthH, sz1), v4 = addV(sx0, plinthH, sz1);
    const v5 = addV(sx0, 0, sz0), v6 = addV(sx1, 0, sz0), v7 = addV(sx1, plinthH, sz0), v8 = addV(sx0, plinthH, sz0);
    addQuad(v1, v2, v3, v4);
    addQuad(v6, v5, v8, v7);
    addQuad(v2, v6, v7, v3);
    addQuad(v5, v1, v4, v8);
    addQuad(v4, v3, v7, v8);

    // Moduler
    for (let fl = 0; fl < floors; fl++) {
      const y0 = plinthH + fl * floorH;
      const y1 = y0 + floorH;
      for (let m = 0; m < count; m++) {
        const x0 = -totalW / 2 + m * modWidth;
        const x1 = x0 + modWidth;
        const z0 = -totalL / 2;
        const z1 = totalL / 2;
        const p1 = addV(x0, y0, z1), p2 = addV(x1, y0, z1), p3 = addV(x1, y1, z1), p4 = addV(x0, y1, z1);
        const p5 = addV(x0, y0, z0), p6 = addV(x1, y0, z0), p7 = addV(x1, y1, z0), p8 = addV(x0, y1, z0);
        addQuad(p1, p2, p3, p4);
        addQuad(p6, p5, p8, p7);
        if (m === count - 1) addQuad(p2, p6, p7, p3);
        if (m === 0) addQuad(p5, p1, p4, p8);
        if (fl === floors - 1) addQuad(p4, p3, p7, p8);
      }
    }

    // Tak
    const roofY = plinthH + totalH;
    if (roof === 'saltak') {
      const pitchH = (modLen / 2) * Math.tan(27 * Math.PI / 180);
      const rx0 = -totalW / 2 - 0.35, rx1 = totalW / 2 + 0.35;
      const rz0 = -totalL / 2 - 0.35, rz1 = totalL / 2 + 0.35;
      const midZ = (rz0 + rz1) / 2;
      const rs0 = addV(rx0, roofY, rz1), rs1 = addV(rx1, roofY, rz1);
      const rm0 = addV(rx0, roofY + pitchH, midZ), rm1 = addV(rx1, roofY + pitchH, midZ);
      const rn0 = addV(rx0, roofY, rz0), rn1 = addV(rx1, roofY, rz0);
      addQuad(rs0, rs1, rm1, rm0);
      addQuad(rn1, rn0, rm0, rm1);
      addTri(rn1, rm1, rs1);
      addTri(rs0, rm0, rn0);
    } else if (roof === 'pult') {
      const pitchH = modLen * Math.tan(9 * Math.PI / 180);
      const rx0 = -totalW / 2 - 0.35, rx1 = totalW / 2 + 0.35;
      const rz0 = -totalL / 2 - 0.35, rz1 = totalL / 2 + 0.35;
      const pz0_0 = addV(rx0, roofY, rz0), pz0_1 = addV(rx1, roofY, rz0);
      const pz1_0 = addV(rx0, roofY + pitchH, rz1), pz1_1 = addV(rx1, roofY + pitchH, rz1);
      const pz1_b0 = addV(rx0, roofY, rz1), pz1_b1 = addV(rx1, roofY, rz1);
      addQuad(pz0_1, pz0_0, pz1_0, pz1_1);
      addQuad(pz1_b0, pz1_b1, pz1_1, pz1_0);
      addTri(pz0_1, pz1_1, pz1_b1);
      addTri(pz1_b0, pz1_0, pz0_0);
    }

    for (const v of verts) {
      obj += `v ${v[0].toFixed(3)} ${v[1].toFixed(3)} ${v[2].toFixed(3)}\n`;
    }
    for (const f of faces) {
      obj += `f ${f.join(' ')}\n`;
    }

    downloadFile(obj, `LindalModul_${count}mod_${floors}etg_${roof}.obj`, 'text/plain');
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    if (typeof Planner !== 'undefined' && Planner.toast) {
      Planner.toast(`Lastet ned ${filename} ✔`);
    }
  }

  return { init, render, resize, setMaterial, resetView, exportIFC, exportOBJ, get materials() { return MATERIALS; } };
})();
