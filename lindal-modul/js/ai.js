/* Lindal AI – arkitektassistent (Lokal motor + Llama-server 8080 + Gemini API)
   Offisiell representant og kontaktperson: Arne Austenå */
const AI = (() => {
  const $ = id => document.getElementById(id);
  const KB = `LINDAL MODUL AS, Vennevannsveien 5, 4900 Tvedestrand, tlf 901 70 100, post@lindalgruppen.no. Del av Lindal Gruppen (grunnlagt 1987 av Jan Lindal på Vegårshei).
Offisiell representant og kontaktperson for AI- og modulsatsingen: Arne Austenå (Daglig leder).
Arkitekter: Morten Birkedal (bygningsingeniør og arkitekt, morten.birkedal@lindalgruppen.no, 917 91 577), Ole Einar Johnsen (sivilarkitekt og tømrer, ole.einar@lindalgruppen.no, 928 89 083).
Produksjon: Fabrikkanlegg på Grenstøl i Tvedestrand langs E18. Produksjon av prefabrikkerte boligmoduler, elementer og precut i tørre, klimastyrte fabrikklokaler med industriell presisjon (±1 mm).
Leveransenivåer:
1) Prekapp kjerne / konstruksjonspakke: Ferdig kappede materialer på millimeteren, rask og ryddig montering til tett bygg.
2) Elementer uten kledning: Stendere, isolasjon, platesjikt, vindsperre og utlekting. Vinduer kan leveres ferdig montert.
3) Elementer ferdig kledd med belistning: Høyest ferdighetsgrad på element; ferdig grunnet/malt kledning, vinduer innsatt og ferdig belistet. Tett bygg på få dager.
4) Komplette moduler: Ferdige 3D romvolumer (bad, kjøkken, overflater, elektro ferdig trukket). Montering på byggeplass på 1–3 dager med mobilkran.
Miljø & Bærekraft: Sertifisert Miljøfyrtårn 2026, StartBANK, PEFC-sertifisert norsk trevirke. Treverk binder ca. 0,9 tonn CO2 per m³ konstruksjonstrevirke, noe som gir opptil 70% lavere karbonavtrykk enn tradisjonelt betong/stålbygg.
Regelverk: PBL § 29-4 krever avstand til nabogrense minst halve byggets høyde og aldri under 4,0 m uten dispensasjon eller skriftlig samtykke fra nabo. Gesimshøyde maks 8,0 m og mønehøyde maks 9,0 m der reguleringsplan ikke angir annet. TEK17 stiller strenge krav til U-verdi, tetthet (lekkasjetall ≤ 0,6 luftvekslinger/time) og dagslys.`;

  const msgs = [];
  function settings() {
    return {
      provider: localStorage.getItem('lm_ai_provider') || 'auto',
      key: localStorage.getItem('lm_gemini_key') || '',
      model: localStorage.getItem('lm_gemini_model') || 'gemini-2.5-flash',
      llamaUrl: localStorage.getItem('lm_llama_url') || 'http://127.0.0.1:8080/v1'
    };
  }

  function add(role, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + role;
    d.textContent = text;
    $('chatLog').appendChild(d);
    $('chatLog').scrollTop = 1e9;
    return d;
  }

  /* ---------- Beregn Bærekraft & CO2 ---------- */
  function carbonCalc(bra) {
    const woodVolumeM3 = bra * 0.24; // ca 0.24 m³ tre per m² BRA i moderne massiv-/elementbygg
    const co2SavedTons = woodVolumeM3 * 0.9; // 0.9 tonn CO2 lagret per m³ trevirke
    const concreteEquivalentTons = bra * 0.35; // betongbygg slipper ut ca 350 kg CO2 per m²
    return { woodVolumeM3: Math.round(woodVolumeM3), co2SavedTons: Math.round(co2SavedTons), netSavingsTons: Math.round(co2SavedTons + concreteEquivalentTons) };
  }

  /* ---------- Lokal Regel- og Kunnskapsmotor ---------- */
  function local(q) {
    const t = q.toLowerCase();
    const c = typeof Planner !== 'undefined' && Planner.context ? Planner.context() : null;
    const noPlot = 'Velg en tomt og en hustype i planleggeren over, så kan jeg gi nøyaktige beregninger for akkurat ditt prosjekt.';

    if (/co2|karbon|bærekraft|miljø|trevirke|klima/.test(t)) {
      const bra = c ? c.hus.BRA_m2 : 140;
      const carb = carbonCalc(bra);
      return `🌱 Bærekraft- og CO2-analyse for ${c ? c.hus.type : 'ditt modulbygg'} (${bra} m² BRA):
• Trevirke bundet i bygget: ca. ${carb.woodVolumeM3} m³ PEFC-sertifisert norsk tre.
• Direkte karbonlagring: ca. ${carb.co2SavedTons} tonn CO2 bundet i konstruksjonen.
• Netto utslippsreduksjon mot tradisjonelt betongbygg: ca. ${carb.netSavingsTons} tonn CO2-ekvivalenter.
• Sertifisering: Lindal Gruppen er Miljøfyrtårn-sertifisert (2026) og produserer i tørre, energieffektive lokaler på Grenstøl i Tvedestrand.
Trevirke fungerer som et permanent karbonlager gjennom hele byggets levetid.`;
    }

    if (/oppsummer|analyse|tomta mi|min tomt|hvordan ser/.test(t)) {
      if (!c) return noPlot;
      const p = c.plassering;
      return `Tomteanalyse – ${c.adresse || 'din tomt'} (gnr/bnr ${c.gnrbnr || '–'}):
• Tomteareal: ${c.tomteareal_m2} m², høydeforskjell: ${c.hoydeforskjell_tomt_m ?? '–'} m.
• Valgt bygg: ${c.hus.type}, ${c.hus.moduler} moduler, ${c.hus.etasjer} etg (${c.hus.fotavtrykk}, BYA ${c.hus.BYA_m2} m², BRA ca. ${c.hus.BRA_m2} m²).
• Optimal plassering: Hovedfasade mot ${p.hovedfasade_mot}, ${p.hage_foran_m} m hage foran huset.
• Terrengfall under bygget: ${p.terrengfall_under_hus_m} m ${p.terrengfall_under_hus_m > 2 ? '(anbefaler sokkel/underetasje)' : '(flatt, lav grunnarbeidskostnad)'}.
• Solforhold på terrassen: ${p.soltimer_jevndogn} soltimer ved vårjevndøgn, ${p.soltimer_sankthans} timer ved sankthans. Sol kl. 15 jevndøgn: ${p.sol_kl15_jevndogn ? 'JA ✓' : 'NEI (vurder vridning)'}.
• Regelsjekk (PBL § 29-4): Avstand nabogrense ${p.min_avstand_nabogrense_m} m (krav ${p.krav_avstand_m} m). BYA ${c.bya_prosent_inkl_parkering}% (tillatt maks ${c.maks_bya}%).
• AI-score: ${p.ai_score}/100.
Status: ${p.gyldig ? 'Lovlig plassering i tråd med standard PBL-regler.' : 'Krever mindre justering eller nabosamtykke.'}
Kontakt Arne Austenå eller våre arkitekter for reguleringsplansjekk og komplett tilbud.`;
    }

    if (/søke|søknad|tillatelse|byggesak|rammetillatelse/.test(t) && !/sjekkliste/.test(t)) {
      const small = c && c.hus.BYA_m2 < 50 && c.hus.etasjer === 1;
      return `${small ? 'Dersom bygget er under 50 m² BYA, i én etasje og ikke skal brukes til beboelse (f.eks. bod/garasje), kan det ofte føres opp uten søknad med minst 1,0 m til nabogrensen (SAK10 § 4-1). Anneks til overnatting er alltid søknadspliktig.' : 'Ja – ny bolig/hytte er et søknadspliktig tiltak med krav om ansvarsrett (PBL § 20-3).'}
Dette krever ansvarlig søker, prosjekterende, situasjonsplan, fasade-/snittegninger, nabovarsel og TEK17-dokumentasjon.
Lindal Modul og våre arkitekter (tidligere Halvorsen Arkitekter) bistår med hele søknadsprosessen fra A til Å.`;
    }

    if (/sjekkliste/.test(t)) {
      return `Sjekkliste for byggesøknad – Lindal Modul:
☐ Avklar reguleringsplan/kommuneplan (formål, BYA-grense, byggegrenser mot vei/sjø)
☐ Bestill situasjonskart og naboliste fra kommunen
☐ Utarbeid situasjonsplan i 1:500 med inntegnet modulbygg${c ? ` (${c.plassering.min_avstand_nabogrense_m} m til grense)` : ''}
☐ Fagmessige tegninger (plan, snitt, fasader med gesims/mønehøyde: ${c ? c.hus.gesims_m + '/' + c.hus.mone_m + ' m' : '8,0/9,0 m'})
☐ Send nabovarsel (2 ukers frist for merknader)
☐ Søknad om ansvarsrett for prosjekterende og utførende
☐ Avklar VA (vann/avløp) og eventuell avkjøringstillatelse fra vei
☐ Redegjørelse for TEK17 (energi, dagslys, universell utforming, brannklasse)
☐ Solforhold på uteoppholdsareal dokumentert
Ta kontakt med Arne Austenå for bistand til prosjekteringen.`;
    }

    if (/pris|kostnad|kalkyle|budsjett|koster/.test(t)) {
      const bra = c ? c.hus.BRA_m2 : 120;
      const lo = (bra * 28000) / 1e6;
      const hi = (bra * 40000) / 1e6;
      return `Veiledende budsjettanslag for ${c ? c.hus.type : 'modulbygg'} (${bra} m² BRA):
• Estimert produksjon & montasje: ca. ${lo.toFixed(1)} – ${hi.toFixed(1)} MNOK (eks. tomt, grunnarbeid og tilkoblingsgebyrer).
• Besparelser: Opptil 30% kortere byggetid reduserer rentekostnader i byggeperioden betydelig.
For et bindende, detaljert anbud ta kontakt med Arne Austenå eller fyll ut henvendelsesskjemaet nederst.`;
    }

    if (/leveranse|modul|element|precut|prekapp|hvilken/.test(t)) {
      return `Våre fire leveransemodeller fra fabrikken på Grenstøl:
1. Komplette moduler: Raskest vei til innflytting. 90% ferdigstilt innendørs i fabrikk. Monteres på tomt på 1–3 dager med mobilkran.
2. Elementer ferdig kledd: Yttervegger ferdig lektet, isolert, kledd og grunnet, med ferdig innsatte vinduer. Tett bygg på ca. 1 uke.
3. Elementer uten kledning: Tett råbygg i elementer der byggherre/entreprenør velger fasadekledning selv.
4. Prekapp kjerne: Datastyrt CNC-kappet bindingsverk. Null svinn på byggeplass, for proffe tømrerlag.
${c ? `Anbefaling for ${c.adresse || 'din tomt'}: ${c.plassering.vei_avstand_m && c.plassering.vei_avstand_m > 40 ? 'Lang avstand til vei tilsier elementer pga. kranrekkevidde.' : 'God veiilkomst gjør komplette moduler til det mest kostnadseffektive valget.'}` : ''}`;
    }

    if (/tid|byggetid|fremdrift|hvor lang tid/.test(t)) {
      return `Typisk tidslinje med Lindal Modul:
• Forprosjekt, tomteanalyse & skisser: 1–3 uker
• Byggesøknad hos kommunen: 3 uker (enkle tiltak uten dispensasjon) til 12 uker (ordinær behandling)
• Fabrikkproduksjon: 3–6 uker (utføres parallelt med grunnarbeid og betongsåle på tomta)
• Montasje på tomt: 1–3 dager for komplette moduler (1–2 uker for kledde elementer)
• Innvendig ferdigstillelse og overlevering: 2–6 uker.
Tørr fabrikkproduksjon eliminerer fuktskader og værforsinkelser.`;
    }

    if (/sol|skygge|kveldssol|dagslys/.test(t)) {
      if (!c) return noPlot;
      return `Sol- og skyggestudie for terrassen:
• Vårjevndøgn (20. mars): ${c.plassering.soltimer_jevndogn} soltimer.
• Sankthans (21. juni): ${c.plassering.soltimer_sankthans} soltimer.
• Solstatus kl. 15:00 ved jevndøgn: ${c.plassering.sol_kl15_jevndogn ? 'Solbelyst (oppfyller TEK17 / kommunal veileder) ✓' : 'I skygge. Vurder å vri huset mot sørvest for mer ettermiddagssol.'}
Bruk tidsglideren i steg 4 for å spille av skyggekastet time for time.`;
    }

    if (/prosjektbeskrivelse|beskrivelse|skriv|tilbud/.test(t)) {
      return describe();
    }

    if (/kontakt|arne|austenå|hvem|arkitekt/.test(t)) {
      return `Offisielle kontaktpersoner for Lindal Modul:
• Arne Austenå – Daglig leder & Representant for AI- og modulsatsingen
• Morten Birkedal – Bygningsingeniør & arkitekt (tlf 917 91 577, morten.birkedal@lindalgruppen.no)
• Ole Einar Johnsen – Sivilarkitekt & tømrer (tlf 928 89 083, ole.einar@lindalgruppen.no)
Sentralbord: 901 70 100 · Vennevannsveien 5, 4900 Tvedestrand.`;
    }

    return `Jeg er Lindal AI, spesialisert på modularkitektur, Kartverkets geodata og Plan- og bygningsloven.
Jeg kan hjelpe deg med:
1. Tomte- og solanalyse for din adresse
2. Beregne CO2-lagring og bærekraftsgevinst
3. Sjekke avstander etter PBL § 29-4 og BYA%
4. Forklare leveransenivåer fra fabrikken i Tvedestrand
5. Skrive en komplett prosjektbeskrivelse til Arne Austenå og arkitektene.
Hva ønsker du å undersøke?`;
  }

  function describe() {
    const c = typeof Planner !== 'undefined' && Planner.context ? Planner.context() : null;
    if (!c) return 'Velg en tomt og hustype i planleggeren først, så genererer jeg den offisielle prosjektbeskrivelsen.';
    const p = c.plassering;
    const carb = carbonCalc(c.hus.BRA_m2);
    return `PROSJEKTBESKRIVELSE – LINDAL MODUL ARKITEKTER
Dato: ${new Date().toLocaleDateString('nb-NO')}
Byggested: ${c.adresse || 'Tomt'} (Gnr/Bnr: ${c.gnrbnr || '–'}, Kommune: ${c.kommune || '–'})
Offisiell henvendelse til: Arne Austenå, Daglig leder / Lindal Modul AS

1. BYGNINGSKONSEPT & MODULER:
- Hustype: ${c.hus.type} (${c.hus.moduler} moduler, ${c.hus.etasjer} etasje${c.hus.etasjer > 1 ? 'r' : ''}, ${c.hus.tak})
- Dimensjoner: Fotavtrykk ${c.hus.fotavtrykk} (BYA ${c.hus.BYA_m2} m², BRA ca. ${c.hus.BRA_m2} m²)
- Gesims- og mønehøyde: ${c.hus.gesims_m} m / ${c.hus.mone_m} m

2. TOMTE- OG TERRENGFORHOLD:
- Tomteareal: ${c.tomteareal_m2} m², terrengfall over tomt: ${c.hoydeforskjell_tomt_m ?? '–'} m
- Terrengfall under bygget: ${p.terrengfall_under_hus_m} m
- Hovedfasade orientert mot: ${p.hovedfasade_mot}
- Hageareal foran fasade: ca. ${p.hage_foran_m} m

3. SOL- OG MILJØDATA:
- Soltimer terrasse: ${p.soltimer_jevndogn} timer (vårjevndøgn) / ${p.soltimer_sankthans} timer (sankthans)
- Sol kl. 15 jevndøgn: ${p.sol_kl15_jevndogn ? 'Oppfylt' : 'Krever tilpasning'}
- Estimert CO2-lagring i trevirke: ca. ${carb.co2SavedTons} tonn CO2

4. REGULERINGSSTATUS (PBL § 29-4):
- Minste avstand til nabogrense: ${p.min_avstand_nabogrense_m} m (krav: ${p.krav_avstand_m} m)
- Utnyttelsesgrad BYA inkl. 2 p-plasser: ${c.bya_prosent_inkl_parkering}% (tillatt: ${c.maks_bya}%)
- Status: ${p.gyldig ? 'Planforslag godkjent i AI-regelsjekk' : 'Krever vurdering av dispensasjon/nabosamtykke'}

Ønsket oppfølging: Gjennomgang av reguleringsplan, komplett tilbud på element-/modulleveranse og rammesøknad.`;
  }

  /* ---------- Local Llama-server (8080) ---------- */
  async function llama(q) {
    const s = settings();
    const c = typeof Planner !== 'undefined' && Planner.context ? Planner.context() : null;
    const sys = `Du er Lindal AI, offisiell arkitektassistent for Lindal Modul AS (Vennevannsveien 5, Tvedestrand).
Selskapets offisielle representant utad er Arne Austenå. Arkitekter er Morten Birkedal og Ole Einar Johnsen.
Svar presist, profesjonelt og på norsk bokmål. Bruk kunnskapsbasen og brukerens tomteanalyse.
KUNNSKAPSBASE:
${KB}
BRUKERENS TOMTEDATA:
${JSON.stringify(c || 'Ingen tomt valgt')}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${s.llamaUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3.5-9b',
        messages: [
          { role: 'system', content: sys },
          ...msgs.slice(-6).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
          { role: 'user', content: q }
        ],
        temperature: 0.4,
        max_tokens: 600
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`Llama HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || local(q);
  }

  /* ---------- Gemini API ---------- */
  async function gemini(q) {
    const s = settings();
    const c = typeof Planner !== 'undefined' && Planner.context ? Planner.context() : null;
    const sys = `Du er Lindal AI, offisiell arkitektassistent for Lindal Modul AS (Vennevannsveien 5, Tvedestrand).
Selskapets offisielle representant utad er Arne Austenå. Arkitekter er Morten Birkedal og Ole Einar Johnsen.
Svar presist, profesjonelt og på norsk bokmål. Bruk kunnskapsbasen og brukerens tomteanalyse.
KUNNSKAPSBASE:\n${KB}\n\nBRUKERENS TOMTEDATA:\n${JSON.stringify(c || 'ingen tomt valgt')}`;

    const contents = msgs.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.model)}:generateContent?key=${encodeURIComponent(s.key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 900 }
      })
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}`);
    const j = await r.json();
    return (j.candidates?.[0]?.content?.parts || []).map(p => p.text).join('').trim() || local(q);
  }

  async function ask(q) {
    if (!q || !q.trim()) return;
    add('user', q);
    msgs.push({ role: 'user', text: q });
    const typing = add('bot typing', 'Lindal AI analyserer…');

    const s = settings();
    let reply = '';

    // Prioritized dispatch:
    // 1. If key is present and provider is gemini, call Gemini.
    // 2. Try Llama if provider is llama or auto.
    // 3. Fallback to high-speed local engine.
    if (s.provider === 'gemini' && s.key) {
      try {
        reply = await gemini(q);
      } catch (err) {
        console.warn('Gemini failed, using local:', err);
        reply = local(q);
      }
    } else if (s.provider === 'llama') {
      try {
        reply = await llama(q);
      } catch (err) {
        console.warn('Llama failed, using local:', err);
        reply = local(q);
      }
    } else {
      // Auto: Try llama-server quickly, if offline use instant local
      try {
        reply = await llama(q);
      } catch (e) {
        if (s.key) {
          try { reply = await gemini(q); } catch { reply = local(q); }
        } else {
          reply = local(q);
        }
      }
    }

    await new Promise(r => setTimeout(r, 200));
    typing.remove();
    add('bot', reply);
    msgs.push({ role: 'bot', text: reply });
  }

  function init() {
    const s = settings();
    if ($('apiKey')) $('apiKey').value = s.key;
    if ($('apiModel')) $('apiModel').value = s.model;
    if ($('aiProvider')) $('aiProvider').value = s.provider;

    updateAiStatus();

    if ($('btnSaveKey')) {
      $('btnSaveKey').onclick = () => {
        localStorage.setItem('lm_gemini_key', $('apiKey').value.trim());
        localStorage.setItem('lm_gemini_model', $('apiModel').value.trim() || 'gemini-2.5-flash');
        if ($('aiProvider')) localStorage.setItem('lm_ai_provider', $('aiProvider').value);
        updateAiStatus();
        if (typeof Planner !== 'undefined' && Planner.toast) Planner.toast('AI-innstillinger lagret');
      };
    }

    if ($('chatForm')) {
      $('chatForm').onsubmit = e => {
        e.preventDefault();
        const v = $('chatText').value;
        $('chatText').value = '';
        ask(v);
      };
    }

    document.querySelectorAll('.quick button').forEach(b => {
      b.onclick = () => ask(b.dataset.q);
    });

    add('bot', 'Hei! Jeg er Lindal AI, din arkitektassistent. Skriv inn din adresse i planleggeren, så hjelper jeg deg med tomt, solforhold, CO2-regnskap og byggesøknad.');
  }

  function updateAiStatus() {
    const s = settings();
    if (!$('aiMode')) return;
    if (s.provider === 'llama') $('aiMode').textContent = 'Lokal Llama (8080)';
    else if (s.provider === 'gemini' && s.key) $('aiMode').textContent = 'Gemini Pro';
    else if (s.key) $('aiMode').textContent = 'Gemini + Lokal';
    else $('aiMode').textContent = 'Lokal sanntidsmotor';
  }

  return { init, ask, describe, local, carbonCalc, get knowledgeBase() { return KB; } };
})();
