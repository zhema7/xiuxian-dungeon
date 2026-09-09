/** 整数哈希 — 无周期性，基于大质数乘法 */
export function hash2(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263
  h = (h ^ (h >>> 13)) | 0
  h = Math.imul(h, 1274126177)
  h = h ^ (h >>> 16)
  return ((h >>> 0) & 0x7fffffff) / 0x7fffffff
}

/** 平滑值噪声 — 双线性插值 + smoothstep */
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

/** fBm 噪声（分形布朗运动）— 多层八度叠加，无周期性 */
export function fbm(x: number, y: number, octaves = 5, lacunarity = 2.1, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise(x * freq, y * freq) * 2 - 1
    sum += n * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}
