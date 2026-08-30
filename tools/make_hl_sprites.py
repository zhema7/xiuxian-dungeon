# -*- coding: utf-8 -*-
"""黄龙山 NPC 素材处理：
- hanli_base.jpg  → 去棋盘格背景（边缘洪水填充）+ 裁掉底部水印阴影 → hanli_base.png (128x128 透明底)
- hanli_cast.png  → 黑底亮度键控转透明 → hanli_cast.png (256x256，游戏内用 ADD 混合发光)
- leshangshi_base.jpg → 去棋盘格背景 → leshangshi.png (128x128 透明底)
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# 源素材统一目录见 docs/art/asset-directory-spec.md：NPC 立绘原始 → assets/source/portraits
# 产物必须写 public/sprites（唯一运行时资源源），禁止直接写 dist/
SRC = ROOT / 'assets' / 'source' / 'portraits'
OUT = ROOT / 'public' / 'sprites'
OUT.mkdir(parents=True, exist_ok=True)


def bg_candidate(arr: np.ndarray) -> np.ndarray:
    """浅灰/白棋盘格背景候选：三通道均亮且色散小"""
    r, g, b = arr[..., 0].astype(int), arr[..., 1].astype(int), arr[..., 2].astype(int)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    return (mn > 185) & ((mx - mn) < 32)


def flood_from_border(cand: np.ndarray) -> np.ndarray:
    """从四边出发填充候选背景，返回背景掩码"""
    h, w = cand.shape
    bg = np.zeros_like(cand, dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    return bg


def remove_checker_bg(img: Image.Image, pre_crop: tuple | None) -> Image.Image:
    """pre_crop: (l, t, r, b) 比例裁剪（先去水印/阴影），再洪水填充去棋盘格"""
    w, h = img.size
    if pre_crop:
        l, t, r, b = pre_crop
        img = img.crop((int(l * w), int(t * h), int(r * w), int(b * h)))
    small = img.resize((512, 512), Image.BILINEAR)
    arr = np.asarray(small.convert('RGB'))
    bg = flood_from_border(bg_candidate(arr))
    mask = Image.fromarray((~bg).astype(np.uint8) * 255).resize(img.size, Image.NEAREST)
    rgba = img.convert('RGBA')
    rgba.putalpha(mask)
    # 按 alpha 紧致裁边 + 留 4px 边距
    a = np.asarray(rgba)[..., 3]
    ys, xs = np.where(a > 10)
    if len(xs) == 0:
        return rgba
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    pad = 4
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(rgba.width, x1 + pad), min(rgba.height, y1 + pad)
    return rgba.crop((x0, y0, x1, y1))


def to_square(img: Image.Image, size: int, bottom_bias: float = 0.98) -> Image.Image:
    """放入透明正方形画布（角色脚底贴近底部），缩放到 size"""
    w, h = img.size
    side = max(w, h)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, int((side - h) * bottom_bias)))
    return canvas.resize((size, size), Image.LANCZOS)


def keyout_black(img: Image.Image, size: int) -> Image.Image:
    """黑底发光图：亮度键控转 alpha（配合 ADD 混合使用）"""
    img = img.convert('RGB')
    arr = np.asarray(img).astype(int)
    lum = arr.max(axis=2)  # 用最大通道值，保留蓝色光翼的亮度
    alpha = np.clip((lum - 12) * 4, 0, 255).astype(np.uint8)
    rgba = img.convert('RGBA')
    rgba.putalpha(Image.fromarray(alpha))
    a = np.asarray(rgba)[..., 3]
    ys, xs = np.where(a > 16)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    rgba = rgba.crop((x0, y0, x1 + 1, y1 + 1))
    return to_square(rgba, size, bottom_bias=0.5)


def main():
    # 韩前辈常态立绘：裁掉底部 10%（阴影+水印），去棋盘格
    hanli = Image.open(SRC / 'hanli_base.jpg')
    hanli = remove_checker_bg(hanli, (0.14, 0.24, 0.88, 0.898))
    to_square(hanli, 128).save(OUT / 'hanli_base.png')
    print('hanli_base.png', hanli.size)

    # 韩前辈施法光翼：黑底键控
    cast = Image.open(SRC / 'hanli_cast.png')
    cast = keyout_black(cast, 256)
    cast.save(OUT / 'hanli_cast.png')
    print('hanli_cast.png', cast.size)

    # 乐上师立绘：去棋盘格（浅阴影会被一并吞掉）
    le = Image.open(SRC / 'leshangshi_base.jpg')
    le = remove_checker_bg(le, (0.10, 0.02, 0.92, 0.985))
    to_square(le, 128).save(OUT / 'leshangshi.png')
    print('leshangshi.png', le.size)


if __name__ == '__main__':
    main()
