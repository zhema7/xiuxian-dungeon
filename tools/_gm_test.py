# -*- coding: utf-8 -*-
"""GM 面板验证：开面板→穿紫霄雷套→学全功法→升5级→检查状态"""
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
    print('GM display:', page.evaluate("document.getElementById('btnGm').style.display"))
    page.locator('#btnGm').click(force=True)
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / 'gm1_panel.png'))

    lv0 = page.evaluate("document.getElementById('hudLv').textContent")
    # 穿紫霄雷套
    page.locator('[data-gm-wear="set_zx"]').click(force=True)
    page.wait_for_timeout(500)
    # 全功法
    page.locator('[data-gm-allskills]').click(force=True)
    page.wait_for_timeout(500)
    # 等级+5
    page.locator('[data-gm-level]').click(force=True)
    page.wait_for_timeout(500)
    # 灵石
    page.locator('[data-gm-res="gold"]').click(force=True)
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 'gm2_after.png'))

    lv1 = page.evaluate("document.getElementById('hudLv').textContent")
    gold = page.evaluate("document.getElementById('hudGold').textContent")
    save = page.evaluate("JSON.parse(localStorage.getItem('xiuxian_save_v1'))")
    eq = {k: (v['name'] if v else None) for k, v in save['equipment'].items()}
    print('等级:', lv0, '->', lv1, '|', gold)
    print('装备:', eq)
    print('功法数:', len(save['skills']))
    # 关闭面板再开背包确认套装效果展示
    page.evaluate("document.getElementById('panel').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(300)
    page.evaluate("document.getElementById('btnBag').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / 'gm3_bag.png'))
    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('GM TEST DONE')
