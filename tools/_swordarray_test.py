# -*- coding: utf-8 -*-
"""验证万剑归宗剑阵：开启→扣血→旋转伤害→收敛"""
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
    "version": 3, "classId": "sword", "heroName": "剑阵测试", "level": 15, "exp": 0,
    "gold": 100, "potions": 5, "insight": 0, "hp": -1, "realm": 1, "materials": {},
    "companion": False, "progress": {"qmCleared": True, "ymCleared": False},
    "favor": {}, "quests": {}, "totalKills": 0,
    "equipment": {"weapon": None, "head": None, "armor": None, "boots": None, "charm1": None, "charm2": None},
    "inventory": [],
    "skills": {"sk_wanjian": 5, "sk_sanlian": 1},
    "skillSlots": {"style": "sk_wanjian", "minds": [None, None], "art": None},
    "talents": {}, "presets": [None] * 5, "activePreset": -1,
    "syCheckpoint": 7, "syMaxDepth": 0,
}

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
    ctx = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True)
    ctx.add_init_script("localStorage.setItem('xiuxian_save_v1', " + json.dumps(json.dumps(save, ensure_ascii=False)) + ")")
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8899/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2000)
    page.locator('#btnContinue').click(force=True)
    page.wait_for_timeout(2500)

    joy = page.locator('#joy').bounding_box()
    cx, cy = joy['x'] + joy['width'] / 2, joy['y'] + joy['height'] / 2
    def mv(dx, dy, ms):
        page.mouse.move(cx, cy); page.mouse.down()
        page.mouse.move(cx + dx * 38, cy + dy * 38, steps=5)
        page.wait_for_timeout(ms); page.mouse.up()
    mv(0, -1, 700); mv(-1, 0, 700); mv(0, -1, 150); mv(-1, 0, 150)
    page.wait_for_timeout(300)
    for _ in range(6):
        if page.evaluate("document.getElementById('btnAct').style.display") != 'none': break
        mv(0, 1, 200); mv(1, 0, 200); mv(0, -1, 200); mv(-1, 0, 200); page.wait_for_timeout(200)
    page.evaluate("document.getElementById('btnAct').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(500)
    for _ in range(3):
        if page.locator('#dialogOpts button').count() > 0: break
        db = page.locator('#dialog').bounding_box()
        if not db: break
        page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
        page.wait_for_timeout(400)
    page.locator('#dialogOpts button').first.click(force=True)  # 青冥
    page.wait_for_timeout(500)
    for _ in range(3):
        if page.locator('#dialogOpts button').count() > 0: break
        db = page.locator('#dialog').bounding_box()
        if not db: break
        page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
        page.wait_for_timeout(400)
    page.locator('#dialogOpts button').first.click(force=True)  # 普通
    page.wait_for_timeout(2500)
    print('HUD:', page.evaluate("document.getElementById('hudFloor').textContent"))

    hp0 = page.evaluate("JSON.parse(localStorage.getItem('xiuxian_save_v1'))?.hp")
    # 开启剑阵（按攻击键）
    page.evaluate("document.getElementById('btnAtk').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 'sa1_on.png'))
    page.wait_for_timeout(2300)  # 燃烧 2 秒
    page.screenshot(path=str(OUT / 'sa2_spin.png'))
    # 存盘后读 hp：剑阵每次扣血不写存档，读 HUD 血条文字
    hp_text = page.evaluate("document.getElementById('hpbar').querySelector('b')?.textContent ?? ''")
    print('HP 剑阵开启后 ~2.7s:', hp_text)
    # 收敛
    page.evaluate("document.getElementById('btnAtk').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 'sa3_off.png'))
    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('SWORD ARRAY TEST DONE')
