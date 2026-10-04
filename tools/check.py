"""Contrôle visuel du jeu dans Chromium headless.

Prérequis : pip install playwright && python -m playwright install chromium
Lancer d'abord le serveur : python -m http.server 8000  (à la racine du projet)
Puis : python tools/check.py   — les captures atterrissent dans tools/shots/.
"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
URL = "http://localhost:8000/"

msgs, errs = [], []

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=[
        "--use-gl=angle", "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    ])
    page = browser.new_page(viewport={"width": 1600, "height": 950})
    page.on("console", lambda m: msgs.append(f"[{m.type}] {m.text}"))
    page.on("pageerror", lambda e: errs.append(str(e)))

    page.goto(URL, wait_until="load")
    page.wait_for_timeout(2500)
    page.screenshot(path=str(OUT / "shot-setup.png"))

    page.click("#setup-go")
    page.wait_for_timeout(4000)
    page.screenshot(path=str(OUT / "shot-board.png"))

    # état interne après initialisation
    state = page.evaluate("""() => ({
        hasGame: !!window.game,
        phase: window.game && window.game.phase,
        players: window.game && window.game.players.map(p => [p.name, p.money, p.tile]),
        tiles: window.view && window.view.tilePos.length,
        anchors: window.view && Object.keys(window.view.plotAnchors).length,
        drawCalls: window.view && window.view.renderer.info.render.calls,
        tris: window.view && window.view.renderer.info.render.triangles,
    })""")
    print("ETAT:", state)

    # quelques tours : on clique le bouton principal du panneau d'actions
    for i in range(14):
        try:
            btn = page.query_selector("#actions .btn.primary") or page.query_selector("#actions .btn")
            if not btn:
                page.wait_for_timeout(600); continue
            label = btn.inner_text()
            btn.click()
            page.wait_for_timeout(1700)
        except Exception as e:
            errs.append(f"clic {i}: {e}")
            page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / "shot-play.png"))

    # vue rapprochée pour juger les volumes
    page.evaluate("""() => {
        const g = window.game, v = window.view;
        // force un complexe entièrement construit + base de loisirs + entrées
        const codes = ['WAI','FUJ','MON','BOO'];
        for (const c of codes) {
            const p = g.plots[c];
            p.owner = 0; p.built = g.maxBuildings(c); p.leisure = true;
            p.entrances = g.entranceSpots(c).slice(0, p.built);
            v.syncPlot(c, p);
        }
        v.camera.position.set(0, 34, 46);
        v.controls.target.set(0, 0, 10);
        v.controls.update();
    }""")
    page.wait_for_timeout(1200)
    page.screenshot(path=str(OUT / "shot-builds.png"))

    page.evaluate("""() => {
        const v = window.view;
        v.camera.position.set(0, 95, 1);
        v.controls.target.set(0, 0, 0);
        v.controls.update();
    }""")
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / "shot-top.png"))

    browser.close()

print("\n--- ERREURS PAGE ---")
print("\n".join(errs) or "(aucune)")
print("\n--- CONSOLE ---")
print("\n".join(m for m in msgs if "[error]" in m or "[warning]" in m) or "(rien)")
