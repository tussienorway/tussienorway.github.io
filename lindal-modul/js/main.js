/* Oppkobling av siden */
(() => {
  const $ = id => document.getElementById(id);
  const REFS = [
    ['Barnehage i Stavanger', 'https://www.lindalmodul.no/wp-content/uploads/2026/06/Barnehage-3-768x432.jpg'],
    ['Bedehus i Sandnes', 'https://www.lindalmodul.no/wp-content/uploads/2026/06/Bedehus-768x432.jpg'],
    ['Boligområde i Grimstad', 'https://www.lindalmodul.no/wp-content/uploads/2026/06/Boligomrade-768x432.jpg'],
    ['Edens have i Grimstad', 'https://www.lindalmodul.no/wp-content/uploads/2026/06/Edens-have-1024x576.jpg'],
    ['Barnehage på Færvik, Arendal', 'https://www.lindalmodul.no/wp-content/uploads/2026/06/Barnehage-4-768x432.jpg'],
    ['Aktivitetshus på Vegårshei', 'https://www.lindalmodul.no/wp-content/uploads/2025/08/Lindalgruppen_sept_2023-65-768x557.jpg'],
    ['Enebolig', 'https://www.lindalmodul.no/wp-content/uploads/2025/09/IMG_2594-768x512.jpg'],
    ['Elvebredden, Gjesdal', 'https://www.lindalmodul.no/wp-content/uploads/2025/08/Lindalgruppen_sept_2023-66-768x555.jpg']
  ];

  function refs() {
    $('refGrid').innerHTML = REFS.map(([t, src]) => `<a class="ref" href="https://www.lindalmodul.no/arkitekter/" target="_blank" rel="noopener"><img src="${src}" alt="${t}" loading="lazy" onerror="this.remove()"><span>${t}</span></a>`).join('');
  }

  function autocomplete(input, box, onPick) {
    let timer, items = [];
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try { items = await Data.searchAddress(input.value); } catch { items = []; }
        if (!box) return;
        box.innerHTML = items.map((a, i) => `<div data-i="${i}">${a.text} <small>${a.sted} · ${a.gnr}/${a.bnr}</small></div>`).join('');
        box.querySelectorAll('div').forEach(d => d.onclick = () => { const a = items[+d.dataset.i]; input.value = `${a.text}, ${a.sted}`; box.innerHTML = ''; onPick(a); });
      }, 250);
    });
    input.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!items.length) { try { items = await Data.searchAddress(input.value); } catch { items = []; } }
      if (items[0]) { if (box) box.innerHTML = ''; onPick(items[0]); } else Planner.toast('Fant ingen adresse.');
    });
    document.addEventListener('click', e => { if (box && !box.contains(e.target) && e.target !== input) box.innerHTML = ''; });
  }

  function pick(a) {
    Planner.goStep(1);
    Planner.loadPlotAt(a.lat, a.lon, { text: a.text, sted: a.sted, kommune: a.kommune });
  }

  document.addEventListener('DOMContentLoaded', () => {
    Planner.init();
    AI.init();
    refs();
    if (typeof Viewer3D !== 'undefined' && $('module3D')) {
      Viewer3D.init('module3D');
      if ($('btnReset3D')) $('btnReset3D').onclick = () => Viewer3D.resetView();
      if ($('btnExportIFC')) $('btnExportIFC').onclick = () => Viewer3D.exportIFC();
      if ($('btnExportOBJ')) $('btnExportOBJ').onclick = () => Viewer3D.exportOBJ();
      document.querySelectorAll('.mat-btn').forEach(btn => {
        btn.onclick = () => {
          document.querySelectorAll('.mat-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          Viewer3D.setMaterial(btn.dataset.mat);
        };
      });
    }
    autocomplete($('address'), $('suggest'), pick);
    $('heroSearch').addEventListener('submit', async e => {
      e.preventDefault();
      const q = $('heroAddress').value;
      document.getElementById('planlegger').scrollIntoView();
      let r = [];
      try { r = await Data.searchAddress(q); } catch { }
      if (r[0]) { $('address').value = `${r[0].text}, ${r[0].sted}`; pick(r[0]); } else Planner.toast('Fant ingen adresse – prøv igjen eller klikk i kartet.');
    });
    document.addEventListener('plot-loaded', () => {
      const c = Planner.context();
      if (c && c.adresse) $('cfWhere').value = `${c.adresse} (gnr/bnr ${c.gnrbnr || '–'})`;
    });
    $('btnToContact').onclick = () => {
      $('cfDesc').value = AI.describe();
      const c = Planner.context(); if (c && c.adresse) $('cfWhere').value = `${c.adresse} (gnr/bnr ${c.gnrbnr || '–'})`;
      document.getElementById('kontakt').scrollIntoView();
    };
    $('btnAutoDesc').onclick = () => { $('cfDesc').value = AI.describe(); };
    $('contactForm').addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const body = `Navn: ${f.get('navn')}\nFirma: ${f.get('firma') || '-'}\nE-post: ${f.get('epost')}\nTelefon: ${f.get('tlf') || '-'}\nType: ${f.get('type')}\nHvor: ${f.get('hvor')}\n\n${f.get('beskrivelse')}\n\n--- Henvendelse via Lindal Modul AI ---\nOffisiell representant: Arne Austenå\n\n--- Tomteanalyse (JSON) ---\n${JSON.stringify(Planner.context(), null, 1)}`;
      location.href = `mailto:post@lindalgruppen.no?subject=${encodeURIComponent('Arkitekthjelp (Att: Arne Austenå) – ' + (f.get('hvor') || f.get('type')))}&body=${encodeURIComponent(body)}`;
    });

    // Forhåndslast Lindal Modul sitt eget fabrikkområde (Vennevannsveien 5, Tvedestrand)
    // slik at tomteplanleggeren, 3D-viseren og AI-assistenten er 100% operative og levende fra første sekund
    setTimeout(() => {
      if (!Planner.state.plot) {
        pick({ text: 'Vennevannsveien 5', sted: '4900 Tvedestrand', kommune: 'Tvedestrand', lat: 58.6128, lon: 8.901 });
      }
    }, 400);
  });
})();
