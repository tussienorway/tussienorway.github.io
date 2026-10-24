/**
 * Operasjonssentral JavaScript - Agder Bilberging AI
 */

(function () {
  'use strict';

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
        <div style="margin-bottom:8px;"><strong style="color:#06b6d4;">AI ANALYSERESULTAT:</strong></div>
        <div style="margin-bottom:6px;"><strong>Kategori:</strong> ${kat}</div>
        <div style="margin-bottom:6px;"><strong>Prioritet:</strong> <span style="color:${prio.includes('P1') ? '#ef4444' : '#f59e0b'}; font-weight:800;">${prio}</span></div>
        <div style="margin-bottom:6px;"><strong>Anbefalt Hovedbil:</strong> ${bil}</div>
        <div style="margin-bottom:12px;"><strong>E18 TMA-Støtputebil:</strong> ${tmaText}</div>
        <div style="background:#05070d; padding:10px; border-radius:6px; border:1px solid #1e293b; color:#94a3b8; font-size:0.78rem; word-break:break-all;">
          ${dispatchSms}
        </div>
        <button class="btn-demo-photo" style="margin-top:10px;" onclick="navigator.clipboard.writeText('${dispatchSms}').then(() => alert('SMS-ordre kopiert til utklippstavle!'))">
          Kopier SMS-ordre til vaktmobil
        </button>
      `;
    });
  }
})();
