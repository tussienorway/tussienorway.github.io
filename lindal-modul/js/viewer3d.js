/* 3D / Aksonometrisk modulvisualisator for Lindal Modul
   Tegner husmodulene i ekte 3D på HTML5 Canvas med rotasjon, takformer, vinduer og materialer */
const Viewer3D = (() => {
  let canvas, ctx, width, height;
  let angleX = 25 * Math.PI / 180;
  let angleY = 45 * Math.PI / 180;
  let zoom = 1.0;
  let isDragging = false;
  let lastMouseX = 0, lastMouseY = 0;
  let material = 'furu'; // 'furu', 'mork', 'rod'

  const MATERIALS = {
    furu: { wall: '#C8A97E', wallDark: '#A88960', wallLight: '#DFBF92', roof: '#2D3130', trim: '#33261D', glass: '#A5C9D8' },
    mork: { wall: '#3A3835', wallDark: '#282725', wallLight: '#4D4A46', roof: '#1C1B1A', trim: '#111', glass: '#8EB6C8' },
    rod:  { wall: '#75151E', wallDark: '#560F16', wallLight: '#8F1E28', roof: '#2E2D2B', trim: '#FFFFFF', glass: '#A5C9D8' }
  };

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
      angleX = Math.max(0.1, Math.min(Math.PI / 2.2, angleX + dy * 0.008));
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      render();
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      zoom = Math.max(0.5, Math.min(2.5, zoom - e.deltaY * 0.001));
      render();
    }, { passive: false });

    // Touch support for mobile
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
        angleX = Math.max(0.1, Math.min(Math.PI / 2.2, angleX + dy * 0.008));
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
        render();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (lastTouchDist > 0) {
          zoom = Math.max(0.5, Math.min(2.5, zoom + (dist - lastTouchDist) * 0.005));
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
    // Rotate around Y axis
    const cosY = Math.cos(angleY), sinY = Math.sin(angleY);
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;

    // Rotate around X axis
    const cosX = Math.cos(angleX), sinX = Math.sin(angleX);
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;

    // Axonometric / Orthographic with depth cues
    const px = cx + x1 * scale;
    const py = cy - y2 * scale;
    return { x: px, y: py, depth: z2 };
  }

  function drawQuad(p1, p2, p3, p4, color, strokeColor = 'rgba(0,0,0,0.15)') {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawTriangle(p1, p2, p3, color, strokeColor = 'rgba(0,0,0,0.15)') {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
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

    // Get current building configuration from Planner inputs
    const count = parseInt(document.getElementById('modCount')?.value || 3, 10);
    const modLen = parseFloat(document.getElementById('modLen')?.value || 10.2);
    const modWidth = parseFloat(document.getElementById('modWidth')?.value || 3.9);
    const floors = parseInt(document.getElementById('floors')?.value || 2, 10);
    const roof = document.getElementById('roof')?.value || 'saltak';

    const mat = MATERIALS[material];

    // Total building dimensions
    const totalW = count * modWidth;
    const totalL = modLen;
    const floorH = 2.9; // meter per etasje
    const totalH = floors * floorH;

    // Center and scale
    const cx = w / 2;
    const cy = h / 2 + 40;
    const maxDim = Math.max(totalW, totalL, totalH + 4);
    const baseScale = (Math.min(w, h) * 0.42 / maxDim) * zoom;

    // 1. Draw foundation / terrain plane
    const groundSize = Math.max(totalW, totalL) * 1.5;
    const g0 = project(-groundSize / 2, 0, -groundSize / 2, cx, cy, baseScale);
    const g1 = project(groundSize / 2, 0, -groundSize / 2, cx, cy, baseScale);
    const g2 = project(groundSize / 2, 0, groundSize / 2, cx, cy, baseScale);
    const g3 = project(-groundSize / 2, 0, groundSize / 2, cx, cy, baseScale);
    drawQuad(g0, g1, g2, g3, 'rgba(235, 240, 235, 0.85)', 'rgba(200, 215, 200, 0.6)');

    // Ground grid lines
    ctx.strokeStyle = 'rgba(180, 195, 180, 0.35)';
    ctx.lineWidth = 1;
    const steps = 6;
    for (let i = -steps; i <= steps; i++) {
      const pos = (i / steps) * (groundSize / 2);
      const ga = project(pos, 0, -groundSize / 2, cx, cy, baseScale);
      const gb = project(pos, 0, groundSize / 2, cx, cy, baseScale);
      ctx.beginPath(); ctx.moveTo(ga.x, ga.y); ctx.lineTo(gb.x, gb.y); ctx.stroke();
      const gc = project(-groundSize / 2, 0, pos, cx, cy, baseScale);
      const gd = project(groundSize / 2, 0, pos, cx, cy, baseScale);
      ctx.beginPath(); ctx.moveTo(gc.x, gc.y); ctx.lineTo(gd.x, gd.y); ctx.stroke();
    }

    // 2. Concrete plinth / foundation
    const plinthH = 0.3;
    const pX0 = -totalW / 2 - 0.15, pX1 = totalW / 2 + 0.15;
    const pZ0 = -totalL / 2 - 0.15, pZ1 = totalL / 2 + 0.15;
    drawBox(pX0, 0, pZ0, pX1, plinthH, pZ1, cx, cy, baseScale, '#C2C4C6', '#9A9C9E', '#DBDDDF');

    // 3. Render modules floor by floor
    for (let fl = 0; fl < floors; fl++) {
      const y0 = plinthH + fl * floorH;
      const y1 = y0 + floorH;

      for (let m = 0; m < count; m++) {
        const x0 = -totalW / 2 + m * modWidth;
        const x1 = x0 + modWidth;
        const z0 = -totalL / 2;
        const z1 = totalL / 2;

        // Module box with wooden cladding texture look
        drawModuleBox(x0, y0, z0, x1, y1, z1, cx, cy, baseScale, mat, m, fl, count, floors);
      }
    }

    // 4. Roof construction
    const roofY = plinthH + totalH;
    if (roof === 'saltak') {
      const pitchH = (modLen / 2) * Math.tan(27 * Math.PI / 180);
      drawGabledRoof(-totalW / 2 - 0.4, roofY, -totalL / 2 - 0.4, totalW / 2 + 0.4, roofY + pitchH, totalL / 2 + 0.4, cx, cy, baseScale, mat);
    } else if (roof === 'pult') {
      const pitchH = modLen * Math.tan(8 * Math.PI / 180);
      drawMonoRoof(-totalW / 2 - 0.4, roofY, -totalL / 2 - 0.4, totalW / 2 + 0.4, roofY + pitchH, totalL / 2 + 0.4, cx, cy, baseScale, mat);
    } else {
      // Flat roof with parapet
      const parapetH = 0.5;
      drawBox(-totalW / 2 - 0.2, roofY, -totalL / 2 - 0.2, totalW / 2 + 0.2, roofY + parapetH, totalL / 2 + 0.2, cx, cy, baseScale, mat.roof, '#151515', '#333');
    }

    // 5. Dimension markers
    drawDimensions(totalW, totalL, totalH, roof === 'saltak' ? 2.5 : roof === 'pult' ? 1.4 : 0.5, cx, cy, baseScale);
  }

  function drawModuleBox(x0, y0, z0, x1, y1, z1, cx, cy, scale, mat, modIdx, floorIdx, totalMods, totalFloors) {
    // 8 vertices of module box
    const p000 = project(x0, y0, z0, cx, cy, scale);
    const p100 = project(x1, y0, z0, cx, cy, scale);
    const p110 = project(x1, y1, z0, cx, cy, scale);
    const p010 = project(x0, y1, z0, cx, cy, scale);

    const p001 = project(x0, y0, z1, cx, cy, scale);
    const p101 = project(x1, y0, z1, cx, cy, scale);
    const p111 = project(x1, y1, z1, cx, cy, scale);
    const p011 = project(x0, y1, z1, cx, cy, scale);

    // Module joint line highlight
    const jointStroke = 'rgba(50, 30, 20, 0.45)';

    // Back / South / Front / Sides based on view angle
    // Draw south face (+Z)
    drawQuad(p001, p101, p111, p011, mat.wall, jointStroke);

    // Windows on South facade
    const winW = (x1 - x0) * 0.45;
    const winH = (y1 - y0) * 0.5;
    const wx0 = x0 + ((x1 - x0) - winW) / 2;
    const wy0 = y0 + 0.8;
    const w001 = project(wx0, wy0, z1 + 0.02, cx, cy, scale);
    const w101 = project(wx0 + winW, wy0, z1 + 0.02, cx, cy, scale);
    const w111 = project(wx0 + winW, wy0 + winH, z1 + 0.02, cx, cy, scale);
    const w011 = project(wx0, wy0 + winH, z1 + 0.02, cx, cy, scale);
    drawQuad(w001, w101, w111, w011, mat.glass, '#222');

    // Window crossbars
    ctx.strokeStyle = '#2A2A2A';
    ctx.lineWidth = 1.5;
    const wMidX = (w001.x + w101.x) / 2;
    const wMidYTop = (w011.y + w111.y) / 2;
    const wMidYBot = (w001.y + w101.y) / 2;
    ctx.beginPath(); ctx.moveTo(wMidX, wMidYBot); ctx.lineTo(wMidX, wMidYTop); ctx.stroke();

    // Side face (+X)
    if (modIdx === totalMods - 1) {
      drawQuad(p101, p100, p110, p111, mat.wallDark, jointStroke);
      // Window on end wall
      const endWinW = (z1 - z0) * 0.35;
      const ewz0 = z0 + ((z1 - z0) - endWinW) / 2;
      const ew0 = project(x1 + 0.02, y0 + 0.9, ewz0, cx, cy, scale);
      const ew1 = project(x1 + 0.02, y0 + 0.9, ewz0 + endWinW, cx, cy, scale);
      const ew2 = project(x1 + 0.02, y0 + 0.9 + winH, ewz0 + endWinW, cx, cy, scale);
      const ew3 = project(x1 + 0.02, y0 + 0.9 + winH, ewz0, cx, cy, scale);
      drawQuad(ew0, ew1, ew2, ew3, mat.glass, '#222');
    }

    // Side face (-X)
    if (modIdx === 0) {
      drawQuad(p000, p001, p011, p010, mat.wallLight, jointStroke);
    }

    // Top face
    if (floorIdx === totalFloors - 1) {
      drawQuad(p010, p110, p111, p011, mat.wallLight, jointStroke);
    }

    // Module separation seam
    ctx.strokeStyle = '#5A1015';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p101.x, p101.y);
    ctx.lineTo(p111.x, p111.y);
    ctx.stroke();
  }

  function drawBox(x0, y0, z0, x1, y1, z1, cx, cy, scale, colFront, colSide, colTop) {
    const p000 = project(x0, y0, z0, cx, cy, scale);
    const p100 = project(x1, y0, z0, cx, cy, scale);
    const p110 = project(x1, y1, z0, cx, cy, scale);
    const p010 = project(x0, y1, z0, cx, cy, scale);

    const p001 = project(x0, y0, z1, cx, cy, scale);
    const p101 = project(x1, y0, z1, cx, cy, scale);
    const p111 = project(x1, y1, z1, cx, cy, scale);
    const p011 = project(x0, y1, z1, cx, cy, scale);

    drawQuad(p001, p101, p111, p011, colFront);
    drawQuad(p101, p100, p110, p111, colSide);
    drawQuad(p010, p110, p111, p011, colTop);
  }

  function drawGabledRoof(x0, y0, z0, x1, yRidge, z1, cx, cy, scale, mat) {
    const midZ = (z0 + z1) / 2;
    const rL = project(x0, yRidge, midZ, cx, cy, scale);
    const rR = project(x1, yRidge, midZ, cx, cy, scale);

    const e00 = project(x0, y0, z0, cx, cy, scale);
    const e10 = project(x1, y0, z0, cx, cy, scale);
    const e01 = project(x0, y0, z1, cx, cy, scale);
    const e11 = project(x1, y0, z1, cx, cy, scale);

    // Front roof slope
    drawQuad(e01, e11, rR, rL, mat.roof, '#111');

    // Gable triangular ends
    drawTriangle(e11, e10, rR, mat.wallDark, '#222');
    drawTriangle(e00, e01, rL, mat.wallLight, '#222');

    // Ridge line
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(rL.x, rL.y); ctx.lineTo(rR.x, rR.y); ctx.stroke();
  }

  function drawMonoRoof(x0, y0, z0, x1, yHigh, z1, cx, cy, scale, mat) {
    const p00 = project(x0, y0, z0, cx, cy, scale);
    const p10 = project(x1, y0, z0, cx, cy, scale);
    const p01 = project(x0, yHigh, z1, cx, cy, scale);
    const p11 = project(x1, yHigh, z1, cx, cy, scale);

    drawQuad(p00, p10, p11, p01, mat.roof, '#111');
    drawTriangle(p10, project(x1, y0, z1, cx, cy, scale), p11, mat.wallDark, '#222');
  }

  function drawDimensions(w, l, h, roofAdd, cx, cy, scale) {
    ctx.font = '600 12px "Open Sans", sans-serif';
    ctx.fillStyle = '#75151E';

    // Width label
    const pW0 = project(-w / 2, 0, l / 2 + 1.2, cx, cy, scale);
    const pW1 = project(w / 2, 0, l / 2 + 1.2, cx, cy, scale);
    ctx.strokeStyle = '#75151E';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pW0.x, pW0.y); ctx.lineTo(pW1.x, pW1.y); ctx.stroke();
    ctx.fillText(`${w.toFixed(1)} m bredde`, (pW0.x + pW1.x) / 2 - 35, (pW0.y + pW1.y) / 2 + 16);

    // Length label
    const pL0 = project(w / 2 + 1.2, 0, l / 2, cx, cy, scale);
    const pL1 = project(w / 2 + 1.2, 0, -l / 2, cx, cy, scale);
    ctx.beginPath(); ctx.moveTo(pL0.x, pL0.y); ctx.lineTo(pL1.x, pL1.y); ctx.stroke();
    ctx.fillText(`${l.toFixed(1)} m lengde`, (pL0.x + pL1.x) / 2 + 8, (pL0.y + pL1.y) / 2);

    // Height label
    const pH0 = project(-w / 2 - 1.2, 0, -l / 2, cx, cy, scale);
    const pH1 = project(-w / 2 - 1.2, h + roofAdd, -l / 2, cx, cy, scale);
    ctx.beginPath(); ctx.moveTo(pH0.x, pH0.y); ctx.lineTo(pH1.x, pH1.y); ctx.stroke();
    ctx.fillText(`${(h + roofAdd).toFixed(1)} m høyde`, pH1.x - 70, (pH0.y + pH1.y) / 2);
  }

  function resetView() {
    angleX = 25 * Math.PI / 180;
    angleY = 45 * Math.PI / 180;
    zoom = 1.0;
    render();
  }

  return { init, render, resize, setMaterial, resetView };
})();
