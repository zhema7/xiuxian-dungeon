# -*- coding: utf-8 -*-
"""诊断：为什么 #btnNew 点击无效。"""
import http.server, functools, threading, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
PORT = 8899
URL = f'http://127.0.0.1:{PORT}/'

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
httpd.daemon_threads = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()


def state(page, tag):
    info = page.evaluate("""() => {
      const q = (s) => document.querySelector(s)
      const cv = q('#game canvas')
      const tc = q('#titleCover')
      const btns = q('#titleBtns')
      return {
        canvas: cv ? `${cv.width}x${cv.height}` : null,
        titleDisplay: tc ? getComputedStyle(tc).display : null,
        btnsDisplay: btns ? getComputedStyle(btns).display : null,
        btnNewText: q('#btnNew') ? q('#btnNew').textContent : null,
        dialogOpen: q('#dialog') ? q('#dialog').classList.contains('open') : null,
        dialogName: q('#dialogName') ? q('#dialogName').textContent : null,
        hud: q('#hud') ? getComputedStyle(q('#hud')).display : null,
        ver: q('#titleVer') ? q('#titleVer').textContent : null,
      }
    }""")
    print(f'[{tag}]', info)
    return info


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
        ctx = browser.new_context(viewport={'width': 360, 'height': 640},
                                  device_scale_factor=2, is_mobile=True, has_touch=True)
        ctx.add_init_script('localStorage.clear()')
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)

        page.goto(URL)
        page.wait_for_selector('#game canvas', timeout=20000)
        page.wait_for_timeout(3000)
        state(page, 't+3s')

        page.wait_for_timeout(5000)
        state(page, 't+8s')

        # 点击
        page.locator('#btnNew').click(force=True)
        page.wait_for_timeout(1500)
        state(page, 'after-click')
        page.screenshot(path=str(ROOT / 'promo' / '_v10' / 'diag_click.png'))

        # 尝试 dispatch 真实 pointer 事件
        page.evaluate("""() => {
          const b = document.getElementById('btnNew')
          b.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))
          b.dispatchEvent(new PointerEvent('pointerup', {bubbles:true}))
          b.dispatchEvent(new MouseEvent('click', {bubbles:true}))
        }""")
        page.wait_for_timeout(1500)
        state(page, 'after-dispatch')

        print('errors:', errs[:6])
        ctx.close(); browser.close()


if __name__ == '__main__':
    sys.exit(main())
