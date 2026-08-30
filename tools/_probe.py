# -*- coding: utf-8 -*-
"""探针：注入存档后继续，输出场景状态"""
import http.server, functools, threading, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'promo' / '_smoke'
OUT.mkdir(parents=True, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 8899), handler)
httpd.daemon_threads = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()

save = {
    "version": 2, "classId": "sword", "heroName": "试雷真人", "level": 25, "exp": 0,
    "gold": 999, "potions": 5, "insight": 0, "hp": -1, "realm": 2, "materials": {},
    "companion": False, "progress": {"qmCleared": True, "ymCleared": True},
    "favor": {}, "quests": {}, "totalKills": 0,
    "equipment": {
        "weapon": {"uid": "t1", "baseId": "w_zx", "name": "紫霄雷剑", "slot": "weapon", "quality": 3, "setId": "set_zx", "atk": 40, "def": 0, "speed": 0, "crit": 0.04, "maxHp": 0, "affixes": [], "price": 100, "enh": 0},
        "head": {"uid": "t2", "baseId": "h_zx", "name": "紫霄冠", "slot": "head", "quality": 3, "setId": "set_zx", "atk": 0, "def": 12, "speed": 0, "crit": 0, "maxHp": 50, "affixes": [], "price": 100, "enh": 0},
        "armor": {"uid": "t3", "baseId": "a_zx", "name": "紫霄雷衣", "slot": "armor", "quality": 3, "setId": "set_zx", "atk": 0, "def": 20, "speed": 0, "crit": 0, "maxHp": 0, "affixes": [], "price": 100, "enh": 0},
        "boots": {"uid": "t4", "baseId": "b_zx", "name": "紫霄靴", "slot": "boots", "quality": 3, "setId": "set_zx", "atk": 0, "def": 6, "speed": 11, "crit": 0, "maxHp": 0, "affixes": [], "price": 100, "enh": 0},
        "charm1": None, "charm2": None,
    },
    "inventory": [],
    "skills": {"sk_tianlei": 1, "sk_sanlian": 1},
    "skillSlots": {"style": "sk_sanlian", "minds": [None, None], "art": "sk_tianlei"},
    "talents": {}, "presets": [None] * 5, "activePreset": -1,
    "syCheckpoint": 7, "syMaxDepth": 0,
}

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
    ctx = browser.new_context(viewport={'width': 412, 'height': 915})
    js = "localStorage.setItem('xiuxian_save_v1', " + json.dumps(json.dumps(save, ensure_ascii=False)) + ")"
    ctx.add_init_script(js)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8899/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2000)
    print('hasSave:', page.evaluate("!!localStorage.getItem('xiuxian_save_v1')"))
    print('btnContinue disabled:', page.evaluate("document.getElementById('btnContinue').disabled"))
    page.locator('#btnContinue').click(force=True)
    page.wait_for_timeout(3000)
    print('title display:', page.evaluate("document.getElementById('title').style.display"))
    print('controls display:', page.evaluate("document.getElementById('controls').style.display"))
    print('hudName:', page.evaluate("document.getElementById('hudName').textContent"))
    page.screenshot(path=str(OUT / 'probe.png'))
    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('PROBE DONE')
