/**
 * NAF Senter Arendal AI - Mekaniker & Verkstedportal v1.0
 * AI Delesøk mot lokale grossister på Stoa, OBD2 DTC feilkodetriage, og PKK mangelvurdering.
 */

(function () {
  'use strict';

  // Lydfeedback
  let audioCtx = null;
  function playClick(freq = 900) {
    try {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioClass) return;
      if (!audioCtx) audioCtx = new AudioClass();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      if (audioCtx.state !== 'running') return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {}
  }

  // 1. AI Delesøk mot Stoa/Arendal grossister
  const partSearchInput = document.getElementById('partSearchInput');
  const partRegnrInput = document.getElementById('partRegnrInput');
  const btnSearchParts = document.getElementById('btnSearchParts');
  const partsResultBox = document.getElementById('partsResultBox');

  const DELE_KATALOG = {
    brems: {
      komponent: "Bremseskiver & Klosser (Foran)",
      oem: "Brembo 09.9772.11 / P 85 020",
      grossist: "Meca Arendal (Stoa)",
      lager: "PÅ LAGER (Stoa - 1,4 km)",
      budtid: 25,
      pris: "kr 2 150,-",
      normtid: "1.2 timer"
    },
    baerearm: {
      komponent: "Bærearm med integrert bærekule (Venstre foran)",
      oem: "Lemförder 38442 01",
      grossist: "Meca Arendal (Stoa)",
      lager: "PÅ LAGER (Stoa - 1,4 km)",
      budtid: 25,
      pris: "kr 1 890,-",
      normtid: "1.5 timer"
    },
    hjullager: {
      komponent: "Hjullagersett med ABS-magnetring",
      oem: "SKF VKBA 3643",
      grossist: "Romnes Agder (Arendal)",
      lager: "PÅ LAGER (Arendal - 3,5 km)",
      budtid: 35,
      pris: "kr 1 650,-",
      normtid: "1.4 timer"
    },
    fjaer: {
      komponent: "Spiralfjær foraksel (Standard chassis)",
      oem: "Lesjöfors 4082931 / Sachs",
      grossist: "Mekonomen Arendal (Vesterveien)",
      lager: "PÅ LAGER (Arendal - 2,2 km)",
      budtid: 30,
      pris: "kr 1 250,-",
      normtid: "1.6 timer"
    },
    egr: {
      komponent: "EGR-ventil med eksoskjøler",
      oem: "Wahler 710327D / VAG OEM",
      grossist: "Meca Arendal (Stoa)",
      lager: "PÅ LAGER (Stoa - 1,4 km)",
      budtid: 25,
      pris: "kr 4 200,-",
      normtid: "2.8 timer"
    },
    dpf: {
      komponent: "Differansetrykksensor DPF eksos",
      oem: "Bosch 0 281 006 005",
      grossist: "Romnes Agder (Arendal)",
      lager: "PÅ LAGER (Arendal - 3,5 km)",
      budtid: 30,
      pris: "kr 980,-",
      normtid: "0.7 timer"
    },
    batteri: {
      komponent: "12V Startbatteri AGM 70Ah / 760A",
      oem: "Varta Silver Dynamic AGM E39",
      grossist: "Meca Arendal (Stoa)",
      lager: "PÅ LAGER (Stoa - 1,4 km)",
      budtid: 25,
      pris: "kr 2 490,-",
      normtid: "0.5 timer"
    }
  };

  function handlePartsSearch() {
    if (!partSearchInput) return;
    const q = partSearchInput.value.toLowerCase().trim();
    const reg = (partRegnrInput?.value || '').toUpperCase().trim();
    if (!q) {
      alert('Skriv inn del, symptom eller feilkode for delesøk.');
      return;
    }

    playClick(1050);

    let matchKey = 'brems';
    if (q.includes('bære') || q.includes('kule') || q.includes('forstilling')) matchKey = 'baerearm';
    else if (q.includes('lager') || q.includes('hjul')) matchKey = 'hjullager';
    else if (q.includes('fjær') || q.includes('fjaer')) matchKey = 'fjaer';
    else if (q.includes('egr') || q.includes('ventil')) matchKey = 'egr';
    else if (q.includes('dpf') || q.includes('partikkel') || q.includes('trykk')) matchKey = 'dpf';
    else if (q.includes('batteri') || q.includes('12v') || q.includes('start')) matchKey = 'batteri';

    const item = DELE_KATALOG[matchKey];
    const orderTxt = `[NAF ARENDAL DELEBESTILLING] Regnr: ${reg || 'Ukjent'} | Del: ${item.komponent} | Grossist: ${item.grossist} | Levering: Budbil til Åsbieveien 14 (ca. ${item.budtid} min)`;

    if (partsResultBox) {
      partsResultBox.style.display = 'block';
      partsResultBox.innerHTML = `
        <div style="background:#080d1a; border:1px solid #10b981; border-radius:12px; padding:18px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <span style="font-size:0.75rem; color:#94a3b8; font-family:var(--font-mono);">MATCH FUNNET · OEM DELEKATALOG</span>
              <h4 style="font-size:1.15rem; font-weight:800; color:#fff; margin-top:2px;">${item.komponent}</h4>
              <div style="font-size:0.85rem; font-family:var(--font-mono); color:#06b6d4;">OEM Ref: ${item.oem}</div>
            </div>
            <span style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid #10b981; padding:4px 10px; border-radius:999px; font-size:0.75rem; font-weight:800;">
              ${item.lager}
            </span>
          </div>

          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:14px; font-size:0.82rem;">
            <div>
              <span style="color:#94a3b8;">Grossist:</span><br>
              <strong>${item.grossist}</strong>
            </div>
            <div>
              <span style="color:#94a3b8;">Est. Budbil-tid:</span><br>
              <strong style="color:var(--naf-yellow);">ca. ${item.budtid} minutter</strong>
            </div>
            <div>
              <span style="color:#94a3b8;">Normtid montering:</span><br>
              <strong>${item.normtid}</strong>
            </div>
          </div>

          <div style="background:#001f4d; border-radius:8px; padding:10px; font-family:var(--font-mono); font-size:0.78rem; color:#cbd5e1; margin-bottom:12px; word-break:break-all;">
            ${orderTxt}
          </div>

          <div style="display:flex; gap:10px;">
            <button class="btn-regnr-submit" style="font-size:0.82rem; padding:8px 14px;" onclick="navigator.clipboard.writeText('${orderTxt}').then(() => alert('Bestillingsordre kopiert til utklippstavle!'))">
              📋 Kopier Bestillingsrekvisisjon
            </button>
            <a href="tel:37005500" class="btn-nav-portal" style="font-size:0.82rem; padding:8px 14px;">
              📞 Ring Grossist
            </a>
          </div>
        </div>
      `;
    }
  }

  if (btnSearchParts) btnSearchParts.addEventListener('click', handlePartsSearch);

  // 2. OBD2 DTC Feilkodetriage
  const dtcInput = document.getElementById('dtcInput');
  const btnDiagnoseDtc = document.getElementById('btnDiagnoseDtc');
  const dtcResultBox = document.getElementById('dtcResultBox');

  const DTC_DB = {
    P0420: {
      tittel: "Katalysatoreffektivitet under terskelverdi (Bank 1)",
      arsak: "Defekt katalysator, eksoslekkasje før fremre lambdasonde, eller treg bakre O2-sensor.",
      pkk: "Grad 2 mangel (ikke godkjent pga. avgasskrav).",
      tiltak: "Kjør røyktest på eksosanlegg, sjekk O2-sensor oscilloskopkurver, sjekk for feiltenning."
    },
    P0300: {
      tittel: "Tilfeldig / Flere sylindere feiltenning detektert",
      arsak: "Slitte tennplugger, defekt coil/tennspole, falskluft i innsugsmanifold, lavt drivstofftrykk.",
      pkk: "Grad 2 mangel (motorfeillampe MIL lyser).",
      tiltak: "Inspiser tennplugger for sot/brennemerker, sjekk Short-Term Fuel Trim (STFT)."
    },
    P0101: {
      tittel: "Luftmassemåler (MAF) kretsområde / ytelse",
      arsak: "Tilsmusset måletype, oljefilm fra åpent luftfilter, sprukket innsugsslange.",
      pkk: "Grad 2 mangel ved aktiv motorlampe.",
      tiltak: "Rengjør MAF med godkjent rens, røyktest innsug etter luftfilterboks."
    },
    P2463: {
      tittel: "Dieselpartikkelfilter (DPF) - For høy sotakkumulering",
      arsak: "Gjentatte avbrutte regenereringer, defekt differansetrykksensor, defekt termostat.",
      pkk: "Grad 2 mangel (høyt partikkelutslipp).",
      tiltak: "Sjekk differansetrykk på tomgang (<10 mbar). Utfør tvungen regenerering under kjøring."
    },
    C0035: {
      tittel: "Venstre forhjul ABS-hastighetssensor kretsfeil",
      arsak: "Kabelbrudd ved fjærbein, sprukket ABS-magnetring i hjullager, defekt sensor.",
      pkk: "Grad 2 mangel (ABS-lampe lyser under kjøring).",
      tiltak: "Mål motstand i sensor, sjekk hjulhastighet med diagnose under prøverulling."
    },
    P0A80: {
      tittel: "Erstatt Hybrid / Elbil Batteripakke (Celleubalanse)",
      arsak: "Spenningstap over 0.2V mellom modulpar, degraderte celler i høyspenningsbatteri.",
      pkk: "Grad 2 mangel ved aktiv varsellampe for fremdrift.",
      tiltak: "Koble til NAF Aviloo-diagnose for komplett State-of-Health sertifisering."
    }
  };

  function handleDtcDiagnose(code) {
    const raw = (code || dtcInput?.value || '').toUpperCase().trim();
    if (!raw) {
      alert('Oppgi en DTC feilkode (f.eks. P0420).');
      return;
    }

    playClick(1200);

    const hit = DTC_DB[raw] || {
      tittel: `Generisk feilkode ${raw}`,
      arsak: "Ukjent i hurtigbase. Kan skyldes sensoravvik, spenningsfall eller ledningsbrudd.",
      pkk: "Grad 2 mangel dersom feilen tenner motorfeillampen (MIL).",
      tiltak: "Koble opp Bosch KTS eller Autel MaxiSys i Åsbieveien 14 for live-datamåling."
    };

    if (dtcResultBox) {
      dtcResultBox.style.display = 'block';
      dtcResultBox.innerHTML = `
        <div style="background:#080d1a; border:1px solid #06b6d4; border-radius:12px; padding:18px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-family:var(--font-mono); font-size:1.3rem; font-weight:900; color:var(--naf-yellow);">${raw}</span>
            <span style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid #ef4444; padding:3px 10px; border-radius:4px; font-weight:800; font-size:0.75rem;">
              PKK: ${hit.pkk.includes('Grad 2') ? 'GRAD 2 MANGEL' : 'MERKNAD'}
            </span>
          </div>
          <h4 style="font-size:1.05rem; font-weight:800; color:#fff; margin-bottom:8px;">${hit.tittel}</h4>
          <p style="font-size:0.85rem; color:#94a3b8; margin-bottom:12px;"><strong>Sannsynlig årsak:</strong> ${hit.arsak}</p>
          <div style="background:#001f4d; border-radius:8px; padding:12px; font-size:0.85rem; color:#cbd5e1; border-left:3px solid #06b6d4;">
            <strong style="color:#06b6d4;">Mekaniker-feilsøking:</strong><br>
            ${hit.tiltak}
          </div>
        </div>
      `;
    }
  }

  if (btnDiagnoseDtc) btnDiagnoseDtc.addEventListener('click', () => handleDtcDiagnose());
  window.testDtcCode = function (c) {
    if (dtcInput) dtcInput.value = c;
    handleDtcDiagnose(c);
  };

  // 3. AI PKK Mangelgradering
  const pkkCompInput = document.getElementById('pkkCompInput');
  const pkkObsInput = document.getElementById('pkkObsInput');
  const btnEvalPkk = document.getElementById('btnEvalPkk');
  const pkkResultBox = document.getElementById('pkkResultBox');

  function handlePkkEval() {
    if (!pkkObsInput) return;
    const obs = pkkObsInput.value.toLowerCase().trim();
    const comp = pkkCompInput?.value || 'Komponent';
    if (!obs) {
      alert('Vennligst beskriv verkstedobservasjonen.');
      return;
    }

    playClick(850);

    let grad = 1;
    let tittel = "Grad 1: Mindre mangel (Godkjent)";
    let badgeColor = "#38bdf8";
    let krav = "Må rettes av eier så snart som mulig, men krever ingen etterkontroll.";

    if (obs.includes('svikt') || obs.includes('knekt aksel') || obs.includes('bunn') || obs.includes('eksplosjon') || obs.includes('fare')) {
      grad = 3;
      tittel = "Grad 3: FARLIG MANGEL (KJØREFORBUD)";
      badgeColor = "#ef4444";
      krav = "Kjøretøyet ilegges umiddelbart bruksforbud på stedet. Kan ikke forlate Åsbieveien 14 for egen maskin.";
    } else if (obs.includes('slitt') || obs.includes('rust') || obs.includes('knekt') || obs.includes('slark') || obs.includes('lyser') || obs.includes('lekkasje')) {
      grad = 2;
      tittel = "Grad 2: Mangel (IKKE GODKJENT)";
      badgeColor = "#f59e0b";
      krav = "Kjøretøyet er ikke godkjent. Må utbedres og etterkontrolleres hos NAF Senter Arendal innen 2 måneder.";
    }

    if (pkkResultBox) {
      pkkResultBox.style.display = 'block';
      pkkResultBox.innerHTML = `
        <div style="background:#080d1a; border:1px solid ${badgeColor}; border-radius:10px; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong style="color:${badgeColor}; font-size:1rem;">${tittel}</strong>
            <span style="font-family:var(--font-mono); font-size:0.75rem; color:#94a3b8;">PKK KONTROLLORGAN 01</span>
          </div>
          <div style="font-size:0.85rem; color:#fff; margin-bottom:6px;"><strong>Kontrollpunkt:</strong> ${comp}</div>
          <p style="font-size:0.82rem; color:#94a3b8; margin-bottom:8px;"><strong>Funn:</strong> ${pkkObsInput.value}</p>
          <div style="font-size:0.82rem; color:#cbd5e1; background:#001f4d; padding:8px; border-radius:6px;">
            ${krav}
          </div>
        </div>
      `;
    }
  }

  if (btnEvalPkk) btnEvalPkk.addEventListener('click', handlePkkEval);

})();
