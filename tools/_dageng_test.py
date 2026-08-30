# -*- coding: utf-8 -*-
"""大庚剑阵验证：数量应为 72、剑气应索敌（追踪命中扣血）"""
import http.server, functools, threading, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'promo' / '_smoke'
OUT.mkdir(parents=True, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 8907), handler)
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
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8907/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(1500)
    page.locator('#btnContinue').click(force=True)
    page.wait_for_timeout(2000)

    # 直接进青冥山脉普通难度（对话框流程）
    joy = page.locator('#joy').bounding_box()
    cx, cy = joy['x'] + joy['width'] / 2, joy['y'] + joy['height'] / 2
    def mv(dx, dy, ms):
        page.mouse.move(cx, cy); page.mouse.down()
        page.mouse.move(cx + dx * 38, cy + dy * 38, steps=5)
        page.wait_for_timeout(ms); page.mouse.up()

    # 直接跳入青冥山脉第 1 层（跳过走位与对话，专注验证剑阵）
    page.evaluate("""(() => {
      const town = window.__game.scene.getScene('Town')
      document.getElementById('btnAct').style.display = 'none'
      town.scene.start('Dungeon', { floor: 1, diff: 'normal' })
    })()""")
    page.wait_for_timeout(2500)

    # 等怪物聚来，记录敌方总血量
    page.wait_for_timeout(2000)
    hp_before = page.evaluate("""(() => {
      const sc = window.__game.scene.getScene('Dungeon')
      return sc.enemies.filter(e => e.alive).reduce((s, e) => s + e.hp, 0)
    })()""")

    # 放大庚剑阵（神通键）
    page.evaluate("document.getElementById('btnSkill').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))")
    counts = []
    for t in range(8):
        page.wait_for_timeout(150)
        n = page.evaluate("""(() => {
          const sc = window.__game.scene.getScene('Dungeon')
          return sc.pprojs.filter(p => p.homing).length
        })()""")
        counts.append(n)
    print('剑气数量采样(每150ms):', counts)
    print('峰值剑气数:', max(counts))
    page.screenshot(path=str(OUT / 'dageng_fix.png'))

    page.wait_for_timeout(2500)
    hp_after = page.evaluate("""(() => {
      const sc = window.__game.scene.getScene('Dungeon')
      return sc.enemies.filter(e => e.alive).reduce((s, e) => s + e.hp, 0)
    })()""")
    print('敌方总血量: 施法前', hp_before, '→ 施法后', hp_after)
    page.screenshot(path=str(OUT / 'dageng_fix_after.png'))
    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('DAGENG TEST DONE')
