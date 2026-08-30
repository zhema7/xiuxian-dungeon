# -*- coding: utf-8 -*-
"""实机验收视频（横屏 1280x720）+ 宣传截图 自动录制脚本。

分段录制：标题画面 / 洞府互动 / 副本战斗，各配对应 BGM 混流为 mp4。
截图：全屏横屏版（验收用）+ 画布竖屏裁剪版（宣传用）。
"""
import http.server, functools, threading, time, shutil, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = ROOT / 'promo'
VID_TMP = OUT / '_raw'
SHOT = OUT / 'screenshots'
PORT = 8899
URL = f'http://127.0.0.1:{PORT}/'
W, H = 1280, 720
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

for d in (OUT, VID_TMP, SHOT):
    d.mkdir(parents=True, exist_ok=True)


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def wait(page, ms):
    page.wait_for_timeout(ms)


def tap(page, sel, force=False):
    try:
        el = page.locator(sel)
        if force or el.is_visible():
            el.click(force=True, timeout=1500)
            return True
    except Exception:
        pass
    return False


def joy(page, dx, dy, ms):
    """按住摇杆向 (dx,dy) 方向移动 ms 毫秒"""
    try:
        box = page.locator('#joy').bounding_box()
        if not box:
            return
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        page.mouse.move(cx, cy)
        page.mouse.down()
        page.mouse.move(cx + dx * 38, cy + dy * 38, steps=6)
        wait(page, ms)
        page.mouse.up()
    except Exception as e:
        print('joy err', e)


def shot(page, name, canvas_only=True):
    """全屏横屏截图 + 游戏画布竖屏截图"""
    page.screenshot(path=str(SHOT / f'{name}_wide.png'))
    if canvas_only:
        try:
            page.locator('#game canvas').first.screenshot(path=str(SHOT / f'{name}.png'))
        except Exception:
            pass
    print('shot:', name)


def dialog_closed(page):
    return page.evaluate("!document.getElementById('dialog').classList.contains('open')")


def advance_dialog(page, times=6, pick_first_option=True):
    """推进对话；遇到选项时点击第一个"""
    for _ in range(times):
        if dialog_closed(page):
            return
        opt = page.locator('#dialogOpts button')
        try:
            if pick_first_option and opt.count() > 0:
                opt.first.click(force=True)
                wait(page, 500)
                continue
        except Exception:
            pass
        box = page.locator('#dialog').bounding_box()
        if box:
            page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        wait(page, 450)


def close_panel(page):
    try:
        box = page.locator('#panel').bounding_box()
        if box:
            page.mouse.click(box['x'] + 12, box['y'] + 12)  # 卡片外区域
    except Exception:
        pass
    wait(page, 400)


def new_context(pw, clip):
    browser = pw.chromium.launch(headless=True, args=[
        '--autoplay-policy=no-user-gesture-required', '--mute-audio'])
    ctx = browser.new_context(viewport={'width': W, 'height': H},
                              record_video_dir=str(VID_TMP), record_video_size={'width': W, 'height': H})
    ctx.add_init_script('localStorage.clear()')
    return browser, ctx


def open_game(ctx):
    page = ctx.new_page()
    page.goto(URL)
    page.wait_for_selector('#game canvas', timeout=15000)
    wait(page, 2500)  # 等贴图/音频/背景加载
    return page


def save_clip(page, ctx, browser, name):
    try:
        ctx.close()  # 关闭上下文以完成视频写入
        browser.close()
    except Exception:
        pass
    time.sleep(1)
    raws = sorted(VID_TMP.glob('*.webm'), key=lambda p: p.stat().st_mtime)
    if raws:
        raws[-1].rename(OUT / f'{name}.webm')
        print('clip:', name)


def mux(name, bgm):
    """webm + BGM -> mp4（无声轨则直接配 BGM）"""
    src = OUT / f'{name}.webm'
    dst = OUT / f'{name}.mp4'
    audio = DIST / 'audio' / f'{bgm}.mp3'
    if not src.exists():
        print('missing', src); return
    if audio.exists():
        cmd = [FFMPEG, '-y', '-i', str(src), '-stream_loop', '-1', '-i', str(audio),
               '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
               '-c:a', 'aac', '-b:a', '128k', '-shortest', str(dst)]
    else:
        cmd = [FFMPEG, '-y', '-i', str(src), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', str(dst)]
    subprocess.run(cmd, capture_output=True)
    print('muxed:', dst.name)


# ---------------- 片段 1：标题画面 ----------------
def seg_title(pw):
    browser, ctx = new_context(pw, 'clip1_title')
    page = open_game(ctx)
    wait(page, 2500)
    shot(page, '01_title')
    tap(page, '#btnRecords')
    wait(page, 900)
    shot(page, '02_records')
    close_panel(page)
    wait(page, 1500)
    save_clip(page, ctx, browser, 'clip1_title')


# ---------------- 片段 2：洞府互动 ----------------
def seg_town(pw):
    browser, ctx = new_context(pw, 'clip2_town')
    page = open_game(ctx)
    tap(page, '#btnNew')
    wait(page, 2500)  # 淡入洞府
    shot(page, '03_town')

    # 道友（出生点左一点）
    joy(page, -1, 0, 350)
    wait(page, 300)
    tap(page, '#btnAct')
    wait(page, 900)
    shot(page, '04_dialog')
    advance_dialog(page, 4, pick_first_option=False)
    # 选项（寒暄/送礼/任务/组队）：点最后一个（组队）
    try:
        opt = page.locator('#dialogOpts button')
        if opt.count() > 0:
            opt.last.click(force=True)
            wait(page, 600)
    except Exception:
        pass
    advance_dialog(page, 6, pick_first_option=False)

    # 背包
    tap(page, '#btnBag')
    wait(page, 900)
    shot(page, '05_bag')
    close_panel(page)

    # 坊市商人（右下方木屋前）
    joy(page, 1, 0, 700); joy(page, 0, 1, 300); joy(page, 1, 0, 400)
    wait(page, 300)
    tap(page, '#btnAct')
    wait(page, 800)
    shot(page, '06_merchant')
    # 对话选项里选"看看货品"（含"货"/"交易"字样的按钮，否则第一个）
    try:
        opt = page.locator('#dialogOpts button')
        n = opt.count()
        clicked = False
        for i in range(n):
            t = opt.nth(i).inner_text()
            if '货' in t or '交易' in t or '买' in t:
                opt.nth(i).click(force=True); clicked = True; break
        if not clicked and n > 0:
            opt.first.click(force=True)
        wait(page, 800)
        shot(page, '07_shop')
    except Exception:
        pass
    tap(page, '[data-close]', force=True)
    advance_dialog(page, 3)
    close_panel(page)
    wait(page, 800)
    save_clip(page, ctx, browser, 'clip2_town')


# ---------------- 片段 3：副本战斗 ----------------
def seg_dungeon(pw):
    browser, ctx = new_context(pw, 'clip3_dungeon')
    page = open_game(ctx)
    # 继续前缘（上一片段已存档）；无存档则新开局
    if not tap(page, '#btnContinue'):
        tap(page, '#btnNew')
    wait(page, 2500)

    # 走向左上方的传送门（出生 160,445 -> 76,364）
    joy(page, -1, 0, 800); joy(page, 0, -1, 700); joy(page, -1, 0, 300); joy(page, 0, -1, 300)
    wait(page, 300)
    tap(page, '#btnAct')
    wait(page, 800)
    shot(page, '08_dungeon_choose')
    advance_dialog(page, 2, pick_first_option=True)   # 选第一个关卡
    wait(page, 2500)                                   # 载入副本
    shot(page, '09_dungeon')

    import random
    random.seed(7)
    t0 = time.time()
    skill_done = 0
    while time.time() - t0 < 55:
        for _ in range(3):
            tap(page, '#btnAtk', force=True); wait(page, 260)
        d = random.choice([(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1)])
        joy(page, d[0], d[1], random.randint(500, 900))
        el = time.time() - t0
        if 14 < el < 16:
            shot(page, '10_combat')
        if el > 8 and skill_done < 3:
            tap(page, '#btnSkill', force=True)
            skill_done += 1
            if skill_done == 1:
                wait(page, 500); shot(page, '11_skill')
        if 30 < el < 31:
            tap(page, '#btnPot', force=True)
        # 面板/对话框意外弹出则关掉
        try:
            if page.evaluate("document.getElementById('panel').classList.contains('open') && document.getElementById('panel').dataset.modal !== '1'"):
                close_panel(page)
        except Exception:
            pass
    shot(page, '12_combat_end')
    wait(page, 1200)
    save_clip(page, ctx, browser, 'clip3_dungeon')


def concat():
    listfile = OUT / '_concat.txt'
    clips = [OUT / f'clip{i}_{n}.mp4' for i, n in [(1, 'title'), (2, 'town'), (3, 'dungeon')]]
    clips = [c for c in clips if c.exists()]
    if len(clips) < 2:
        return
    listfile.write_text(''.join(f"file '{c.name}'\n" for c in clips), encoding='utf-8')
    subprocess.run([FFMPEG, '-y', '-f', 'concat', '-safe', '0', '-i', str(listfile),
                    '-c', 'copy', str(OUT / '实机验收视频.mp4')], capture_output=True, cwd=str(OUT))
    listfile.unlink(missing_ok=True)
    print('concat done')


def main():
    httpd = serve()
    with sync_playwright() as pw:
        seg_title(pw)
        seg_town(pw)
        seg_dungeon(pw)
    httpd.shutdown()
    shutil.rmtree(VID_TMP, ignore_errors=True)
    mux('clip1_title', 'bgm_title')
    mux('clip2_town', 'bgm_town')
    mux('clip3_dungeon', 'bgm_dungeon')
    concat()
    print('ALL DONE')


if __name__ == '__main__':
    sys.exit(main())
