# -*- coding: utf-8 -*-
"""掉落链路验证：无尽妖域 Boss → 机缘套装/无名古卷/图鉴记录"""
import http.server, functools, threading
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

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--mute-audio'])
    ctx = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True)
    ctx.add_init_script('localStorage.clear()')
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8903/')
    page.wait_for_selector('#game canvas', timeout=15000)
    page.wait_for_timeout(2000)
    page.locator('#btnNew').click(force=True)
    page.wait_for_timeout(2500)

    # 直接进无尽妖域第 9 层（Boss 层）
    page.evaluate("(() => { window.__game.scene.getScene('Town').scene.start('Dungeon', { floor: 9, diff: 'hell' }); return 1 })()")
    page.wait_for_timeout(3000)
    print('scene:', page.evaluate("window.__game.scene.getScenes(true).map(s=>s.scene.key)"))

    # 1) 直接验证无名古卷拾取链路
    page.evaluate("""(() => {
      const s = window.__game.scene.getScene('Dungeon')
      s.collectDrop({ spr: { x: 0, y: 0 }, kind: 'book', gold: 0, skillId: '__dyn__', bornAt: 0 })
      return 1
    })()""")
    page.wait_for_timeout(400)
    save = page.evaluate("JSON.parse(localStorage.getItem('xiuxian_save_v1'))")
    print('古卷生成功法:', [(d['name'], d['desc']) for d in save['dynamicSkills']])
    print('图鉴功法:', save['codex']['skills'])

    # 2) 连杀 3 个 Boss 层（9/12/15），走真实掉落链路
    for floor in (9, 12, 15):
        if floor != 9:
            page.evaluate(f"(() => {{ window.__game.scene.getScene('Dungeon').scene.start('Dungeon', {{ floor: {floor}, diff: 'hell' }}); return 1 }})()")
            page.wait_for_timeout(3000)
        page.evaluate("""(() => {
          const s = window.__game.scene.getScene('Dungeon')
          for (const e of s.enemies) if (e.alive) { const k = e.takeDamage(999999, e.x, e.y - 1); if (k) s.onEnemyKilled(e) }
          return 1
        })()""")
        page.wait_for_timeout(1200)
        # 拾取全部掉落物
        page.evaluate("""(() => {
          const s = window.__game.scene.getScene('Dungeon')
          const drops = s.drops.slice()
          for (const d of drops) {
            s.collectDrop(d)
            if (d.spr.destroy) { const b = d.spr.getData && d.spr.getData('beam'); if (b) b.destroy(); d.spr.destroy() }
          }
          s.drops.length = 0
          return drops.length
        })()""")
        page.wait_for_timeout(400)
        save = page.evaluate("JSON.parse(localStorage.getItem('xiuxian_save_v1'))")
        print(f'floor {floor}: 套装部件=', [i['name'] for i in save['inventory'] if i.get('setId')],
              '| 动态套装=', [d['set']['name'] for d in save['dynamicSets']],
              '| 图鉴=', {k: len(v) for k, v in save['codex'].items()})
        # 离开 Boss 层（可能弹出清层传送门/结算）
        page.screenshot(path=str(OUT / f'dyn_f{floor}.png'))

    print('errors:', errs if errs else '无')
    ctx.close(); browser.close()
httpd.shutdown()
print('DYN DROP TEST DONE')
