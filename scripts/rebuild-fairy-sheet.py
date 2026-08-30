"""从 v3 母版(4动作x6帧, 单方向)重建仙子 768x512 标准帧表。
方向变换通过与现网标准表的 alpha 轮廓匹配自动检测（down/left/right/up）。
"""
import numpy as np
from PIL import Image

# 源素材统一目录见 docs/art/asset-directory-spec.md：职业精灵表原始 → assets/source/class-sheets
V3 = 'assets/source/class-sheets/v3/fairy_v3.png'
CUR = 'assets/source/class-sheets/v3/fairy_spritesheet_v2_backup.png'
OUT = 'public/sprites/fairy_spritesheet.png'
CELL = 64
ART_H = 58  # 单元格内角色最大高度

v3 = Image.open(V3).convert('RGBA')
cur = Image.open(CUR).convert('RGBA')

# ---------- 1. 用 alpha 投影分割 v3 的 6 列 x 4 行 ----------
a = np.array(v3)[..., 3]

def bands(proj, min_gap=10):
    idx = np.where(proj > 0)[0]
    out, start, prev = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - prev > min_gap:
            out.append((start, prev)); start = i
        prev = i
    out.append((start, prev))
    return out

cb = bands((a > 10).sum(axis=0))
rb = bands((a > 10).sum(axis=1))
print('col bands:', len(cb), cb)
print('row bands:', len(rb), rb)
assert len(cb) == 6 and len(rb) == 4, 'v3 分割失败'

def cell_img(row, col):
    x0, x1 = cb[col]
    y0, y1 = rb[row]
    return v3.crop((x0, y0, x1 + 1, y1 + 1))

def norm(im, size=48):
    bbox = im.getchannel('A').getbbox()
    if bbox: im = im.crop(bbox)
    im.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((size - im.size[0]) // 2, size - im.size[1]))
    return np.array(canvas)[..., 3].astype(np.float32) / 255.0

TRANSFORMS = {
    'orig': lambda im: im,
    'hflip': lambda im: im.transpose(Image.FLIP_LEFT_RIGHT),
    'vflip': lambda im: im.transpose(Image.FLIP_TOP_BOTTOM),
    'hvflip': lambda im: im.transpose(Image.ROTATE_180),
}

# ---------- 2. 检测四个方向的变换（现网表 idle 帧 vs v3 idle 帧） ----------
# 现网布局: 行0=down_idle(0-5)+down_walk(6-11), 行2/4/6=left/right/up idle+walk
DIR_ROW = {'down': 0, 'left': 2, 'right': 4, 'up': 6}
mapping = {}
for dname, row in DIR_ROW.items():
    scores = {t: 0.0 for t in TRANSFORMS}
    for j in range(6):
        cur_cell = cur.crop((j * CELL, row * CELL, (j + 1) * CELL, (row + 1) * CELL))
        cn = norm(cur_cell)
        for t, fn in TRANSFORMS.items():
            vn = norm(fn(cell_img(0, j)))
            scores[t] += float(((cn - vn) ** 2).mean())
    mapping[dname] = min(scores, key=scores.get)
    print(dname, {k: round(v, 4) for k, v in scores.items()}, '->', mapping[dname])

# ---------- 3. 合成新表 ----------
sheet = Image.new('RGBA', (CELL * 12, CELL * 8), (0, 0, 0, 0))
ACTIONS = ['idle', 'walk', 'attack', 'hit']  # v3 行序

def paste(im, cx, cy):
    bbox = im.getchannel('A').getbbox()
    if bbox: im = im.crop(bbox)
    w, h = im.size
    scale = min(60 / w, ART_H / h)
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    sheet.alpha_composite(im, (cx * CELL + (CELL - im.size[0]) // 2, cy * CELL + CELL - im.size[1] - 2))

for dname, row in DIR_ROW.items():
    fn = TRANSFORMS[mapping[dname]]
    for j in range(6):
        paste(fn(cell_img(0, j)), j, row)            # idle
        paste(fn(cell_img(1, j)), j + 6, row)        # walk
        paste(fn(cell_img(2, j)), j, row + 1)        # attack
        paste(fn(cell_img(3, j)), j + 6, row + 1)    # hit

sheet.save(OUT)
print('saved', OUT)

# 检查图
chk = Image.new('RGBA', sheet.size, (200, 40, 40, 255))
chk.alpha_composite(sheet)
chk.save('assets/source/class-sheets/v3/fairy_new_check.png')
print('check saved')
