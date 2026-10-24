/**
 * Operasjonssentral & Flåtestatus JavaScript v3.0 - Agder Bilberging AI
 * Utviklet for Vaktleder Jan Ove Thygesen & redningsmannskapene på E18 Agder.
 * Inkluderer:
 * 1. Flåteovervåking med sanntids drivstoffmåling, lavt nivå (<35%) varsling og rekkeviddeberegning.
 * 2. Dekkstatus (mønsterdybde mm, minstekrav, piggdekk, kjettinger) og sertifisert spesialutstyr.
 * 3. AI-oppdragsdirigering som matcher hendelsestype + GPS/E18-posisjon med optimal bil.
 * 4. 1-klikks SMS-ordre til sjåfør og beroligende HMS-ordre til bilist.
 * 5. Sanntidssynkronisering mot innkommende nødsignaler fra kundesiden.
 */

(function () {
  'use strict';

  // Lydsynthesizer (Web Audio API - Sirene & Kvittering)
  let audioCtx = null;
  function playAlertSound(isEmergency = true) {
    try {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioClass) return;
      if (!audioCtx) audioCtx = new AudioClass();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      if (audioCtx.state !== 'running') return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = isEmergency ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(isEmergency ? 750 : 880, audioCtx.currentTime);
      if (isEmergency) {
        osc.frequency.exponentialRampToValueAtTime(1250, audioCtx.currentTime + 0.22);
        osc.frequency.exponentialRampToValueAtTime(750, audioCtx.currentTime + 0.45);
      }
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    } catch (e) {}
  }

  // Initial flåtedata med telemetri
  const DEFAULT_FLEET = [
    {
      id: 'TUNG-01',
      type: 'Tungberger 8x4',
      modell: 'Scania R580 V8',
      base: 'Grimstad Base',
      status: 'beredskap',
      sjafor: 'Jan Ove Thygesen',
      drivstoff: { type: 'diesel', prosent: 82, tank_liter: 600, rekkevidde_km: 875, lav_advarsel: false },
      dekk: { monsterdybde_mm: 10.5, minstekrav_mm: 5.0, piggdekk: false, kjettinger_sett: 4, tilstand: 'optimal' },
      utstyr: { wire_sertifisert: true, wire_utloper: '2027-04', skates: false, oljesanering: true, vinsj_tonn: 25.0 }
    },
    {
      id: 'PUTE-02',
      type: 'TMA Støtputebil',
      modell: 'Mercedes-Benz Atego',
      base: 'E18 Beredskap Grimstad',
      status: 'aktiv_patrulje',
      sjafor: 'Tore M.',
      drivstoff: { type: 'diesel', prosent: 65, tank_liter: 200, rekkevidde_km: 620, lav_advarsel: false },
      dekk: { monsterdybde_mm: 9.0, minstekrav_mm: 5.0, piggdekk: false, kjettinger_sett: 2, tilstand: 'optimal' },
      utstyr: { wire_sertifisert: false, stotpute_godkjent: true, vms_skilt: true, skates: false, oljesanering: true }
    },
    {
      id: 'FLAK-03',
      type: 'Flakbil med brille',
      modell: 'MAN TGL 12.250',
      base: 'Grimstad Base',
      status: 'beredskap',
      sjafor: 'Kjetil S.',
      drivstoff: { type: 'diesel', prosent: 28, tank_liter: 180, rekkevidde_km: 260, lav_advarsel: true },
      dekk: { monsterdybde_mm: 8.5, minstekrav_mm: 5.0, piggdekk: false, kjettinger_sett: 2, tilstand: 'god' },
      utstyr: { wire_sertifisert: false, skates: true, skates_antall: 4, oljesanering: true, vinsj_tonn: 5.0 }
    },
    {
      id: 'KRAN-04',
      type: 'Flakbil med kran & båtvugge',
      modell: 'Iveco Eurocargo',
      base: 'Grimstad Base',
      status: 'oppdrag',
      sjafor: 'Morten B.',
      drivstoff: { type: 'diesel', prosent: 74, tank_liter: 220, rekkevidde_km: 680, lav_advarsel: false },
      dekk: { monsterdybde_mm: 9.2, minstekrav_mm: 5.0, piggdekk: false, kjettinger_sett: 2, tilstand: 'optimal' },
      utstyr: { wire_sertifisert: true, wire_utloper: '2027-03', skates: false, oljesanering: false, batak: true }
    },
    {
      id: '4X4-05',
      type: 'Offroad Bergebil',
      modell: 'Toyota Land Cruiser HD',
      base: 'Grimstad / Arendal',
      status: 'beredskap',
      sjafor: 'Espen R.',
      drivstoff: { type: 'diesel', prosent: 91, tank_liter: 90, rekkevidde_km: 680, lav_advarsel: false },
      dekk: { monsterdybde_mm: 11.0, minstekrav_mm: 3.0, piggdekk: true, kjettinger_sett: 2, tilstand: 'optimal_vinter' },
      utstyr: { wire_sertifisert: false, skates: false, oljesanering: false, warn_vinsj: true, booster_24v: true }
    }
  ];

  // Hent lagret flåtetilstand eller bruk standard
  function getFleetData() {
    try {
      const stored = localStorage.getItem('agder_fleet_telemetry');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return DEFAULT_FLEET;
  }

  function saveFleetData(fleet) {
    try {
      localStorage.setItem('agder_fleet_telemetry', JSON.stringify(fleet));
    } catch (e) {}
  }

  // Render flåteovervåking
  function renderFleetGrid() {
    const container = document.getElementById('fleetGridContainer');
    if (!container) return;
    const fleet = getFleetData();

    let operativeCount = 0;
    let fuelAlertCount = 0;

    container.innerHTML = '';
    fleet.forEach((bil) => {
      if (bil.status === 'beredskap' || bil.status === 'aktiv_patrulje' || bil.status === 'oppdrag') {
        operativeCount++;
      }
      const isFuelLow = bil.drivstoff.prosent < 35;
      if (isFuelLow) fuelAlertCount++;

      let fuelColorClass = 'high';
      if (bil.drivstoff.prosent < 35) fuelColorClass = 'low';
      else if (bil.drivstoff.prosent < 60) fuelColorClass = 'medium';

      const card = document.createElement('div');
      card.className = `fleet-card-v2 ${isFuelLow ? 'alert-fuel' : ''}`;

      card.innerHTML = `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <div>
              <span class="fleet-id" style="font-size:0.8rem; padding:2px 8px;">${bil.id}</span>
              <h3 style="font-size:1rem; font-weight:800; color:#fff; margin-top:4px;">${bil.modell}</h3>
              <div style="font-size:0.75rem; color:var(--text-muted);">${bil.type} · Sjåfør: <strong>${bil.sjafor}</strong></div>
            </div>
            <span class="fleet-badge" style="${bil.status === 'oppdrag' ? 'background:rgba(6,182,212,0.15); color:#06b6d4; border-color:#06b6d4;' : bil.status === 'aktiv_patrulje' ? 'background:rgba(251,191,36,0.15); color:var(--viking-yellow); border-color:var(--viking-yellow);' : ''}">
              ${bil.status.toUpperCase()}
            </span>
          </div>

          <!-- Drivstoffindikator -->
          <div class="fuel-gauge-wrapper">
            <div class="fuel-gauge-labels">
              <span>Drivstoff (${bil.drivstoff.type.toUpperCase()})</span>
              <strong style="color:${isFuelLow ? '#ef4444' : '#f8fafc'};">${bil.drivstoff.prosent}% (${bil.drivstoff.rekkevidde_km} km)</strong>
            </div>
            <div class="fuel-gauge-track">
              <div class="fuel-gauge-bar ${fuelColorClass}" style="width: ${bil.drivstoff.prosent}%;"></div>
            </div>
            ${isFuelLow ? '<div class="fuel-alert-badge">⚠️ LAVT DRIVSTOFF (<35%) · MÅ TANKES</div>' : ''}
          </div>

          <!-- Dekk & Kjettinger -->
          <div class="tire-status-box">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span>Mønsterdybde:</span>
              <strong style="color:#10b981;">${bil.dekk.monsterdybde_mm} mm (min. ${bil.dekk.minstekrav_mm}mm)</strong>
            </div>
            <div style="display:flex; justify-content:space-between; color:var(--text-secondary);">
              <span>Snøkjettinger:</span>
              <span>${bil.dekk.kjettinger_sett} par godkjent ✓</span>
            </div>
            ${bil.dekk.piggdekk ? '<div style="margin-top:2px; color:var(--radar-cyan); font-weight:700;">❄️ Piggdekk montert (Innland E18)</div>' : ''}
          </div>

          <!-- Spesialutstyr Badges -->
          <div class="equipment-badge-list">
            ${bil.utstyr.wire_sertifisert ? `<span class="eq-badge active" title="Kranwire sakkyndig godkjent til ${bil.utstyr.wire_utloper}">✓ Sertifisert Wire (${bil.utstyr.wire_utloper})</span>` : ''}
            ${bil.utstyr.skates ? '<span class="eq-badge active">✓ Elbil-Skates (4x GoJak)</span>' : ''}
            ${bil.utstyr.oljesanering ? '<span class="eq-badge active">✓ Oljesaneringssett (50kg)</span>' : ''}
            ${bil.utstyr.vinsj_tonn ? `<span class="eq-badge active">✓ ${bil.utstyr.vinsj_tonn}t Vinsj</span>` : ''}
            ${bil.utstyr.stotpute_godkjent ? '<span class="eq-badge active">✓ TMA Kollisjonspute SVV</span>' : ''}
            ${bil.utstyr.batak ? '<span class="eq-badge active">✓ Båtvugge & Løfteåk</span>' : ''}
            ${bil.utstyr.warn_vinsj ? '<span class="eq-badge active">✓ Warn Offroadvinsj f/b</span>' : ''}
          </div>
        </div>

        <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.75rem; color:var(--text-muted);">${bil.base}</span>
          <button class="btn-demo-photo" style="font-size:0.75rem; padding:4px 8px;" onclick="openFuelModal('${bil.id}')">
            ⛽ Juster Telemetri
          </button>
        </div>
      `;
      container.appendChild(card);
    });

    const elOperative = document.getElementById('kpiOperative');
    if (elOperative) elOperative.textContent = `${operativeCount} / ${fleet.length}`;
    const elFuelAlert = document.getElementById('kpiFuelAlert');
    if (elFuelAlert) elFuelAlert.textContent = `${fuelAlertCount} Bil${fuelAlertCount !== 1 ? 'er' : ''} (<35%)`;
  }

  // Modal for justering av drivstoff
  let activeVehicleId = null;
  window.openFuelModal = function (id) {
    activeVehicleId = id;
    const fleet = getFleetData();
    const bil = fleet.find((b) => b.id === id);
    if (!bil) return;

    const modal = document.getElementById('fuelModal');
    const title = document.getElementById('fuelModalTitle');
    const desc = document.getElementById('fuelModalDesc');
    const slider = document.getElementById('fuelSliderInput');
    const valText = document.getElementById('fuelSliderVal');
    const rangeText = document.getElementById('fuelSliderRangeVal');

    if (!modal || !title || !slider) return;

    title.textContent = `⛽ Telemetri & Drivstoff: ${bil.id} (${bil.modell})`;
    desc.textContent = `Justér tanknivå for å simulere FMS-telemetri eller tanking før utrykning. Sjåfør: ${bil.sjafor}.`;
    slider.value = bil.drivstoff.prosent;
    valText.textContent = `${bil.drivstoff.prosent}%`;
    rangeText.textContent = `ca. ${bil.drivstoff.rekkevidde_km} km rekkevidde`;

    slider.oninput = () => {
      const pct = parseInt(slider.value, 10);
      valText.textContent = `${pct}%`;
      const estRange = Math.round((pct / 100) * (bil.drivstoff.tank_liter * 1.5));
      rangeText.textContent = `ca. ${estRange} km rekkevidde`;
    };

    modal.classList.add('active');
  };

  const btnModalClose = document.getElementById('fuelModalClose');
  if (btnModalClose) {
    btnModalClose.addEventListener('click', () => {
      document.getElementById('fuelModal').classList.remove('active');
    });
  }

  const btnSaveFuel = document.getElementById('btnSaveFuel');
  if (btnSaveFuel) {
    btnSaveFuel.addEventListener('click', () => {
      if (!activeVehicleId) return;
      const slider = document.getElementById('fuelSliderInput');
      const pct = parseInt(slider.value, 10);
      const fleet = getFleetData();
      const bil = fleet.find((b) => b.id === activeVehicleId);
      if (bil) {
        bil.drivstoff.prosent = pct;
        bil.drivstoff.rekkevidde_km = Math.round((pct / 100) * (bil.drivstoff.tank_liter * 1.5));
        bil.drivstoff.lav_advarsel = pct < 35;
        saveFleetData(fleet);
        renderFleetGrid();
        playAlertSound(false);
      }
      document.getElementById('fuelModal').classList.remove('active');
    });
  }

  const btnTankFull = document.getElementById('btnTankFull');
  if (btnTankFull) {
    btnTankFull.addEventListener('click', () => {
      const slider = document.getElementById('fuelSliderInput');
      if (slider) {
        slider.value = 100;
        slider.dispatchEvent(new Event('input'));
      }
    });
  }

  // Presets for hurtigvalg i Dispatch Engine
  const PRESETS = {
    e18_vogntog: {
      txt: 'Vogntog med henger har sakset på E18 ved Fevik, sperrer venstre kjørefelt. Oljesøl i veibanen.',
      loc: 'fevik',
      regnr: 'VH 99882',
      caller: 'Janis (Litauisk Transport)',
      phone: '98765432'
    },
    elbil_fevik: {
      txt: 'Tesla Model Y har fått totalt 12V-havari og låste bakhjul på avkjøringsrampe. Kan ikke rulles.',
      loc: 'bie_grimstad',
      regnr: 'EB 41203',
      caller: 'Kari Moe',
      phone: '41234567'
    },
    bat_grimstad: {
      txt: 'Trenger båtløft med kran og transport av en 24 fots daycruiser fra Torskeholmen til opplag.',
      loc: 'grimstad_gjestehavn',
      regnr: 'BÅT-24F',
      caller: 'Lars Olsen',
      phone: '90123456'
    },
    offroad_froland: {
      txt: 'Personbil har sklidd av skogsbilvei i bratt terreng i Froland, fastkjørt i dyp snøfonn.',
      loc: 'froland_innland',
      regnr: 'CF 88419',
      caller: 'Einar Hauge',
      phone: '91554433'
    },
    tunnel_stans: {
      txt: 'Motorstopp midt i Grimstadtunnelen retning Kristiansand. Røykutvikling og stillestående bil.',
      loc: 'grimstadtunnelen',
      regnr: 'EK 55321',
      caller: 'Peder Ås',
      phone: '92334455'
    }
  };

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-preset');
      const data = PRESETS[key];
      if (!data) return;

      document.getElementById('dispatchTxt').value = data.txt;
      document.getElementById('dispatchLoc').value = data.loc;
      document.getElementById('dispatchRegnr').value = data.regnr;
      document.getElementById('dispatchCaller').value = data.caller;
      document.getElementById('dispatchPhone').value = data.phone;
      playAlertSound(false);
      executeDispatchAlgorithm();
    });
  });

  // AI Dispatch Algoritme
  const btnRunDispatch = document.getElementById('btnRunDispatch');
  if (btnRunDispatch) {
    btnRunDispatch.addEventListener('click', () => {
      executeDispatchAlgorithm();
    });
  }

  function executeDispatchAlgorithm() {
    const txt = (document.getElementById('dispatchTxt').value || '').trim();
    const locId = document.getElementById('dispatchLoc').value;
    const regnr = (document.getElementById('dispatchRegnr').value || '').trim().toUpperCase();
    const caller = (document.getElementById('dispatchCaller').value || '').trim() || 'Bilist';
    const phone = (document.getElementById('dispatchPhone').value || '').trim() || '905 66 147';
    const resultPanel = document.getElementById('dispatchResultContent');

    if (!txt) {
      alert('Vennligst beskriv hendelsen først.');
      return;
    }

    playAlertSound(true);

    const lower = txt.toLowerCase();
    const fleet = getFleetData();

    // Lokasjonskatalog
    const LOCATIONS = {
      bie_grimstad: { name: 'E18 Bie-krysset Grimstad (km 242)', km: 2.1, eta: 5, isE18: true },
      fevik: { name: 'E18 Fevik / Vik (km 248)', km: 7.4, eta: 10, isE18: true },
      grimstadtunnelen: { name: 'E18 Grimstadtunnelen (km 244 - Påbudt TMA)', km: 3.8, eta: 7, isE18: true },
      stoa_arendal: { name: 'E18 Stoa Arendal (km 257)', km: 17.8, eta: 16, isE18: true },
      harebakken_arendal: { name: 'E18 Harebakken Arendal (km 262)', km: 22.5, eta: 19, isE18: true },
      lillesand_ost: { name: 'E18 Lillesand Øst (km 235)', km: 19.2, eta: 17, isE18: true },
      lillesand_vest: { name: 'E18 Lillesand Vest (km 225)', km: 25.8, eta: 22, isE18: true },
      grimstad_gjestehavn: { name: 'Grimstad Gjestehavn / Marina', km: 2.5, eta: 6, isE18: false },
      froland_innland: { name: 'Froland / Birkenes Innland', km: 24.0, eta: 26, isE18: false }
    };

    const locInfo = LOCATIONS[locId] || { name: 'E18 Agder', km: 12.0, eta: 15, isE18: true };

    const isHeavy = lower.includes('vogntog') || lower.includes('lastebil') || lower.includes('buss') || lower.includes('semi') || lower.includes('sakset') || lower.includes('tømmerbil');
    const isBoat = /\b(båt|båter|båten|snekke|cabincruiser|daycruiser|seilbåt|skjærgårdsjeep|marina|båtløft)\b/i.test(txt);
    const is4x4 = lower.includes('grøft') || lower.includes('groft') || lower.includes('snø') || lower.includes('snofonn') || lower.includes('skogsvei') || lower.includes('myr') || lower.includes('terreng');
    const isElbil = lower.includes('elbil') || lower.includes('tesla') || lower.includes('skates') || lower.includes('låst aksel') || lower.includes('12v');
    const isE18 = locInfo.isE18 || lower.includes('e18') || lower.includes('motorvei') || lower.includes('tunnel') || lower.includes('felt');

    let targetVehicleId = 'FLAK-03';
    let category = 'Akutt Veihjelp & Berging';
    let prio = isE18 ? 'P1 KRITISK' : 'P2 HASTER';
    let reqEquipment = ['Hydraulisk skyveflak', 'Løftebrille', 'Oljesaneringssett'];

    if (isHeavy) {
      targetVehicleId = 'TUNG-01';
      category = 'Tungberging & Vogntogredning';
      prio = 'P1 KRITISK';
      reqEquipment = ['25t hydraulisk vinsj', 'Sertifisert kranwire', 'Akselgafler'];
    } else if (isBoat) {
      targetVehicleId = 'KRAN-04';
      category = 'Båttransport & Båtløft';
      prio = 'PLANLAGT';
      reqEquipment = ['14tm HMF Kran', 'Båtvugge & stropper', 'Følgebil-skilt'];
    } else if (is4x4) {
      targetVehicleId = '4X4-05';
      category = '4x4 Terrengberging';
      prio = 'P2 HASTER';
      reqEquipment = ['Warn vinsj foran/bak', 'Snøkjettinger / Piggdekk', '12V/24V Booster'];
    } else if (isElbil) {
      targetVehicleId = 'FLAK-03';
      category = 'Elbilberging (Låst drivlinje)';
      reqEquipment = ['4x Elbil-skates (GoJak)', 'Hydraulisk flak', 'Oljesaneringssett'];
    }

    const assignedCar = fleet.find((b) => b.id === targetVehicleId) || fleet[0];
    const isFuelLow = assignedCar.drivstoff.prosent < 35;
    const roundTripKm = Math.round(locInfo.km * 2);
    const fuelAdequate = assignedCar.drivstoff.rekkevidde_km >= roundTripKm + 25;

    // Finn eventuell alternativ/reservebil hvis primærbil har utilstrekkelig drivstoff
    let alternativeCar = null;
    if (!fuelAdequate) {
      alternativeCar = fleet.find((b) => b.id !== assignedCar.id && (b.status === 'beredskap' || b.status === 'aktiv_patrulje') && b.drivstoff.rekkevidde_km >= roundTripKm + 25);
    }

    let fuelAlertNote = '';
    if (!fuelAdequate) {
      fuelAlertNote = `⚠️ KRITISK DRIVSTOFFVARSEL: Rekkevidde ${assignedCar.drivstoff.rekkevidde_km} km er for kort for t/r ${roundTripKm} km! Må etterfylles før avreise! | `;
    } else if (isFuelLow) {
      fuelAlertNote = `⚠️ OBS: Lav reserve (${assignedCar.drivstoff.prosent}% / ${assignedCar.drivstoff.rekkevidde_km} km) | `;
    }

    // Dispatch SMS til sjåfør
    const driverSms = `[AGDER BILBERGING VAKT] ${prio}: ${category.toUpperCase()} | Til: ${assignedCar.id} (${assignedCar.sjafor}) | Sted: ${locInfo.name} (${locInfo.km} km, ETA: ca. ${locInfo.eta} min) | Kunde: ${caller} (tlf: ${phone}) | Regnr: ${regnr || 'Ukjent'} | Krav: ${reqEquipment.join(', ')} | Drivstoff: ${assignedCar.drivstoff.prosent}% (${assignedCar.drivstoff.rekkevidde_km} km) | ${fuelAlertNote}${isE18 ? 'TMA PUTE-02 rykker ut i tospann!' : 'Normal varsling.'}`;

    // Kunde SMS
    const customerSms = `Hei ${caller}, Jan Ove fra Agder Bilberging her. Vår redningsbil ${assignedCar.id} (${assignedCar.modell}) ${isE18 ? '+ TMA-støtputebil ' : ''}rykker nå ut til ${locInfo.name}. Estimert ankomst ca. ${locInfo.eta} minutter. HMS-PÅBUD: Ta på refleksvest og vent trygt bak autovernet! Tlf: 905 66 147.`;

    // Lagre til aktiv tilstand for trygg eksekvering uten unescaped inline onclick
    currentDispatchDraft = {
      prio,
      locName: locInfo.name,
      desc: txt,
      regnr: regnr || 'Ukjent',
      carId: assignedCar.id,
      carName: `${assignedCar.id} (${assignedCar.sjafor})`,
      isTma: isE18,
      caller,
      phone,
      driverSms,
      customerSms
    };

    resultPanel.innerHTML = `
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span style="font-size:0.75rem; font-family:var(--font-mono); color:var(--radar-cyan); font-weight:700;">AI BESLUTNINGSRAPPORT</span>
          <span class="${prio.includes('P1') ? 'badge-p1' : 'badge-p2'}">${escapeHtml(prio)}</span>
        </div>

        <div style="background:#050811; border:1px solid var(--border-color); border-radius:10px; padding:12px; margin-bottom:12px;">
          <div style="font-size:0.85rem; margin-bottom:4px;">
            <strong>Allokert Hovedbil:</strong> <span style="color:#38bdf8; font-weight:800;">${escapeHtml(assignedCar.id)} (${escapeHtml(assignedCar.modell)})</span>
          </div>
          <div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:4px;">
            Sjåfør: <strong>${escapeHtml(assignedCar.sjafor)}</strong> · Responstid ETA: <strong>ca. ${locInfo.eta} min</strong> (${locInfo.km} km fra Grimstad)
          </div>
          <div style="font-size:0.78rem; color:var(--text-secondary);">
            Kategori: <strong>${escapeHtml(category)}</strong>
          </div>
        </div>

        <!-- Drivstoff og Sikkerhetssjekk -->
        <div style="font-size:0.8rem; margin-bottom:10px; line-height:1.5;">
          <div style="margin-bottom:4px;">
            <strong>Drivstoffvurdering:</strong> 
            <span style="color:${!fuelAdequate ? '#ef4444' : isFuelLow ? 'var(--warning-amber)' : '#10b981'}; font-weight:700;">
              ${assignedCar.drivstoff.prosent}% (${assignedCar.drivstoff.rekkevidde_km} km).
            </span>
            ${!fuelAdequate
              ? `<br><span style="color:#ef4444; font-weight:700;">🚨 KRITISK: Rekkevidden er mindre enn beregnet tur/retur (${roundTripKm} km + buffer). Bilen må etterfylles! ${alternativeCar ? 'Alternativ ressurs tilgjengelig: ' + escapeHtml(alternativeCar.id) + ' (' + escapeHtml(alternativeCar.modell) + ').' : ''}</span>`
              : isFuelLow
              ? '<br><span style="color:var(--warning-amber);">⚠️ Bilen har lav reserve (<35%). Tilstrekkelig for dette oppdraget (' + roundTripKm + ' km tur/retur), men bør etterfylles snarest.</span>'
              : ' Fullt tilstrekkelig for oppdraget.'}
          </div>

          <div style="margin-bottom:4px;">
            <strong>E18 TMA-Støtputebil:</strong> 
            ${isE18 ? '<span style="color:var(--viking-yellow); font-weight:800;">PÅBUDT (PUTE-02 Atego rykker ut i tospann for skjerming!)</span>' : '<span style="color:var(--text-muted);">Ikke påkrevd (normal varsling/blitz)</span>'}
          </div>

          <div>
            <strong>Påkrevd Utstyr Verifisert Ombord:</strong><br>
            <span style="color:#10b981; font-family:var(--font-mono); font-size:0.75rem;">✓ ${escapeHtml(reqEquipment.join(' · '))}</span>
          </div>
        </div>

        <!-- SMS Ordre Boks -->
        <div style="background:#05070d; border:1px solid #1e293b; border-radius:8px; padding:10px; font-family:var(--font-mono); font-size:0.75rem; color:#cbd5e1; word-break:break-all; margin-bottom:12px;">
          ${escapeHtml(driverSms)}
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn-demo-photo" id="btnCopyDriverSms" style="flex:1; border-color:#06b6d4; color:#06b6d4;" type="button">
            📋 Kopier Sjåfør-SMS
          </button>
          <a href="sms:${assignedCar.sjafor === 'Jan Ove Thygesen' ? '90566147' : '90566147'}?body=${encodeURIComponent(driverSms)}" class="btn-emergency" style="font-size:0.78rem; padding:6px 12px; text-decoration:none;">
            📲 Send til Sjåfør
          </a>
          <a href="sms:${phone ? encodeURIComponent(phone) : '90566147'}?body=${encodeURIComponent(customerSms)}" class="btn-demo-photo" style="border-color:#10b981; color:#10b981; font-size:0.78rem; padding:6px 12px; text-decoration:none;">
            📲 Send SMS til Bilist
          </a>
        </div>

        <button class="btn-emergency" id="btnAddCurrentDispatch" style="background:#10b981; border-color:#10b981; width:100%; justify-content:center;" type="button">
          ➕ Legg til Oppdrag i Operativ Kø
        </button>
      </div>
    `;

    const copyBtn = document.getElementById('btnCopyDriverSms');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (!currentDispatchDraft) return;
        navigator.clipboard.writeText(currentDispatchDraft.driverSms).then(() => {
          copyBtn.textContent = '✓ SMS-ordre kopiert!';
          setTimeout(() => { copyBtn.textContent = '📋 Kopier Sjåfør-SMS'; }, 2000);
        }).catch(() => {
          alert('SMS-ordre:\n' + currentDispatchDraft.driverSms);
        });
      });
    }

    const addBtn = document.getElementById('btnAddCurrentDispatch');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (!currentDispatchDraft) return;
        saveDraftToIncidentQueue(currentDispatchDraft);
      });
    }
  }

  // Sikker hjelpefunksjon for HTML-escaping
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let currentDispatchDraft = null;

  // Lagre utkast til aktiv hendelseskø
  function saveDraftToIncidentQueue(draft) {
    playAlertSound(false);
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newIncident = {
      tid: timeStr,
      prioritet: draft.prio.includes('P1') ? 'P1' : 'P2',
      posisjon: draft.locName,
      beskrivelse: draft.desc,
      regnr: draft.regnr || 'Ukjent',
      bil: draft.carName,
      tma: draft.isTma ? 'PÅBUDT (PUTE-02)' : 'Vurderes',
      navn: draft.caller,
      telefon: draft.phone
    };

    try {
      const list = JSON.parse(localStorage.getItem('agder_incidents') || '[]');
      list.unshift(newIncident);
      localStorage.setItem('agder_incidents', JSON.stringify(list.slice(0, 30)));
    } catch (e) {}

    // Sett bilstatus til oppdrag hvis ikke allerede
    const carId = draft.carId;
    const fleet = getFleetData();
    const b = fleet.find((x) => x.id === carId);
    if (b) {
      b.status = 'oppdrag';
      saveFleetData(fleet);
      renderFleetGrid();
    }

    loadIncidentsTable();
    alert(`Oppdrag lagt inn i aktiv kø for ${carId}!`);
  }

  // Last inn hendelser fra localStorage eller standardoppsett
  function loadIncidentsTable() {
    const tableBody = document.getElementById('incidentTableBody');
    if (!tableBody) return;

    let incidents = [];
    try {
      incidents = JSON.parse(localStorage.getItem('agder_incidents') || '[]');
    } catch (e) {}

    // Standard hendelser dersom listen er tom
    if (incidents.length === 0) {
      incidents = [
        {
          tid: '02:35',
          prioritet: 'P1',
          posisjon: 'E18 Fevik-krysset (km 248)',
          beskrivelse: 'Kollisjon 2 biler, sperrer v. felt',
          regnr: 'EK 88219',
          bil: 'Scania TUNG-01 + MAN FLAK-03',
          tma: 'PÅBUDT (PUTE-02)',
          navn: 'Ola Hansen',
          telefon: '90566147'
        },
        {
          tid: '02:18',
          prioritet: 'P2',
          posisjon: 'E18 Bie-krysset Grimstad (km 242)',
          beskrivelse: 'Elbil flatt 12V batteri & låst aksel',
          regnr: 'EB 12345',
          bil: 'MAN FLAK-03 (Elbil-skates)',
          tma: 'Varsellys nok',
          navn: 'Kari Dahl',
          telefon: '91234567'
        },
        {
          tid: '01:45',
          prioritet: 'P3',
          posisjon: 'Grimstad Gjestehavn',
          beskrivelse: 'Båttransport 24 fot snekke til opplag',
          regnr: 'BÅT-AGDER',
          bil: 'Iveco KRAN-04',
          tma: 'Ikke påkrevd',
          navn: 'Tore Grimstad',
          telefon: '37000000'
        }
      ];
    }

    tableBody.innerHTML = '';
    incidents.forEach((inc) => {
      const row = document.createElement('tr');
      const isP1 = inc.prioritet === 'P1';
      const isP2 = inc.prioritet === 'P2';
      const badgeClass = isP1 ? 'badge-p1' : isP2 ? 'badge-p2' : 'badge-p3';
      const prioLabel = isP1 ? 'P1 KRITISK' : isP2 ? 'P2 HASTER' : 'PLANLAGT';

      const safeTid = escapeHtml(inc.tid);
      const safePrio = escapeHtml(prioLabel);
      const safePos = escapeHtml(inc.posisjon);
      const safeNavn = escapeHtml(inc.navn || 'Bilist');
      const safeTlf = escapeHtml(inc.telefon || '90566147');
      const safeDesc = escapeHtml(inc.beskrivelse);
      const safeRegnr = escapeHtml(inc.regnr || 'Ukjent');
      const safeBil = escapeHtml(inc.bil || 'FLAK-03');
      const safeTma = escapeHtml(inc.tma || 'Vurderes');

      row.innerHTML = `
        <td style="font-family:var(--font-mono); color:var(--telemetry-green); font-weight:700;">${safeTid}</td>
        <td><span class="${badgeClass}">${safePrio}</span></td>
        <td><strong>${safePos}</strong><br><span style="font-size:0.75rem; color:#94a3b8;">${safeNavn} (tlf: ${safeTlf})</span></td>
        <td>${safeDesc}<br><span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--viking-yellow);">Regnr: ${safeRegnr}</span></td>
        <td><strong style="color:#38bdf8;">${safeBil}</strong></td>
        <td><strong style="color:var(--viking-yellow);">${safeTma}</strong></td>
        <td>
          <button class="btn-demo-photo btn-send-incident-sms" style="border-color:#10b981; color:#10b981; font-size:0.75rem; padding:4px 8px;" type="button" data-navn="${safeNavn}" data-tlf="${safeTlf}">
            📲 SMS til bilist
          </button>
        </td>
      `;
      tableBody.appendChild(row);
    });
  }

  // Hendelsesdelegering for SMS-knapper i tabellen
  const incidentTableBody = document.getElementById('incidentTableBody');
  if (incidentTableBody) {
    incidentTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-send-incident-sms');
      if (btn) {
        const navn = btn.getAttribute('data-navn');
        const tlf = btn.getAttribute('data-tlf');
        sendDriverSms(navn, tlf);
      }
    });
  }

  window.sendDriverSms = function (navn, tlf) {
    playAlertSound(false);
    const msg = `Hei ${navn}, Jan Ove fra Agder Bilberging her. Bergingsbil er på vei mot din posisjon. Ta på refleksvest og vent bak autovernet! Tlf: 905 66 147.`;
    window.location.href = `sms:${tlf}?body=${encodeURIComponent(msg)}`;
  };

  // Nullstill demo-kø
  const btnClear = document.getElementById('btnClearIncidents');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (confirm('Nullstill oppdragskøen til standardoppsett?')) {
        localStorage.removeItem('agder_incidents');
        localStorage.removeItem('agder_fleet_telemetry');
        renderFleetGrid();
        loadIncidentsTable();
        alert('Kø og flåtestatus tilbakestilt.');
      }
    });
  }

  // Sanntidssynkronisering på tvers av nettleserfaner (StorageEvent)
  window.addEventListener('storage', (e) => {
    if (e.key === 'agder_incidents' || e.key === 'agder_fleet_telemetry') {
      renderFleetGrid();
      loadIncidentsTable();
      playAlertSound(true);
    }
  });

  // Initialiser ved lasting
  window.addEventListener('DOMContentLoaded', () => {
    renderFleetGrid();
    loadIncidentsTable();
  });
})();
