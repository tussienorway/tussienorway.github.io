// Felles hjelpefunksjoner for Svarflyt-prototypen. Ingen nøkler her.
export const API = "https://svarflyt-api.tussienorway.workers.dev";
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function api(path, body) {
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
export function busy(btn, on, text) {
  if (on) { btn.dataset.t = btn.textContent; btn.textContent = text || "Jobber …"; btn.disabled = true; }
  else { btn.textContent = btn.dataset.t || btn.textContent; btn.disabled = false; }
}
export function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const showErr = (el, msg) => { el.innerHTML = `<p class="status err" role="alert">${esc(msg)}</p>`; };


export const fmtSlot = (s) => new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short" }).format(new Date(s.slice(0, 10) + "T12:00:00")) + " kl. " + s.slice(11);

let sid = 0;
/** Viser ledige tider, lar brukeren velge og bekrefte, og gir .ics. onBooked(r) kalles etter bekreftelse. */
export function renderSlots(out, ledige, { intro = "", tema = "", tittel = "", minutter = 15, onBooked } = {}) {
  const id = "sl" + (++sid);
  if (!ledige || !ledige.length) { out.innerHTML = `${intro ? `<p><em>${esc(intro)}</em></p>` : ""}<p>Ingen ledige tider passet. Prøv en annen dag eller tid.</p>`; return; }
  out.innerHTML = `${intro ? `<p class="hint"><strong>Forstått:</strong> ${esc(intro)}</p>` : ""}
   <div class="slots" role="group" aria-label="Ledige tider">${ledige.map((s) => `<button type="button" class="slot" aria-pressed="false" data-s="${s}">${fmtSlot(s)}</button>`).join("")}</div>
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
      const r = await api("/api/booking/bekreft", { slot: chosen, navn: cf.querySelector(`#${id}-n`).value, epost: cf.querySelector(`#${id}-e`).value, tema, tittel, minutter });
      out.innerHTML = `<div class="confirm"><p><strong>${esc(r.bekreftelse)}</strong></p><p class="hint">Dette er en demo. Tiden er reservert i prototypen, men ingen e-post sendes.</p><button type="button" class="btn btn-ghost bk-ics">Legg i kalenderen (.ics)</button></div>`;
      out.querySelector(".bk-ics").addEventListener("click", () => download(`svarflyt-${r.id}.ics`, r.ics, "text/calendar;charset=utf-8"));
      onBooked && onBooked(r, chosen);
    } catch (err) { st.className = "status err"; st.textContent = err.message; }
    finally { busy(b2, false); }
  });
}
