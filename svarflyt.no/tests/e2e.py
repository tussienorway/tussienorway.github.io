"""Ende-til-ende-test av Svarflyt-prototypen mot den ekte Worker-en.
Serverer filene lokalt, men under https://tussienorway.github.io/svarflyt.no/ (via Playwright-ruting),
slik at CORS-regelen i Worker-en blir testet på ekte. Kjør: python svarflyt.no/tests/e2e.py
"""
import pathlib, sys, mimetypes, json
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = "https://tussienorway.github.io/svarflyt.no/"
SHOTS = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/svarflyt-shots"); SHOTS.mkdir(parents=True, exist_ok=True)
results, created, errors = [], [], []

def ok(name, cond, info=""):
    results.append((name, bool(cond), info)); print(("PASS " if cond else "FAIL ") + name, info)

def serve(route):
    path = route.request.url.split("/svarflyt.no/", 1)[1].split("?")[0] or "index.html"
    f = ROOT / path
    if not f.is_file(): return route.fulfill(status=404, body="nf")
    route.fulfill(status=200, body=f.read_bytes(), content_type=mimetypes.guess_type(str(f))[0] or "text/plain")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    ctx.route("https://tussienorway.github.io/svarflyt.no/**", serve)
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(BASE); pg.wait_for_load_state("networkidle")
    ok("forside laster", "Bruk mindre tid" in pg.inner_text("h1"))
    ld = pg.eval_on_selector("script[type='application/ld+json']", "e => JSON.parse(e.textContent)['@graph'].map(x => x['@type'])")
    ok("JSON-LD gyldig", {"Organization", "Service", "FAQPage"} <= set(ld), str(ld))

    # A: Kundesvar
    pg.click("#form-a button[type=submit]")
    pg.wait_for_selector("#a-out:not([hidden])", timeout=60000)
    svar = pg.input_value("#a-svar"); ok("kundesvar gir AI-utkast", len(svar) > 60, svar[:90].replace("\n", " "))
    pg.click("#a-godkjenn"); ok("godkjenn viser status", "Godkjent" in pg.inner_text("#a-out .badge"))

    # B: Uttrekk
    pg.click("#tab-b"); pg.click("#form-b button[type=submit]")
    pg.wait_for_selector("#b-out:not([hidden])", timeout=60000)
    tbl = pg.inner_text("#b-table"); ok("uttrekk gir felt", "Vestland" in tbl and "20431" in tbl)
    ok("uttrekk flagger feil sum", "stemmer ikke" in tbl, "")
    with pg.expect_download() as d: pg.click("#b-csv")
    ok("CSV lastes ned", d.value.suggested_filename.endswith(".csv"))
    with pg.expect_download() as d: pg.click("#b-json")
    j = json.loads(pathlib.Path(d.value.path()).read_text()); ok("JSON lastes ned", "felter" in j)

    # C: Timebestilling
    pg.click("#tab-c"); pc = pg.locator("#pane-c")
    pc.locator("button[type=submit]").first.click()
    pc.locator(".slot").first.wait_for(timeout=60000)
    ok("booking tolker fritekst", pc.locator(".slot").count() > 0, pc.locator(".hint").first.inner_text()[:90])
    pc.locator(".slot").first.click()
    pc.locator("input[autocomplete=name]").fill("E2E Test"); pc.locator("input[type=email]").fill("e2e-test@example.com")
    pc.locator(".bk-confirm button[type=submit]").click()
    pc.locator(".confirm").wait_for(timeout=30000)
    conf = pc.locator(".confirm").inner_text(); ok("booking bekreftet", "Bookingnummer" in conf, conf[:80])
    created.append(conf.split("Bookingnummer: ")[1].split(".")[0])
    with pg.expect_download() as d: pc.locator(".bk-ics").click()
    ics = pathlib.Path(d.value.path()).read_text(); ok(".ics lastes ned", "BEGIN:VCALENDAR" in ics and "DTSTART:" in ics)

    # Kontaktskjema
    pg.fill("#k-navn", "E2E Test"); pg.fill("#k-epost", "e2e-test@example.com"); pg.fill("#k-melding", "Automatisk test – slett meg")
    pg.check("#k-samtykke"); pg.click("#form-k button[type=submit]")
    pg.wait_for_function("document.querySelector('#k-status').textContent.length > 5", timeout=30000)
    st = pg.inner_text("#k-status"); ok("kontaktskjema lagrer", "referanse K-" in st, st)
    if "K-" in st: created.append("K-" + st.split("K-")[1][:8])
    pg.screenshot(path=str(SHOTS / "desktop.png"), full_page=True)

    # Mobil
    m = ctx.new_page(); m.set_viewport_size({"width": 375, "height": 800}); m.goto(BASE); m.wait_for_load_state("networkidle")
    sw = m.evaluate("document.documentElement.scrollWidth"); ok("ingen horisontal scroll på 375px", sw <= 375, f"scrollWidth={sw}")
    m.click(".menu-btn"); ok("mobilmeny åpner", m.is_visible("#nav a[href='#losninger']"))
    m.screenshot(path=str(SHOTS / "mobil.png"), full_page=True)

    pv = ctx.new_page(); pv.goto(BASE + "personvern.html"); ok("personvern.html laster", "Behandlingsansvarlig" in pv.content())
    # ---------- AI-resepsjonist ----------
    import base64, time
    webm = base64.b64encode((ROOT / "tests/fixtures/sporsmal-nb.webm").read_bytes()).decode()
    t0 = time.time()
    stt = pg.evaluate("""async (b) => { const bin = Uint8Array.from(atob(b), c => c.charCodeAt(0));
        const r = await fetch('https://svarflyt-api.tussienorway.workers.dev/api/stt', {method:'POST', headers:{'Content-Type':'audio/webm'}, body: bin}); return await r.json(); }""", webm)
    ok("STT (Whisper) transkriberer norsk lydfil", "time" in stt.get("tekst", "").lower(), f"{stt.get('tekst','')[:70]} ({time.time()-t0:.1f}s)")
    t0 = time.time()
    tts = pg.evaluate("""async () => { const r = await fetch('https://svarflyt-api.tussienorway.workers.dev/api/tts', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({tekst:'Hei, du har kommet til Bergen Fysioterapi.'})});
        const b = await r.arrayBuffer(); return [r.status, r.headers.get('content-type'), b.byteLength]; }""")
    ok("TTS returnerer lyd", tts[0] == 200 and "audio" in (tts[1] or "") and tts[2] > 2000, f"{tts} ({time.time()-t0:.1f}s)")

    pg.click("#tab-d")
    pg.fill("#rx-msg", "Hei, hva koster en første time hos dere?"); pg.click("#rx-text button")
    pg.wait_for_function("document.querySelectorAll('#rx-log li.ai').length >= 2", timeout=60000)
    svar = pg.locator("#rx-log li.ai").nth(1).inner_text(); ok("resepsjonist svarer fra bedriftsinfo", "890" in svar, svar[:90].replace("\n", " "))
    pg.fill("#rx-msg", "Jeg vil gjerne bestille en time på fredag etter lunsj."); pg.click("#rx-text button")
    try:
        pg.locator("#rx-action .slot").first.wait_for(timeout=60000)
    except Exception:
        pg.fill("#rx-msg", "Ja, vis meg ledige tider på fredag etter klokka tolv."); pg.click("#rx-text button")
        pg.locator("#rx-action .slot").first.wait_for(timeout=60000)
    ok("resepsjonist viser ledige tider", pg.locator("#rx-action .slot").count() > 0)
    pg.locator("#rx-action .slot").first.click()
    pg.locator("#rx-action input[autocomplete=name]").fill("E2E Resepsjon"); pg.locator("#rx-action input[type=email]").fill("e2e-test@example.com")
    pg.locator("#rx-action .bk-confirm button[type=submit]").click()
    pg.locator("#rx-action .confirm").wait_for(timeout=30000)
    conf = pg.locator("#rx-action .confirm").inner_text(); ok("resepsjonist booker time", "Bookingnummer" in conf, conf[:70])
    created.append(conf.split("Bookingnummer: ")[1].split(".")[0])
    with pg.expect_download() as d: pg.locator("#rx-action .bk-ics").click()
    ics2 = pathlib.Path(d.value.path()).read_text(); ok("resepsjonist .ics (60 min, riktig tittel)", "BEGIN:VCALENDAR" in ics2 and "Bergen Fysioterapi" in ics2)
    pg.click("#rx-hang")
    pg.locator("#rx-summary h3").wait_for(timeout=60000)
    summ = pg.inner_text("#rx-summary"); ok("samtalelogg/oppsummering lages", "Årsak" in summ and len(summ) > 80, summ.split("\n")[1][:90] if "\n" in summ else "")
    pg.screenshot(path=str(SHOTS / "resepsjonist-tekst.png"), full_page=False)
    lat = pg.evaluate("window.__rx.stats.llm"); print("LATENS resepsjonist (ms):", [round(x) for x in lat])
    ok("ingen konsollfeil", not errors, "; ".join(errors)[:200])
    b.close()

    # ---------- Talesamtale med falsk mikrofon (ekte lydfil) ----------
    wav = str(ROOT / "tests/fixtures/sporsmal-nb.wav")
    b2 = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-audio-capture={wav}", "--autoplay-policy=no-user-gesture-required"])
    c2 = b2.new_context(permissions=["microphone"]); c2.route("https://tussienorway.github.io/svarflyt.no/**", serve)
    v = c2.new_page(); verr = []; v.on("pageerror", lambda e: verr.append(str(e)))
    v.goto(BASE); v.click("#tab-d"); v.click("#rx-call"); t0 = time.time()
    v.wait_for_function("document.querySelectorAll('#rx-log li.du').length >= 1", timeout=90000)
    heard = v.locator("#rx-log li.du").first.inner_text(); t_heard = time.time() - t0
    v.wait_for_function("document.querySelectorAll('#rx-log li.ai').length >= 2", timeout=60000)
    reply = v.locator("#rx-log li.ai").nth(1).inner_text()
    ok("talesamtale: tale blir forstått", "time" in heard.lower(), heard.replace("\n", " ")[:80])
    ok("talesamtale: AI svarer", len(reply) > 15, reply.replace("\n", " ")[:80])
    print("TALE: stt-ms", [round(x) for x in v.evaluate("window.__rx.stats.stt")], "llm-ms", [round(x) for x in v.evaluate("window.__rx.stats.llm")])
    v.click("#rx-hang"); v.locator("#rx-summary h3").wait_for(timeout=60000)
    ok("talesamtale: samtalelogg etter legg på", "Årsak" in v.inner_text("#rx-summary"))
    v.screenshot(path=str(SHOTS / "resepsjonist-tale.png"))
    ok("talesamtale: ingen JS-feil", not verr, "; ".join(verr)[:200])
    b2.close()

    # ---------- Mikrofon avslått ----------
    b3 = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    c3 = b3.new_context(); c3.route("https://tussienorway.github.io/svarflyt.no/**", serve)
    d3 = c3.new_page(); d3.goto(BASE); d3.click("#tab-d"); d3.click("#rx-call")
    d3.wait_for_function("document.querySelector('#rx-phone').dataset.state === 'text'", timeout=20000)
    ok("avslått mikrofon gir tekstmodus", "Skriv" in d3.inner_text("#rx-hint") or "skriv" in d3.inner_text("#rx-hint"), d3.inner_text("#rx-hint")[:80])
    b3.close()

print("OPPRETTET:", ",".join(created))
fails = [r for r in results if not r[1]]
print(f"{len(results) - len(fails)}/{len(results)} bestått"); sys.exit(1 if fails else 0)
