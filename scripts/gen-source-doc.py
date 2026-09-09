#!/usr/bin/env python3
# 生成软著源代码文档：首页30页 + 末页30页，每页50行
import os, html

PROJECT = r"c:\kimi\修仙与地下城"
OUTPUT = os.path.join(PROJECT, "soft-copyright", "源代码文档.html")
SOFTWARE_NAME = "修仙与地下城"
VERSION = "V0.5"
LINES_PER_PAGE = 50
FIRST_PAGES = 30
LAST_PAGES = 30

files = [
    "src/main.ts", "src/constants.ts", "src/state.ts", "src/core.ts",
    "src/data.ts", "src/data/classes.json", "src/effects.ts", "src/entities.ts",
    "src/input.ts", "src/levelgen.ts", "src/fog.ts", "src/audio.ts",
    "src/sfx-synth.ts", "src/ui.ts", "src/style.css", "src/scenes/BootScene.ts",
    "src/scenes/TitleScene.ts", "src/scenes/TownScene.ts", "src/scenes/CityScene.ts",
    "src/scenes/WorldScene.ts", "src/scenes/DungeonScene.ts", "src/scenes/SectScene.ts",
    "src/scenes/SectWarScene.ts", "src/scenes/TribulationScene.ts",
    "src/sect-data.ts", "src/disciple-data.ts", "src/artifact-data.ts",
    "src/npc-data.ts", "src/npc-system.ts", "src/world-time.ts",
    "src/world-events.ts", "src/three-bridge.ts", "src/mount-system.ts",
    "src/story-quests.ts", "src/tribulation-data.ts", "src/tribulation-v2.ts",
    "src/karma.ts", "src/stamina.ts", "src/weather.ts",
    "src/secret-realm.ts", "src/records.ts",
]

all_lines = []
for f in files:
    path = os.path.join(PROJECT, f.replace("/", os.sep))
    if os.path.exists(path):
        all_lines.append(f"/* ====== 文件: {f} ====== */")
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            all_lines.extend(fh.read().splitlines())
        all_lines.append("")

# Add remaining .ts files
import glob
existing = set(os.path.join(PROJECT, f.replace("/", os.sep)) for f in files)
for tsf in sorted(glob.glob(os.path.join(PROJECT, "src", "**", "*.ts"), recursive=True)):
    if tsf not in existing:
        rel = tsf.replace(PROJECT + os.sep, "").replace(os.sep, "/")
        all_lines.append(f"/* ====== 文件: {rel} ====== */")
        with open(tsf, "r", encoding="utf-8", errors="replace") as fh:
            all_lines.extend(fh.read().splitlines())
        all_lines.append("")

total = len(all_lines)
first_n = FIRST_PAGES * LINES_PER_PAGE
last_n = LAST_PAGES * LINES_PER_PAGE
first_chunk = all_lines[:first_n]
last_chunk = all_lines[-last_n:] if total > first_n else []

print(f"Total lines: {total}")
print(f"First: {len(first_chunk)} lines, Last: {len(last_chunk)} lines")

def render_pages(lines, start_page):
    pages = []
    for i in range(0, len(lines), LINES_PER_PAGE):
        page_lines = lines[i:i+LINES_PER_PAGE]
        page_num = start_page + i // LINES_PER_PAGE
        lines_html = "\n".join(
            f'<div class="line">{html.escape(l)}</div>' for l in page_lines
        )
        pages.append(f'''<div class="page">
<div class="page-header"><span>{SOFTWARE_NAME} {VERSION}</span><span>第 {page_num} 页</span></div>
{lines_html}
</div>''')
    return "\n".join(pages), len(pages)

parts = [f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>{SOFTWARE_NAME} {VERSION} 源代码文档</title>
<style>
@page {{ size: A4; margin: 2cm 2.5cm; }}
body {{ font-family: "Courier New", "Consolas", monospace; font-size: 10.5px; line-height: 1.5; color: #333; }}
.page {{ page-break-after: always; margin-bottom: 20px; }}
.page-header {{ font-size: 9px; color: #999; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 8px; display: flex; justify-content: space-between; }}
.line {{ white-space: pre-wrap; word-break: break-all; min-height: 15px; }}
h1 {{ text-align: center; font-size: 18px; margin-bottom: 30px; font-family: "SimSun", serif; }}
.info {{ text-align: center; margin-bottom: 30px; color: #666; font-size: 12px; }}
</style>
</head>
<body>
<h1>{SOFTWARE_NAME} {VERSION} 源代码文档</h1>
<div class="info">
软件名称：{SOFTWARE_NAME}　　版本号：{VERSION}<br>
源程序总行数：{total} 行　　编程语言：TypeScript / JavaScript<br>
（本文档包含首页{FIRST_PAGES}页及末页{LAST_PAGES}页，每页{LINES_PER_PAGE}行）
</div>
''']

total_pages = 0
html_str, n = render_pages(first_chunk, 1)
parts.append(html_str)
total_pages += n

if last_chunk:
    total_pages += 1
    parts.append(f'<div class="page"><div class="page-header"><span>{SOFTWARE_NAME} {VERSION}</span><span>第 {total_pages} 页</span></div><div style="text-align:center;margin-top:100px;font-size:14px;color:#666;">（以下为源代码末尾部分）</div></div>')
    html_str, n = render_pages(last_chunk, total_pages + 1)
    parts.append(html_str)
    total_pages += n

parts.append('</body></html>')

with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write("\n".join(parts))

print(f"Generated: {OUTPUT} ({total_pages} pages)")
