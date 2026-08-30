# -*- coding: utf-8 -*-
"""调试：GM 彩蛋入口流程"""
import http.server, functools, threading, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 8902), handler)
httpd.daemon_threads = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
    ctx = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8902/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2000)
    page.locator('#btnNew').click(force=True)
    page.wait_for_timeout(2500)
    print('scene keys:', page.evaluate("window.__game.scene.getScenes(true).map(s=>s.scene.key)"))
    r = page.evaluate("(() => { const t = window.__game.scene.getScene('Town'); t.talkTo('merchant'); return 'called' })()")
    print('talkTo:', r)
    page.wait_for_timeout(800)
    print('dialog open:', page.evaluate("document.getElementById('dialog').classList.contains('open')"))
    print('dialog text:', page.evaluate("document.getElementById('dialogText').textContent"))
    for i in range(8):
        page.evaluate("document.getElementById('dialog').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
        page.wait_for_timeout(200)
        n = page.locator('#dialogOpts button').count()
        print(f'step{i}: opts={n}')
        if n > 0:
            labels = page.evaluate("[...document.querySelectorAll('#dialogOpts button')].map(b=>b.textContent)")
            print('选项:', labels)
            break
    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('DEBUG DONE')
