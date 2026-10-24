/**
 * Operasjonssentral JavaScript v2.0 - Agder Bilberging AI
 * Sanntids hendelsessynkronisering mot kundesiden, klientside sirenevarsel,
 * AI-hurtigtriage og 1-klikks SMS-ordre til bilist og bergingsmannskap.
 */

(function () {
  'use strict';

  // Lydsynthesizer (Sirene / Varsellyd)
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
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.25);
        osc.frequency.exponentialRampToValueAtTime(750, audioCtx.currentTime + 0.5);
      }
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {}
  }

  // 1. Last innkommende hendelser fra localStorage
  function loadLocalIncidents() {
    const tableBody = document.getElementById('incidentTableBody');
    if (!tableBody) return;

    try {
      const incidents = JSON.parse(localStorage.getItem('agder_incidents') || '[]');
      if (incidents.length > 0) {
        incidents.forEach((inc) => {
          const row = document.createElement('tr');
          row.style.background = 'rgba(6, 182, 212, 0.06)';
          row.innerHTML = `
            <td style="font-family:var(--font-mono); color:var(--telemetry-green); font-weight:700;">${inc.tid} (NY)</td>
            <td><span class="${inc.prioritet === 'P1' ? 'badge-p1' : 'badge-p2'}">${inc.prioritet} ${inc.prioritet === 'P1' ? 'KRITISK' : 'HASTER'}</span></td>
            <td><strong>${inc.posisjon}</strong><br><span style="font-size:0.75rem; color:#94a3b8;">${inc.navn} (tlf: ${inc.telefon})</span></td>
            <td>${inc.beskrivelse} (Regnr: <strong>${inc.regnr}</strong>)</td>
            <td>FLAK-03 el. TUNG-01</td>
            <td>${inc.prioritet === 'P1' ? '<strong style="color:var(--viking-yellow);">PÅBUDT (PUTE-02)</strong>' : 'Vurderes'}</td>
            <td>
              <button class="btn-demo-photo" style="border-color:#10b981; color:#10b981;" onclick="sendDriverSms('${inc.navn}', '${inc.telefon}')">
                📲 SMS til bilist
              </button>
            </td>
          `;
          tableBody.insertBefore(row, tableBody.firstChild);
        });
      }
    } catch (e) {}
  }

  window.sendDriverSms = function (navn, tlf) {
    playAlertSound(false);
    const msg = `Hei ${navn}, Jan Ove fra Agder Bilberging her. Vår bergingsbil FLAK-03 er rykket ut mot din posisjon (estimert 12 min). Ta på refleksvest og vent bak autovernet! Tlf: 905 66 147.`;
    const encoded = encodeURIComponent(msg);
    window.location.href = `sms:${tlf}?body=${encoded}`;
  };

  // 2. Hurtigtriage motor
  const btnQuick = document.getElementById('btnQuickTriage');
  const inputQuick = document.getElementById('quickTriageInput');
  const resQuick = document.getElementById('quickTriageResult');

  if (btnQuick && inputQuick && resQuick) {
    btnQuick.addEventListener('click', () => {
      const txt = inputQuick.value.trim();
      if (!txt) {
        alert('Vennligst oppgi en hendelsesbeskrivelse.');
        return;
      }

      playAlertSound(true);
      const lower = txt.toLowerCase();

      const isE18 = lower.includes('e18') || lower.includes('motorvei') || lower.includes('felt') || lower.includes('tunnel');
      const isHeavy = lower.includes('vogntog') || lower.includes('lastebil') || lower.includes('buss') || lower.includes('semi') || lower.includes('sakset') || lower.includes('akselbrudd');
      const isBoat = /\b(båt|båter|båten|snekke|cabincruiser|daycruiser|seilbåt|skjærgårdsjeep|marina|båtløft)\b/i.test(txt);
      const is4x4 = lower.includes('grøft') || lower.includes('groft') || lower.includes('snø') || lower.includes('snofonn') || lower.includes('utfor') || lower.includes('hytte') || lower.includes('myr');

      let prio = 'P2 HASTER';
      let bil = 'MAN TGL Flakbil (FLAK-03)';
      let kat = 'Akutt veihjelp';

      if (isHeavy) {
        prio = 'P1 KRITISK';
        bil = 'Scania R580 8x4 Tungberger (TUNG-01)';
        kat = 'Tungberging';
      } else if (isBoat) {
        prio = 'PLANLAGT';
        bil = 'Iveco Eurocargo med Båtkran (KRAN-04)';
        kat = 'Båttransport';
      } else if (is4x4) {
        prio = 'P2 HASTER';
        bil = 'Toyota Land Cruiser 4x4 Offroad (4X4-05)';
        kat = 'Terrengberging';
      }

      const tmaText = isE18 
        ? '<strong style="color:#fbbf24;">JA - PÅBUDT (PUTE-02 TMA Atego må rykke ut i tospann!)</strong>'
        : '<span style="color:#94a3b8;">Nei (Normal varsling tilstrekkelig)</span>';

      const dispatchSms = `[DISPATCH AGDER BILBERGING] ${prio}: ${kat.toUpperCase()} | Ressurs: ${bil} ${isE18 ? '+ PUTE-02' : ''} | Oppdrag: ${txt}`;

      resQuick.style.display = 'block';
      resQuick.innerHTML = `
        <div style="margin-bottom:8px;"><strong style="color:#06b6d4;">AI ANALYSERESULTAT (Vaktleder):</strong></div>
        <div style="margin-bottom:6px;"><strong>Kategori:</strong> ${kat}</div>
        <div style="margin-bottom:6px;"><strong>Prioritet:</strong> <span style="color:${prio.includes('P1') ? '#ef4444' : '#f59e0b'}; font-weight:800;">${prio}</span></div>
        <div style="margin-bottom:6px;"><strong>Anbefalt Hovedbil:</strong> ${bil}</div>
        <div style="margin-bottom:12px;"><strong>E18 TMA-Støtputebil:</strong> ${tmaText}</div>
        <div style="background:#05070d; padding:10px; border-radius:6px; border:1px solid #1e293b; color:#94a3b8; font-size:0.78rem; word-break:break-all;">
          ${dispatchSms}
        </div>
        <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
          <button class="btn-demo-photo" onclick="navigator.clipboard.writeText('${dispatchSms}').then(() => alert('SMS-ordre kopiert til utklippstavle!'))">
            📋 Kopier SMS-ordre
          </button>
          <a href="sms:?body=${encodeURIComponent(dispatchSms)}" class="btn-emergency" style="font-size:0.8rem; padding:8px 12px; text-decoration:none;">
            📲 Send til vaktbil via SMS
          </a>
        </div>
      `;
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    loadLocalIncidents();
  });
})();
