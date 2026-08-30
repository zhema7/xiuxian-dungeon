# -*- coding: utf-8 -*-
"""黄龙山胜利流程验证（HL_DURATION 已临时调为 15s）：剧情对话 → 结算 → 凡人套入包 → 返回洞府"""
import http.server, functools, threading, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'promo' / '_smoke'
OUT.mkdir(parents=True, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 8903), handler)
httpd.daemon_threads = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()

def fr_item(uid, base_id, name, slot, atk=0, dfn=0, spd=0, crit=0.0, hp=0):
    return {'uid': uid, 'baseId': base_id, 'name': name, 'slot': slot, 'quality': 3,
            'setId': 'set_fr', 'atk': atk, 'def': dfn, 'speed': spd, 'crit': crit,
            'maxHp': hp, 'affixes': [], 'price': 999, 'enh': 0}

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
    page.on('pageerror', lambda e: errs.append(str(getattr(e, 'stack', None) or e)))
    page.goto('http://127.0.0.1:8903/')
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

    # 走向右上法阵并进入
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

    # 开场摇镜期间截一张山巅对决
    page.screenshot(path=str(OUT / 'hl_intro_pan.png'))
    # 等待胜利（15s 坚守 + 摇镜），期间攻击输出
    for _ in range(9):
        page.evaluate("document.getElementById('btnAtk').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
        page.wait_for_timeout(2000)
        if page.evaluate("document.getElementById('dialog').classList.contains('open')"):
            break

    # 推进韩先辈剧情对话（多行文本，逐次点击）
    for _ in range(10):
        if not page.evaluate("document.getElementById('dialog').classList.contains('open')"):
            break
        page.screenshot(path=str(OUT / 'hl_story.png'))
        db = page.locator('#dialog').bounding_box()
        if not db:
            break
        page.mouse.click(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2)
        page.wait_for_timeout(450)
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / 'hl_result.png'))

    # 结算面板：返回洞府
    res = page.evaluate("document.getElementById('result') ? document.getElementById('result').innerText.replace(/\\s+/g,' ').slice(0,150) : ''")
    print('结算面板:', res)
    clicked = page.evaluate("""(() => {
      const b = document.querySelector('#panel [data-ok]');
      if (b && document.getElementById('panel').classList.contains('open')) { b.click(); return true } return false
    })()""")
    print('点击返回洞府:', clicked)
    page.wait_for_timeout(2000)

    hud = page.evaluate("document.getElementById('hud').innerText.replace(/\\s+/g,' ').slice(0,60)")
    print('回到洞府 HUD:', hud)
    final_save = json.loads(page.evaluate("localStorage.getItem('xiuxian_save_v1')"))
    fr_names = [it['name'] for it in final_save['inventory'] if it.get('setId') == 'set_fr']
    print('背包中的凡人套:', fr_names)
    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('HL VICTORY TEST DONE')
