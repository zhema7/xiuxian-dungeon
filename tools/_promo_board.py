# -*- coding: utf-8 -*-
"""TapTap v1.0 物料生成：渲染 _build/board.html 中的各尺寸卡片并导出 PNG

输出：promo/taptap-v1.0/
"""
import http.server, functools, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUTROOT = ROOT / 'promo' / 'taptap-v1.0'
PORT = 8900
URL = f'http://127.0.0.1:{PORT}/promo/_build/board.html'

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
httpd.daemon_threads = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()

TARGETS = [
    ('logo',      '05-logo/logo-1280x720.png',              True),
    ('icon512',   '01-icon/icon-512x512.png',               False),
    ('promo169',  '03-promo/promo-1920x1080.png',           False),
    ('promo11',   '03-promo/promo-1440x1440.png',           False),
    ('coverL',    '04-cover/cover-landscape-460x215.png',   False),
    ('coverP',    '04-cover/cover-portrait-600x900.png',    False),
    ('wall',      '06-wallpaper/wallpaper-3840x1240.png',    False),
]


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1400, 'height': 1000}, device_scale_factor=1)
        page.goto(URL, wait_until='networkidle')
        page.wait_for_timeout(3500)

        # 字体自检
        fonts = page.evaluate("""() => {
          const probe = (f) => { const d=document.createElement('div');
            d.style.cssText='position:absolute;visibility:hidden;font-size:80px;font-family:'+f;
            d.textContent='修仙与地下城'; document.body.appendChild(d);
            const w=d.getBoundingClientRect().width; d.remove(); return Math.round(w) }
          return { xingkai: probe("'STXingkai'"), kaiti: probe("'STKaiti'"),
                   yahei: probe("'Microsoft YaHei'"), serif: probe('serif') }
        }""")
        print('字体宽度自检:', fonts, flush=True)

        # 等字体与标题自适应完成，并打印实测字宽
        page.wait_for_function('() => !!window.__fitReport', timeout=20000)
        page.wait_for_timeout(800)
        for r in page.evaluate('() => window.__fitReport'):
            flag = 'OK ' if r['margin'] >= r['safe'] else '!! '
            print(f"  {flag}{r['card']:9s} 字号{r['font']:>4}px  文字宽{r['textW']:>5} / 卡片{r['cardW']:>5}  两侧净空{r['margin']:>4}px (要求≥{r['safe']})", flush=True)

        # 页脚背景会污染透明导出：截图前把页面背景清空
        page.evaluate("""() => {
          document.documentElement.style.background = 'transparent';
          document.body.style.background = 'transparent';
        }""")
        page.wait_for_timeout(200)

        for card_id, rel, transparent in TARGETS:
            el = page.locator(f'#{card_id}')
            el.scroll_into_view_if_needed()
            page.wait_for_timeout(300)
            out = OUTROOT / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            if transparent:
                box = el.bounding_box()
                page.screenshot(path=str(out), omit_background=True,
                                clip={'x': box['x'], 'y': box['y'], 'width': box['width'], 'height': box['height']})
            else:
                el.screenshot(path=str(out))
            from PIL import Image
            print(f'  ✔ {rel}  {Image.open(out).size} {Image.open(out).mode}', flush=True)

        browser.close()


if __name__ == '__main__':
    main()
