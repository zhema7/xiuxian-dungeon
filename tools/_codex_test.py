# -*- coding: utf-8 -*-
"""机缘系统 + 万象图鉴验证（GM 入口：与商人连续告辞 5 次）"""
import http.server, functools, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'promo' / '_smoke'
OUT.mkdir(parents=True, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 8901), handler)
httpd.daemon_threads = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()


def advance_dialog(page):
    """点完对话文本直到出现选项或关闭"""
    for _ in range(12):
        if page.locator('#dialogOpts button').count() > 0:
            return True
        if not page.evaluate("document.getElementById('dialog').classList.contains('open')"):
            return False
        page.evaluate("document.getElementById('dialog').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
        page.wait_for_timeout(150)
    return page.locator('#dialogOpts button').count() > 0


def merchant_bye(page):
    page.evaluate("(() => { window.__game.scene.getScene('Town').talkTo('merchant'); return 1 })()")
    page.wait_for_selector('#dialog.open', timeout=5000)
    page.wait_for_timeout(300)
    if advance_dialog(page):
        btns = page.locator('#dialogOpts button')
        btns.nth(btns.count() - 1).click(force=True)  # 告辞
    page.wait_for_timeout(400)


def open_gm(page):
    for i in range(5):
        merchant_bye(page)
        print(f'  告辞 {i + 1}/5', flush=True)
    # 第 5 次触发彩蛋对话，点完后 GM 面板出现
    advance_dialog(page)
    page.wait_for_timeout(500)


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
    ctx = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8901/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2000)
    page.locator('#btnNew').click(force=True)
    page.wait_for_timeout(2500)

    open_gm(page)
    gm_open = page.evaluate("document.getElementById('panel').classList.contains('open')")
    print('GM 面板已开:', gm_open)
    assert gm_open, 'GM 面板未打开'

    page.locator('[data-gm-dynset]').click(force=True); page.wait_for_timeout(400)
    page.locator('[data-gm-dynset]').click(force=True); page.wait_for_timeout(400)
    page.locator('[data-gm-dynskill]').click(force=True); page.wait_for_timeout(400)
    page.locator('[data-gm-dynskill]').click(force=True); page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 'codex1_gm.png'))

    save = page.evaluate("JSON.parse(localStorage.getItem('xiuxian_save_v1'))")
    print('版本:', save['version'])
    print('动态套装:', [(s['set']['name'], s['set']['bonuses'][0]['desc']) for s in save['dynamicSets']])
    print('动态功法:', [(s['name'], s['desc']) for s in save['dynamicSkills']])
    print('图鉴:', {k: len(v) for k, v in save['codex'].items()})
    print('背包件数:', len(save['inventory']), '| 功法数:', len(save['skills']))
    lucky = [a for i in save['inventory'] for a in i['affixes'] if a.get('lucky')]
    print('机缘词缀条数(背包):', len(lucky))

    # --- 刷新读档：动态内容重新注册 ---
    page.reload()
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2000)
    page.locator('#btnContinue').click(force=True)
    page.wait_for_timeout(2500)
    open_gm(page)
    gm_html = page.evaluate("document.getElementById('panel').innerHTML")
    dyn_names = [s['set']['name'] for s in save['dynamicSets']]
    sk_names = [s['name'] for s in save['dynamicSkills']]
    print('读档后 GM 面板含动态套装:', all(n in gm_html for n in dyn_names))
    print('读档后 GM 面板含动态功法:', all(n in gm_html for n in sk_names))

    # --- 背包 → 图鉴 ---
    page.evaluate("document.getElementById('panel').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(300)
    page.evaluate("document.getElementById('btnBag').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(500)
    page.locator('[data-tab="codex"]').click(force=True)
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / 'codex2_tab.png'))
    codex_html = page.evaluate("document.getElementById('tabBody').innerHTML")
    print('图鉴含动态套装名:', all(n in codex_html for n in dyn_names))
    print('图鉴含动态功法名:', all(n in codex_html for n in sk_names))
    print('图鉴含未知占位:', '？？？' in codex_html)

    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('CODEX TEST DONE')
