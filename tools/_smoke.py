# -*- coding: utf-8 -*-
"""冒烟测试：难度选择流程 + 副本内 HUD 难度标识 + 战斗无报错"""
import http.server, functools, threading
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

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
    ctx = browser.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2.0, is_mobile=True, has_touch=True)
    ctx.add_init_script('localStorage.clear()')
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8899/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2200)
    page.locator('#btnNew').click(force=True)
    page.wait_for_timeout(2500)

    joy = page.locator('#joy').bounding_box()
    cx, cy = joy['x'] + joy['width'] / 2, joy['y'] + joy['height'] / 2
    def mv(dx, dy, ms):
        page.mouse.move(cx, cy); page.mouse.down()
        page.mouse.move(cx + dx * 38, cy + dy * 38, steps=5)
        page.wait_for_timeout(ms); page.mouse.up()
    # 先上后左直达传送门 (76,364)
    mv(0, -1, 700); mv(-1, 0, 700); mv(0, -1, 150); mv(-1, 0, 150)
    page.wait_for_timeout(300)
    page.evaluate("document.getElementById('btnAct').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / 's1_region.png'))
    # 推进对话文本，让选项出现
    for _ in range(3):
        if page.locator('#dialogOpts button').count() > 0:
            break
        db = page.locator('#dialog').bounding_box()
        page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
        page.wait_for_timeout(400)
    opt = page.locator('#dialogOpts button')
    print('region options:', [opt.nth(i).inner_text() for i in range(opt.count())])
    opt.first.click(force=True)  # 青冥山脉
    page.wait_for_timeout(600)
    for _ in range(3):
        if page.locator('#dialogOpts button').count() > 0:
            break
        db = page.locator('#dialog').bounding_box()
        page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
        page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 's2_diff.png'))
    opt2 = page.locator('#dialogOpts button')
    print('diff options:', [opt2.nth(i).inner_text() for i in range(opt2.count())])
    # 选炼狱
    for i in range(opt2.count()):
        if '炼狱' in opt2.nth(i).inner_text():
            opt2.nth(i).click(force=True); break
    page.wait_for_timeout(2500)
    floor_text = page.evaluate("document.getElementById('hudFloor').textContent")
    print('HUD floor:', floor_text)
    page.screenshot(path=str(OUT / 's3_dungeon_hell.png'))

    # 战斗 20 秒：普攻 + 走位，观察有无报错
    import random
    random.seed(3)
    for _ in range(14):
        for _ in range(3):
            page.evaluate("document.getElementById('btnAtk').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
            page.wait_for_timeout(240)
        d = random.choice([(-1, 0), (1, 0), (0, -1), (0, 1)])
        mv(d[0], d[1], 500)
    hp = page.evaluate("document.getElementById('hpbar').querySelector('b')?.textContent ?? ''")
    print('HP after fight:', hp)
    page.screenshot(path=str(OUT / 's4_fight.png'))
    print('page errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('SMOKE DONE')
