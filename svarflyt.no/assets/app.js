// Svarflyt konseptprototype – frontend. Ingen nøkler her; alt AI-arbeid skjer i Cloudflare Worker-en.
const API = "https://svarflyt-api.tussienorway.workers.dev";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, body) {
  let res;
  try {
    res = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Får ikke kontakt med tjenesten. Sjekk nettet og prøv igjen.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.feil || "Noe gikk galt. Prøv igjen.");
  return data;
}
function busy(btn, on, text) {
  if (on) { btn.dataset.t = btn.textContent; btn.textContent = text || "Jobber …"; btn.disabled = true; }
  else { btn.textContent = btn.dataset.t || btn.textContent; btn.disabled = false; }
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const showErr = (el, msg) => { el.innerHTML = `<p class="status err" role="alert">${esc(msg)}</p>`; };

/* ---------- Meny ---------- */
const menuBtn = $(".menu-btn"), nav = $("#nav");
menuBtn.addEventListener("click", () => { const o = nav.classList.toggle("open"); menuBtn.setAttribute("aria-expanded", o); });
nav.addEventListener("click", (e) => { if (e.target.closest("a")) { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); } });

/* ---------- Faner ---------- */
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(t, focus) {
  tabs.forEach((x) => { const on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; $("#" + x.getAttribute("aria-controls")).hidden = !on; });
  if (focus) t.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener("click", () => selectTab(t));
  t.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (d) { e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length], true); }
  });
});

/* ---------- A: Kundesvar ---------- */
const formA = $("#form-a");
formA.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = formA.querySelector('button[type="submit"]'), out = $("#a-out"), empty = $("#a-empty");
  busy(btn, true, "Skriver utkast …");
  empty.hidden = false; out.hidden = true; empty.className = "loading"; empty.textContent = "AI-en leser e-posten og bedriftsinformasjonen …";
  try {
    const d = await api("/api/kundesvar", { epost: $("#a-epost").value, kunnskap: $("#a-kunnskap").value });
    $("#a-svar").value = d.svar;
    $("#a-sjekk").innerHTML = d.sjekk?.length ? `<strong>Sjekk før du sender:</strong><ul>${d.sjekk.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    $("#a-status").textContent = ""; $("#a-status").className = "status";
    out.querySelector(".badge").textContent = "Utkast – ikke sendt"; out.querySelector(".badge").className = "badge";
    $("#a-godkjenn").disabled = false; $("#a-svar").readOnly = false;
    empty.hidden = true; out.hidden = false;
  } catch (err) { empty.className = "placeholder"; showErr(empty, err.message); }
  finally { busy(btn, false); }
});
$("#a-ny").addEventListener("click", () => formA.requestSubmit());
$("#a-godkjenn").addEventListener("click", () => {
  const b = $("#a-out .badge"); b.textContent = "Godkjent av deg"; b.className = "badge ok";
  $("#a-svar").readOnly = true; $("#a-godkjenn").disabled = true;
  const s = $("#a-status"); s.className = "status ok";
  s.textContent = "Godkjent. I en ekte løsning ville svaret nå blitt sendt fra innboksen deres. I denne demoen sendes ingenting.";
});

/* ---------- B: Uttrekk ---------- */
const LABELS = { kunde_navn: "Kunde / avsender", kontaktperson: "Kontaktperson", epost: "E-post", telefon: "Telefon", orgnr: "Org.nr.", adresse: "Adresse", fakturanummer: "Fakturanummer", ordrenummer: "Ordrenummer", dato: "Dato", forfallsdato: "Forfallsdato", belop_eks_mva: "Beløp eks. mva", mva: "Mva", belop_inkl_mva: "Beløp inkl. mva", valuta: "Valuta", kontonummer: "Kontonummer", kid: "KID" };
let lastB = null;
const formB = $("#form-b");
formB.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = formB.querySelector('button[type="submit"]'), out = $("#b-out"), empty = $("#b-empty");
  busy(btn, true, "Henter ut …");
  empty.hidden = false; out.hidden = true; empty.className = "loading"; empty.textContent = "AI-en leser dokumentet …";
  try {
    const d = await api("/api/uttrekk", { tekst: $("#b-tekst").value });
    lastB = d;
    $("#b-type").textContent = "Dokumenttype: " + (d.dokumenttype || "ukjent");
    const rows = Object.keys(LABELS).map((k) => {
      const v = d.felter?.[k] || "", f = d.flagg?.[k];
      if (!v && !f) return `<tr class="missing"><th scope="row">${LABELS[k]}</th><td>–</td><td>Ikke i teksten</td></tr>`;
      return `<tr><th scope="row">${LABELS[k]}</th><td>${esc(v) || "–"}</td><td class="${f ? "flag" : "okc"}">${f ? "⚠ " + esc(f) : "✓ OK"}</td></tr>`;
    });
    $("#b-table tbody").innerHTML = rows.join("");
    const l = (d.linjer || []).filter((x) => x.beskrivelse);
    $("#b-linjer").innerHTML = l.length ? `<h4>Varelinjer</h4><div class="table-wrap"><table><thead><tr><th>Beskrivelse</th><th>Antall</th><th>Pris</th></tr></thead><tbody>${l.map((x) => `<tr><td>${esc(x.beskrivelse)}</td><td>${esc(x.antall)}</td><td>${esc(x.pris)}</td></tr>`).join("")}</tbody></table></div>` : "";
    const n = Object.keys(d.flagg || {}).length;
    $("#b-merk").innerHTML = (n ? `<p><strong>${n} felt bør sjekkes</strong> før det går inn i fagsystemet.</p>` : `<p><strong>Ingen avvik funnet.</strong> Klar for import.</p>`) +
      (d.merknader?.length ? `<ul>${d.merknader.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
    empty.hidden = true; out.hidden = false;
  } catch (err) { empty.className = "placeholder"; showErr(empty, err.message); }
  finally { busy(btn, false); }
});
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
$("#b-csv").addEventListener("click", () => {
  if (!lastB) return;
  const head = ["felt", "verdi", "kontroll"], lines = [head.join(";")];
  for (const k of Object.keys(LABELS)) lines.push([k, lastB.felter?.[k] || "", lastB.flagg?.[k] || "OK"].map(csvCell).join(";"));
  download("svarflyt-uttrekk.csv", "\ufeff" + lines.join("\r\n"), "text/csv;charset=utf-8");
});
$("#b-json").addEventListener("click", () => {
  if (!lastB) return;
  const { modell, ...rest } = lastB;
  download("svarflyt-uttrekk.json", JSON.stringify(rest, null, 2), "application/json");
});

/* ---------- C og booking: gjenbrukbar bookingkomponent ---------- */
const fmtSlot = (s) => new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short" }).format(new Date(s.slice(0, 10) + "T12:00:00")) + " kl. " + s.slice(11);
let uid = 0;
function mountBooker(root) {
  const id = "bk" + (++uid);
  root.innerHTML = `
   <form class="bk-ask">
    <label for="${id}-t">${esc(root.dataset.label)}</label>
    <div class="row" style="margin-top:0"><input id="${id}-t" maxlength="500" value="${esc(root.dataset.default)}" required style="flex:1;min-width:200px"><button class="btn" type="submit">Finn ledige tider</button></div>
   </form>
   <div class="bk-out" aria-live="polite"></div>`;
  const out = root.querySelector(".bk-out");
  let tema = "";
  root.querySelector(".bk-ask").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    busy(btn, true, "Tolker …");
    out.innerHTML = `<div class="loading" style="min-height:80px">AI-en tolker ønsket ditt …</div>`;
    try {
      const d = await api("/api/booking/tolk", { tekst: root.querySelector("input").value });
      tema = d.tema || "";
      if (!d.ledige.length) { out.innerHTML = `<p><em>${esc(d.oppsummering)}</em></p><p>Ingen ledige tider passet. Prøv en annen dag eller tid.</p>`; return; }
      out.innerHTML = `<p class="hint"><strong>Forstått:</strong> ${esc(d.oppsummering)}</p>
       <div class="slots" role="group" aria-label="Ledige tider">${d.ledige.map((s) => `<button type="button" class="slot" aria-pressed="false" data-s="${s}">${fmtSlot(s)}</button>`).join("")}</div>
       <form class="bk-confirm" hidden>
        <label for="${id}-n">Navn</label><input id="${id}-n" autocomplete="name" required maxlength="100">
        <label for="${id}-e">E-post</label><input id="${id}-e" type="email" autocomplete="email" required maxlength="150">
        <div class="row"><button class="btn" type="submit">Bekreft tid</button></div>
        <p class="status" role="status"></p>
       </form>`;
      let chosen = null;
      const cf = out.querySelector(".bk-confirm");
      out.querySelectorAll(".slot").forEach((b) => b.addEventListener("click", () => {
        out.querySelectorAll(".slot").forEach((x) => x.setAttribute("aria-pressed", x === b));
        chosen = b.dataset.s; cf.hidden = false; cf.querySelector("input").focus();
      }));
      cf.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const st = cf.querySelector(".status"), b2 = cf.querySelector("button");
        busy(b2, true, "Bekrefter …"); st.textContent = ""; st.className = "status";
        try {
          const r = await api("/api/booking/bekreft", { slot: chosen, navn: cf.querySelector(`#${id}-n`).value, epost: cf.querySelector(`#${id}-e`).value, tema });
          out.innerHTML = `<div class="confirm"><p><strong>${esc(r.bekreftelse)}</strong></p><p class="hint">Dette er en demo. Tiden er reservert i prototypen, men ingen e-post sendes.</p><button type="button" class="btn btn-ghost bk-ics">Legg i kalenderen (.ics)</button></div>`;
          out.querySelector(".bk-ics").addEventListener("click", () => download(`svarflyt-${r.id}.ics`, r.ics, "text/calendar;charset=utf-8"));
        } catch (err) { st.className = "status err"; st.textContent = err.message; }
        finally { busy(b2, false); }
      });
    } catch (err) { showErr(out, err.message); }
    finally { busy(btn, false); }
  });
}
document.querySelectorAll("[data-booker]").forEach(mountBooker);

/* ---------- Kontaktskjema ---------- */
const formK = $("#form-k");
formK.addEventListener("submit", async (e) => {
  e.preventDefault();
  const st = $("#k-status"), btn = formK.querySelector('button[type="submit"]');
  st.className = "status";
  if (!formK.checkValidity()) { st.className = "status err"; st.textContent = "Fyll inn navn, e-post, melding og kryss av for samtykke."; formK.reportValidity(); return; }
  busy(btn, true, "Sender …");
  try {
    const d = await api("/api/kontakt", { navn: $("#k-navn").value, epost: $("#k-epost").value, firma: $("#k-firma").value, melding: $("#k-melding").value, samtykke: $("#k-samtykke").checked, nettside: $("#k-web").value });
    formK.reset(); st.className = "status ok";
    st.textContent = `Takk! Meldingen er lagret med referanse ${d.id}. (Prototype: ingen e-post sendes.)`;
  } catch (err) { st.className = "status err"; st.textContent = err.message; }
  finally { busy(btn, false); }
});
