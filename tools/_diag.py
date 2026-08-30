# -*- coding: utf-8 -*-
"""诊断：道友对话为何截图为空"""
import http.server, functools, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'promo' / '_diag'
OUT.mkdir(parents=True, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 8899), handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
    ctx.add_init_script('localStorage.clear()')
    page = ctx.new_page()
    page.goto('http://127.0.0.1:8899/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2500)
    page.locator('#btnNew').click()
    page.wait_for_timeout(2500)

    box = page.locator('#joy').bounding_box()
    cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    page.mouse.move(cx, cy); page.mouse.down()
    page.mouse.move(cx - 38, cy, steps=6)
    page.wait_for_timeout(350); page.mouse.up()
    page.wait_for_timeout(300)

    print('btnAct visible:', page.locator('#btnAct').is_visible(),
          'display:', page.evaluate("document.getElementById('btnAct').style.display"))
    page.locator('#btnAct').click(force=True)
    for i in range(5):
        page.wait_for_timeout(400)
        st = page.evaluate("""({
            open: document.getElementById('dialog').classList.contains('open'),
            name: document.getElementById('dialogName').textContent,
            text: document.getElementById('dialogText').textContent,
            opts: document.getElementById('dialogOpts').children.length,
            toast: document.getElementById('toast').textContent,
        })""")
        print(i, st)
        page.screenshot(path=str(OUT / f'diag_{i}.png'))
    ctx.close(); browser.close()
httpd.shutdown()
