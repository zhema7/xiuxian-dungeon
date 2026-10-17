# -*- coding: utf-8 -*-
"""TapTap v1.0 物料：实机截图采集（竖版 720x1280 = viewport 360x640 @dpr2）

策略：先建角得到真实存档 → 缓存为 base_save.json → 各场景注入存档直达（state.lastScene）
输出：promo/_v10/*.png
"""
import http.server, functools, threading, sys, time, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'promo' / '_v10'
OUT.mkdir(parents=True, exist_ok=True)
BASE_SAVE = OUT / 'base_save.json'
PORT = 8899
URL = f'http://127.0.0.1:{PORT}/'

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
httpd.daemon_threads = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()


def log(*a):
    print(' '.join(str(x) for x in a), flush=True)


def wait(page, ms):
    page.wait_for_timeout(ms)


def shot(page, name):
    page.screenshot(path=str(OUT / f'{name}.png'))
    log('  📸', name)


# ---------- 基础操作 ----------

def tap(page, sel):
    """优先真实点击，失败则用 JS 派发 pointer 事件（按钮多绑 pointerdown）"""
    try:
        page.locator(sel).first.click(force=True, timeout=1500)
        return True
    except Exception:
        pass
    try:
        return page.evaluate("""(sel) => {
          const e = document.querySelector(sel)
          if (!e) return false
          e.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))
          e.dispatchEvent(new PointerEvent('pointerup', {bubbles:true}))
          e.dispatchEvent(new MouseEvent('click', {bubbles:true}))
          return true
        }""", sel)
    except Exception:
        return False


def dismiss(page, tries=3):
    """关掉可能的对话框/面板（掉落、升级提示等）"""
    for _ in range(tries):
        if panel_open(page):
            close_panel(page)
            continue
        if dialog_open(page):
            ensure_opts(page, tries=2)
            if page.locator('#dialogOpts button').count() > 0:
                click_opt(page, last=True)
            else:
                tap_dialog(page)
            wait(page, 400)
        else:
            return


def dialog_open(page):
    return page.evaluate("document.getElementById('dialog').classList.contains('open')")


def panel_open(page):
    return page.evaluate("document.getElementById('panel').classList.contains('open')")


def el_state(page):
    return page.evaluate("""() => {
      const q = (s) => document.querySelector(s)
      const st = (s) => q(s) ? getComputedStyle(q(s)) : null
      return {
        dialog: q('#dialog') ? q('#dialog').classList.contains('open') : false,
        dlgName: q('#dialogName') ? q('#dialogName').textContent : '',
        opts: Array.from(document.querySelectorAll('#dialogOpts button')).map(b => b.textContent),
        panel: q('#panel') ? q('#panel').classList.contains('open') : false,
        lv: q('#hudLv') ? q('#hudLv').textContent : '',
        floor: q('#hudFloor') ? q('#hudFloor').textContent : '',
        actShow: st('#btnAct') ? st('#btnAct').display : null,
      }
    }""")


def tap_dialog(page):
    box = page.locator('#dialog').bounding_box()
    if box:
        page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.3)
    wait(page, 450)


def ensure_opts(page, tries=4):
    for _ in range(tries):
        if page.locator('#dialogOpts button').count() > 0:
            return True
        if not dialog_open(page):
            return False
        tap_dialog(page)
    return page.locator('#dialogOpts button').count() > 0


def click_opt(page, keyword=None, index=0, last=False):
    opts = page.locator('#dialogOpts button')
    n = opts.count()
    if n == 0:
        return False
    if last:
        opts.last.click(force=True)
        return True
    if keyword:
        for i in range(n):
            if keyword in opts.nth(i).inner_text():
                opts.nth(i).click(force=True)
                return True
    if index < n:
        opts.nth(index).click(force=True)
        return True
    return False


def advance(page, times=4):
    for _ in range(times):
        if not dialog_open(page):
            return
        if page.locator('#dialogOpts button').count() > 0:
            click_opt(page, index=0)
        else:
            tap_dialog(page)


def joy(page, dx, dy, ms):
    try:
        box = page.locator('#joy').bounding_box()
        if not box:
            return
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        page.mouse.move(cx, cy)
        page.mouse.down()
        page.mouse.move(cx + dx * 40, cy + dy * 40, steps=6)
        wait(page, ms)
        page.mouse.up()
        wait(page, 150)
    except Exception:
        pass


def close_panel(page):
    if not panel_open(page):
        return
    try:
        box = page.locator('#panel').bounding_box()
        if box:
            page.mouse.click(box['x'] + 10, box['y'] + 10)
        wait(page, 400)
    except Exception:
        pass


def click_panel_text(page, text):
    return page.evaluate("""(text) => {
      const els = Array.from(document.querySelectorAll('#panel button'))
      const t = els.find(e => e.textContent.includes(text))
      if (t) { t.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true})); return true }
      return false
    }""", text)


# ---------- 会话与存档 ----------

def new_page(pw, save_json=None, meta_json=None):
    browser = pw.chromium.launch(headless=True, args=['--mute-audio', '--autoplay-policy=no-user-gesture-required'])
    ctx = browser.new_context(viewport={'width': 360, 'height': 640},
                              device_scale_factor=2, is_mobile=True, has_touch=True)
    if save_json:
        ctx.add_init_script(f"""
          localStorage.setItem('xiuxian_save_slot_0', {json.dumps(save_json)});
          localStorage.setItem('xiuxian_save_slots_meta', {json.dumps(meta_json)});
        """)
    else:
        ctx.add_init_script('localStorage.clear()')
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(URL)
    page.wait_for_selector('#game canvas', timeout=25000)
    wait(page, 8000)
    return browser, ctx, page, errs


def make_meta(s):
    return [{'index': 0, 'heroName': s.get('heroName', '无痕'), 'classId': s.get('classId', 'sword'),
             'level': s.get('level', 1), 'realm': s.get('realm', 0), 'updatedAt': int(time.time() * 1000)}]


def load_all_skill_ids():
    try:
        data = json.loads((ROOT / 'src' / 'data' / 'skills.json').read_text(encoding='utf-8'))
        return [d['id'] for d in data if isinstance(d, dict) and d.get('id')]
    except Exception:
        return []


ALL_SKILLS = load_all_skill_ids()


def bootstrap(pw):
    """建角并返回真实存档"""
    if BASE_SAVE.exists():
        log('复用缓存存档', BASE_SAVE.name)
        return json.loads(BASE_SAVE.read_text(encoding='utf-8'))
    log('--- 建角（首次，约 40s） ---')
    browser, ctx, page, errs = new_page(pw)
    shot(page, '01_title')
    tap(page, '#btnNew'); wait(page, 1500)
    ensure_opts(page); click_opt(page, index=0); wait(page, 1500)   # 槽位 1
    ensure_opts(page); click_opt(page, index=0); wait(page, 1500)   # 剑修
    try:
        page.locator('#dialogText input').fill('无痕'); wait(page, 400)
        click_opt(page, keyword='确认')
    except Exception as e:
        log('  命名失败', str(e)[:60])
    wait(page, 6000)
    st = el_state(page)
    log('  场景:', st['floor'], st['lv'])
    save = page.evaluate("localStorage.getItem('xiuxian_save_slot_0')")
    ctx.close(); browser.close()
    if save:
        BASE_SAVE.write_text(save, encoding='utf-8')
        log('  存档已缓存')
        return json.loads(save)
    log('  ⚠ 未取到存档', errs[:3])
    return None


def scene_shot(pw, base, name, mutate=None, wait_ms=6000, after=None):
    """注入（修改后的）存档 → 继续前缘（需选槽位）→ 截图"""
    s = dict(base)
    if mutate:
        mutate(s)
    browser, ctx, page, errs = new_page(
        pw, json.dumps(s, ensure_ascii=False), json.dumps(make_meta(s), ensure_ascii=False))
    tap(page, '#btnContinue')
    wait(page, 1500)
    if dialog_open(page):
        ensure_opts(page)
        opts = el_state(page)['opts']
        click_opt(page, index=0)
        wait(page, 400)
        log(f'  [{name}] 槽位选项={opts[:1]}')
    wait(page, wait_ms)
    st = el_state(page)
    log(f'  [{name}] 场景={st["floor"]} lv={st["lv"]} panel={st["panel"]} dialog={st["dialog"]}')
    if after:
        after(page)
    shot(page, name)
    if errs:
        log('  err:', errs[:2])
    ctx.close(); browser.close()
    return page


def boost(s, level=45):
    """给存档加料：等级 / 灵石 / 全功法 / 解锁"""
    s['level'] = level
    s['exp'] = 0
    s['gold'] = 88888
    s['insight'] = 60
    s['skillPoints'] = 30
    s['talents'] = {}
    s['skills'] = {sid: 5 for sid in ALL_SKILLS}
    s['skillSlots'] = {'style': 'sk_wanjian', 'minds': ['sk_taiyi', 'sk_lingxi'], 'art': 'sk_jianqi'}
    s['worldUnlocked'] = True
    s['cityUnlocked'] = True
    s['sectUnlocked'] = True
    s['worldDomain'] = 'south'
    s.setdefault('homeX', 0); s.setdefault('homeY', 0)
    s['worldPlayerX'] = s.get('homeX', 0)
    s['worldPlayerY'] = s.get('homeY', 0)
    return s


def hp_ratio(page):
    try:
        return page.evaluate("() => { const i=document.querySelector('#hpbar i'); return i? i.style.width : '' }")
    except Exception:
        return ''


def dungeon_shots(pw, base, floor=1, seconds=110):
    """地下城（青冥山脉）：连续战斗采样，每 5.5s 一张，便于挑选敌人密集+特效应明显的画面"""
    s = boost(dict(base), 45)
    s['lastScene'] = 'Dungeon'
    s['lastSceneData'] = {'floor': floor, 'diff': 'normal'}
    browser, ctx, page, errs = new_page(
        pw, json.dumps(s, ensure_ascii=False), json.dumps(make_meta(s), ensure_ascii=False))
    tap(page, '#btnContinue'); wait(page, 1500)
    if dialog_open(page):
        ensure_opts(page); click_opt(page, index=0); wait(page, 500)
    wait(page, 9000)
    log('  [dungeon] 场景=', el_state(page)['floor'])
    import random
    random.seed(11)
    t0 = time.time()
    idx = 0
    last_slot = -1
    skill_at = [18, 46, 74]
    while time.time() - t0 < seconds:
        dismiss(page)
        for _ in range(2):
            tap(page, '#btnAtk'); wait(page, 200)
        # 小幅游走（避免原地被远程怪放风筝，也不再满地图乱跑丢失画面）
        d = random.choice([(-1, 0), (1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)])
        joy(page, d[0], d[1], random.randint(160, 260))
        el = time.time() - t0
        slot = int(el // 5.5)
        if slot > last_slot:
            last_slot = slot
            idx += 1
            shot(page, f'combat_{idx:02d}')
            log(f'   #{idx} t={el:.0f}s hp={hp_ratio(page)} {el_state(page)["floor"]}')
        for sa in skill_at:
            if sa <= el < sa + 0.5:
                tap(page, '#btnSkill'); wait(page, 320)
                shot(page, f'combat_skill_{int(sa)}')
    if errs:
        log('  [dungeon] err:', errs[:2])
    ctx.close(); browser.close()


def pick_busy(prefix='combat_', top=4):
    """按“画面信息量”挑选最佳战斗帧：非背景像素占比越高越热闹"""
    from PIL import Image
    scores = []
    for p in sorted(OUT.glob(f'{prefix}*.png')):
        try:
            im = Image.open(p).convert('RGB').resize((180, 320))
            px = list(im.getdata())
            busy = sum(1 for r, g, b in px if (r + g + b) > 150)
            scores.append((busy / len(px), p.name))
        except Exception:
            pass
    scores.sort(reverse=True)
    for sc, name in scores[:top]:
        log(f'   score={sc:.3f} {name}')
    return [n for _, n in scores[:top]]


def main():
    t0 = time.time()
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    with sync_playwright() as pw:
        base = bootstrap(pw)
        if not base:
            log('无存档，终止'); return
        log('base lastScene=', base.get('lastScene'), 'home=', base.get('homeX'), base.get('homeY'))

        if which in ('all', 'ui'):
            scene_shot(pw, base, '03_bag', lambda s: boost(s, 12),
                       after=lambda p: (tap(p, '#btnBag'), wait(p, 1500)))
            scene_shot(pw, base, '04_skill', lambda s: boost(s, 12),
                       after=lambda p: (tap(p, '#btnBag'), wait(p, 1200),
                                        click_panel_text(p, '功法'), wait(p, 1000)))
        if which in ('all', 'dungeon'):
            dungeon_shots(pw, base)
            pick_busy()

        log('elapsed %.1fs' % (time.time() - t0))


if __name__ == '__main__':
    sys.exit(main())
