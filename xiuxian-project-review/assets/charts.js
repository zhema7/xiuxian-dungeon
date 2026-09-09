(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart 1: Version Feature Growth Timeline ---
  var chart1 = echarts.init(document.getElementById('chart-version-growth'), null, { renderer: 'svg' });
  chart1.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    legend: { data: ['核心系统数', '源文件数', '包体积(MB)'], top: 0, textStyle: { color: muted } },
    grid: { left: '8%', right: '8%', bottom: '10%', top: '15%' },
    xAxis: {
      type: 'category',
      data: ['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5', 'v0.6', 'v0.7'],
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted }
    },
    yAxis: [
      { type: 'value', name: '数量', axisLine: { lineStyle: { color: rule } }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: rule, opacity: 0.3 } } },
      { type: 'value', name: 'MB', axisLine: { lineStyle: { color: rule } }, axisLabel: { color: muted }, splitLine: { show: false } }
    ],
    series: [
      { name: '核心系统数', type: 'line', smooth: true, data: [3, 5, 7, 9, 14, 20, 24], itemStyle: { color: accent }, areaStyle: { color: accent, opacity: 0.1 } },
      { name: '源文件数', type: 'line', smooth: true, data: [15, 25, 35, 50, 65, 80, 95], itemStyle: { color: accent2 }, areaStyle: { color: accent2, opacity: 0.1 } },
      { name: '包体积(MB)', type: 'bar', yAxisIndex: 1, data: [1.6, 3, 6.7, 96, 248, 251, 251], itemStyle: { color: muted, opacity: 0.5 } }
    ]
  });
  window.addEventListener('resize', function () { chart1.resize(); });

  // --- Chart 2: Code Module Distribution ---
  var chart2 = echarts.init(document.getElementById('chart-code-distribution'), null, { renderer: 'svg' });
  chart2.setOption({
    animation: false,
    tooltip: { trigger: 'item', appendToBody: true },
    legend: { bottom: 0, textStyle: { color: muted, fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      center: ['50%', '45%'],
      label: { color: ink, fontSize: 11 },
      data: [
        { value: 568, name: '场景系统(10个场景)', itemStyle: { color: accent } },
        { value: 99, name: 'UI系统', itemStyle: { color: accent2 } },
        { value: 62, name: '叙事/Lore', itemStyle: { color: '#7c3aed' } },
        { value: 58, name: 'NPC/弟子系统', itemStyle: { color: '#c084fc' } },
        { value: 45, name: '世界/地图', itemStyle: { color: '#fbbf24' } },
        { value: 39, name: '宗门系统', itemStyle: { color: '#34d399' } },
        { value: 38, name: '状态/核心', itemStyle: { color: '#60a5fa' } },
        { value: 30, name: 'v4套件系统', itemStyle: { color: '#f87171' } },
        { value: 146, name: '其他系统', itemStyle: { color: '#9ca3af' } }
      ]
    }]
  });
  window.addEventListener('resize', function () { chart2.resize(); });

  // --- Chart 3: Art Asset Categories ---
  var chart3 = echarts.init(document.getElementById('chart-art-assets'), null, { renderer: 'svg' });
  chart3.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true },
    grid: { left: '15%', right: '8%', bottom: '8%', top: '10%' },
    xAxis: { type: 'value', axisLine: { lineStyle: { color: rule } }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: rule, opacity: 0.3 } } },
    yAxis: {
      type: 'category',
      data: ['FX特效帧', 'v4套件帧', '角色精灵图', '怪物精灵图', 'NPC精灵图', '建筑JSON', '法阵', '背景图', '坐骑', '装饰', '音频文件'],
      axisLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted, fontSize: 11 }
    },
    series: [{
      type: 'bar',
      data: [920, 1140, 120, 15, 20, 14, 9, 10, 5, 9, 40],
      itemStyle: {
        color: function (params) {
          var colors = [accent, accent2, '#7c3aed', '#c084fc', '#fbbf24', '#34d399', '#60a5fa', '#f87171', '#a78bfa', '#9ca3af', '#f0c987'];
          return colors[params.dataIndex];
        }
      },
      label: { show: true, position: 'right', color: ink, fontSize: 11 }
    }]
  });
  window.addEventListener('resize', function () { chart3.resize(); });

  // --- Chart 4: AI Application Priority Matrix ---
  var chart4 = echarts.init(document.getElementById('chart-ai-priority'), null, { renderer: 'svg' });
  chart4.setOption({
    animation: false,
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: function (p) { return p.data.name + '<br/>影响力: ' + p.data.value[0] + '<br/>实施难度: ' + p.data.value[1] + '<br/>优先级: ' + p.data.priority; }
    },
    grid: { left: '10%', right: '10%', bottom: '12%', top: '10%' },
    xAxis: { name: '影响力→', type: 'value', min: 3, max: 10, axisLine: { lineStyle: { color: rule } }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: rule, opacity: 0.2 } }, nameTextStyle: { color: muted } },
    yAxis: { name: '↑实施难度', type: 'value', min: 2, max: 10, axisLine: { lineStyle: { color: rule } }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: rule, opacity: 0.2 } }, nameTextStyle: { color: muted } },
    series: [{
      type: 'scatter',
      symbolSize: function (d) { return d[2]; },
      data: [
        { name: 'AI生成角色美术', value: [9, 6, 32], priority: 'P0', itemStyle: { color: accent } },
        { name: 'AI生成场景背景', value: [8, 5, 28], priority: 'P0', itemStyle: { color: accent } },
        { name: 'AI驱动NPC对话', value: [9, 4, 30], priority: 'P0', itemStyle: { color: accent2 } },
        { name: 'AI动态剧情生成', value: [10, 7, 34], priority: 'P1', itemStyle: { color: '#7c3aed' } },
        { name: 'AI数值平衡优化', value: [7, 3, 24], priority: 'P1', itemStyle: { color: '#c084fc' } },
        { name: 'AI生成特效美术', value: [6, 4, 22], priority: 'P1', itemStyle: { color: '#fbbf24' } },
        { name: 'AI生成BGM音乐', value: [7, 5, 24], priority: 'P2', itemStyle: { color: '#34d399' } },
        { name: 'AI自动化测试', value: [6, 3, 20], priority: 'P2', itemStyle: { color: '#60a5fa' } },
        { name: 'AI生成副本设计', value: [8, 6, 26], priority: 'P2', itemStyle: { color: '#f87171' } },
        { name: 'AI语音合成', value: [5, 4, 18], priority: 'P3', itemStyle: { color: '#9ca3af' } }
      ],
      label: { show: true, formatter: function (p) { return p.data.name; }, position: 'top', color: ink, fontSize: 10, distance: 8 }
    }]
  });
  window.addEventListener('resize', function () { chart4.resize(); });
})();
