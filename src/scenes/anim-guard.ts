/** 命中碎裂判据（纯函数，便于单测）：仅当是 sword_proj 动画 sprite 时才播 sword_proj_hit，
 * 排除 bolt_fly / proj_fly 等其它 Sprite 误播（回归 bug，详见 fx-anim-batch-spec.md §4.6）。
 * @param isSprite  调用方已判定 `spr instanceof Phaser.GameObjects.Sprite`
 * @param currentAnimKey 该 Sprite 当前播放动画的 key（无则 undefined）
 */
export function isSwordProjAnim(isSprite: boolean, currentAnimKey: string | undefined): boolean {
  return isSprite && (currentAnimKey ?? '').startsWith('sword_proj')
}
