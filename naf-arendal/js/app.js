/**
 * NAF Senter Arendal AI - Interaktiv Klientmotor v1.0
 * Kjøretøyoppslag, Elbil-batterihelse simulator, timebooking og Nora 24/7 AI-assistent.
 */

(function () {
  'use strict';

  // Lydsynthesizer (Web Audio API)
  let audioCtx = null;
  function playBeep(freq = 880, type = 'sine', duration = 0.08) {
    try {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioClass) return;
      if (!audioCtx) audioCtx = new AudioClass();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
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
    } catch (e) {}
  }

  // 1. Reg.nr Oppslag & Kjøretøyskanner
  const regnrInput = document.getElementById('regnrInput');
  const btnRegnrSubmit = document.getElementById('btnRegnrSubmit');
  const regnrResultBox = document.getElementById('regnrResultBox');

  const ELBIL_PREFIXER = ['EL', 'EK', 'EV', 'EB', 'EC', 'ED', 'EE', 'EF'];

  function handleRegnrLookup() {
    if (!regnrInput) return;
    const raw = regnrInput.value.trim().toUpperCase().replace(/[\s\-\.]/g, '');
    if (!raw || !/^[A-Z]{2}\d{4,5}$/.test(raw)) {
      alert('Vennligst oppgi et gyldig norsk registreringsnummer (f.eks. EK 12345).');
      return;
    }

    playBeep(980, 'sine', 0.08);

    const prefix = raw.substring(0, 2);
    const sisteSiffer = parseInt(raw.slice(-1), 10);
    const erElbil = ELBIL_PREFIXER.includes(prefix);

    const mndNavn = ["", "Januar", "Februar", "Mars", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Desember"];
    const kontrollMnd = (sisteSiffer === 0 || sisteSiffer > 10) ? "Oktober" : mndNavn[sisteSiffer];

    if (regnrResultBox) {
      regnrResultBox.style.display = 'block';
      regnrResultBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:12px; margin-bottom:14px;">
          <div>
            <span style="font-size:0.75rem; color:#94a3b8; font-family:var(--font-mono);">STATENS VEGVESEN / NAF ARENDAL REG</span>
            <div style="font-size:1.4rem; font-weight:900; color:#fff; font-family:var(--font-mono); letter-spacing:0.05em;">${raw}</div>
          </div>
          <span style="background:${erElbil ? 'rgba(16,185,129,0.15)' : 'rgba(2,132,199,0.15)'}; color:${erElbil ? '#10b981' : '#38bdf8'}; border:1px solid ${erElbil ? '#10b981' : '#0284c7'}; padding:4px 12px; border-radius:999px; font-weight:800; font-size:0.8rem;">
            ${erElbil ? '⚡ 100% Elektrisk' : '⛽ Bensin / Diesel / Hybrid'}
          </span>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
          <div>
            <div style="font-size:0.75rem; color:#94a3b8;">Neste EU-kontrollfrist:</div>
            <div style="font-size:1.1rem; font-weight:800; color:var(--naf-yellow);">${kontrollMnd} (iht. siste siffer ${sisteSiffer})</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:#94a3b8;">Valgt Testsenter:</div>
            <div style="font-size:0.95rem; font-weight:700; color:#fff;">NAF Senter Arendal (Åsbieveien 14)</div>
          </div>
        </div>

        <div style="background:#0f172a; border-radius:10px; padding:12px; border:1px solid #334155; margin-bottom:16px; font-size:0.85rem;">
          <strong style="color:#06b6d4;">Anbefalt NAF-kontroll for denne bilen:</strong><br>
          ${erElbil 
            ? '✓ NAF Aviloo Batterihelse-test (State of Health) + EU-kontroll for elbil.<br>✓ Grundig sjekk av bremseskiver bak og bærearmer.' 
            : '✓ Periodisk Kjøretøykontroll (PKK) + 4-gass avgassmåling.<br>✓ Kontroll av partikkelfilter og bremsevæskekokepunkt.'}
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn-regnr-submit" style="padding:10px 18px; font-size:0.85rem;" onclick="openBookingModal('eu_kontroll', '${raw}')">
            Bestill EU-kontroll for ${raw} (kr 1 195,-)
          </button>
          ${erElbil ? `
            <button class="btn-nav-portal" style="font-size:0.85rem; padding:10px 18px;" onclick="openBookingModal('elbil_batteritest', '${raw}')">
              Bestill Aviloo Batteritest (kr 1 890,-)
            </button>
          ` : ''}
        </div>
      `;
    }
  }

  if (btnRegnrSubmit) btnRegnrSubmit.addEventListener('click', handleRegnrLookup);
  if (regnrInput) {
    regnrInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleRegnrLookup();
      }
    });
  }

  // 2. Interaktiv Elbil Batterihelse Simulator (Aviloo SoH)
  const evAgeSlider = document.getElementById('evAgeSlider');
  const evKmSlider = document.getElementById('evKmSlider');
  const evAgeVal = document.getElementById('evAgeVal');
  const evKmVal = document.getElementById('evKmVal');
  const sohPctOut = document.getElementById('sohPctOut');
  const sohStatusBadge = document.getElementById('sohStatusBadge');
  const sohDegradationOut = document.getElementById('sohDegradationOut');
  const sohWarrantyOut = document.getElementById('sohWarrantyOut');

  function updateEvSim() {
    if (!evAgeSlider || !evKmSlider) return;
    const alder = parseInt(evAgeSlider.value, 10);
    const km = parseInt(evKmSlider.value, 10);

    if (evAgeVal) evAgeVal.textContent = `${alder} år`;
    if (evKmVal) evKmVal.textContent = `${km.toLocaleString('nb-NO')} km`;

    // Realistisk Aviloo SoH degraderingskurve for moderne elbiler:
    // Årlig kalender-aldring: ~1.2% per år
    // Syklisk kjørealdring: ~1.4% per 30 000 km
    const kalenderTap = alder * 1.15;
    const kjoreTap = (km / 30000) * 1.35;
    const totalTap = Math.min(30, kalenderTap + kjoreTap);
    const soh = Math.max(70, (100 - totalTap)).toFixed(1);

    if (sohPctOut) sohPctOut.textContent = `${soh}%`;

    const batteriKwh = 75; // Snitt elbilpakke
    const taptKwh = ((totalTap / 100) * batteriKwh).toFixed(1);

    if (sohDegradationOut) {
      sohDegradationOut.textContent = `Estimert kapasitetstap: ca. ${taptKwh} kWh av 75 kWh batteripakke`;
    }

    // 8 år / 160 000 km garanti
    const innenforGaranti = alder <= 8 && km <= 160000;
    if (sohWarrantyOut) {
      sohWarrantyOut.textContent = innenforGaranti
        ? '✓ Innenfor bilimportørens 8 år / 160 000 km batterigaranti (70% terskel).'
        : '⚠️ Utenfor ordinær 8 år / 160 000 km garanti. NAF Aviloo-test anbefales sterkt ved kjøp/salg.';
      sohWarrantyOut.style.color = innenforGaranti ? '#10b981' : '#f59e0b';
    }

    if (sohStatusBadge) {
      if (soh >= 90) {
        sohStatusBadge.textContent = 'MEGET GOD HELSETILSTAND (A)';
        sohStatusBadge.style.color = '#10b981';
      } else if (soh >= 80) {
        sohStatusBadge.textContent = 'NORMAL BRUKSSLITASJE (B)';
        sohStatusBadge.style.color = '#38bdf8';
      } else {
        sohStatusBadge.textContent = 'BETYDELIG KAPASITETSTAP (C)';
        sohStatusBadge.style.color = '#f59e0b';
      }
    }
  }

  if (evAgeSlider && evKmSlider) {
    evAgeSlider.addEventListener('input', updateEvSim);
    evKmSlider.addEventListener('input', updateEvSim);
  }

  // 3. Timebestilling Modal
  window.openBookingModal = function (tjenesteId = 'eu_kontroll', regnr = '') {
    playBeep(1100, 'sine', 0.1);
    const modal = document.getElementById('bookingModal');
    const select = document.getElementById('modalServiceSelect');
    const regInput = document.getElementById('modalRegnr');

    if (select && tjenesteId) select.value = tjenesteId;
    if (regInput && regnr) regInput.value = regnr;
    if (modal) modal.classList.add('active');
  };

  const modalClose = document.getElementById('modalClose');
  const bookingModal = document.getElementById('bookingModal');
  if (modalClose && bookingModal) {
    modalClose.addEventListener('click', () => bookingModal.classList.remove('active'));
  }

  const btnConfirmBooking = document.getElementById('btnConfirmBooking');
  if (btnConfirmBooking) {
    btnConfirmBooking.addEventListener('click', () => {
      playBeep(1300, 'triangle', 0.15);
      const name = document.getElementById('modalName')?.value || 'Kunde';
      const phone = document.getElementById('modalPhone')?.value || '08505';
      const reg = (document.getElementById('modalRegnr')?.value || 'UKJENT').toUpperCase();
      const service = document.getElementById('modalServiceSelect')?.value || 'EU-kontroll';
      const isMember = document.getElementById('modalMemberCheck')?.checked;

      const resultBox = document.getElementById('bookingResult');
      if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
          <div style="background:#080d1a; border:1px solid #10b981; border-radius:10px; padding:16px; margin-top:14px;">
            <strong style="color:#10b981; font-size:1.05rem;">✓ Timeforespørsel registrert ved NAF Senter Arendal!</strong>
            <p style="font-size:0.85rem; color:#94a3b8; margin:6px 0;">
              Regnr: <strong>${reg}</strong> · Tjeneste: <strong>${service}</strong> · NAF Medlemspris: <strong>${isMember ? 'JA (Rabatt aktivert)' : 'Nei'}</strong>
            </p>
            <p style="font-size:0.8rem; color:#cbd5e1; margin-bottom:10px;">
              📍 Adresse: <strong>Åsbieveien 14, 4848 Arendal</strong> (Nøkkelautomat tilgjengelig 24/7).
            </p>
            <div style="display:flex; gap:8px;">
              <a href="tel:08505" class="btn-phone" style="font-size:0.85rem;">📞 Ring Senteret (08505)</a>
              <a href="sms:37002850?body=${encodeURIComponent('NAF Arendal Timeforespørsel: ' + reg + ' - ' + name)}" class="btn-nav-portal" style="font-size:0.85rem;">📲 Send SMS-bekreftelse</a>
            </div>
          </div>
        `;
      }
    });
  }

  // 4. Nora AI Assistent (Kundemottak & Rådgiver)
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
    noraClose.addEventListener('click', () => noraDrawer.classList.remove('active'));
  }

  function appendNoraMsg(text, sender = 'bot') {
    if (!noraMessages) return;
    const msg = document.createElement('div');
    msg.className = `nora-msg ${sender}`;
    msg.innerHTML = text;
    noraMessages.appendChild(msg);
    noraMessages.scrollTop = noraMessages.scrollHeight;
  }

  function generateNoraResponse(question) {
    const q = (question || '').toLowerCase();
    playBeep(1100, 'sine', 0.06);

    if (q.includes('åpningstid') || q.includes('time') || q.includes('stengt') || q.includes('helg')) {
      return `⏰ <strong>Åpningstider NAF Senter Arendal:</strong><br>
      Vi har åpent mandag til fredag <strong>08:00 – 16:00</strong>.<br>
      Skal du levere eller hente utenfor åpningstid? Vi har <strong>døgnåpen nøkkelautomat</strong> på høyre side ved postkassa!`;
    }

    if (q.includes('eu') || q.includes('pkk') || q.includes('kontroll') || q.includes('frist')) {
      return `🔍 <strong>EU-kontroll i Arendal:</strong><br>
      Pris er <strong>kr 1 195,-</strong> for NAF-medlemmer (kr 1 450,- for ikke-medlem). Kontrollen tar ca. 45 minutter i Åsbieveien 14. Vi sjekker bremser, lys, understell og avgass.`;
    }

    if (q.includes('batteri') || q.includes('aviloo') || q.includes('elbil') || q.includes('soh')) {
      return `⚡ <strong>NAF Aviloo Batteritest:</strong><br>
      Vi er autorisert elbil-testsenter. Vi måler reell helsetilstand (State of Health) på batteripakken, cellebalanse og gjenværende rekkevidde. Koster kr 1 890,- for medlemmer.`;
    }

    if (q.includes('adresse') || q.includes('hvor') || q.includes('stoa') || q.includes('vei')) {
      return `📍 <strong>Adresse og Veibeskrivelse:</strong><br>
      Du finner oss i <strong>Åsbieveien 14, 4848 Arendal</strong>, like ved Stoa næringspark. God parkering og hurtigladere i nærheten.`;
    }

    if (q.includes('medlem') || q.includes('rabatt') || q.includes('pris')) {
      return `⭐ <strong>NAF Medlemsfordeler:</strong><br>
      Som NAF-medlem sparer du 15–20% på alle tester og kontroller hos oss, pluss fri veihjelp og juridisk bistand ved bilkjøp.`;
    }

    return `Takk for spørsmålet! NAF Senter Arendal hjelper deg med EU-kontroll, tilstandsrapport, batteritest og service i Åsbieveien 14. Du kan nå oss på tlf <a href="tel:08505" style="color:var(--naf-yellow); font-weight:700;">08505</a> eller bestille time direkte her på siden.`;
  }

  function handleNoraSubmit() {
    if (!noraInput) return;
    const txt = noraInput.value.trim();
    if (!txt) return;

    appendNoraMsg(txt, 'user');
    noraInput.value = '';

    setTimeout(() => {
      const resp = generateNoraResponse(txt);
      appendNoraMsg(resp, 'bot');
    }, 450);
  }

  if (noraSendBtn) noraSendBtn.addEventListener('click', handleNoraSubmit);
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
      const rec = new SpeechRec();
      rec.lang = 'nb-NO';
      rec.continuous = false;
      rec.interimResults = false;

      let isRec = false;

      noraMicBtn.addEventListener('click', () => {
        if (!isRec) {
          try {
            rec.start();
            isRec = true;
            noraMicBtn.style.background = '#ef4444';
            playBeep(600, 'sine', 0.1);
          } catch (e) {
            isRec = false;
            noraMicBtn.style.background = '';
          }
        } else {
          rec.stop();
          isRec = false;
          noraMicBtn.style.background = '';
        }
      });

      rec.onresult = (evt) => {
        isRec = false;
        noraMicBtn.style.background = '';
        const speech = evt.results[0][0].transcript;
        if (noraInput) noraInput.value = speech;
        handleNoraSubmit();
      };

      rec.onerror = rec.onend = () => {
        isRec = false;
        noraMicBtn.style.background = '';
      };
    } else {
      noraMicBtn.style.display = 'none';
    }
  }

  // Initialiser ved sidelasting
  window.addEventListener('DOMContentLoaded', () => {
    updateEvSim();
  });

})();
