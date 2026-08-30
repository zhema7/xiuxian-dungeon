# -*- coding: utf-8 -*-
"""黄龙山准入校验：筑基（realm=1）应被拒，对话无「踏入法阵」选项"""
import http.server, functools, threading, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'promo' / '_smoke'
OUT.mkdir(parents=True, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 8905), handler)
httpd.daemon_threads = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()

save = {
    'version': 3, 'classId': 'sword', 'heroName': '测试修士', 'level': 12, 'exp': 0,
    'gold': 500, 'potions': 3, 'hp': -1, 'insight': 20, 'realm': 1,
    'materials': {'tupo': 1}, 'companion': False,
    'progress': {'qmCleared': True, 'ymCleared': False},
    'favor': {}, 'quests': {}, 'totalKills': 0,
    'equipment': {'weapon': None, 'head': None, 'armor': None, 'boots': None, 'charm1': None, 'charm2': None},
    'inventory': [], 'skills': {'sk_sanlian': 2},
    'skillSlots': {'style': 'sk_sanlian', 'minds': [None, None], 'art': None},
    'talents': {}, 'presets': [None] * 5, 'activePreset': -1,
    'syMaxDepth': 0, 'syCheckpoint': 7,
}
init = 'localStorage.clear();localStorage.setItem("xiuxian_save_v1", ' + json.dumps(json.dumps(save, ensure_ascii=False)) + ');'

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
    ctx = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True)
    ctx.add_init_script(init)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8905/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(1500)
    page.locator('#btnContinue').click(force=True)
    page.wait_for_timeout(2000)

    joy = page.locator('#joy').bounding_box()
    cx, cy = joy['x'] + joy['width'] / 2, joy['y'] + joy['height'] / 2
    def mv(dx, dy, ms):
        page.mouse.move(cx, cy); page.mouse.down()
        page.mouse.move(cx + dx * 38, cy + dy * 38, steps=5)
        page.wait_for_timeout(ms); page.mouse.up()

    mv(1, -0.2, 1500)
    for _ in range(10):
        if page.evaluate("document.getElementById('btnAct').style.display") != 'none':
            break
        mv(0.3, -1, 900)
    page.evaluate("document.getElementById('btnAct').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(500)
    for _ in range(8):
        if page.locator('#dialogOpts button').count() > 0:
            break
        if not page.evaluate("document.getElementById('dialog').classList.contains('open')"):
            break
        db = page.locator('#dialog').bounding_box()
        if not db:
            break
        page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
        page.wait_for_timeout(350)
    page.screenshot(path=str(OUT / 'hl_gate_refuse.png'))
    dlg_text = page.evaluate("document.getElementById('dialogText')?.innerText ?? ''")
    n_opts = page.locator('#dialogOpts button').count()
    print('对话内容:', dlg_text)
    print('选项数（拒绝时应为 0）:', n_opts)
    hud = page.evaluate("document.getElementById('hud').innerText.slice(0, 40)")
    print('仍在洞府:', '洞府' in hud)
    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('GATE TEST DONE')
