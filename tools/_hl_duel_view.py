# -*- coding: utf-8 -*-
"""目检黄龙山山巅对战：瞬移玩家到顶部，截韩前辈/乐上师/施法光翼"""
import http.server, functools, threading, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'promo' / '_smoke'
OUT.mkdir(parents=True, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 8904), handler)
httpd.daemon_threads = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()

save = {
    'version': 3, 'classId': 'sword', 'heroName': '测试修士', 'level': 25, 'exp': 0,
    'gold': 5000, 'potions': 9, 'hp': -1, 'insight': 100, 'realm': 1,
    'materials': {'tupo': 5, 'lingcao': 9}, 'companion': False,
    'progress': {'qmCleared': True, 'ymCleared': True},
    'favor': {}, 'quests': {}, 'totalKills': 0,
    'equipment': {'weapon': None, 'head': None, 'armor': None, 'boots': None, 'charm1': None, 'charm2': None},
    'inventory': [],
    'skills': {'sk_sanlian': 3},
    'skillSlots': {'style': 'sk_sanlian', 'minds': [None, None], 'art': None},
    'talents': {}, 'presets': [None] * 5, 'activePreset': -1,
    'syMaxDepth': 0, 'syCheckpoint': 7,
}
init = 'localStorage.clear();localStorage.setItem("xiuxian_save_v1", ' + json.dumps(json.dumps(save, ensure_ascii=False)) + ');'

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
    ctx = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True)
    ctx.add_init_script(init)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8904/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(1500)
    page.locator('#btnContinue').click(force=True)
    page.wait_for_timeout(2000)

    joy = page.locator('#joy').bounding_box()
    cx, cy = joy['x'] + joy['width'] / 2, joy['y'] + joy['height'] / 2
    def mv(dx, dy, ms):
        page.mouse.move(cx, cy); page.mouse.down()
        page.mouse.move(cx + dx * 38, cy + dy * 38, steps=5)
        page.wait_for_timeout(ms); page.mouse.up()

    mv(1, -0.2, 1500)
    for _ in range(10):
        if page.evaluate("document.getElementById('btnAct').style.display") != 'none':
            break
        mv(0.3, -1, 900)
    page.evaluate("document.getElementById('btnAct').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(500)
    for _ in range(8):
        if page.locator('#dialogOpts button').count() > 0:
            break
        db = page.locator('#dialog').bounding_box()
        if not db:
            break
        page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
        page.wait_for_timeout(350)
    opts = page.locator('#dialogOpts button')
    for i in range(opts.count()):
        if '踏入法阵' in opts.nth(i).inner_text():
            opts.nth(i).click(force=True)
            break
    page.wait_for_timeout(2000)

    # 轮询相机状态 5 秒，定位摇镜序列卡在哪一步
    for t in range(6):
        print(f't={t}s:', page.evaluate("""(() => {
      const sc = window.__game.scene.getScene('Dungeon')
      const cam = sc.cameras.main
      return JSON.stringify({
        scrollX: Math.round(cam.scrollX), scrollY: Math.round(cam.scrollY),
        following: !!cam._follow,
        panRunning: cam.panEffect ? cam.panEffect.isRunning : null,
      })
    })()"""))
        page.wait_for_timeout(1000)

    # 瞬移到山巅（对战区下方一点，双方同框）
    page.evaluate("""(() => {
      const sc = window.__game.scene.getScene('Dungeon')
      sc.player.sprite.setPosition(416, 360)
    })()""")
    page.wait_for_timeout(1200)
    print('debug:', page.evaluate("""(() => {
      const sc = window.__game.scene.getScene('Dungeon')
      const cam = sc.cameras.main
      return JSON.stringify({
        px: Math.round(sc.player.sprite.x), py: Math.round(sc.player.sprite.y),
        scrollX: Math.round(cam.scrollX), scrollY: Math.round(cam.scrollY),
        han: sc.hlHan ? [Math.round(sc.hlHan.x), Math.round(sc.hlHan.y)] : null,
        le: sc.hlLe ? [Math.round(sc.hlLe.x), Math.round(sc.hlLe.y), sc.hlLe.texture.key] : null,
        following: !!cam._follow,
      })
    })()"""))
    page.screenshot(path=str(OUT / 'hl_duel_top.png'))
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / 'hl_duel_top2.png'))
    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('DUEL VIEW TEST DONE')
