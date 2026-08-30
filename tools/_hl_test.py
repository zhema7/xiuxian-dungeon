# -*- coding: utf-8 -*-
"""黄龙山坚守战实机验证：法阵入口 → 弹幕/兽潮 → 巨剑术/大庚剑阵 → 无报错"""
import http.server, functools, threading, json
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

def fr_item(uid, base_id, name, slot, atk=0, dfn=0, spd=0, crit=0.0, hp=0):
    return {
        'uid': uid, 'baseId': base_id, 'name': name, 'slot': slot, 'quality': 3,
        'setId': 'set_fr', 'atk': atk, 'def': dfn, 'speed': spd, 'crit': crit,
        'maxHp': hp, 'affixes': [], 'price': 999, 'enh': 0,
    }

save = {
    'version': 3, 'classId': 'sword', 'heroName': '测试修士', 'level': 25, 'exp': 0,
    'gold': 5000, 'potions': 9, 'hp': -1, 'insight': 100, 'realm': 2,
    'materials': {'tupo': 5, 'lingcao': 9}, 'companion': False,
    'progress': {'qmCleared': True, 'ymCleared': True},
    'favor': {}, 'quests': {}, 'totalKills': 0,
    'equipment': {
        'weapon': fr_item('t1', 'w_fr', '青竹云剑', 'weapon', atk=60, crit=0.09),
        'head': fr_item('t2', 'h_fr', '韩立元婴', 'head', dfn=20, hp=100, crit=0.06),
        'armor': fr_item('t3', 'a_fr', '血色披风', 'armor', dfn=30, hp=90, spd=10),
        'boots': fr_item('t4', 'b_fr', '风雷翅', 'boots', spd=40, dfn=10),
        'charm1': None, 'charm2': None,
    },
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
    page.goto('http://127.0.0.1:8901/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2000)
    page.locator('#btnContinue').click(force=True)
    page.wait_for_timeout(2500)
    page.screenshot(path=str(OUT / 'hl_after_continue.png'))
    print('title 可见:', page.evaluate("getComputedStyle(document.getElementById('title')).display"))
    print('controls:', page.evaluate("document.getElementById('controls').style.display"))
    print('floorText:', page.evaluate("document.getElementById('floorText')?.innerText"))

    joy = page.locator('#joy').bounding_box()
    cx, cy = joy['x'] + joy['width'] / 2, joy['y'] + joy['height'] / 2
    def mv(dx, dy, ms):
        page.mouse.move(cx, cy); page.mouse.down()
        page.mouse.move(cx + dx * 38, cy + dy * 38, steps=5)
        page.wait_for_timeout(ms); page.mouse.up()

    def advance_dialog_to_opts():
        for _ in range(8):
            if page.locator('#dialogOpts button').count() > 0:
                return True
            db = page.locator('#dialog').bounding_box()
            if not db:
                return False
            page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
            page.wait_for_timeout(350)
        return False

    # 从出生点 (160,445) 走向右上法阵 (316,100)：先向右再向上
    print('走向黄龙山法阵…')
    mv(1, -0.2, 1500)
    for _ in range(10):
        if page.evaluate("document.getElementById('btnAct').style.display") != 'none':
            break
        mv(0.3, -1, 900)
    page.screenshot(path=str(OUT / 'hl_portal.png'))
    print('btnAct:', page.evaluate("document.getElementById('btnAct').style.display"))

    # 触发法阵对话并进入
    page.evaluate("document.getElementById('btnAct').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(500)
    advance_dialog_to_opts()
    opts = page.locator('#dialogOpts button')
    entered = False
    for i in range(opts.count()):
        if '踏入法阵' in opts.nth(i).inner_text():
            opts.nth(i).click(force=True)
            entered = True
            break
    print('进入黄龙山:', entered)
    page.wait_for_timeout(2500)

    floor_txt = page.evaluate("document.getElementById('floorText') ? document.getElementById('floorText').innerText : ''")
    print('层数标题:', floor_txt)
    page.screenshot(path=str(OUT / 'hl_start.png'))

    # 巨剑术普攻 + 大庚剑阵神通
    for _ in range(3):
        page.evaluate("document.getElementById('btnAtk').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
        page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / 'hl_giant.png'))
    page.evaluate("document.getElementById('btnSkill').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / 'hl_dageng.png'))

    # 坚守观察 30 秒（兽潮 2 波 + 弹幕），期间小幅走位并持续攻击
    for t in range(6):
        mv(0.6 if t % 2 == 0 else -0.6, 0.4, 1400)
        page.evaluate("document.getElementById('btnAtk').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
        page.wait_for_timeout(3600)
        if t == 2:
            page.screenshot(path=str(OUT / 'hl_wave.png'))
    page.screenshot(path=str(OUT / 'hl_mid.png'))
    floor_txt2 = page.evaluate("document.getElementById('floorText') ? document.getElementById('floorText').innerText : ''")
    print('30 秒层数标题:', floor_txt2)
    hp_txt = page.evaluate("document.getElementById('hud').innerText.replace(/\\s+/g,' ').slice(0,120)")
    print('HUD:', hp_txt)
    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('HL TEST DONE')
