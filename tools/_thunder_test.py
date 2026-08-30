# -*- coding: utf-8 -*-
"""验证：紫霄雷套 4 件（闪电链攻击）+ 九天神雷神通 的特效渲染"""
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


def item(uid, base, name, slot, atk=0, def_=0, speed=0, crit=0, hp=0, set_id=None):
    return {"uid": uid, "baseId": base, "name": name, "slot": slot, "quality": 3,
            "setId": set_id, "atk": atk, "def": def_, "speed": speed, "crit": crit,
            "maxHp": hp, "affixes": [], "price": 100, "enh": 0}


save = {
    "version": 3, "classId": "sword", "heroName": "试雷真人", "level": 25, "exp": 0,
    "gold": 999, "potions": 5, "insight": 0, "hp": -1, "realm": 2, "materials": {},
    "companion": False, "progress": {"qmCleared": True, "ymCleared": True},
    "favor": {}, "quests": {}, "totalKills": 0,
    "equipment": {
        "weapon": item("t1", "w_zx", "紫霄雷剑", "weapon", atk=40, crit=0.04, set_id="set_zx"),
        "head": item("t2", "h_zx", "紫霄冠", "head", def_=12, hp=50, set_id="set_zx"),
        "armor": item("t3", "a_zx", "紫霄雷衣", "armor", def_=20, set_id="set_zx"),
        "boots": item("t4", "b_zx", "紫霄靴", "boots", speed=11, def_=6, set_id="set_zx"),
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
    ctx = browser.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2.0, is_mobile=True, has_touch=True)
    js = "localStorage.setItem('xiuxian_save_v1', " + json.dumps(json.dumps(save, ensure_ascii=False)) + ")"
    ctx.add_init_script(js)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8899/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2000)
    page.locator('#btnContinue').click(force=True)
    page.wait_for_timeout(2500)
    print('title:', page.evaluate("document.getElementById('title').style.display"),
          'controls:', page.evaluate("document.getElementById('controls').style.display"),
          'hud:', page.evaluate("document.getElementById('hudName').textContent"))

    joy = page.locator('#joy').bounding_box()
    cx, cy = joy['x'] + joy['width'] / 2, joy['y'] + joy['height'] / 2
    def mv(dx, dy, ms):
        page.mouse.move(cx, cy); page.mouse.down()
        page.mouse.move(cx + dx * 38, cy + dy * 38, steps=5)
        page.wait_for_timeout(ms); page.mouse.up()
    mv(0, -1, 700); mv(-1, 0, 700); mv(0, -1, 150); mv(-1, 0, 150)
    page.wait_for_timeout(300)
    # 若未靠近传送门，围绕小幅走位直到"交谈/进入"按钮出现
    for _ in range(6):
        if page.evaluate("document.getElementById('btnAct').style.display") != 'none':
            break
        mv(0, 1, 200); mv(1, 0, 200); mv(0, -1, 200); mv(-1, 0, 200)
        page.wait_for_timeout(200)
    print('btnAct display:', page.evaluate("document.getElementById('btnAct').style.display"))
    page.evaluate("document.getElementById('btnAct').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(500)
    # 推进并选 幽冥沼泽（已解锁）
    for _ in range(3):
        if page.locator('#dialogOpts button').count() > 0: break
        db = page.locator('#dialog').bounding_box()
        if not db: break
        page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
        page.wait_for_timeout(400)
    page.locator('#dialogOpts button').nth(1).click(force=True)
    page.wait_for_timeout(500)
    for _ in range(3):
        if page.locator('#dialogOpts button').count() > 0: break
        db = page.locator('#dialog').bounding_box()
        if not db: break
        page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
        page.wait_for_timeout(400)
    page.locator('#dialogOpts button').nth(1).click(force=True)  # 困难
    page.wait_for_timeout(2500)
    print('HUD:', page.evaluate("document.getElementById('hudFloor').textContent"))

    # 等怪靠近后连打（触发闪电链）
    page.wait_for_timeout(3000)
    for r in range(10):
        for _ in range(2):
            page.evaluate("document.getElementById('btnAtk').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
            page.wait_for_timeout(300)
        if r == 3:
            page.screenshot(path=str(OUT / 't1_chain.png'))
        mv(0, 0, 10)
    # 神通：九天神雷
    page.evaluate("document.getElementById('btnSkill').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(120)
    page.screenshot(path=str(OUT / 't2_thunder_art.png'))
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT / 't3_after.png'))
    print('page errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('THUNDER TEST DONE')
