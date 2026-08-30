# -*- coding: utf-8 -*-
"""验证 GM 彩蛋：连续与商人告辞 5 次开启管理台"""
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
    ctx = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True)
    ctx.add_init_script('localStorage.clear()')
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8899/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2000)
    page.locator('#btnNew').click(force=True)
    page.wait_for_timeout(2500)
    # 确认 GM 按钮已不存在
    print('btnGm 存在:', page.evaluate("!!document.getElementById('btnGm')"))

    joy = page.locator('#joy').bounding_box()
    cx, cy = joy['x'] + joy['width'] / 2, joy['y'] + joy['height'] / 2
    def mv(dx, dy, ms):
        page.mouse.move(cx, cy); page.mouse.down()
        page.mouse.move(cx + dx * 38, cy + dy * 38, steps=5)
        page.wait_for_timeout(ms); page.mouse.up()

    def talk_bye():
        page.evaluate("document.getElementById('btnAct').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
        page.wait_for_timeout(500)
        for _ in range(4):  # 推进到选项
            if page.locator('#dialogOpts button').count() > 0: break
            db = page.locator('#dialog').bounding_box()
            if not db: break
            page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
            page.wait_for_timeout(400)
        opts = page.locator('#dialogOpts button')
        for i in range(opts.count()):
            if '告辞' in opts.nth(i).inner_text():
                opts.nth(i).click(force=True)
                return True
        return False

    # 走向商人 (232,402)：出生 (160,445) 右下
    mv(1, 0, 620); mv(0, -1, 350); mv(1, 0, 250)
    page.wait_for_timeout(300)
    for _ in range(6):
        if page.evaluate("document.getElementById('btnAct').style.display") != 'none': break
        mv(0, 1, 200); mv(-1, 0, 200); mv(0, -1, 200); mv(1, 0, 200); page.wait_for_timeout(200)
    print('btnAct:', page.evaluate("document.getElementById('btnAct').style.display"))

    for n in range(5):
        ok = talk_bye()
        print(f'第 {n+1} 次告辞:', ok)
        page.wait_for_timeout(400)
        # 彩蛋对话出现时推进它
        for _ in range(3):
            if page.evaluate("document.getElementById('dialog').classList.contains('open')"):
                if page.locator('#dialogOpts button').count() > 0: break
                db = page.locator('#dialog').bounding_box()
                if not db: break
                page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
                page.wait_for_timeout(400)
        if page.evaluate("document.getElementById('panel').classList.contains('open')"):
            break
    page.wait_for_timeout(500)
    opened = page.evaluate("document.getElementById('panel').classList.contains('open') && document.getElementById('panel').innerText.includes('GM 管理台')")
    print('GM 面板已开启:', opened)
    page.screenshot(path=str(OUT / 'gm_egg.png'))
    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('EGG TEST DONE')
