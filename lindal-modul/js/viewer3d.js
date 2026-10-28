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
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
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
    });

    canvas.addEventListener('touchmove', e => {
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
    });

    canvas.addEventListener('touchend', () => { isDragging = false; lastTouchDist = 0; });
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

    // Sør-fasade (+Z) - med panoramavinduer for stue/oppholdsrom
    addPoly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], mat.wall, jointStroke, false, () => {
      // Tegn skandinavisk vindusparti på sørfasade
      const winW = (x1 - x0) * 0.52;
      const winH = (y1 - y0) * 0.56;
      const wx0 = x0 + ((x1 - x0) - winW) / 2;
      const wy0 = y0 + 0.65;
      const wp = [
        project(wx0, wy0, z1 + 0.02, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
        project(wx0 + winW, wy0, z1 + 0.02, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
        project(wx0 + winW, wy0 + winH, z1 + 0.02, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
        project(wx0, wy0 + winH, z1 + 0.02, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom)
      ];
      drawProjectedPoly(wp, mat.glass, mat.glassFrame);
      // Sprosse
      ctx.strokeStyle = mat.glassFrame;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo((wp[0].x + wp[1].x) / 2, (wp[0].y + wp[1].y) / 2);
      ctx.lineTo((wp[3].x + wp[2].x) / 2, (wp[3].y + wp[2].y) / 2);
      ctx.stroke();
    });

    // Nord-fasade (-Z) - med vinduer
    addPoly([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], mat.wallDark, jointStroke, false, () => {
      const winW = (x1 - x0) * 0.38;
      const winH = (y1 - y0) * 0.45;
      const wx0 = x0 + ((x1 - x0) - winW) / 2;
      const wy0 = y0 + 0.9;
      const wp = [
        project(wx0 + winW, wy0, z0 - 0.02, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
        project(wx0, wy0, z0 - 0.02, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
        project(wx0, wy0 + winH, z0 - 0.02, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
        project(wx0 + winW, wy0 + winH, z0 - 0.02, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom)
      ];
      drawProjectedPoly(wp, mat.glass, mat.glassFrame);
    });

    // Øst-fasade (+X) - kun yttervegg på siste modul
    if (modIdx === totalMods - 1) {
      addPoly([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], mat.wallDark, jointStroke, false, () => {
        const winW = (z1 - z0) * 0.35;
        const winH = (y1 - y0) * 0.48;
        const wz0 = z0 + ((z1 - z0) - winW) / 2;
        const wy0 = y0 + 0.8;
        const wp = [
          project(x1 + 0.02, wy0, wz0, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
          project(x1 + 0.02, wy0, wz0 + winW, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
          project(x1 + 0.02, wy0 + winH, wz0 + winW, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
          project(x1 + 0.02, wy0 + winH, wz0, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom)
        ];
        drawProjectedPoly(wp, mat.glass, mat.glassFrame);
      });
    }

    // Vest-fasade (-X) - yttervegg på første modul med inngangsdør
    if (modIdx === 0) {
      addPoly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], mat.wallLight, jointStroke, false, () => {
        // Inngangsdør i 1. etasje
        if (floorIdx === 0) {
          const doorW = (z1 - z0) * 0.18;
          const doorH = (y1 - y0) * 0.72;
          const dz0 = z0 + (z1 - z0) * 0.35;
          const dp = [
            project(x0 - 0.02, y0, dz0, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
            project(x0 - 0.02, y0, dz0 + doorW, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
            project(x0 - 0.02, y0 + doorH, dz0 + doorW, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom),
            project(x0 - 0.02, y0 + doorH, dz0, width / (2 * (window.devicePixelRatio || 1)), height / (2 * (window.devicePixelRatio || 1)) + 35, (Math.min(width, height) * 0.44 / Math.max(totalMods * (x1 - x0), z1 - z0, totalFloors * 2.9 + 4)) * zoom)
          ];
          drawProjectedPoly(dp, mat.door, mat.trim);
        }
      });
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

    // Gavler (trekanter på øst- og vest-side)
    addPoly([
      [x1, y0, z1],
      [x1, yRidge, midZ],
      [x1, y0, z0]
    ], mat.wallDark, '#222');

    addPoly([
      [x0, y0, z0],
      [x0, yRidge, midZ],
      [x0, y0, z1]
    ], mat.wallLight, '#222');
  }

  function addMonoRoofPolys(x0, y0, z0, x1, yHigh, z1, mat, addPoly) {
    // Pulttakflate
    addPoly([
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, yHigh, z1],
      [x0, yHigh, z1]
    ], mat.roof, '#111');

    // Høy frontvegg (+Z)
    addPoly([
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, yHigh, z1],
      [x0, yHigh, z1]
    ], mat.wall, '#111');

    // Øst-gavl
    addPoly([
      [x1, y0, z1],
      [x1, yHigh, z1],
      [x1, y0, z0]
    ], mat.wallDark, '#222');

    // Vest-gavl
    addPoly([
      [x0, y0, z0],
      [x0, yHigh, z1],
      [x0, y0, z1]
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

  return { init, render, resize, setMaterial, resetView, get materials() { return MATERIALS; } };
})();
