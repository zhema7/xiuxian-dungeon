#!/usr/bin/env python3
"""
第六节素材批量处理脚本
4只怪/Boss + 9个装饰件
功能：去背景 → 裁切到内容 → 缩放到规范像素尺寸
"""

import os
import numpy as np
from PIL import Image

DIR = "./assets/xianxia_pixel_art/game_sprites"

# (key, 目标宽, 目标高)
SPECS = [
    # 怪物 16x16
    ("m_eagle", 16, 16),
    ("m_golem", 16, 16),
    ("m_moth",  16, 16),
    # Boss 32x32
    ("m_boss3", 32, 32),
    # 青冥山脉装饰 8x8
    ("deco_qm1", 8, 8),
    ("deco_qm2", 8, 8),
    ("deco_qm3", 8, 8),
    # 幽冥沼泽装饰 8x8
    ("deco_ym1", 8, 8),
    ("deco_ym2", 8, 8),
    ("deco_ym3", 8, 8),
    # 无尽妖域装饰 8x8
    ("deco_sy1", 8, 8),
    ("deco_sy2", 8, 8),
    ("deco_sy3", 8, 8),
]


def remove_background_adaptive(img_arr):
    """自适应背景去除：采样边缘像素作为背景参考"""
    h, w = img_arr.shape[:2]
    
    # 采样边缘像素作为背景参考
    edge_pixels = []
    for y in range(0, h, max(1, h//30)):
        for x in [0, 1, w-2, w-1]:
            edge_pixels.append(img_arr[y, x, :3])
    for y in [0, 1, h-2, h-1]:
        for x in range(0, w, max(1, w//30)):
            edge_pixels.append(img_arr[y, x, :3])
    
    bg = np.array(edge_pixels).mean(axis=0)
    
    diff = img_arr[:,:,:3].astype(float) - bg
    dist = np.sqrt((diff**2).sum(axis=2))
    gray = img_arr[:,:,:3].mean(axis=2)
    
    alpha = img_arr[:,:,3].copy()
    is_bg = (dist < 45) | (gray > 210)
    alpha[is_bg] = 0
    img_arr[:,:,3] = alpha
    return img_arr


def crop_to_content(img_arr, padding=2):
    """裁切到有内容的区域"""
    alpha = img_arr[:, :, 3]
    if alpha.max() == 0:
        return img_arr
    rows = np.any(alpha > 0, axis=1)
    cols = np.any(alpha > 0, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    
    h, w = img_arr.shape[:2]
    rmin = max(0, rmin - padding)
    rmax = min(h - 1, rmax + padding)
    cmin = max(0, cmin - padding)
    cmax = min(w - 1, cmax + padding)
    
    return img_arr[rmin:rmax+1, cmin:cmax+1]


def process_sprite(key, target_w, target_h):
    """处理单个素材：去背景 → 裁切 → 缩放"""
    raw_path = os.path.join(DIR, f"{key}_raw.png")
    out_path = os.path.join(DIR, f"{key}.png")
    
    if not os.path.exists(raw_path):
        print(f"  [SKIP] {key}: raw not found")
        return False
    
    img = Image.open(raw_path).convert("RGBA")
    arr = np.array(img)
    
    # 去背景
    arr = remove_background_adaptive(arr)
    # 裁切到内容区域
    arr = crop_to_content(arr, padding=1)
    
    processed = Image.fromarray(arr)
    # 最近邻缩放到目标尺寸
    processed = processed.resize((target_w, target_h), Image.NEAREST)
    processed.save(out_path, "PNG")
    
    alpha = np.array(processed)[:, :, 3]
    nz = np.count_nonzero(alpha > 0)
    total = alpha.size
    print(f"  [OK] {key}.png ({target_w}x{target_h})  pixels={nz:4d}  trans={((total-nz)/total*100):.1f}%")
    return True


print("=" * 60)
print("第六节素材批量处理 (4怪/Boss + 9装饰件)")
print("=" * 60)

success = 0
failed = 0
for key, tw, th in SPECS:
    if process_sprite(key, tw, th):
        success += 1
    else:
        failed += 1

print(f"\n{'=' * 60}")
print(f"完成: {success} 成功, {failed} 失败")
print(f"输出目录: {DIR}/")
print("=" * 60)
