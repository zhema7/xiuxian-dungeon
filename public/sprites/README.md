# 精灵图目录

把自定义 PNG 精灵图放在本目录，**文件名与 key 同名**即可自动替换游戏内的程序化占位贴图；
未提供的贴图会继续使用占位图，可以只替换一部分。

## 命名与建议尺寸（PNG、透明背景、像素风）

| 文件 | 内容 | 建议尺寸 |
|---|---|---|
| `player.png` | 玩家角色 | 16×16（或 32×32 等比） |
| `npc.png` | NPC 兜底图 | 16×16 |
| `npc_elder.png` / `npc_merchant.png` / `npc_junior.png` | 老者 / 商人 / 小师妹（含队友形态） | 16×16 |
| `cave_bg.png` | 洞府整图背景（不透明整图，存在时替换程序化铺地） | 360×640 |
| `m_slime.png` / `m_bat.png` / `m_spitter.png` | 怪物（青冥山脉） | 16×16 |
| `m_wraith.png` / `m_flower.png` / `m_tortoise.png` | 怪物（幽冥沼泽） | 16×16 |
| `m_boss.png` / `m_boss2.png` | 守关 Boss（游戏内放大 1.9 倍显示） | 16×16 或 32×32 |
| `floor.png` / `wall.png` | 青冥山脉 地板 / 墙壁 | 16×16 |
| `floor2.png` / `wall2.png` | 幽冥沼泽 地板 / 墙壁 | 16×16 |
| `grass.png` / `stone.png` | 洞府草地 / 石板路 | 16×16 |
| `portal.png` | 传送门 | 16×24 |
| `slash.png` | 攻击剑光特效 | 48×48 |
| `proj.png` / `bolt.png` | 敌方毒弹 / 仙子火弹 | 8×8 |
| `sword_proj.png` | 飞剑投射物（朝右绘制） | 12×6 |
| `d_gold.png` / `d_potion.png` / `d_equip.png` / `d_book.png` | 掉落物 | 8×8 ~ 10×10 |
| `chest.png` / `altar.png` | 副本随机事件：宝箱 / 血池祭坛 | 16×12 / 16×16 |
| `furnace.png` | 洞府炼丹炉 | 16×16 |
| `m_eagle.png` / `m_golem.png` / `m_moth.png` | 无尽妖域新怪（雷鹰/魔像/幽萤蝶） | 16×16 |
| `m_boss3.png` | 深渊魔尊（游戏内放大 1.55 倍） | 32×32 |
| `deco_qm1~3.png` | 青冥山脉装饰（草丛/碎石/蘑菇） | 8×8 |
| `deco_ym1~3.png` | 幽冥沼泽装饰（毒菇/白骨/枯木） | 8×8 |
| `deco_sy1~3.png` | 无尽妖域装饰（血晶/裂石/魂火） | 8×8 |

## 注意
- 游戏以最近邻缩放渲染，任意 16 的整数倍尺寸都能保持像素锐利。
- 玩家角色已使用 `sword_*` / `fairy_*` 帧表三件套（spritesheet + atlas + anims），不走本目录散图规则。
- 完整的 AI 生成提示词规范见 `docs/04-美术素材AI生成规范.md`。
