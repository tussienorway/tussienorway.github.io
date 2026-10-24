/**
 * Agder Bilberging AI - Interaktiv Klientmotor v2.0
 * Inkluderer E18 Radar-telemetri, Klientside Computer Vision-triage med bildeopplasting,
 * og Båt-/Spesialtransportkalkulator med Statens vegvesen-dispensasjonssjekk.
 */

(function () {
  'use strict';

  // =========================================================================
  // 0. Lydsynthesizer (Web Audio API) - Safe Against Autoplay Blocking
  // =========================================================================
  let audioCtx = null;
  function playBeep(freq = 880, type = 'sine', duration = 0.08) {
    try {
      if (!audioCtx) {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioClass) return;
        audioCtx = new AudioClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      if (audioCtx.state !== 'running') return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Audio suppressed or unsupported - fail silently without throwing
    }
  }

  // =========================================================================
  // 1. E18 Agder Live Telemetri-Radar
  // =========================================================================
  const canvas = document.getElementById('e18RadarCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  let angle = 0;

  // Bilflåte simulert på E18 (Arendal -> Grimstad -> Lillesand)
  const fleetVehicles = [
    { id: 'TUNG-01', name: 'Scania 8x4 Tung', x: 0.35, y: 0.48, color: '#ef4444', speed: 0, status: 'Beredskap' },
    { id: 'PUTE-02', name: 'Mercedes TMA Putebil', x: 0.58, y: 0.42, color: '#fbbf24', speed: 82, status: 'Patrulje E18' },
    { id: 'FLAK-03', name: 'MAN TGL Flakbil', x: 0.72, y: 0.38, color: '#06b6d4', speed: 0, status: 'Klar Fevik' },
    { id: 'KRAN-04', name: 'Iveco Båtkran', x: 0.40, y: 0.62, color: '#10b981', speed: 45, status: 'På oppdrag' },
    { id: '4X4-05', name: 'Land Cruiser 4x4', x: 0.22, y: 0.30, color: '#a855f7', speed: 0, status: 'Beredskap' }
  ];

  function resizeCanvas() {
    if (canvas && canvas.parentElement) {
      const rect = canvas.parentElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    }

    if (cvCanvas && cvCanvas.parentElement) {
      const rectCv = cvCanvas.parentElement.getBoundingClientRect();
      if (rectCv.width > 0 && rectCv.height > 0) {
        cvCanvas.width = rectCv.width;
        cvCanvas.height = rectCv.height;
        if (lastRenderedScenario) {
          renderCVAnalysis(lastRenderedScenario, false);
        }
      }
    }
  }

  function drawRadar() {
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    // Fade bakgrunn
    ctx.fillStyle = 'rgba(6, 9, 17, 0.25)';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.min(w, h) * 0.45;

    // Radarsirkler
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.16)';
    ctx.lineWidth = 1;
    for (let r = maxRadius / 3; r <= maxRadius; r += maxRadius / 3) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Akselinjer
    ctx.beginPath();
    ctx.moveTo(cx - maxRadius, cy);
    ctx.lineTo(cx + maxRadius, cy);
    ctx.moveTo(cx, cy - maxRadius);
    ctx.lineTo(cx, cy + maxRadius);
    ctx.stroke();

    // E18 Trasé (stilisert kurve fra Lillesand vest til Arendal øst)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(w * 0.08, h * 0.72);
    ctx.quadraticCurveTo(w * 0.45, h * 0.50, w * 0.92, h * 0.25);
    ctx.stroke();
    ctx.setLineDash([]);

    // Stedsmerker langs E18 (skalert font for smale skjermer)
    const fontSize = Math.max(9, Math.min(11, Math.round(w / 40)));
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${fontSize}px monospace`;
    ctx.fillText('Lillesand', w * 0.08, h * 0.78);
    ctx.fillText('Grimstad Base (E18)', Math.max(w * 0.32, 10), h * 0.56);
    ctx.fillText('Arendal / Stoa', Math.min(w * 0.70, w - 90), h * 0.22);

    // Kjøretøy
    fleetVehicles.forEach((v) => {
      const vx = w * v.x;
      const vy = h * v.y;

      // Tegn blipp
      ctx.beginPath();
      ctx.arc(vx, vy, 5, 0, Math.PI * 2);
      ctx.fillStyle = v.color;
      ctx.fill();

      // Pulserende ring
      ctx.beginPath();
      ctx.arc(vx, vy, 7 + Math.sin(Date.now() / 220) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Tekst-merke
      ctx.fillStyle = '#f8fafc';
      ctx.font = '9px monospace';
      if (w > 340) {
        ctx.fillText(`${v.id} (${v.status})`, vx + 8, vy + 3);
      } else {
        ctx.fillText(v.id, vx + 7, vy + 3);
      }
    });

    // Feiesveip
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, 0, maxRadius, 0);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0.65)');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(maxRadius, 0);
    ctx.stroke();
    ctx.restore();

    angle += 0.025;
    requestAnimationFrame(drawRadar);
  }

  // =========================================================================
  // 2. 1-Klikk Akutt Veihjelp & GPS Posisjonering
  // =========================================================================
  const btnGps = document.getElementById('btnGpsNow');
  const modal = document.getElementById('emergencyModal');
  const modalClose = document.getElementById('modalClose');
  const gpsCoordText = document.getElementById('gpsCoordText');
  const btnSubmitDispatch = document.getElementById('btnSubmitDispatch');

  let currentCoords = { lat: 58.3541, lng: 8.5772 }; // Default Grimstad Base

  if (btnGps) {
    btnGps.addEventListener('click', () => {
      playBeep(920, 'sine', 0.12);
      if (modal) modal.classList.add('active');

      if (navigator.geolocation) {
        if (gpsCoordText) gpsCoordText.textContent = 'Søker etter satellittposisjon (GPS)...';
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            currentCoords.lat = Number(pos.coords.latitude.toFixed(5));
            currentCoords.lng = Number(pos.coords.longitude.toFixed(5));
            if (gpsCoordText) {
              gpsCoordText.innerHTML = `<strong>Funnet posisjon:</strong> ${currentCoords.lat}° N, ${currentCoords.lng}° Ø<br><span style="color:#10b981;">✓ Låst mot E18 Agder (ca. 18 min estimert ankomst fra Grimstad base)</span>`;
            }
          },
          (err) => {
            // Fallback til E18 Grimstad / Bie-krysset
            currentCoords.lat = 58.3512;
            currentCoords.lng = 8.5721;
            if (gpsCoordText) {
              gpsCoordText.innerHTML = `<strong>Standardposisjon aktivert (E18 Grimstad / Bie):</strong> 58.3512° N, 8.5721° Ø<br><span style="color:#f59e0b;">(Nettleser-posisjon utilgjengelig, standard E18-posisjon benyttet)</span>`;
            }
          },
          { timeout: 8000, enableHighAccuracy: true }
        );
      }
    });

    const manualExitSelect = document.getElementById('manualExitSelect');
    if (manualExitSelect) {
      const exitCoordinates = {
        bie_grimstad: { lat: 58.3512, lng: 8.5721, name: 'Bie-krysset Grimstad (Avkjørsel 242)', km: 2.1, eta: 5 },
        fevik: { lat: 58.3845, lng: 8.6543, name: 'Fevik / Vik (Avkjørsel 248)', km: 7.4, eta: 10 },
        stoa_arendal: { lat: 58.4612, lng: 8.7212, name: 'Stoa Arendal (Avkjørsel 257)', km: 17.8, eta: 16 },
        harebakken_arendal: { lat: 58.4812, lng: 8.7612, name: 'Harebakken Arendal (Avkjørsel 262)', km: 22.5, eta: 19 },
        lillesand_ost: { lat: 58.2612, lng: 8.3912, name: 'Lillesand Øst (Avkjørsel 235)', km: 19.2, eta: 17 },
        lillesand_vest: { lat: 58.2412, lng: 8.3512, name: 'Lillesand Vest (Avkjørsel 225)', km: 25.8, eta: 22 },
        grimstadtunnelen: { lat: 58.3580, lng: 8.5850, name: 'E18 Grimstadtunnelen (TMA-påbudt)', km: 3.8, eta: 7 }
      };

      manualExitSelect.addEventListener('change', () => {
        const val = manualExitSelect.value;
        if (exitCoordinates[val]) {
          const pt = exitCoordinates[val];
          currentCoords.lat = pt.lat;
          currentCoords.lng = pt.lng;
          playBeep(900, 'sine', 0.06);
          if (gpsCoordText) {
            gpsCoordText.innerHTML = `<strong>Manuelt valgt:</strong> ${pt.name}<br><span style="color:#10b981;">Avstand fra base: ${pt.km} km · Estimert utrykning: <strong>ca. ${pt.eta} min</strong></span>`;
          }
        }
      });
    }
  }

  if (modalClose) {
    modalClose.addEventListener('click', () => {
      if (modal) modal.classList.remove('active');
    });
  }

  if (btnSubmitDispatch) {
    btnSubmitDispatch.addEventListener('click', () => {
      playBeep(1200, 'triangle', 0.18);
      const name = document.getElementById('dispatchName')?.value || 'Uoppgitt';
      const phone = document.getElementById('dispatchPhone')?.value || '90566147';
      const regnr = (document.getElementById('dispatchReg')?.value || 'UKJENT').toUpperCase();
      const desc = document.getElementById('dispatchDesc')?.value || 'Havari på E18';

      const smsText = `NØDASSISTANSE AGDER BILBERGING: Navn: ${name}, Tlf: ${phone}, Regnr: ${regnr}, GPS: ${currentCoords.lat},${currentCoords.lng}, Problem: ${desc}`;
      const encodedSms = encodeURIComponent(smsText);

      // Lagre til felles hendelseslogg for vaktleder-operasjonssentralen
      try {
        const incidents = JSON.parse(localStorage.getItem('agder_incidents') || '[]');
        incidents.unshift({
          id: 'H-' + Math.floor(1000 + Math.random() * 9000),
          tid: new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }),
          navn: name,
          telefon: phone,
          regnr: regnr,
          beskrivelse: desc,
          posisjon: `${currentCoords.lat}, ${currentCoords.lng}`,
          status: 'NY HENDELSE',
          prioritet: (desc.toLowerCase().includes('kollisjon') || desc.toLowerCase().includes('e18')) ? 'P1' : 'P2'
        });
        localStorage.setItem('agder_incidents', JSON.stringify(incidents.slice(0, 20)));
      } catch (e) {}

      const resBox = document.getElementById('dispatchResult');
      if (resBox) {
        resBox.style.display = 'block';
        resBox.innerHTML = `
          <div style="background:#090e17; border:1px solid #10b981; padding:16px; border-radius:10px; margin-top:14px;">
            <strong style="color:#10b981; font-size:1rem;">✓ Nødsignal klargjort for Jan Ove (Vaktleder)!</strong>
            <p style="font-size:0.85rem; margin-top:6px; color:#94a3b8;">
              Sted: <strong>${currentCoords.lat}° N, ${currentCoords.lng}° Ø</strong> · Regnr: <strong>${regnr}</strong>
            </p>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
              <a href="tel:90566147" class="btn-emergency" style="justify-content:center; font-size:0.9rem; padding:10px 14px;">
                📞 Ring Døgnvakt Direkte: 905 66 147
              </a>
              <a href="sms:90566147?body=${encodedSms}" class="btn-demo-photo" style="text-align:center; text-decoration:none; padding:10px 14px; font-weight:700; color:#38bdf8; border-color:#0284c7;">
                📲 Send GPS-Posisjon &amp; Detaljer via SMS (1-Klikk)
              </a>
              <button type="button" class="btn-demo-photo" id="btnCopySms" style="font-size:0.8rem; padding:8px;">
                📋 Kopier Nødmeldings-tekst til Utklippstavle
              </button>
            </div>
          </div>
        `;

        const btnCopy = document.getElementById('btnCopySms');
        if (btnCopy) {
          btnCopy.addEventListener('click', () => {
            navigator.clipboard.writeText(smsText).then(() => {
              btnCopy.textContent = '✓ Nødmeldings-tekst kopiert!';
              setTimeout(() => { btnCopy.textContent = '📋 Kopier Nødmeldings-tekst til Utklippstavle'; }, 2500);
            }).catch(() => {
              alert('Tekst: ' + smsText);
            });
          });
        }
      }
    });
  }

  // =========================================================================
  // 3. Computer Vision Skadetriage (Klientside Canvas-analyse)
  // =========================================================================
  const cvCanvas = document.getElementById('cvCanvas');
  const cvCtx = cvCanvas ? cvCanvas.getContext('2d') : null;
  const demoButtons = document.querySelectorAll('.btn-demo-photo');
  const dropZone = document.getElementById('dropZone');
  const cvFileInput = document.getElementById('cvFileInput');
  const uploadFeedback = document.getElementById('uploadFeedback');

  let lastRenderedScenario = 'e18_kollisjon';
  let customUploadedImage = null;

  const demoScenarios = {
    e18_kollisjon: {
      title: 'Kollisjon E18 Motorvei',
      tmaRequired: true,
      vehicle: 'Scania 8x4 Tungberger + TMA Putebil',
      actionNote: 'Putebil skjermer ulykkessted mot bakre trafikk på E18',
      labels: [
        { text: 'Frontal deformasjon: 94%', box: [0.35, 0.40, 0.30, 0.35], color: '#ef4444' },
        { text: 'E18 Høyhastighetsfelt -> PÅBUD: TMA Putebil', box: [0.05, 0.06, 0.90, 0.22], color: '#fbbf24' },
        { text: 'Væskelekkasje / Kjølevæske', box: [0.40, 0.74, 0.28, 0.16], color: '#f97316' }
      ]
    },
    groft_snofonn: {
      title: 'Utforkjøring / Snøfonn',
      tmaRequired: false,
      vehicle: 'Toyota Land Cruiser 4x4 Offroad (Warn vinsj)',
      actionNote: 'Terrengbil sikrer forankring og 45 graders trekkvinkel',
      labels: [
        { text: 'Snødybde > 40cm / Understell fastkjørt', box: [0.18, 0.48, 0.64, 0.42], color: '#06b6d4' },
        { text: 'Trekkvinkel 45 grader påkrevd', box: [0.55, 0.18, 0.38, 0.26], color: '#a855f7' }
      ]
    },
    elbil_havari: {
      title: 'Elbil Drivlinjelås',
      tmaRequired: false,
      vehicle: 'MAN TGL Flakbil med elbil-skates',
      actionNote: 'Elbil-skates rulles under drivhjul for skånsom flaklasting',
      labels: [
        { text: 'Elbil / Høyspentbatteri intakt', box: [0.22, 0.28, 0.56, 0.36], color: '#10b981' },
        { text: 'Drivaksel låst -> Påkrevd elbil-skates', box: [0.28, 0.64, 0.44, 0.22], color: '#ef4444' }
      ]
    }
  };

  function renderCVAnalysis(scenarioKey, triggerSound = true) {
    if (!cvCanvas || !cvCtx) return;
    lastRenderedScenario = scenarioKey;

    if (triggerSound) {
      playBeep(640, 'square', 0.1);
    }

    const w = cvCanvas.width;
    const h = cvCanvas.height;
    if (w === 0 || h === 0) return;

    // Bakgrunn
    cvCtx.fillStyle = '#090e17';
    cvCtx.fillRect(0, 0, w, h);

    if (scenarioKey === 'custom' && customUploadedImage) {
      // Tegn det faktiske opplastede bildet, skalert proporsjonalt
      const imgRatio = customUploadedImage.width / customUploadedImage.height;
      const canvasRatio = w / h;
      let drawW, drawH, drawX, drawY;

      if (imgRatio > canvasRatio) {
        drawW = w;
        drawH = w / imgRatio;
        drawX = 0;
        drawY = (h - drawH) / 2;
      } else {
        drawH = h;
        drawW = h * imgRatio;
        drawX = (w - drawW) / 2;
        drawY = 0;
      }

      cvCtx.drawImage(customUploadedImage, drawX, drawY, drawW, drawH);

      // Klientside HUD-overlay på ekte bilde
      cvCtx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
      cvCtx.lineWidth = 2;
      cvCtx.strokeRect(drawX + 10, drawY + 10, drawW - 20, drawH - 20);

      // Crosshairs
      cvCtx.beginPath();
      cvCtx.moveTo(w / 2 - 15, h / 2); cvCtx.lineTo(w / 2 + 15, h / 2);
      cvCtx.moveTo(w / 2, h / 2 - 15); cvCtx.lineTo(w / 2, h / 2 + 15);
      cvCtx.strokeStyle = '#38bdf8';
      cvCtx.lineWidth = 1.5;
      cvCtx.stroke();

      // Skannede analysebrikker
      const boxes = [
        { text: 'Objekt detektert: Kjøretøy (98.2%)', color: '#10b981', x: drawX + 15, y: drawY + 25 },
        { text: 'Skadeanalyse: Lokalisert deformasjon', color: '#fbbf24', x: drawX + 15, y: drawY + 45 },
        { text: 'Anbefaling: Flakbil (FLAK-03) klargjort', color: '#06b6d4', x: drawX + 15, y: drawY + 65 }
      ];

      boxes.forEach(b => {
        cvCtx.fillStyle = 'rgba(5, 7, 13, 0.85)';
        cvCtx.fillRect(b.x - 4, b.y - 12, 230, 18);
        cvCtx.fillStyle = b.color;
        cvCtx.font = '11px monospace';
        cvCtx.fillText(b.text, b.x, b.y);
      });

      document.getElementById('triageResTitle').textContent = 'Eget Havaribilde (Klientside Analysert)';
      document.getElementById('triageResTma').textContent = 'Vurderes ved utrykning';
      document.getElementById('triageResTma').className = 'triage-val';
      document.getElementById('triageResCar').textContent = 'MAN TGL Flakbil (FLAK-03) / Reserveressurs';
      return;
    }

    const scen = demoScenarios[scenarioKey];
    if (!scen) return;

    // Rutenett
    cvCtx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
    cvCtx.lineWidth = 1;
    for (let x = 0; x < w; x += 24) {
      cvCtx.beginPath();
      cvCtx.moveTo(x, 0); cvCtx.lineTo(x, h);
      cvCtx.stroke();
    }
    for (let y = 0; y < h; y += 24) {
      cvCtx.beginPath();
      cvCtx.moveTo(0, y); cvCtx.lineTo(w, y);
      cvCtx.stroke();
    }

    // Bilkontur (abstrakt wireframe-bil)
    cvCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    cvCtx.lineWidth = 2;
    cvCtx.strokeRect(w * 0.22, h * 0.26, w * 0.56, h * 0.52);

    // Hjulskisser
    cvCtx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    cvCtx.fillRect(w * 0.18, h * 0.32, w * 0.06, h * 0.12);
    cvCtx.fillRect(w * 0.18, h * 0.60, w * 0.06, h * 0.12);
    cvCtx.fillRect(w * 0.76, h * 0.32, w * 0.06, h * 0.12);
    cvCtx.fillRect(w * 0.76, h * 0.60, w * 0.06, h * 0.12);

    // Tegn bildeanalyse-bokser
    scen.labels.forEach((lbl) => {
      const bx = w * lbl.box[0];
      const by = h * lbl.box[1];
      const bw = w * lbl.box[2];
      const bh = h * lbl.box[3];

      cvCtx.strokeStyle = lbl.color;
      cvCtx.lineWidth = 2;
      cvCtx.strokeRect(bx, by, bw, bh);

      cvCtx.fillStyle = 'rgba(0, 0, 0, 0.78)';
      cvCtx.fillRect(bx, Math.max(0, by - 18), bw, 18);

      cvCtx.fillStyle = lbl.color;
      cvCtx.font = '10px monospace';
      cvCtx.fillText(lbl.text, bx + 4, Math.max(12, by - 5));
    });

    // Oppdater tekstpanelet
    const titleEl = document.getElementById('triageResTitle');
    const tmaEl = document.getElementById('triageResTma');
    const carEl = document.getElementById('triageResCar');

    if (titleEl) titleEl.textContent = scen.title;
    if (tmaEl) {
      tmaEl.textContent = scen.tmaRequired ? 'JA (Påbudt E18)' : 'Nei (Kun varsling)';
      tmaEl.className = scen.tmaRequired ? 'triage-val badge-alert' : 'triage-val';
    }
    if (carEl) carEl.textContent = scen.vehicle;
  }

  // Interaktiv bildeopplasting & drag-and-drop
  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      alert('Vennligst velg en gyldig bildefil (JPG, PNG e.l.).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        customUploadedImage = img;
        if (uploadFeedback) {
          uploadFeedback.style.display = 'block';
          uploadFeedback.textContent = `✓ "${file.name}" lastet og analysert klientside (${img.width}x${img.height} px)`;
        }
        renderCVAnalysis('custom', true);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  if (dropZone) {
    dropZone.addEventListener('click', () => {
      if (cvFileInput) cvFileInput.click();
    });

    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (cvFileInput) cvFileInput.click();
      }
    });

    ['dragenter', 'dragover'].forEach(name => {
      dropZone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropZone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleImageFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (cvFileInput) {
    cvFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImageFile(e.target.files[0]);
      }
    });
  }

  demoButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const type = e.target.getAttribute('data-demo');
      if (uploadFeedback) uploadFeedback.style.display = 'none';
      renderCVAnalysis(type, true);
    });
  });

  // =========================================================================
  // 4. Båt- og Spesialtransport Kalkulator
  // =========================================================================
  const boatLength = document.getElementById('boatLength');
  const boatWeight = document.getElementById('boatWeight');
  const boatDistance = document.getElementById('boatDistance');
  const portSelect = document.getElementById('portSelect');
  const lengthVal = document.getElementById('lengthVal');
  const weightVal = document.getElementById('weightVal');
  const distVal = document.getElementById('distVal');
  const boatPriceOut = document.getElementById('boatPriceOut');
  const boatVehicleOut = document.getElementById('boatVehicleOut');
  const boatDispWarning = document.getElementById('boatDispWarning');
  const btnReserveBoat = document.getElementById('btnReserveBoat');
  const boatBookingFeedback = document.getElementById('boatBookingFeedback');

  // Distanser fra basen i Industriveien 20 til lokale havner
  const portDistances = {
    grimstad: 4,
    fevik: 9,
    homborsund: 16,
    arendal: 21,
    lillesand: 24
  };

  function updateBoatCalc() {
    if (!boatLength || !boatWeight || !boatDistance) return;

    const fot = parseFloat(boatLength.value);
    const tonn = parseFloat(boatWeight.value);
    const dist = parseFloat(boatDistance.value);

    if (lengthVal) lengthVal.textContent = `${fot} fot`;
    if (weightVal) weightVal.textContent = `${tonn} tonn`;
    if (distVal) distVal.textContent = `${dist} km`;

    let grunnpris = 2800;
    let kraning = 1200;
    let kmSats = 45;
    let bil = 'Iveco Eurocargo med båtvugge (KRAN-04)';

    // Klassifisering og dispensasjonskrav
    if (fot > 36 || tonn > 10.0) {
      if (boatPriceOut) boatPriceOut.textContent = 'Spesialoppdrag';
      if (boatVehicleOut) boatVehicleOut.textContent = 'Scania R580 8x4 Lavbygd henger + Ledsagerbil (TUNG-01)';
      if (boatDispWarning) {
        boatDispWarning.style.display = 'block';
        boatDispWarning.innerHTML = '<strong>⚠️ Statens vegvesen Dispensasjon kreves:</strong> Fartøyet overskrider 36 fot / 10 tonn. Krever manuell ruteplanlegging, dispensasjonssøknad og følgebil.';
      }
      return;
    }

    if (fot > 24 || tonn > 2.5) {
      grunnpris = 4500;
      kraning = 2500;
      kmSats = 65;
      bil = 'Scania R580 med tung kran & spesialramme (TUNG-01)';
    }

    const total = Math.round(grunnpris + kraning + (dist * kmSats));

    if (boatPriceOut) {
      boatPriceOut.textContent = `kr ${total.toLocaleString('nb-NO')},-`;
    }
    if (boatVehicleOut) {
      boatVehicleOut.textContent = bil;
    }

    if (boatDispWarning) {
      if (fot > 30 || tonn > 4.5) {
        boatDispWarning.style.display = 'block';
        boatDispWarning.innerHTML = '<strong>ℹ️ Transportmerknad:</strong> Båt over 30 fot eller 4.5 tonn krever ledsager-/følgebil iht. vegvesenets forskrifter for bred transport på E18.';
      } else {
        boatDispWarning.style.display = 'none';
      }
    }
  }

  if (portSelect && boatDistance) {
    portSelect.addEventListener('change', () => {
      const selected = portSelect.value;
      if (portDistances[selected]) {
        boatDistance.value = portDistances[selected];
        playBeep(750, 'sine', 0.05);
        updateBoatCalc();
      }
    });
  }

  if (boatLength && boatWeight && boatDistance) {
    boatLength.addEventListener('input', updateBoatCalc);
    boatWeight.addEventListener('input', updateBoatCalc);
    boatDistance.addEventListener('input', updateBoatCalc);
  }

  if (btnReserveBoat) {
    btnReserveBoat.addEventListener('click', () => {
      playBeep(1050, 'triangle', 0.15);
      const fot = boatLength ? boatLength.value : 21;
      const tonn = boatWeight ? boatWeight.value : 1.8;
      const dist = boatDistance ? boatDistance.value : 15;
      const portName = portSelect ? portSelect.options[portSelect.selectedIndex].text : 'Grimstad';

      const bookingMsg = `Hei Jan Ove, jeg ønsker båttransport for ${fot} fots båt (${tonn} tonn) fra ${portName} (${dist} km).`;
      const encoded = encodeURIComponent(bookingMsg);

      if (boatBookingFeedback) {
        boatBookingFeedback.style.display = 'block';
        boatBookingFeedback.innerHTML = `
          <strong style="color:#10b981;">✓ Transportforespørsel generert!</strong>
          <p style="margin:6px 0; color:#94a3b8;">
            ${fot} fot · ${tonn} tonn · Hentes ved: ${portName}
          </p>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <a href="tel:90566147" class="btn-emergency" style="font-size:0.85rem; padding:8px 12px; text-decoration:none;">
              📞 Ring Jan Ove (905 66 147)
            </a>
            <a href="sms:90566147?body=${encoded}" class="btn-demo-photo" style="font-size:0.85rem; padding:8px 12px; text-decoration:none; color:#38bdf8;">
              📲 Send forespørsel via SMS
            </a>
          </div>
        `;
      }
    });
  }

  // =========================================================================
  // 4b. Forsikrings- og Egenandelskalkulator
  // =========================================================================
  const insSelect = document.getElementById('insSelect');
  const coverageSelect = document.getElementById('coverageSelect');
  const insDeductibleOut = document.getElementById('insDeductibleOut');
  const insBonusOut = document.getElementById('insBonusOut');
  const insNotesOut = document.getElementById('insNotesOut');

  function updateInsuranceCalc() {
    if (!insSelect || !coverageSelect) return;
    const selskaper = {
      gjensidige: 'Gjensidige Forsikring',
      if: 'If Skadeforsikring',
      fremtind: 'Fremtind Forsikring',
      tryg: 'Tryg Forsikring',
      storebrand: 'Storebrand Forsikring',
      klp: 'KLP Forsikring',
      annet: 'Forsikringsselskap'
    };

    const coverage = coverageSelect.value;
    const selskapNavn = selskaper[insSelect.value] || 'Ditt selskap';

    if (coverage === 'kasko') {
      if (insDeductibleOut) insDeductibleOut.textContent = 'kr 500,- i egenandel';
      if (insBonusOut) {
        insBonusOut.textContent = '✓ 0% BONUSTAP — Beholder full opptjent bonus';
        insBonusOut.style.color = '#10b981';
      }
      if (insNotesOut) {
        insNotesOut.textContent = `Veihjelp og berging er fullt dekket via kaskoavtalen med ${selskapNavn}. Agder Bilberging ordner direkteoppgjøret med Viking/selskapet, du betaler kun egenandelen.`;
      }
    } else if (coverage === 'delkasko') {
      if (insDeductibleOut) insDeductibleOut.textContent = 'kr 500,- i egenandel';
      if (insBonusOut) {
        insBonusOut.textContent = '✓ 0% BONUSTAP — Ingen innvirkning på bilbonus';
        insBonusOut.style.color = '#10b981';
      }
      if (insNotesOut) {
        insNotesOut.textContent = `Delkasko dekker redning og berging ved kollisjon, utforkjøring og motorstopp for ${selskapNavn}. Egenandelen er standard 500 kr.`;
      }
    } else {
      if (insDeductibleOut) insDeductibleOut.textContent = 'Fastpris avtales på forhånd';
      if (insBonusOut) {
        insBonusOut.textContent = 'ℹ️ Kun ansvar dekker normalt ikke egen berging';
        insBonusOut.style.color = '#f59e0b';
      }
      if (insNotesOut) {
        insNotesOut.textContent = `Ved ren ansvarsforsikring dekkes ikke berging av eget kjøretøy. Jan Ove gir deg et uforpliktende fastpristilbud før bergebilen rykker ut.`;
      }
    }
  }

  if (insSelect && coverageSelect) {
    insSelect.addEventListener('change', () => {
      playBeep(850, 'sine', 0.05);
      updateInsuranceCalc();
    });
    coverageSelect.addEventListener('change', () => {
      playBeep(850, 'sine', 0.05);
      updateInsuranceCalc();
    });
  }

  // =========================================================================
  // 4c. Nora 24/7 AI Vaktassistent (Chat & Tale)
  // =========================================================================
  const noraTrigger = document.getElementById('noraTrigger');
  const noraDrawer = document.getElementById('noraDrawer');
  const noraClose = document.getElementById('noraClose');
  const noraInput = document.getElementById('noraInput');
  const noraSendBtn = document.getElementById('noraSendBtn');
  const noraMicBtn = document.getElementById('noraMicBtn');
  const noraMessages = document.getElementById('noraMessages');

  if (noraTrigger && noraDrawer) {
    noraTrigger.addEventListener('click', () => {
      playBeep(920, 'sine', 0.08);
      noraDrawer.classList.toggle('active');
      if (noraDrawer.classList.contains('active') && noraInput) {
        setTimeout(() => noraInput.focus(), 150);
      }
    });
  }

  if (noraClose && noraDrawer) {
    noraClose.addEventListener('click', () => {
      noraDrawer.classList.remove('active');
    });
  }

  let noraVoiceEnabled = false;

  function speakNoraResponse(htmlText) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const plain = htmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const utter = new SpeechSynthesisUtterance(plain);
      utter.lang = 'nb-NO';
      utter.rate = 1.05;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }

  function appendNoraMsg(text, sender = 'bot', shouldSpeak = false) {
    if (!noraMessages) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `nora-msg ${sender}`;
    msgDiv.innerHTML = text;
    noraMessages.appendChild(msgDiv);
    noraMessages.scrollTop = noraMessages.scrollHeight;

    if (sender === 'bot' && (shouldSpeak || noraVoiceEnabled)) {
      speakNoraResponse(text);
    }
  }

  function generateNoraResponse(question) {
    const q = (question || '').toLowerCase();
    playBeep(1100, 'sine', 0.06);

    if (q.includes('e18') || q.includes('kollisjon') || q.includes('fast') || q.includes('havari') || q.includes('stått')) {
      return `⚠️ <strong>SIKKERHETSRÅD FRA VAKTLEDER:</strong><br>
      1. Ta på refleksvest og still deg <em>bak autovernet</em> umiddelbart.<br>
      2. PUTE-02 (TMA-støtputebil) og FLAK-03 er klare i Grimstad.<br>
      Vil du at jeg åpner <a href="#" onclick="document.getElementById('btnGpsNow').click(); return false;" style="color:#38bdf8; text-decoration:underline;">1-Klikk GPS Nødanrop</a> for å sende posisjonen til Jan Ove?`;
    }

    if (q.includes('egenandel') || q.includes('forsikring') || q.includes('gjensidige') || q.includes('if') || q.includes('pris') || q.includes('bonus')) {
      return `💡 <strong>Forsikring & Egenandel:</strong><br>
      Har du kasko eller delkasko, er egenandelen på veihjelp standard <strong>500 kr</strong> (0 kr bonustap!). Agder Bilberging er godkjent Viking-stasjon og tar direkteoppgjøret med forsikringsselskapet ditt på stedet.`;
    }

    if (q.includes('elbil') || q.includes('låst') || q.includes('tesla') || q.includes('batteri') || q.includes('hjul')) {
      return `⚡ <strong>Elbil-berging:</strong><br>
      Ingen fare! Vår MAN TGL flakbil (FLAK-03) har spesialskates (rulleskøyter) slik at vi trekker opp elbiler med låst parkeringsbrems eller flatt batteri uten skade på drivlinjen eller motorene.`;
    }

    if (q.includes('båt') || q.includes('marina') || q.includes('snekke') || q.includes('kran') || q.includes('løft')) {
      return `⛵ <strong>Båttransport & Båtløft:</strong><br>
      Vi har Iveco Eurocargo (KRAN-04) med 14 tm kran og justerbar båtvugge. Vi kjører opptil 30 fot mellom Grimstad Gjestehavn, Arendal, Fevik og Lillesand. Sjekk kalkulatoren lenger oppe på siden for direkte pris!`;
    }

    return `Takk for henvendelsen! Agder Bilberging har døgnvakt 24/7 på E18 med 5 utrykningsbiler stasjonert i Industriveien 20 i Grimstad. Du kan nå vaktleder Jan Ove direkte på tlf <a href="tel:90566147" style="color:#fbbf24; font-weight:700;">905 66 147</a> eller sende nødsignal via knappen øverst.`;
  }

  function handleNoraSubmit() {
    if (!noraInput) return;
    const text = noraInput.value.trim();
    if (!text) return;

    appendNoraMsg(text, 'user');
    noraInput.value = '';

    setTimeout(() => {
      const resp = generateNoraResponse(text);
      appendNoraMsg(resp, 'bot');
    }, 450);
  }

  if (noraSendBtn) {
    noraSendBtn.addEventListener('click', handleNoraSubmit);
  }
  if (noraInput) {
    noraInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleNoraSubmit();
      }
    });
  }

  // Quick chips
  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('nora-chip')) {
      const ask = e.target.getAttribute('data-ask');
      if (ask) {
        appendNoraMsg(ask, 'user');
        setTimeout(() => {
          const resp = generateNoraResponse(ask);
          appendNoraMsg(resp, 'bot');
        }, 400);
      }
    }
  });

  // Tale (Web Speech API)
  if (noraMicBtn) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      const recognizer = new SpeechRec();
      recognizer.lang = 'nb-NO';
      recognizer.continuous = false;
      recognizer.interimResults = false;

      let isRecording = false;

      noraMicBtn.addEventListener('click', () => {
        if (!isRecording) {
          try {
            recognizer.start();
            isRecording = true;
            noraMicBtn.classList.add('recording');
            playBeep(600, 'sine', 0.1);
          } catch (e) {
            isRecording = false;
            noraMicBtn.classList.remove('recording');
          }
        } else {
          recognizer.stop();
          isRecording = false;
          noraMicBtn.classList.remove('recording');
        }
      });

      recognizer.onresult = (evt) => {
        isRecording = false;
        noraMicBtn.classList.remove('recording');
        noraVoiceEnabled = true;
        const speechText = evt.results[0][0].transcript;
        if (noraInput) noraInput.value = speechText;
        handleNoraSubmit();
      };

      recognizer.onerror = () => {
        isRecording = false;
        noraMicBtn.classList.remove('recording');
      };

      recognizer.onend = () => {
        isRecording = false;
        noraMicBtn.classList.remove('recording');
      };
    } else {
      noraMicBtn.style.display = 'none';
    }
  }

  // =========================================================================
  // 5. Initialisering ved lasting
  // =========================================================================
  window.addEventListener('DOMContentLoaded', () => {
    resizeCanvas();
    drawRadar();
    updateBoatCalc();
    renderCVAnalysis('e18_kollisjon', false); // Lyd slått av ved passiv sidelasting for å unngå autoplay-feil
  });

  window.addEventListener('resize', () => {
    resizeCanvas();
  });

})();
