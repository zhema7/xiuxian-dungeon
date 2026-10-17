// ---------- 玩家可见文案英文泄漏扫描 ----------
// 规则：含中文的字符串字面量，剥离 ${插值} / {{占位符}} / HTML 标签后，
// 若仍残留 ASCII 单词，即视为「英文泄漏」候选。
// 用法：npm run validate:i18n     （有命中时退出码 1，可当 CI 门禁）
//
// 主动排除的误报：代码注释、console.* 日志、HTML 标签/实体、模板占位符、Lv 等级缩写。

import fs from 'node:fs'
import path from 'node:path'

const CJK = /[\u4e00-\u9fff]/

/** 允许保留的缩写 / 术语（游戏内已约定俗成） */
const ALLOW = new Set([
  'Lv', 'GM', 'ID', 'UI', 'OK',
  'v2', 'v3', 'v4', 'SR', 'SSR', 'HD', '2D', '3D', 'DPS', 'PNG', 'JSON',
])
/** 允许「缩写+数字」形式，如 Lv3 / Lv5（HUD 里就是 Lv.1） */
const ALLOW_PREFIX_NUM = /^(Lv|HP|MP|CD)\d+$/

/**
 * index.html 额外白名单：仅允许「键盘物理键名」与版本号。
 * 键位是键帽上实际印刷的字符，改成中文玩家反而找不到键。
 */
const ALLOW_HTML = new Set(['WASD', 'Esc', 'v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9'])

/** JSON 里会直接显示给玩家的字段名 */
const JSON_DISPLAY_KEYS = new Set([
  'name', 'desc', 'description', 'title', 'label', 'text', 'story',
  'hint', 'tip', 'effect', 'flavor', 'subtitle', 'caption', 'msg', 'message',
])

const STR_RE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.tsx?$/.test(p)) acc.push(p)
  }
  return acc
}

/** 按花括号配对剥离 ${...}——避免 `${a ? b : c}` 被截断留下 `? ` 误报 */
function stripInterp(s) {
  let out = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let depth = 1
      i += 2
      while (i < s.length && depth > 0) {
        if (s[i] === '{') depth++
        else if (s[i] === '}') depth--
        i++
      }
    } else {
      out += s[i++]
    }
  }
  return out
}

function visibleText(raw) {
  let s = raw
  s = stripInterp(s)                    // ${...} 模板插值（含内部三元）
  s = s.replace(/\{\{?\w+\}?\}/g, '')   // {{name}} 故事模板占位符
  s = s.replace(/<[^>]*>/g, '')         // HTML 标签
  s = s.replace(/&[a-z]+;/g, '')        // HTML 实体
  return s
}

/** 去掉行内注释与块注释（返回去注释后的行，并在块注释中时返回 null） */
function stripComments(line, inBlock) {
  let s = line
  let block = inBlock
  let out = ''
  let i = 0
  while (i < s.length) {
    if (block) {
      const end = s.indexOf('*/', i)
      if (end < 0) return [null, true]
      i = end + 2
      block = false
      continue
    }
    if (s[i] === '/' && s[i + 1] === '*') { block = true; i += 2; continue }
    if (s[i] === '/' && s[i + 1] === '/') break
    out += s[i++]
  }
  return [out, block]
}

const files = walk('src')
const hits = []

for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  let inBlock = false
  lines.forEach((rawLine, idx) => {
    const [line, block] = stripComments(rawLine, inBlock)
    inBlock = block
    if (!line) return
    if (/console\./.test(line)) return        // 开发日志，非玩家可见
    if (/^\s*(import|export\b.*=\s*[\[{])/.test(line)) return

    STR_RE.lastIndex = 0
    let m
    while ((m = STR_RE.exec(line))) {
      const raw = m[0].slice(1, -1)
      if (!CJK.test(raw)) continue
      const vis = visibleText(raw)
      if (!CJK.test(vis)) continue
      const words = vis.match(/[A-Za-z][A-Za-z0-9_]{1,}/g) || []
      const bad = [...new Set(words.filter((w) => !ALLOW.has(w) && !ALLOW_PREFIX_NUM.test(w)))]
      if (bad.length) {
        hits.push({ file: f, line: idx + 1, words: bad, text: vis.trim().slice(0, 120) })
      }
    }
  })
}

// ---------- 2. index.html 静态文案（去 script/style 后取标签间文本） ----------
if (fs.existsSync('index.html')) {
  const html = fs.readFileSync('index.html', 'utf8')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  // 用标签切分成文本节点，逐段检查
  const segments = html.split(/<[^>]*>/).map((s) => s.trim()).filter(Boolean)
  segments.forEach((seg) => {
    const vis = visibleText(seg)
    if (!CJK.test(vis) && !/^[A-Za-z][A-Za-z0-9_. -]*$/.test(vis)) return
    const words = vis.match(/[A-Za-z][A-Za-z0-9_]{1,}/g) || []
    const bad = [...new Set(words.filter((w) => !ALLOW.has(w) && !ALLOW_HTML.has(w) && !ALLOW_PREFIX_NUM.test(w)))]
    if (bad.length) hits.push({ file: 'index.html', line: 0, words: bad, text: vis.slice(0, 120) })
  })
}

// ---------- 3. src/**/*.json 数据里的显示字段 ----------
function scanJson(obj, file, jpath, key) {
  if (typeof obj === 'string') {
    if (!key || !JSON_DISPLAY_KEYS.has(key)) return
    if (!CJK.test(obj)) return                        // 纯 id / 纯英文不在此检查（另有校验器管 id）
    const vis = visibleText(obj)
    if (!CJK.test(vis)) return
    const words = vis.match(/[A-Za-z][A-Za-z0-9_]{1,}/g) || []
    const bad = [...new Set(words.filter((w) => !ALLOW.has(w) && !ALLOW_PREFIX_NUM.test(w)))]
    if (bad.length) hits.push({ file, line: 0, words: bad, text: `${jpath} = ${vis.slice(0, 100)}` })
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => scanJson(v, file, `${jpath}[${i}]`, key))
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) scanJson(v, file, `${jpath}.${k}`, k)
  }
}
function walkJson(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkJson(p, acc)
    else if (/\.json$/.test(p) && !/atlas|anims/.test(p)) acc.push(p)
  }
  return acc
}
for (const jf of walkJson('src')) {
  try {
    scanJson(JSON.parse(fs.readFileSync(jf, 'utf8')), jf, path.basename(jf))
  } catch { /* 非法 JSON 由 validate:data 负责 */ }
}

if (hits.length) {
  for (const h of hits) console.log(`${h.file}${h.line ? ':' + h.line : ''}  {${h.words.join(',')}}  ${h.text}`)
  console.log(`\n发现 ${hits.length} 处可能的英文泄漏（若已确认是内部术语，请登记到 ALLOW 或改用 labels.ts）`)
} else {
  console.log('玩家可见文案英文扫描：通过，未发现泄漏')
}
process.exit(hits.length ? 1 : 0)
