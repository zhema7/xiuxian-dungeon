#!/usr/bin/env python3
"""TapTap H5 发布打包脚本。

背景：经核对 release/ 历史可用包（v0.5 / v0.6 / v0.7 / dist-taptap.zip），TapTap H5 包
必须满足：
  1. 解压后**只有单个顶层文件夹** `xiuxian-dungeon/`，index.html 在该文件夹内
  2. 条目路径分隔符为**正斜杠** `/`（ZIP 规范 / Linux 兼容）
  3. 包含目录条目（历史包均带，如 `xiuxian-dungeon/assets/`）

PowerShell `Compress-Archive` 会写成 `assets\\index.js`（反斜杠）且无顶层文件夹，
TapTap 侧解析异常 → 包不可用。故统一用本脚本（Python zipfile 输出正斜杠）。

用法：
    python scripts/pack-taptap-zip.py <输出zip路径> [--src dist] [--level 9]
"""
import argparse
import os
import sys
import time
import zipfile

TOP_DIR = 'xiuxian-dungeon'


def build(src: str, out: str, level: int = 9) -> dict:
    if not os.path.isdir(src):
        sys.exit(f'[pack] 源目录不存在: {src}')
    if not os.path.exists(os.path.join(src, 'index.html')):
        sys.exit(f'[pack] 源目录缺少 index.html: {src}')

    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)

    file_count = 0
    dir_count = 0
    raw_size = 0
    started = time.time()

    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=level) as z:
        # 顶层单文件夹条目
        zi = zipfile.ZipInfo(f'{TOP_DIR}/', time.localtime(os.path.getmtime(src))[:6])
        zi.external_attr = (0o40755 << 16) | 0x10
        z.writestr(zi, b'')
        dir_count += 1

        # 深度优先递归，保证「目录条目紧跟该目录自身文件」，
        # 与历史 tar/7z 包的条目顺序完全一致
        def add_dir(rel: str) -> None:
            nonlocal file_count, dir_count, raw_size
            base = os.path.join(src, rel) if rel else src
            for name in sorted(os.listdir(base)):
                p = os.path.join(base, name)
                zname = f'{TOP_DIR}/{rel}/{name}'.replace('//', '/') if rel else f'{TOP_DIR}/{name}'
                mtime = time.localtime(os.path.getmtime(p))[:6]
                if os.path.isdir(p):
                    zi = zipfile.ZipInfo(zname + '/', mtime)
                    zi.external_attr = (0o40755 << 16) | 0x10
                    z.writestr(zi, b'')
                    dir_count += 1
                    add_dir(f'{rel}/{name}' if rel else name)
                else:
                    zi = zipfile.ZipInfo(zname, mtime)
                    zi.external_attr = 0o644 << 16
                    zi.compress_type = zipfile.ZIP_DEFLATED
                    with open(p, 'rb') as fh:
                        z.writestr(zi, fh.read())
                    file_count += 1
                    raw_size += os.path.getsize(p)

        add_dir('')

    zsize = os.path.getsize(out)
    return {
        'out': out,
        'files': file_count,
        'dirs': dir_count,
        'raw_mb': raw_size / 1048576,
        'zip_mb': zsize / 1048576,
        'sec': time.time() - started,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out', help='输出 zip 路径')
    ap.add_argument('--src', default='dist', help='源目录，默认 dist')
    ap.add_argument('--level', type=int, default=9, help='deflate 等级 0-9，默认 9')
    args = ap.parse_args()

    print(f'[pack] 打包 {args.src} -> {args.out}（顶层 {TOP_DIR}/，正斜杠）')
    r = build(args.src, args.out, args.level)
    print(f"[pack] ✓ 文件 {r['files']} + 目录条目 {r['dirs']}")
    print(f"[pack] ✓ 原始 {r['raw_mb']:.1f} MB -> 压缩后 {r['zip_mb']:.1f} MB（{r['sec']:.0f}s）")
    if r['zip_mb'] > 300:
        print('[pack] ⚠️ 超过 TapTap 300MB 上限')
    else:
        print(f"[pack] ✓ 体积合规（{r['zip_mb']:.1f} MB ≤ 300MB）")


if __name__ == '__main__':
    main()
