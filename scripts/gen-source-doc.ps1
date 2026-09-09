# 生成软著源代码文档
# 规则：首页30页 + 末页30页，每页50行，页眉标注软件名称和版本号

$projectRoot = "c:\kimi\修仙与地下城"
$outputFile = "$projectRoot\soft-copyright\源代码文档.html"
$softwareName = "修仙与地下城"
$version = "V0.5"

# 按逻辑顺序收集所有源文件
$files = @(
  "src/main.ts",
  "src/constants.ts",
  "src/state.ts",
  "src/core.ts",
  "src/data.ts",
  "src/data/classes.json",
  "src/effects.ts",
  "src/entities.ts",
  "src/input.ts",
  "src/levelgen.ts",
  "src/fog.ts",
  "src/audio.ts",
  "src/sfx-synth.ts",
  "src/ui.ts",
  "src/style.css",
  "src/scenes/BootScene.ts",
  "src/scenes/TitleScene.ts",
  "src/scenes/TownScene.ts",
  "src/scenes/CityScene.ts",
  "src/scenes/WorldScene.ts",
  "src/scenes/DungeonScene.ts",
  "src/scenes/SectScene.ts",
  "src/scenes/SectWarScene.ts",
  "src/scenes/TribulationScene.ts",
  "src/sect-data.ts",
  "src/disciple-data.ts",
  "src/artifact-data.ts",
  "src/npc-data.ts",
  "src/npc-system.ts",
  "src/world-time.ts",
  "src/world-events.ts",
  "src/three-bridge.ts",
  "src/mount-system.ts",
  "src/story-quests.ts",
  "src/tribulation-data.ts",
  "src/tribulation-v2.ts",
  "src/karma.ts",
  "src/stamina.ts",
  "src/weather.ts",
  "src/secret-realm.ts",
  "src/records.ts"
)

# 收集所有代码行
$allLines = @()
foreach ($f in $files) {
  $path = Join-Path $projectRoot $f
  if (Test-Path $path) {
    $lines = Get-Content $path
    $allLines += "/* ====== 文件: $f ====== */"
    $allLines += $lines
    $allLines += ""
  }
}

# 如果还不够，补充其他ts文件
$otherFiles = Get-ChildItem "$projectRoot\src" -Recurse -Filter "*.ts" | Where-Object { $_.FullName -notin ($files | ForEach-Object { Join-Path $projectRoot $_ }) } | Sort-Object FullName
foreach ($f in $otherFiles) {
  $relPath = $f.FullName.Replace("$projectRoot\", "").Replace("\", "/")
  $lines = Get-Content $f.FullName
  $allLines += "/* ====== 文件: $relPath ====== */"
  $allLines += $lines
  $allLines += ""
}

$totalLines = $allLines.Count
$linesPerPage = 50
$firstPages = 30
$lastPages = 30
$firstLines = $firstPages * $linesPerPage  # 1500
$lastLines = $lastPages * $linesPerPage     # 1500

Write-Output "Total source lines: $totalLines"
Write-Output "First $firstLines lines ($firstPages pages)"
Write-Output "Last $lastLines lines ($lastPages pages)"

# 取首页和末页
$firstChunk = $allLines[0..([Math]::Min($firstLines - 1, $totalLines - 1))]
if ($totalLines -gt $firstLines) {
  $lastChunk = $allLines[($totalLines - $lastLines)..($totalLines - 1)]
} else {
  $lastChunk = @()
}

# 生成HTML
$html = @"
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>$softwareName $version 源代码文档</title>
<style>
@page { size: A4; margin: 2cm 2.5cm; }
body { font-family: "Courier New", "Consolas", monospace; font-size: 10.5px; line-height: 1.5; color: #333; }
.page { page-break-after: always; margin-bottom: 20px; }
.page-header { font-size: 9px; color: #999; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 8px; display: flex; justify-content: space-between; }
.page-number { text-align: center; font-size: 9px; color: #999; margin-top: 8px; }
.line { white-space: pre-wrap; word-break: break-all; }
h1 { text-align: center; font-size: 18px; margin-bottom: 30px; font-family: "SimSun", serif; }
</style>
</head>
<body>
<h1>$softwareName $version 源代码文档</h1>
"@

$pageNum = 0

# 首页部分
for ($i = 0; $i -lt $firstChunk.Count; $i += $linesPerPage) {
  $pageNum++
  $endIdx = [Math]::Min($i + $linesPerPage - 1, $firstChunk.Count - 1)
  $pageLines = $firstChunk[$i..$endIdx]

  $html += '<div class="page">'
  $html += "<div class=`"page-header`"><span>$softwareName $version</span><span>第 $pageNum 页</span></div>"
  foreach ($line in $pageLines) {
    $escaped = $line -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
    $html += "<div class=`"line`">$escaped</div>"
  }
  $html += '</div>'
}

# 分隔说明页
if ($lastChunk.Count -gt 0) {
  $pageNum++
  $html += '<div class="page">'
  $html += "<div class=`"page-header`"><span>$softwareName $version</span><span>第 $pageNum 页</span></div>"
  $html += '<div style="text-align:center; margin-top:100px; font-size:14px; color:#666;">（以下为源代码末尾部分）</div>'
  $html += '</div>'
}

# 末页部分
for ($i = 0; $i -lt $lastChunk.Count; $i += $linesPerPage) {
  $pageNum++
  $endIdx = [Math]::Min($i + $linesPerPage - 1, $lastChunk.Count - 1)
  $pageLines = $lastChunk[$i..$endIdx]

  $html += '<div class="page">'
  $html += "<div class=`"page-header`"><span>$softwareName $version</span><span>第 $pageNum 页</span></div>"
  foreach ($line in $pageLines) {
    $escaped = $line -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
    $html += "<div class=`"line`">$escaped</div>"
  }
  $html += '</div>'
}

$html += '</body></html>'

$html | Out-File -FilePath $outputFile -Encoding UTF8
Write-Output "Generated: $outputFile ($pageNum pages)"
