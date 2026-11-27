# End-to-end check of the CV site in Chromium, WebKit (Safari engine) and Firefox, with real keyboard and
# mouse events (keydown -> keypress -> keyup), served over http like GitHub Pages.
#   uv run --with playwright==1.65.2 --with pypdf python tests/check_site.py   (once: ... python -m playwright install)
# Exits non-zero on any failure.
import functools, http.server, pathlib, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
# in the public repo (copied there by tools/build_public.py, run by its CI) the repo root is the site itself
SITE = PUBLIC = ROOT
if not (ROOT / "index.html").exists(): SITE, PUBLIC = ROOT / "site", ROOT / "public"
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(SITE)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_port}/index.html"
fails = []


def check(engine, name, ok, info=""):
    if not ok:
        fails.append(f"[{engine}] {name} {info}")
    print(f"  {'ok  ' if ok else 'FAIL'} {name} {info if not ok else ''}")


def run_engine(pw, engine):
    print(f"\n== {engine}")
    browser = getattr(pw, engine).launch()
    E = functools.partial(check, engine)

    # ---------- desktop, JS on ----------
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.add_init_script("window.open = (u) => { window.__opened = u; return null; };"
                         "window.__csp = []; document.addEventListener('securitypolicyviolation', e => __csp.push(e.violatedDirective + ' ' + e.blockedURI))")
    page.goto(URL + "?lang=fr")
    page.mouse.move(5, 5)
    q = page.evaluate
    opened = lambda: q("document.querySelector('.term').classList.contains('opened')")
    tabs_visible = lambda: q("getComputedStyle(document.querySelector('.term-tabs')).visibility") == "visible"
    session = lambda p="projet": q(f"document.querySelector('#panel-{p} .session').innerText")
    inp = f"#panel-projet input.cmd"

    E("arrives closed", not opened() and not tabs_visible() and page.is_visible(".closed-msg .start") and not page.is_visible("#panel-projet"))

    def blinks(sel):
        seen = set()
        for _ in range(8):
            seen.add(q(f"getComputedStyle(document.querySelector('{sel}')).opacity")); time.sleep(0.2)
        return seen >= {"0", "1"}
    E("cursor blinks while closed", blinks(".closed-msg .cursor"))

    tip = lambda: q("getComputedStyle(document.querySelector('.logo-tip')).opacity")
    page.hover("nav .logo"); time.sleep(0.8)
    E("logo hover shows snake hint", tip() == "1" and "snake" in q("document.querySelector('.logo-tip').innerText"))
    page.mouse.move(5, 400); time.sleep(0.4)
    E("hint hides on leave", tip() == "0")

    page.click(".closed-msg")
    time.sleep(0.6)
    E("click opens, tabs appear", opened() and tabs_visible())
    E("cursor blinks during typing", blinks("#panel-projet .cmd-cursor"))
    time.sleep(2)
    E("intro typed", "cat projet.md" in q("document.querySelector('#panel-projet .intro-line, #panel-projet .typed').textContent"))
    E("cursor blinks after open", blinks("#panel-projet .prompt .cursor"))
    h_open = q("document.querySelector('.term').offsetHeight")

    page.click("#panel-projet .session", position={"x": 5, "y": 5}, force=True)
    E("click focuses prompt", q("document.activeElement.matches('input.cmd')"))
    E("ghost suggests help", q("document.querySelector('#panel-projet .ghost').textContent") == "help")
    page.keyboard.type("he")
    E("ghost completes prefix", q("document.querySelector('#panel-projet .ghost').textContent") == "lp")
    page.keyboard.press("Tab")
    E("Tab accepts", page.input_value(inp) == "help")
    E("typed text not clipped", q(f"(() => {{ const i = document.querySelector('{inp}'); return i.scrollWidth <= i.clientWidth && i.scrollLeft === 0; }})()"))
    page.keyboard.press("Enter")
    E("help runs, intro gone", "whoami" in session() and not page.is_visible("#panel-projet .intro"))
    E("cursor blinks while typing", (page.keyboard.type("wh"), blinks("#panel-projet .prompt .cursor"))[1])
    page.keyboard.press("ArrowRight")
    E("Right accepts", page.input_value(inp) == "whoami")
    page.keyboard.press("Enter")
    E("each command clears the screen", session().count("$") == 1 and "Sherbrooke" in session() and "help" not in session())

    def clear_input():  # the empty input is 0ch wide, so Playwright deems it invisible: erase with keys instead
        for _ in range(len(page.input_value(inp))): page.keyboard.press("Backspace")
    def cmd(c):
        clear_input(); page.keyboard.type(c); page.keyboard.press("Enter"); time.sleep(0.15)
        return session()
    heights = set()
    for c, want in [("ls", "publications/"), ("cat projet.md", "diagonalisation exacte, DFT, topologie"), ("cat contact.md", "@"), ("cat cv.pdf", "open cv.pdf"),
                    ("pwd", "/home/adl/"), ("sudo rm -rf /", "sudoers"), ("pyqcm --version", "pyqcm 2."), ("foo", "command not found: foo"),
                    ("cd nowhere", "no such file"), ("echo <b>x</b>", "<b>x</b>")]:
        out = cmd(c)
        E(f"`{c}`", want in out, repr(out[:120]))
        heights.add(q("document.querySelector('.term').offsetHeight"))
        E(f"`{c}` fits", q("(() => { const p = document.querySelector('#panel-projet'); return p.scrollHeight <= p.clientHeight + 1; })()"))
    E("echo is escaped", q("!document.querySelector('#panel-projet .session b')"))
    E("fixed height", heights == {h_open}, str(heights | {h_open}))
    cmd("open cv.pdf")
    E("open cv.pdf", q("window.__opened") == "cv-fr.pdf")
    y0 = q("scrollY"); cmd("cd publications"); time.sleep(1)
    E("cd scrolls", q("scrollY") > y0 + 300)
    page.evaluate("scrollTo(0, 0)"); time.sleep(0.3)
    cmd("lang en")
    E("lang en", q("document.documentElement.lang") == "en" and "language: English" in session())
    cmd("lang fr")
    page.keyboard.press("ArrowUp"); page.keyboard.press("ArrowUp")
    E("history", page.input_value(inp) == "lang en")
    clear_input()
    page.keyboard.press("Control+l")
    E("ctrl+L clears", session().strip() == "")

    # exit by keyboard: the same Enter must not reopen it
    cmd("exit"); time.sleep(0.8)
    E("exit closes and stays closed", not opened() and not tabs_visible() and page.is_visible(".closed-msg .exited"))
    E("exit moves focus to reopen button", q("document.activeElement.classList.contains('closed-msg')"))
    ring = lambda: q("getComputedStyle(document.querySelector('.closed-msg')).outlineStyle")
    E("no focus ring after exit", ring() == "none", ring())
    q("document.activeElement.blur()")  # leaving it restores the ring (WebKit on macOS does not Tab to buttons, so no Tab here)
    E("ring restored after blur", not q("document.querySelector('.closed-msg').classList.contains('quiet')"))
    q("document.querySelector('.closed-msg').focus()")
    page.keyboard.press("Enter"); time.sleep(0.6)
    E("Enter reopens", opened())
    page.click("#panel-projet .session", position={"x": 5, "y": 5}, force=True)
    cmd("exit"); time.sleep(0.6)
    page.click(".term .bar"); time.sleep(0.6)
    E("click on bar reopens", opened())
    page.click("#panel-projet .session", position={"x": 5, "y": 5}, force=True)
    cmd("exit"); time.sleep(0.1); page.click(".closed-msg"); time.sleep(0.7)
    E("exit then fast reopen settles", opened() and q("document.querySelector('.term').style.height") == "" and q("document.querySelector('.term').offsetHeight") == h_open)

    # contact tab and copy
    page.click("#tab-contact"); time.sleep(2.5)
    E("contact tab", page.is_visible("#panel-contact") and not page.is_visible("#panel-projet"))
    page.click("#panel-contact a[href^='mailto:']"); time.sleep(0.5)
    E("click on email copies or shows it", "copi" in session("contact") or "usherbrooke.ca" in session("contact"), repr(session("contact")))
    E("cursor blinks in contact", blinks("#panel-contact .prompt .cursor"))

    # snake
    page.click("#panel-contact .session", position={"x": 5, "y": 5}, force=True)
    page.keyboard.type("snake"); page.keyboard.press("Enter"); time.sleep(2)
    E("snake tab", page.is_visible("#panel-snake") and q("document.getElementById('tab-snake').hidden") is False)
    page.keyboard.press(" "); time.sleep(0.5)
    E("snake runs", "score" in q("document.querySelector('.snake-status').innerText"))
    E("snake apple is @", "@" in q("document.querySelector('#panel-snake .board').innerText"))
    page.keyboard.press("Escape"); time.sleep(0.3)
    E("esc leaves snake", page.is_visible("#panel-projet"))

    # theme: automatic -> light -> dark -> automatic; automatic follows the system, a saved setting survives a reload
    bg = lambda: q("getComputedStyle(document.body).backgroundColor")
    theme = lambda: q("document.documentElement.dataset.theme")
    pref = lambda: q("document.documentElement.dataset.themePref")
    stored = lambda: q("localStorage.getItem('theme')")
    label = lambda: q("document.getElementById('theme-toggle').getAttribute('aria-label')")
    icons = lambda: q("[...document.querySelectorAll('#theme-toggle svg')].filter(s => getComputedStyle(s).display !== 'none').map(s => s.getAttribute('class'))")
    light_bg = bg()
    E("starts automatic", pref() == "auto" and theme() == "light" and stored() is None and icons() == ["ic-auto"] and "automatique" in label())
    page.emulate_media(color_scheme="dark"); time.sleep(0.2)
    E("automatic follows system to dark", theme() == "dark" and bg() != light_bg)
    page.emulate_media(color_scheme="light"); time.sleep(0.2)
    E("automatic follows system to light", theme() == "light" and bg() == light_bg)
    page.click("#theme-toggle")
    E("click 1: light", pref() == "light" and theme() == "light" and stored() == "light" and icons() == ["ic-light"] and "clair" in label())
    page.emulate_media(color_scheme="dark"); time.sleep(0.2)
    E("light ignores system", theme() == "light")
    page.click("#theme-toggle")
    E("click 2: dark", pref() == "dark" and theme() == "dark" and bg() != light_bg and stored() == "dark" and icons() == ["ic-dark"] and "sombre" in label())
    page.emulate_media(color_scheme="light"); time.sleep(0.2)
    E("dark ignores system", theme() == "dark")
    page.reload(); page.mouse.move(5, 5)
    E("dark persists", pref() == "dark" and theme() == "dark" and icons() == ["ic-dark"])
    page.click("#theme-toggle")
    E("click 3: automatic again", pref() == "auto" and theme() == "light" and stored() is None and icons() == ["ic-auto"])
    E("theme button as tall as lang button", q("document.getElementById('theme-toggle').offsetHeight === document.getElementById('lang-toggle').offsetHeight"))
    page.click(".closed-msg"); time.sleep(0.6)

    # language button during the typing animation, PDF button
    page.click("#lang-toggle"); time.sleep(2.5)
    E("lang toggle while typing", q("document.documentElement.lang") == "en" and "cat project.md" in q("document.querySelector('#panel-projet .typed').textContent"))
    page.click("#panel-projet .session", position={"x": 5, "y": 5}, force=True)
    E("cat in English renders on one line", "CDMFT, exact diagonalization, DFT, Green" in cmd("cat project.md"), repr(session()[:200]))
    E("theme label follows language", label() == "Theme: automatic", label())
    E("PDF links exist", all(page.request.get(f"http://127.0.0.1:{srv.server_port}/cv-{l}.pdf").ok for l in ("fr", "en")))
    E("no JS errors", not errors, str(errors))
    E("no CSP violation", q("window.__csp.length") == 0, str(q("window.__csp")))
    E("CSP active", "script-src 'self'" in q("document.querySelector('meta[http-equiv=Content-Security-Policy]').content"))
    ctx.close()

    # ---------- no JS / terminal.js missing: terminal shown open and static ----------
    ctx = browser.new_context(java_script_enabled=False)
    p = ctx.new_page(); p.goto(URL)
    E("no JS: terminal open", p.is_visible("#panel-projet") and not p.is_visible(".closed-msg"))
    ctx.close()
    ctx = browser.new_context()
    p = ctx.new_page(); p.route("**/terminal.js", lambda r: r.abort()); p.goto(URL)
    E("terminal.js missing: terminal open", p.is_visible("#panel-projet") and not p.is_visible(".closed-msg"))
    ctx.close()

    # ---------- phone ----------
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, **({} if engine == "firefox" else {"is_mobile": True, "has_touch": True}))
    p = ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(URL + "?lang=fr")
    E("phone: no horizontal scroll", p.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    p.click(".closed-msg"); time.sleep(2.6)
    p.click("#panel-projet .session", position={"x": 5, "y": 5}, force=True)
    p.keyboard.type("help"); p.keyboard.press("Enter")
    E("phone: help fits", p.evaluate("(() => { const e = document.querySelector('#panel-projet'); return e.scrollHeight <= e.clientHeight + 1; })()"))
    p.keyboard.type("exit"); p.keyboard.press("Enter"); time.sleep(0.6)
    E("phone: exit", not p.evaluate("document.querySelector('.term').classList.contains('opened')"))
    E("phone: no JS errors", not errs, str(errs))
    ctx.close()
    browser.close()


def check_published():
    # what GitHub Pages actually serves is public/ (in the separate antoinedelagrave.github.io
    # repo): only these files, the private-only sections stripped, nothing personal in the PDFs
    print("\n== published files (public/)")
    E = functools.partial(check, "files")
    if not PUBLIC.exists():
        E("public/ exists", False, "run tools/build_public.py first")
        return
    allowed = {"index.html", "style.css", "boot.js", "page.js", "terminal.js", "cv-fr.pdf", "cv-en.pdf", "README.md",
               "tests/check_site.py", ".github/workflows/check.yml"}
    files = {str(p.relative_to(PUBLIC)) for p in PUBLIC.rglob("*") if p.is_file() and ".git" not in p.relative_to(PUBLIC).parts}
    extra = {x for x in files - allowed if not (x.startswith("fonts/") and x.endswith((".woff2", ".txt")))}
    E("only expected files in public/", not extra, str(sorted(extra)))
    html = (PUBLIC / "index.html").read_text()
    E("Bourses/Engagement stripped from public/", 'id="bourses"' not in html and 'id="engagement"' not in html)
    from pypdf import PdfReader
    for l in ("fr", "en"):
        meta = {k: str(v) for k, v in (PdfReader(PUBLIC / f"cv-{l}.pdf").metadata or {}).items()}
        E(f"cv-{l}.pdf metadata clean", not any(s in " ".join(meta.values()) for s in ("Chrome", "Skia", "/Users", "127.0.0.1")), str(meta))
        raw = (PUBLIC / f"cv-{l}.pdf").read_bytes()
        E(f"cv-{l}.pdf has no local path", b"/Users/" not in raw and b"file://" not in raw and b"127.0.0.1" not in raw)


check_published()
with sync_playwright() as pw:
    for engine in (sys.argv[1:] or ["chromium", "webkit", "firefox"]):
        run_engine(pw, engine)
print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILURE(S):\n" + "\n".join(fails)))
sys.exit(1 if fails else 0)
