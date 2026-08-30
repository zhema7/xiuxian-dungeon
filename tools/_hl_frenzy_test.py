# -*- coding: utf-8 -*-
"""暴走阶段 + 元婴平辈验证（HL_DURATION 临时 15s，全程处于暴走期）：
realm=3 → 入口对话与场中名签应为「韩道友」；暴走金雷/火漩涡特效；胜利对话平辈版"""
import http.server, functools, threading, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'promo' / '_smoke'
OUT.mkdir(parents=True, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 8906), handler)
httpd.daemon_threads = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()

save = {
    'version': 3, 'classId': 'sword', 'heroName': '测试道君', 'level': 33, 'exp': 0,
    'gold': 9999, 'potions': 9, 'hp': -1, 'insight': 200, 'realm': 3,
    'materials': {'tupo': 5, 'lingcao': 9}, 'companion': False,
    'progress': {'qmCleared': True, 'ymCleared': True},
    'favor': {}, 'quests': {}, 'totalKills': 0,
    'equipment': {'weapon': None, 'head': None, 'armor': None, 'boots': None, 'charm1': None, 'charm2': None},
    'inventory': [], 'skills': {'sk_sanlian': 5},
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
    page.goto('http://127.0.0.1:8906/')
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
    seen_lines = []
    for _ in range(8):
        t = page.evaluate("document.getElementById('dialogText')?.innerText ?? ''")
        if t and (not seen_lines or seen_lines[-1] != t):
            seen_lines.append(t)
        if page.locator('#dialogOpts button').count() > 0:
            break
        db = page.locator('#dialog').bounding_box()
        if not db:
            break
        page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
        page.wait_for_timeout(350)
    print('入口对话:', ' | '.join(seen_lines))
    opts = page.locator('#dialogOpts button')
    for i in range(opts.count()):
        if '踏入法阵' in opts.nth(i).inner_text():
            opts.nth(i).click(force=True)
            break
    page.wait_for_timeout(2000)

    # 场中名签 + 暴走状态
    info = page.evaluate("""(() => {
      const sc = window.__game.scene.getScene('Dungeon')
      return JSON.stringify({ name: sc.hlHanName, frenzy: sc.hlFrenzy })
    })()""")
    print('场中状态:', info)

    # 暴走特效期间截帧（把玩家传送到场中看特效）
    page.evaluate("""(() => {
      const sc = window.__game.scene.getScene('Dungeon')
      sc.player.sprite.setPosition(416, 420)
    })()""")
    for i in range(4):
        page.wait_for_timeout(1100)
        page.screenshot(path=str(OUT / f'hl_frenzy_{i}.png'))

    # 等胜利（15s 坚守很快到），推进剧情对话
    for _ in range(8):
        page.wait_for_timeout(1500)
        if page.evaluate("document.getElementById('dialog').classList.contains('open')"):
            break
    story = []
    for _ in range(10):
        if not page.evaluate("document.getElementById('dialog').classList.contains('open')"):
            break
        t = page.evaluate("document.getElementById('dialogName')?.innerText + '::' + document.getElementById('dialogText')?.innerText")
        story.append(t)
        db = page.locator('#dialog').bounding_box()
        if not db:
            break
        page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
        page.wait_for_timeout(450)
    print('胜利对话:')
    for s in story:
        print('  ', s)
    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('FRENZY TEST DONE')
