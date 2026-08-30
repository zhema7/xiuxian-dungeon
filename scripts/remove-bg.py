"""精灵表背景抠除：从边缘洪水填充，按局部色差扩展（容忍渐变底），输出 RGBA。"""
from collections import deque
from PIL import Image

TOL = 40  # 相邻像素单通道最大差

def grayish(c) -> bool:
    """低饱和度灰（背景底色/色带），用于跨色带扩展"""
    mx, mn = max(c), min(c)
    lum = (c[0] + c[1] + c[2]) / 3
    return mx - mn < 25 and 70 <= lum <= 200

def process(src: str, dst: str):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    for (x, y) in list(q):
        visited[y * w + x] = 1
    while q:
        x, y = q.popleft()
        c = px[x, y]
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                n = px[nx, ny]
                step = max(abs(c[0]-n[0]), abs(c[1]-n[1]), abs(c[2]-n[2]))
                if step <= TOL or (grayish(c) and grayish(n)):
                    visited[ny * w + nx] = 1
                    q.append((nx, ny))
    out = Image.new('RGBA', (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if visited[y * w + x]:
                op[x, y] = (0, 0, 0, 0)
            else:
                r, g, b = px[x, y]
                op[x, y] = (r, g, b, 255)
    out.save(dst)

    # 报告第一帧（0,0,48,48）的角色包围盒
    frame = out.crop((0, 0, 48, 48))
    bbox = frame.getchannel('A').getbbox()
    print(f'{dst}: bg removed; frame0 bbox={bbox}')

# 源素材统一目录见 docs/art/asset-directory-spec.md：职业精灵表原始 → assets/source/class-sheets
# 产物必须写 public/sprites（唯一运行时资源源），禁止直接写 dist/
process('assets/source/class-sheets/sword_spritesheet.png', 'public/sprites/sword_spritesheet.png')
process('assets/source/class-sheets/fairy_spritesheet.png', 'public/sprites/fairy_spritesheet.png')
