// ==================== 常量定义 ====================
const CONSTANTS = {
  RATE_LIMIT: {
    WINDOW: 60000,           // 1分钟窗口（毫秒）
    MAX_REQUESTS: 30,         // 每分钟最多30次请求
    SPEEDTEST_LIMIT: 5       // 测速接口每分钟最多5次
  },
  SPEEDTEST: {
    MOBILE_SIZE: 5,          // 移动端测试文件大小（MB）
    DESKTOP_SIZE: 10,        // 桌面端测试文件大小（MB）
    MAX_SPEED: 2500,         // 仪表盘最大速度（Mbps）
    MOBILE_BREAKPOINT: 768   // 移动端断点（像素）
  },
  LATENCY: {
    ITERATIONS: 10,          // 延迟测试迭代次数
    INTERVAL: 100,           // 测试间隔（毫秒）
    MAX_POINTS: 20           // 最大数据点数
  },
  DNS: {
    TIMEOUT: 3000,           // DNS查询超时（毫秒）
    TIMEOUT_VALUE: 500        // 超时代替值（毫秒）
  },
  WEBSITE: {
    TIMEOUT: 4000,           // 网站检测超时（毫秒）
    TIMEOUT_LABEL: '超时'
  },
  STORAGE: {
    HISTORY_KEY: 'netquality_history',
    MAX_HISTORY: 30          // 最大历史记录数
  },
  THRESHOLDS: {
    LATENCY_GOOD: 50,        // 延迟优秀阈值（毫秒）
    LATENCY_MEDIUM: 100,     // 延迟中等阈值（毫秒）
    SPEED_GOOD: 50,          // 速度优秀阈值（Mbps）
    SPEED_MEDIUM: 20         // 速度中等阈值（Mbps）
  }
};

// ==================== 状态管理 ====================
let latencyData = [];
let isLocalStorageAvailable = true;

// ==================== 检测 localStorage 可用性 ====================
function checkLocalStorageAvailability() {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    isLocalStorageAvailable = true;
  } catch (e) {
    isLocalStorageAvailable = false;
    console.warn('localStorage 不可用，将使用内存存储');
  }
}

// ==================== 内存存储（降级方案） ====================
const memoryStorage = {
  data: {},
  setItem(key, value) {
    this.data[key] = value;
  },
  getItem(key) {
    return this.data[key] || null;
  },
  removeItem(key) {
    delete this.data[key];
  },
  clear() {
    this.data = {};
  }
};

// ==================== 安全工具函数 ====================

// XSS 防护：HTML 实体转义
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  return String(str).replace(/[&<>"'`=/]/g, char => escapeMap[char]);
}

// 安全地设置元素内容（自动转义）
function safeText(element, text) {
  if (typeof element === 'string') {
    element = document.getElementById(element);
  }
  if (element) {
    element.textContent = text !== null && text !== undefined ? String(text) : '-';
  }
}

// 安全地设置元素 HTML（用于已知安全的模板）
function safeHtml(element, html) {
  if (typeof element === 'string') {
    element = document.getElementById(element);
  }
  if (element) {
    element.innerHTML = html;
  }
}

// URL 验证（只允许 http/https 协议）
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// 数字验证和限制
function safeNumber(value, min, max, fallback) {
  const num = parseFloat(value);
  if (isNaN(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

// 安全的超时时间（防止过短或过长）
function safeTimeout(timeout, fallback = 5000) {
  const num = parseInt(timeout);
  if (isNaN(num) || num < 100) return fallback;
  if (num > 60000) return 60000;
  return num;
}

// 安全的 fetch 包装
async function safeFetch(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), safeTimeout(timeout));

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
}

// 错误日志（不暴露敏感信息）
function logError(context, error) {
  const safeMessage = error?.message?.replace(/[\w.-]+@[\w.-]+/g, '[redacted]') || '未知错误';
  console.error(`[${context}]`, safeMessage);
}

// ==================== 工具函数 ====================

// 获取延迟颜色类
function getLatencyClass(latency) {
  const val = parseFloat(latency);
  if (isNaN(val)) return '';
  if (val < CONSTANTS.THRESHOLDS.LATENCY_GOOD) return 'latency-good';
  if (val < CONSTANTS.THRESHOLDS.LATENCY_MEDIUM) return 'latency-medium';
  return 'latency-bad';
}

// 获取速度评级
function getSpeedClass(speed) {
  const val = parseFloat(speed);
  if (isNaN(val)) return 'bad';
  if (val > CONSTANTS.THRESHOLDS.SPEED_GOOD) return 'good';
  if (val > CONSTANTS.THRESHOLDS.SPEED_MEDIUM) return 'medium';
  return 'bad';
}

// ==================== 网络检测函数 ====================

// 获取客户端公网 IP
async function getClientIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    logError('获取IP', error);
    return '未知';
  }
}

// NAT 类型检测
async function detectNATType() {
  const stunServers = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302'
  ];

  return new Promise((resolve) => {
    let natType = '检测失败';

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: stunServers }]
      });

      pc.createDataChannel('');

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;

          if (candidate.includes('typ relay')) {
            natType = '对称型 NAT';
          } else if (candidate.includes('typ prflx')) {
            natType = '端口受限锥形 NAT';
          } else if (candidate.includes('typ srflx')) {
            const srflxMatches = pc.localDescription.sdp.match(/typ srflx/g) || [];
            natType = srflxMatches.length > 1 ? '受限锥形 NAT' : '完全锥形 NAT';
          } else if (!candidate.includes('typ')) {
            natType = '无 NAT (公网IP)';
          }
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.close();
          resolve(natType);
        }
      };

      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => {
          pc.close();
          resolve('检测失败');
        });

      setTimeout(() => {
        if (pc.iceGatheringState !== 'complete') {
          pc.close();
          resolve('检测超时');
        }
      }, 5000);

    } catch (e) {
      resolve('不支持 WebRTC');
    }
  });
}

// 下载速度测试 - 移动端自适应
async function testDownloadSpeed() {
  const isMobile = window.innerWidth < CONSTANTS.SPEEDTEST.MOBILE_BREAKPOINT ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const size = isMobile ? CONSTANTS.SPEEDTEST.MOBILE_SIZE : CONSTANTS.SPEEDTEST.DESKTOP_SIZE;

  const startTime = Date.now();
  try {
    const response = await fetch(`/speedtest/${size}`, { method: 'GET', cache: 'no-cache' });
    if (!response.ok) throw new Error('测速失败');
    const blob = await response.blob();
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const speed = (size * 8) / duration;
    return speed.toFixed(2);
  } catch (error) {
    logError('速度测试', error);
    return '未知';
  }
}

// 客户端延迟测试（带实时图表更新）
async function testLatency() {
  const times = [];

  // 初始化实时延迟图表
  initLatencyLiveChart();

  for (let i = 0; i < CONSTANTS.LATENCY.ITERATIONS; i++) {
    const startTime = Date.now();
    try {
      await fetch('/speedtest/0.01', { method: 'GET', cache: 'no-cache' });
      const endTime = Date.now();
      const latency = endTime - startTime;
      times.push(latency);

      // 实时更新图表
      addLatencyPoint(latency);
    } catch (e) {
      // 忽略错误
    }
    // 添加短暂延迟让图表更平滑
    if (i < CONSTANTS.LATENCY.ITERATIONS - 1) {
      await new Promise(resolve => setTimeout(resolve, CONSTANTS.LATENCY.INTERVAL));
    }
  }

  if (times.length === 0) return '未知';

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  return { avg: avg.toFixed(1), min: min.toFixed(1), max: max.toFixed(1) };
}

// DNS 解析速度测试
async function testDNS() {
  const dnsServers = [
    { name: 'Google DNS', url: 'https://dns.google/resolve?name=google.com' },
    { name: 'Cloudflare DNS', url: 'https://cloudflare-dns.com/dns-query?name=cloudflare.com' },
    { name: '阿里 DNS', url: 'https://dns.alidns.com/resolve?name=alipay.com' },
    { name: '腾讯 DNS', url: 'https://doh.pub/dns-query?name=qq.com' }
  ];

  const results = [];

  for (const dns of dnsServers) {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONSTANTS.DNS.TIMEOUT);

      await fetch(dns.url, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors'
      });

      clearTimeout(timeoutId);
      const endTime = Date.now();

      results.push({
        name: dns.name,
        time: (endTime - startTime).toFixed(0)
      });
    } catch (e) {
      results.push({
        name: dns.name,
        time: null
      });
    }
  }

  return results;
}

// 网站访问检测
async function testWebsiteAccess() {
  const websites = [
    { name: '百度', url: 'https://www.baidu.com', favicon: 'https://www.baidu.com/favicon.ico', type: '国内' },
    { name: '淘宝', url: 'https://www.taobao.com', favicon: 'https://www.taobao.com/favicon.ico', type: '国内' },
    { name: '京东', url: 'https://www.jd.com', favicon: 'https://www.jd.com/favicon.ico', type: '国内' },
    { name: '哔哩哔哩', url: 'https://www.bilibili.com', favicon: 'https://www.bilibili.com/favicon.ico', type: '国内' },
    { name: '谷歌', url: 'https://www.google.com', favicon: 'https://www.google.com/favicon.ico', type: '国际' },
    { name: 'YouTube', url: 'https://www.youtube.com', favicon: 'https://www.youtube.com/favicon.ico', type: '国际' },
    { name: 'GitHub', url: 'https://github', favicon: 'https://github.com/favicon.ico', type: '国际' },
    { name: '维基百科', url: 'https://www.wikipedia.org', favicon: 'https://www.wikipedia.org/favicon.ico', type: '国际' }
  ];

  const results = [];

  for (const site of websites) {
    const startTime = Date.now();
    try {
      const accessible = await new Promise((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => {
          img.src = '';
          resolve(false);
        }, CONSTANTS.WEBSITE.TIMEOUT);

        img.onload = () => {
          clearTimeout(timeout);
          resolve(true);
        };

        img.onerror = () => {
          clearTimeout(timeout);
          resolve(null);
        };

        img.src = site.favicon + '?t=' + Date.now();
      });

      if (accessible === null) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), CONSTANTS.WEBSITE.TIMEOUT);

          await fetch(site.url, {
            method: 'HEAD',
            mode: 'no-cors',
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          const endTime = Date.now();

          results.push({
            ...site,
            status: '可访问',
            delay: (endTime - startTime).toFixed(0)
          });
          continue;
        } catch {
          results.push({
            ...site,
            status: '不可访问',
            delay: CONSTANTS.WEBSITE.TIMEOUT_LABEL
          });
          continue;
        }
      }

      const endTime = Date.now();
      results.push({
        ...site,
        status: accessible ? '可访问' : '不可访问',
        delay: accessible ? (endTime - startTime).toFixed(0) : CONSTANTS.WEBSITE.TIMEOUT_LABEL
      });
    } catch (error) {
      logError('网站检测', error);
      results.push({
        ...site,
        status: '不可访问',
        delay: CONSTANTS.WEBSITE.TIMEOUT_LABEL
      });
    }
  }

  return results;
}

// ==================== 渲染函数 ====================

// 纯 SVG 实现实时延迟图表（零依赖）
function renderLatencyLiveChartSVG(latencyData) {
  const container = document.getElementById('latencyLiveChart');
  if (!container || latencyData.length === 0) return;

  // 获取容器实际尺寸
  const containerRect = container.getBoundingClientRect();
  const width = Math.floor(containerRect.width) || 300;
  const height = Math.floor(containerRect.height) || 200;
  const padding = 25;

  // 计算数据范围
  const values = latencyData.map(d => d.value);
  const maxVal = Math.max(...values, 100);
  const minVal = Math.min(...values, 0);

  // 生成 SVG 路径
  const points = latencyData.map((d, i) => {
    const x = padding + (i / (latencyData.length - 1)) * (width - padding * 2);
    const y = height - padding - ((d.value - minVal) / (maxVal - minVal)) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathData = `M ${points.join(' L ')}`;

  // 生成区域填充
  const areaPath = `${pathData} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

  // 创建 SVG - 使用 preserveAspectRatio 确保自适应
  const svg = `
    <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="display: block;">
      <!-- 网格线 -->
      <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="#334155" stroke-width="1" stroke-dasharray="4"/>
      <line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" stroke="#334155" stroke-width="1" stroke-dasharray="4"/>
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#334155" stroke-width="1"/>

      <!-- Y轴标签 -->
      <text x="${padding - 5}" y="${padding + 5}" fill="#94a3b8" font-size="10" text-anchor="end">${maxVal.toFixed(0)}ms</text>
      <text x="${padding - 5}" y="${height / 2 + 3}" fill="#94a3b8" font-size="10" text-anchor="end">${((maxVal + minVal) / 2).toFixed(0)}ms</text>
      <text x="${padding - 5}" y="${height - padding}" fill="#94a3b8" font-size="10" text-anchor="end">${minVal.toFixed(0)}ms</text>

      <!-- 区域填充 -->
      <path d="${areaPath}" fill="rgba(99, 102, 241, 0.2)" stroke="none"/>

      <!-- 折线 -->
      <path d="${pathData}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- 数据点 -->
      ${latencyData.map((d, i) => {
        const x = padding + (i / (latencyData.length - 1)) * (width - padding * 2);
        const y = height - padding - ((d.value - minVal) / (maxVal - minVal)) * (height - padding * 2);
        return `<circle cx="${x}" cy="${y}" r="3" fill="#6366f1"/>`;
      }).join('')}
    </svg>
  `;

  container.innerHTML = svg;
}

// 纯 SVG 实现 DNS 柱状图（零依赖）
function renderDnsChartSVG(results) {
  const container = document.getElementById('dnsChart');
  if (!container || !results) return;

  // 获取容器实际尺寸
  const containerRect = container.getBoundingClientRect();
  const width = Math.floor(containerRect.width) || 400;
  const height = Math.floor(containerRect.height) || 300;
  const padding = 45;

  // 根据宽度自适应柱子宽度
  const availableWidth = width - padding * 2;
  const barWidth = Math.min(50, Math.floor(availableWidth / results.length * 0.6));

  // 计算最大值
  const maxVal = Math.max(...results.map(r => r.time || 500), 500);
  const barHeight = height - padding * 2;
  const spacing = (width - padding * 2 - barWidth * results.length) / (results.length + 1);

  // 生成柱状图
  const bars = results.map((dns, i) => {
    const x = padding + spacing + i * (barWidth + spacing);
    const time = dns.time || 500;
    const h = (time / maxVal) * barHeight;
    const y = height - padding - h;

    // 根据延迟值选择颜色
    let color = '#ef4444';
    if (time < CONSTANTS.THRESHOLDS.LATENCY_GOOD) color = '#10b981';
    else if (time < CONSTANTS.THRESHOLDS.LATENCY_MEDIUM) color = '#f59e0b';

    // 自适应字体大小
    const fontSize = Math.max(9, Math.min(11, barWidth / 4));

    return `
      <g>
        <!-- 柱子 -->
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${color}" rx="4" ry="4">
          <title>${dns.name}: ${time === 500 ? '超时' : time + 'ms'}</title>
        </rect>
        <!-- 数值 -->
        <text x="${x + barWidth / 2}" y="${y - 5}" fill="#94a3b8" font-size="${fontSize}" text-anchor="middle">${time === 500 ? '超时' : time}</text>
        <!-- 名称 -->
        <text x="${x + barWidth / 2}" y="${height - padding + 15}" fill="#94a3b8" font-size="${fontSize - 1}" text-anchor="middle">${dns.name}</text>
      </g>
    `;
  }).join('');

  const svg = `
    <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="display: block;">
      <!-- 网格线 -->
      <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="#334155" stroke-width="1" stroke-dasharray="4"/>
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#334155" stroke-width="1"/>
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#334155" stroke-width="1"/>

      <!-- Y轴标签 -->
      <text x="${padding - 5}" y="${padding + 5}" fill="#94a3b8" font-size="10" text-anchor="end">${maxVal}ms</text>
      <text x="${padding - 5}" y="${height / 2 + 3}" fill="#94a3b8" font-size="10" text-anchor="end">${(maxVal / 2).toFixed(0)}ms</text>
      <text x="${padding - 5}" y="${height - padding}" fill="#94a3b8" font-size="10" text-anchor="end">0ms</text>

      <!-- 柱子 -->
      ${bars}
    </svg>
  `;

  container.innerHTML = svg;
}

// 纯 SVG 实现历史趋势图（零依赖）
function renderHistoryChartSVG(history) {
  const container = document.getElementById('historyChart');
  if (!container || !history || history.length === 0) return;

  // 获取容器实际尺寸
  const containerRect = container.getBoundingClientRect();
  const width = Math.floor(containerRect.width) || 600;
  const height = Math.floor(containerRect.height) || 300;
  const padding = 50;

  // 数据准备
  const labels = history.map(h => {
    const date = new Date(h.timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });

  const speedData = history.map(h => safeNumber(h.speed, 0, 10000, 0));
  const latencyData = history.map(h => safeNumber(h.latency, 0, 10000, 0));

  const maxSpeed = Math.max(...speedData, 100);
  const maxLatency = Math.max(...latencyData, 100);

  // 生成速度线条
  const speedPoints = speedData.map((val, i) => {
    const x = padding + (i / (history.length - 1)) * (width - padding * 2);
    const y = height - padding - (val / maxSpeed) * (height - padding * 2);
    return `${x},${y}`;
  });
  const speedPath = `M ${speedPoints.join(' L ')}`;

  // 生成延迟线条
  const latencyPoints = latencyData.map((val, i) => {
    const x = padding + (i / (history.length - 1)) * (width - padding * 2);
    const y = height - padding - (val / maxLatency) * (height - padding * 2);
    return `${x},${y}`;
  });
  const latencyPath = `M ${latencyPoints.join(' L ')}`;

  // 生成 X 轴标签 - 自适应字体和间隔
  const xLabels = labels.map((label, i) => {
    const x = padding + (i / (history.length - 1)) * (width - padding * 2);
    const fontSize = width < 400 ? 9 : 10;
    const showLabel = history.length <= 10 || i % 2 === 0; // 数据多时隔点显示
    if (!showLabel) return '';
    return `<text x="${x}" y="${height - padding + 20}" fill="#94a3b8" font-size="${fontSize}" text-anchor="middle">${label}</text>`;
  }).join('');

  // 自适应图例位置
  const legendY = width < 500 ? padding - 30 : padding - 20;

  const svg = `
    <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="display: block;">
      <!-- 网格线 -->
      <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="#334155" stroke-width="1" stroke-dasharray="4"/>
      <line x1="${padding}" y1="${height / 2}" x2="${width - padding}" y2="${height / 2}" stroke="#334155" stroke-width="1" stroke-dasharray="4"/>
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#334155" stroke-width="1"/>
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#334155" stroke-width="1"/>
      <line x1="${width - padding}" y1="${padding}" x2="${width - padding}" y2="${height - padding}" stroke="#334155" stroke-width="1" stroke-dasharray="4"/>

      <!-- 左 Y 轴标签（速度） -->
      <text x="${padding - 5}" y="${padding + 5}" fill="#6366f1" font-size="10" text-anchor="end">${maxSpeed.toFixed(0)}M</text>
      <text x="${padding - 5}" y="${height - padding}" fill="#6366f1" font-size="10" text-anchor="end">0M</text>

      <!-- 右 Y 轴标签（延迟） -->
      <text x="${width - padding + 5}" y="${padding + 5}" fill="#10b981" font-size="10" text-anchor="start">${maxLatency.toFixed(0)}ms</text>
      <text x="${width - padding + 5}" y="${height - padding}" fill="#10b981" font-size="10" text-anchor="start">0ms</text>

      <!-- X 轴标签 -->
      ${xLabels}

      <!-- 速度线条 -->
      <path d="${speedPath}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- 延迟线条 -->
      <path d="${latencyPath}" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- 速度数据点 -->
      ${speedData.map((val, i) => {
        const x = padding + (i / (history.length - 1)) * (width - padding * 2);
        const y = height - padding - (val / maxSpeed) * (height - padding * 2);
        const radius = width < 400 ? 2 : 3;
        return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#6366f1"/>`;
      }).join('')}

      <!-- 延迟数据点 -->
      ${latencyData.map((val, i) => {
        const x = padding + (i / (history.length - 1)) * (width - padding * 2);
        const y = height - padding - (val / maxLatency) * (height - padding * 2);
        const radius = width < 400 ? 2 : 3;
        return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#10b981"/>`;
      }).join('')}

      <!-- 图例 -->
      <g transform="translate(${width / 2 - 60}, ${legendY})">
        <line x1="0" y1="0" x2="30" y2="0" stroke="#6366f1" stroke-width="2"/>
        <circle cx="15" cy="0" r="3" fill="#6366f1"/>
        <text x="35" y="4" fill="#6366f1" font-size="11">速度 (Mbps)</text>

        <line x1="100" y1="0" x2="130" y2="0" stroke="#10b981" stroke-width="2"/>
        <circle cx="115" cy="0" r="3" fill="#10b981"/>
        <text x="135" y="4" fill="#10b981" font-size="11">延迟 (ms)</text>
      </g>
    </svg>
  `;

  container.innerHTML = svg;
}

// 渲染测速结果
function renderSpeedtest(downloadSpeed, latency) {
  const speedClass = getSpeedClass(downloadSpeed);
  const speedVal = safeNumber(downloadSpeed, 0, 10000, 0);
  const speedtestInfo = document.getElementById('speedtestInfo');

  const latAvg = typeof latency === 'object' ? latency.avg : latency;
  const latMin = typeof latency === 'object' ? latency.min : latency;
  const latMax = typeof latency === 'object' ? latency.max : latency;
  const latAvgNum = safeNumber(latAvg, 0, 10000, 999);

  speedtestInfo.innerHTML = `
    <div class="card card-animated">
      <div class="speed-gauge">
        <div class="speed-value ${speedClass === 'good' ? 'latency-good' : speedClass === 'medium' ? 'latency-medium' : 'latency-bad'}">${escapeHtml(downloadSpeed)}</div>
        <div class="speed-unit">Mbps 下载速度</div>
        <div class="speed-bar">
          <div class="speed-bar-fill ${escapeHtml(speedClass)}" style="width: ${Math.min(100, speedVal)}%"></div>
        </div>
      </div>
    </div>
    <div class="card card-animated">
      <div class="speed-gauge">
        <div class="speed-value ${getLatencyClass(latAvg)}">${escapeHtml(latAvg)}</div>
        <div class="speed-unit">ms 平均延迟</div>
        <div class="speed-bar">
          <div class="speed-bar-fill ${latAvgNum < CONSTANTS.THRESHOLDS.LATENCY_GOOD ? 'good' : latAvgNum < CONSTANTS.THRESHOLDS.LATENCY_MEDIUM ? 'medium' : 'bad'}" style="width: ${Math.max(10, 200 - latAvgNum * 2)}%"></div>
        </div>
        <p style="margin-top:15px;color:var(--text-muted);font-size:0.85rem">
          最小: ${escapeHtml(latMin)}ms / 最大: ${escapeHtml(latMax)}ms
        </p>
      </div>
    </div>
  `;
}

// 渲染 DNS 结果
function renderDNS(results) {
  const dnsInfo = document.getElementById('dnsInfo');

  dnsInfo.innerHTML = `
    <div class="dns-grid">
      ${results.map(dns => `
        <div class="dns-item">
          <div class="dns-name">${dns.name}</div>
          <div class="dns-time ${dns.time ? getLatencyClass(dns.time) : 'latency-bad'}">
            ${dns.time ? dns.time + 'ms' : '超时'}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// 渲染网站检测结果
function renderWebsites(websites) {
  const websiteInfo = document.getElementById('websiteInfo');

  websiteInfo.innerHTML = websites.map((site, idx) => {
    const statusClass = site.status === '可访问' ? 'status-good' : 'status-bad';
    const typeIcon = site.type === '国内' ? '🇨🇳' : '🌍';
    const delayValue = site.delay === CONSTANTS.WEBSITE.TIMEOUT_LABEL ? null : parseFloat(site.delay);

    return `
      <div class="card card-animated" style="animation-delay: ${idx * 0.05}s">
        <div class="website-card">
          <div class="website-icon">${typeIcon}</div>
          <div class="website-info">
            <div class="website-name">${site.name}</div>
            <div class="website-url">${site.url}</div>
          </div>
          <div class="website-status">
            <div class="status ${statusClass}">${site.status}</div>
            <div class="delay ${delayValue ? getLatencyClass(delayValue) : ''}">${site.delay}${delayValue ? 'ms' : ''}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== 存储操作 ====================

// 保存到历史记录
function saveToHistory(data) {
  const storage = isLocalStorageAvailable ? localStorage : memoryStorage;

  try {
    const history = JSON.parse(storage.getItem(CONSTANTS.STORAGE.HISTORY_KEY) || '[]');
    history.push({
      ...data,
      timestamp: Date.now()
    });

    // 限制历史记录数量
    while (history.length > CONSTANTS.STORAGE.MAX_HISTORY) {
      history.shift();
    }

    storage.setItem(CONSTANTS.STORAGE.HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    logError('保存历史记录', e);
  }
}

// 获取历史记录
function getHistory() {
  const storage = isLocalStorageAvailable ? localStorage : memoryStorage;

  try {
    return JSON.parse(storage.getItem(CONSTANTS.STORAGE.HISTORY_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

// 清除历史记录
function clearHistory() {
  const storage = isLocalStorageAvailable ? localStorage : memoryStorage;
  storage.removeItem(CONSTANTS.STORAGE.HISTORY_KEY);
  renderHistoryChart();
}

// ==================== 图表功能 ====================

// 更新速度仪表盘
function updateSpeedometer(speed) {
  const speedNum = safeNumber(speed, 0, 10000, 0); // 支持最高 10000 Mbps
  const maxSpeed = CONSTANTS.SPEEDTEST.MAX_SPEED;

  // 计算角度 (从 -90度 到 90度)
  const percentage = Math.min(speedNum / maxSpeed, 1);
  const angle = -90 + (percentage * 180);
  const radian = angle * Math.PI / 180;

  // 计算指针终点
  const needleLength = 55;
  const endX = 100 + needleLength * Math.sin(radian);
  const endY = 100 - needleLength * Math.cos(radian);

  // 更新指针
  const needle = document.getElementById('speedometerNeedle');
  if (needle) {
    needle.setAttribute('x2', endX);
    needle.setAttribute('y2', endY);
  }

  // 更新进度弧
  const arc = document.getElementById('speedometerArc');
  if (arc) {
    const totalLength = 251.2;
    const offset = totalLength * (1 - percentage);
    arc.style.strokeDashoffset = offset;
    arc.style.transition = 'stroke-dashoffset 0.5s ease-out';
  }

  // 更新数值
  const valueEl = document.getElementById('speedometerValue');
  if (valueEl) {
    valueEl.textContent = speedNum.toFixed(1);
  }
}

// 初始化实时延迟图表
function initLatencyLiveChart() {
  // 清空数据，等待新数据
  latencyData = [];
  // 清空图表容器
  const container = document.getElementById('latencyLiveChart');
  if (container) {
    container.innerHTML = '';
  }
}

// 添加延迟数据点
function addLatencyPoint(latency) {
  const now = new Date();
  const timeLabel = now.getSeconds() + 's';

  latencyData.push({
    time: timeLabel,
    value: safeNumber(latency, 0, 10000, 0)
  });

  // 限制数据点数量
  if (latencyData.length > CONSTANTS.LATENCY.MAX_POINTS) {
    latencyData.shift();
  }

  // 使用 SVG 渲染图表
  renderLatencyLiveChartSVG(latencyData);
}

// 渲染 DNS 柱状图
function renderDnsChart(results) {
  const container = document.getElementById('dnsChartContainer');
  if (!container) return;

  container.style.display = 'block';

  // 使用 SVG 渲染柱状图
  renderDnsChartSVG(results);
}

// 渲染历史趋势图
function renderHistoryChart(range = 7) {
  const section = document.getElementById('historySection');

  if (!section) return;

  let history = getHistory();

  if (history.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  // 根据范围筛选
  if (range !== 'all') {
    history = history.slice(-range);
  }

  // 使用 SVG 渲染历史趋势图
  renderHistoryChartSVG(history);
}

// ==================== 事件监听 ====================

// 历史范围按钮事件
document.querySelectorAll('.history-btn[data-range]').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.history-btn[data-range]').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const range = this.dataset.range === 'all' ? 'all' : parseInt(this.dataset.range);
    renderHistoryChart(range);
  });
});

// 清除历史按钮
document.getElementById('clearHistoryBtn')?.addEventListener('click', function() {
  if (confirm('确定要清除所有历史记录吗？')) {
    clearHistory();
  }
});

// ==================== 窗口自适应处理 ====================

let resizeTimeout = null;

// 窗口大小改变时重新渲染图表
window.addEventListener('resize', function() {
  // 防抖处理，避免频繁重绘
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(function() {
    // 重新渲染所有图表
    if (latencyData.length > 0) {
      renderLatencyLiveChartSVG(latencyData);
    }

    // 重新渲染 DNS 图表（如果有数据）
    const dnsChartContainer = document.getElementById('dnsChartContainer');
    if (dnsChartContainer && dnsChartContainer.style.display !== 'none') {
      // 需要重新获取 DNS 数据并渲染
      const dnsElements = document.querySelectorAll('#dnsInfo .dns-item');
      if (dnsElements.length > 0) {
        const dnsResults = [];
        dnsElements.forEach(el => {
          const name = el.querySelector('.dns-name')?.textContent || '';
          const timeText = el.querySelector('.dns-time')?.textContent || '';
          const time = timeText === '超时' ? null : parseInt(timeText);
          if (name) dnsResults.push({ name, time });
        });
        if (dnsResults.length > 0) {
          renderDnsChartSVG(dnsResults);
        }
      }
    }

    // 重新渲染历史图表（如果有数据）
    const historySection = document.getElementById('historySection');
    if (historySection && historySection.style.display !== 'none') {
      const history = getHistory();
      if (history.length > 0) {
        renderHistoryChartSVG(history);
      }
    }
  }, 200); // 200ms 延迟
});

// ==================== 主检测流程 ====================

// 检查 localStorage 可用性
checkLocalStorageAvailability();

// 主检测按钮事件
document.getElementById('checkBtn').addEventListener('click', async function() {
  const btn = this;
  const loading = document.getElementById('loading');
  const loadingText = document.getElementById('loadingText');
  const error = document.getElementById('error');
  const results = document.getElementById('results');

  btn.disabled = true;
  loading.classList.add('active');
  error.classList.remove('active');
  results.classList.remove('active');

  const steps = [
    '正在获取公网 IP 地址...',
    '正在检测 NAT 类型...',
    '正在测试下载速度...',
    '正在测试网络延迟（实时图表）...',
    '正在测试 DNS 解析速度...',
    '正在检测网站访问情况...'
  ];

  try {
    // Step 1: 获取 IP
    loadingText.textContent = steps[0];
    const clientIP = await getClientIP();
    document.getElementById('ip').textContent = clientIP;

    // Step 2: 检测 NAT 类型
    loadingText.textContent = steps[1];
    const natType = await detectNATType();
    document.getElementById('natType').textContent = natType;

    // Step 3: 测试下载速度
    loadingText.textContent = steps[2];
    const downloadSpeed = await testDownloadSpeed();

    // Step 4: 测试延迟
    loadingText.textContent = steps[3];
    const latency = await testLatency();

    // 渲染测速结果
    renderSpeedtest(downloadSpeed, latency);

    // 更新速度仪表盘和显示图表容器
    const chartContainer = document.getElementById('speedChartsContainer');
    if (chartContainer) {
      chartContainer.style.display = 'grid';
      updateSpeedometer(downloadSpeed);
    }

    // Step 5: DNS 测试
    loadingText.textContent = steps[4];
    const dnsResults = await testDNS();
    renderDNS(dnsResults);
    renderDnsChart(dnsResults);

    // Step 6: 网站检测
    loadingText.textContent = steps[5];
    const websites = await testWebsiteAccess();
    renderWebsites(websites);

    // 保存到历史记录
    const historyData = {
      speed: parseFloat(downloadSpeed) || 0,
      latency: parseFloat(latency.avg) || 0,
      ip: clientIP,
      natType: natType
    };
    saveToHistory(historyData);

    // 渲染历史趋势图
    renderHistoryChart(7);

    // 更新检测时间
    document.getElementById('timestamp').textContent = new Date().toLocaleString();

    results.classList.add('active');

  } catch (err) {
    logError('主检测流程', err);
    document.getElementById('errorText').textContent = '检测过程中发生错误: ' + err.message;
    error.classList.add('active');
  } finally {
    btn.disabled = false;
    loading.classList.remove('active');
  }
});
