# -*- coding: utf-8 -*-
"""模拟 TapTap webview 环境（多种 Android 视口/dpr），截图检查关卡地图渲染是否完整"""
import http.server, functools, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'promo' / '_taptap'
OUT.mkdir(parents=True, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 8899), handler)
httpd.daemon_threads = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()

DEVICES = [
    ('pixel7', 412, 915, 2.625),      # 常规全面屏
    ('taptap_bar', 412, 760, 2.625),  # 模拟 TapTap 容器带顶栏后的可视高度
    ('small', 360, 640, 2.0),         # 标准竖屏
]


def run(pw, name, w, h, dpr):
    browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
    ctx = browser.new_context(viewport={'width': w, 'height': h},
                              device_scale_factor=dpr, is_mobile=True, has_touch=True)
    ctx.add_init_script('localStorage.clear()')
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto('http://127.0.0.1:8899/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2200)
    page.screenshot(path=str(OUT / f'{name}_title.png'))
    page.locator('#btnNew').click(force=True)
    page.wait_for_timeout(2500)
    page.screenshot(path=str(OUT / f'{name}_town.png'))

    # 上报 canvas 实际尺寸与样式尺寸
    info = page.evaluate("""(() => {
      const c = document.querySelector('#game canvas')
      const r = c.getBoundingClientRect()
      return {canvasW: c.width, canvasH: c.height,
              cssW: Math.round(r.width), cssH: Math.round(r.height),
              cssX: Math.round(r.x), cssY: Math.round(r.y),
              innerW: window.innerWidth, innerH: window.innerHeight, dpr: window.devicePixelRatio}
    })()""")
    print(name, info, 'consoleErr:', errors[:3])

    # 进副本：走到传送门
    joy = page.locator('#joy').bounding_box()
    cx, cy = joy['x'] + joy['width'] / 2, joy['y'] + joy['height'] / 2
    def mv(dx, dy, ms):
        page.mouse.move(cx, cy); page.mouse.down()
        page.mouse.move(cx + dx * 38, cy + dy * 38, steps=5)
        page.wait_for_timeout(ms); page.mouse.up()
    mv(-1, 0, 800); mv(0, -1, 700); mv(-1, 0, 300); mv(0, -1, 300)
    page.wait_for_timeout(300)
    # btnAct 可能 display:none，直接派发 pointerdown
    page.evaluate("document.getElementById('btnAct').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}))")
    page.wait_for_timeout(700)
    opt = page.locator('#dialogOpts button')
    if opt.count() > 0:
        opt.first.click(force=True)
    page.wait_for_timeout(2500)
    page.screenshot(path=str(OUT / f'{name}_dungeon.png'))
    # 副本内 canvas 与相机状态
    info2 = page.evaluate("""(() => {
      const c = document.querySelector('#game canvas')
      const r = c.getBoundingClientRect()
      return {cssW: Math.round(r.width), cssH: Math.round(r.height), cssX: Math.round(r.x), cssY: Math.round(r.y)}
    })()""")
    print(name, 'dungeon', info2)
    ctx.close(); browser.close()


with sync_playwright() as pw:
    for name, w, h, dpr in DEVICES:
        run(pw, name, w, h, dpr)
httpd.shutdown()
print('DONE')
