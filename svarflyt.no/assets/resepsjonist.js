// AI-resepsjonist: tale inn (Whisper på Workers AI, reserve: nettleserens talegjenkjenning),
// språkmodell i Worker-en, tale ut (nettleserens norske stemme, reserve: Workers AI TTS), og tekst som alltid virker.
import { $, esc, api, API, download, renderSlots } from "./lib.js";

const GREETING = "Hei, du har kommet til Bergen Fysioterapi. Jeg er den digitale resepsjonisten. Hva kan jeg hjelpe deg med?";
const phone = $("#rx-phone"), stateEl = $("#rx-state"), logEl = $("#rx-log"), actionEl = $("#rx-action");
const btnCall = $("#rx-call"), btnDone = $("#rx-done"), btnHang = $("#rx-hang"), hint = $("#rx-hint"), level = $("#rx-level");
let historikk = [], inCall = false, busy = false, stream = null, audioCtx = null, analyser = null, recorder = null;
let timerId = null, startTs = 0, sttFails = 0, ended = false, currentAudio = null;
const stats = { stt: [], llm: [] };

/* ---------- UI ---------- */
const STATES = { idle: "Klar", ringing: "Ringer …", listening: "Lytter – snakk nå", thinking: "Tenker …", speaking: "Snakker", transfer: "Setter over til en ansatt …", ended: "Samtalen er avsluttet", text: "Tekstsamtale" };
function setState(s) { phone.dataset.state = s; stateEl.textContent = STATES[s] || s; btnDone.hidden = s !== "listening"; }
function addLine(rolle, tekst) {
  if (logEl.querySelector(".sys") && logEl.children.length === 1) logEl.innerHTML = "";
  const li = document.createElement("li");
  li.className = rolle;
  li.innerHTML = rolle === "sys" ? esc(tekst) : `<span class="who">${rolle === "ai" ? "Resepsjonist" : "Du"}</span>${esc(tekst)}`;
  logEl.append(li); logEl.scrollTop = logEl.scrollHeight;
  if (rolle !== "sys") historikk.push({ rolle: rolle === "ai" ? "ai" : "kunde", tekst });
  btnHang.hidden = ended || (!inCall && historikk.length < 2);
}
function tick() { const s = Math.floor((Date.now() - startTs) / 1000); $("#rx-timer").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

/* ---------- Tale ut ---------- */
let nbVoice = null;
function pickVoice() {
  const v = speechSynthesis?.getVoices?.() || [];
  const nb = v.filter((x) => /^(nb|no|nn)(-|_|$)/i.test(x.lang));
  nbVoice = nb.find((x) => /natural|online|neural/i.test(x.name)) || nb.find((x) => /google/i.test(x.name)) || nb[0] || null;
  $("#rx-voiceinfo").textContent = nbVoice ? `Stemme: ${nbVoice.name} (norsk, fra nettleseren).` : "Nettleseren har ingen norsk stemme, så svarene leses opp med en engelsk stemme fra Workers AI. For norsk stemme: bruk Microsoft Edge, eller Chrome på Windows/Android.";
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; } else pickVoice();

function speak(text) {
  return new Promise((resolve) => {
    const fallbackMs = 2500 + text.length * 90;
    const guard = setTimeout(resolve, fallbackMs);
    const done = () => { clearTimeout(guard); resolve(); };
    if (nbVoice) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = nbVoice; u.lang = nbVoice.lang; u.rate = 1.05;
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
      return;
    }
    fetch(API + "/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tekst: text }) })
      .then((r) => { if (!r.ok) throw 0; return r.blob(); })
      .then((b) => { const a = new Audio(URL.createObjectURL(b)); currentAudio = a; a.onended = done; a.onerror = done; return a.play(); })
      .catch(done);
  });
}
function stopSpeaking() { try { speechSynthesis.cancel(); } catch {} if (currentAudio) { currentAudio.pause(); currentAudio = null; } }

/* ---------- Tale inn ---------- */
async function openMic() {
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
}
function rms() { const a = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(a); let s = 0; for (const x of a) s += x * x; return Math.sqrt(s / a.length); }
const mime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";

let stopNow = null;
function recordUtterance() {
  // Tar opp til personen har snakket og så vært stille i ca. 1,1 sekund (maks 20 s).
  return new Promise((resolve) => {
    const chunks = [], m = mime();
    recorder = new MediaRecorder(stream, m ? { mimeType: m } : undefined);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => { clearInterval(iv); level.style.width = "0"; resolve(heard ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null); };
    let floor = 0.01, heard = false, lastVoice = 0, t0 = Date.now();
    const iv = setInterval(() => {
      const r = rms(), now = Date.now();
      level.style.width = Math.min(100, r * 900) + "%";
      if (now - t0 < 400) { floor = Math.min(0.03, Math.max(floor, r)); return; }
      const thr = Math.max(0.018, floor * 2.5);
      if (r > thr) { heard = true; lastVoice = now; }
      if ((heard && now - lastVoice > 1100) || now - t0 > 20000 || !inCall) stop();
    }, 50);
    const stop = () => { if (recorder.state !== "inactive") recorder.stop(); };
    stopNow = () => { heard = heard || true; stop(); };
    recorder.start(250);
  });
}
function browserRecognize() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return Promise.resolve("");
  return new Promise((resolve) => {
    const r = new SR(); r.lang = "nb-NO"; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => resolve(e.results[0][0].transcript); r.onerror = () => resolve(""); r.onend = () => resolve("");
    r.start();
  });
}
async function listenLoop() {
  while (inCall && !ended) {
    setState("listening");
    let tekst = "";
    if (sttFails < 2) {
      const blob = await recordUtterance();
      if (!inCall) break;
      if (!blob || blob.size < 1500) continue;
      setState("thinking");
      const t = performance.now();
      try {
        const res = await fetch(API + "/api/stt", { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
        const d = await res.json();
        if (!res.ok) throw new Error(d.feil);
        tekst = d.tekst; stats.stt.push(performance.now() - t); sttFails = 0;
      } catch { sttFails++; addLine("sys", "Talegjenkjenningen svarte ikke. Prøver igjen."); continue; }
    } else {
      tekst = await browserRecognize();
      if (!tekst) { addLine("sys", "Fikk ikke tak i talen. Skriv gjerne i feltet under i stedet."); inCall && setState("text"); return; }
    }
    if (!tekst.trim()) continue;
    await turn(tekst);
  }
}

/* ---------- Samtalen ---------- */
async function turn(tekst) {
  while (busy) await new Promise((r) => setTimeout(r, 100)); // vent på forrige svar i stedet for å miste meldingen
  if (ended) return;
  busy = true;
  addLine("du", tekst);
  setState("thinking");
  const t = performance.now();
  try {
    const d = await api("/api/resepsjonist", { kunnskap: $("#rx-kb").value, melding: tekst, historikk: historikk.slice(0, -1) });
    stats.llm.push(performance.now() - t);
    addLine("ai", d.svar);
    handleAction(d);
    if (inCall) { setState("speaking"); await speak(d.svar); }
    if (d.handling === "overfor") await transfer();
    else if (d.handling === "avslutt") await endCall();
    else if (!inCall) setState("text");
  } catch (err) {
    addLine("sys", err.message);
    if (!inCall) setState("text");
  } finally { busy = false; }
}
function handleAction(d) {
  if (d.handling === "vis_tider") {
    renderSlots(actionEl, d.ledige, { tema: d.tema || "Fysioterapi", tittel: "Time hos Bergen Fysioterapi (demo)", minutter: 60, onBooked: (r, slot) => {
      const msg = `Timen er bekreftet. ${r.bekreftelse.replace(/^Takk, [^!]+! /, "")}`;
      addLine("sys", "Time booket: " + r.bekreftelse);
      historikk.push({ rolle: "ai", tekst: msg });
      if (inCall) speak("Supert, timen din er bekreftet. Du kan laste ned kalenderinvitasjonen på skjermen. Er det noe mer jeg kan hjelpe med?");
    } });
    if (!d.ledige?.length && inCall) addLine("sys", "Ingen ledige tider i ønsket tidsrom.");
  } else if (d.handling === "beskjed" && d.beskjed) {
    actionEl.innerHTML = `<div class="note-box"><strong>Beskjed registrert</strong> (ref. ${esc(d.beskjed.id)})<br>${esc(d.beskjed.navn)}${d.beskjed.telefon ? " · " + esc(d.beskjed.telefon) : ""}<br><em>${esc(d.beskjed.tekst)}</em><br><span class="hint">Lagret i prototypen. Ingen SMS eller e-post sendes.</span></div>`;
  }
}
async function transfer() {
  setState("transfer");
  actionEl.innerHTML = `<div class="transfer" role="status"><strong>Overfører til et menneske …</strong><br>AI-en setter samtalen over til en ledig fysioterapeut, og samtaleloggen følger med, så kunden slipper å gjenta seg.</div>`;
  await new Promise((r) => setTimeout(r, 3000));
  actionEl.innerHTML = `<div class="transfer"><strong>Satt over til Ingrid Solheim (simulert)</strong><br>I en ekte løsning ringer telefonen hos en ansatt nå. Demoen avslutter samtalen her.</div>`;
  addLine("sys", "Samtalen er satt over til en ansatt (simulert).");
  await endCall(true);
}

async function startCall() {
  ended = false; historikk = []; actionEl.innerHTML = ""; $("#rx-summary").hidden = true; logEl.innerHTML = ""; stats.stt = []; stats.llm = [];
  btnCall.hidden = true; inCall = true; sttFails = 0;
  startTs = Date.now(); timerId = setInterval(tick, 500); tick();
  setState("ringing");
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("unsupported");
    await openMic();
    hint.textContent = "Snakk når den grønne prikken lyser. Den svarer når du tar en liten pause.";
  } catch (e) {
    inCall = false;
    hint.textContent = e?.name === "NotAllowedError" ? "Du har ikke gitt tilgang til mikrofonen. Det går fint: skriv i feltet under, så svarer resepsjonisten der." : "Mikrofon er ikke tilgjengelig her. Skriv i feltet under i stedet.";
    addLine("ai", GREETING); setState("text"); $("#rx-msg").focus(); clearInterval(timerId);
    btnHang.hidden = false; return;
  }
  await new Promise((r) => setTimeout(r, 900));
  addLine("ai", GREETING); setState("speaking"); btnHang.hidden = false;
  await speak(GREETING);
  listenLoop();
}
async function endCall(auto) {
  if (ended) return;
  ended = true; inCall = false; stopSpeaking();
  clearInterval(timerId);
  try { recorder?.state !== "inactive" && recorder?.stop(); } catch {}
  stream?.getTracks().forEach((t) => t.stop()); stream = null; audioCtx?.close().catch(() => {}); audioCtx = null;
  setState("ended"); btnHang.hidden = true; btnCall.hidden = false; btnCall.textContent = "Ring igjen";
  if (!auto) addLine("sys", "Du la på.");
  await summarize();
}
async function summarize() {
  const box = $("#rx-summary");
  if (historikk.filter((m) => m.rolle === "kunde").length < 1) return;
  box.hidden = false; box.className = "summary"; box.innerHTML = `<div class="loading" style="min-height:60px">Lager samtalelogg …</div>`;
  try {
    const d = await api("/api/samtale/oppsummer", { historikk });
    const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length / 1000).toFixed(1) + " s" : "–");
    box.innerHTML = `<h3>Samtalelogg / oppsummering</h3><p>${esc(d.oppsummering)}</p>
      <dl><dt>Årsak</dt><dd>${esc(d.arsak)}</dd><dt>Innringer</dt><dd>${esc(d.innringer)}</dd><dt>Utfall</dt><dd>${esc(d.utfall)}</dd>
      <dt>Hastegrad</dt><dd><span class="tag ${esc(d.hastegrad)}">${esc(d.hastegrad)}</span></dd><dt>Stemning</dt><dd>${esc(d.stemning)}</dd>
      <dt>Varighet</dt><dd>${$("#rx-timer").textContent}</dd><dt>Svartid AI</dt><dd>${avg(stats.llm)} (tale til tekst ${avg(stats.stt)})</dd></dl>
      ${d.oppfolging?.length ? `<strong>Oppfølging</strong><ul>${d.oppfolging.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <button type="button" class="btn btn-ghost" id="rx-dl">Last ned logg (.txt)</button>`;
    $("#rx-dl").addEventListener("click", () => download("samtalelogg.txt", `SAMTALELOGG – Bergen Fysioterapi (demo)\n\n${d.oppsummering}\n\nÅrsak: ${d.arsak}\nInnringer: ${d.innringer}\nUtfall: ${d.utfall}\nHastegrad: ${d.hastegrad}\nOppfølging:\n${(d.oppfolging || []).map((x) => "- " + x).join("\n")}\n\nUTSKRIFT\n${historikk.map((m) => (m.rolle === "ai" ? "Resepsjonist: " : "Innringer: ") + m.tekst).join("\n")}\n`, "text/plain;charset=utf-8"));
  } catch (err) { box.innerHTML = `<p class="status err">${esc(err.message)}</p>`; }
}

btnCall.addEventListener("click", startCall);
btnHang.addEventListener("click", () => endCall(false));
btnDone.addEventListener("click", () => stopNow && stopNow());
$("#rx-text").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#rx-msg").value.trim(); if (!v) return;
  if (ended) { ended = false; historikk = []; logEl.innerHTML = ""; $("#rx-summary").hidden = true; actionEl.innerHTML = ""; }
  $("#rx-msg").value = "";
  if (!inCall && historikk.length === 0) { addLine("ai", GREETING); setState("text"); }
  turn(v);
});
window.__rx = { stats, get historikk() { return historikk; } }; // for testene
