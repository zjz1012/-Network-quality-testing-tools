const express = require('express');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();
const port = 5000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 工具函数：执行命令并返回结果
function execCommand(cmd, timeout = 5000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout }, (error, stdout, stderr) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// 工具函数：读取系统文件
function readSysFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8').trim();
    }
    return null;
  } catch (error) {
    return null;
  }
}

// 主页路由
app.get('/', (req, res) => {
  res.render('index', { title: '网络质量检测' });
});

// 执行网络质量检测
app.post('/check', async (req, res) => {
  try {
    // 获取客户端 IP 地址（优先使用客户端发送的 IP）
    let clientIP = req.body.clientIP || req.ip || req.connection.remoteAddress;
    
    // 并行执行所有检测以提高速度
    const [localInfo, delayInfo, routeInfo, globalInfo] = await Promise.all([
      getLocalInfo(),
      getDelayInfo(clientIP),
      getRouteInfo(clientIP),
      getGlobalInfo()
    ]);
    
    // 国内测速在客户端执行
    const speedtestInfo = { clientTest: true };
    
    const result = {
      ip: clientIP,
      local: localInfo,
      delay: delayInfo,
      route: routeInfo,
      speedtest: speedtestInfo,
      global: globalInfo,
      timestamp: new Date().toISOString()
    };
    
    res.json(result);
  } catch (error) {
    console.error('检测过程中发生错误:', error);
    res.status(500).json({ error: '检测过程中发生错误' });
  }
});

// 获取本地状态信息 - 真实数据
async function getLocalInfo() {
  try {
    // TCP 拥塞控制算法
    const tcpCongestion = readSysFile('/proc/sys/net/ipv4/tcp_congestion_control') 
      || await execCommand('sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null')
      || '未知';
    
    // 队列调度算法
    let queueDiscipline = '未知';
    const tcResult = await execCommand('tc qdisc show 2>/dev/null | head -1');
    if (tcResult) {
      const match = tcResult.match(/qdisc\s+(\w+)/);
      if (match) {
        queueDiscipline = match[1];
      }
    }
    
    // TCP 接收缓冲区
    const tcpRmem = readSysFile('/proc/sys/net/ipv4/tcp_rmem')
      || await execCommand('sysctl -n net.ipv4.tcp_rmem 2>/dev/null')
      || '未知';
    
    // TCP 发送缓冲区
    const tcpWmem = readSysFile('/proc/sys/net/ipv4/tcp_wmem')
      || await execCommand('sysctl -n net.ipv4.tcp_wmem 2>/dev/null')
      || '未知';
    
    // 默认路由信息
    const defaultRoute = await execCommand('ip route show default 2>/dev/null | head -1') || '未知';
    
    // DNS 服务器
    const dnsServers = readSysFile('/etc/resolv.conf')
      ?.split('\n')
      .filter(line => line.startsWith('nameserver'))
      .map(line => line.split(' ')[1])
      .join(', ') || '未知';
    
    // 网络接口信息
    const interfaces = await execCommand('ip addr show 2>/dev/null | grep -E "^[0-9]+:" | awk -F": " \'{print $2}\'');
    const interfaceList = interfaces ? interfaces.split('\n').filter(i => i && i !== 'lo').join(', ') : '未知';
    
    return {
      natType: '需客户端检测',  // NAT 类型需要客户端通过 STUN 检测
      tcpCongestion: tcpCongestion,
      queueDiscipline: queueDiscipline,
      tcpReceiveBuffer: tcpRmem,
      tcpSendBuffer: tcpWmem,
      defaultRoute: defaultRoute,
      dnsServers: dnsServers,
      interfaces: interfaceList
    };
  } catch (error) {
    console.error('获取本地状态信息失败:', error);
    return { error: '获取本地状态信息失败' };
  }
}

// 三网延迟测试节点
const TEST_NODES = {
  telecom: {
    name: '电信',
    nodes: {
      beijing: { host: '202.96.199.133', name: '北京' },
      shanghai: { host: '101.226.4.6', name: '上海' },
      guangzhou: { host: '113.108.209.1', name: '广州' }
    }
  },
  unicom: {
    name: '联通',
    nodes: {
      beijing: { host: '202.106.196.115', name: '北京' },
      shanghai: { host: '210.22.97.1', name: '上海' },
      guangzhou: { host: '221.5.88.88', name: '广州' }
    }
  },
  mobile: {
    name: '移动',
    nodes: {
      beijing: { host: '211.136.192.6', name: '北京' },
      shanghai: { host: '211.136.112.50', name: '上海' },
      guangzhou: { host: '211.139.145.129', name: '广州' }
    }
  }
};

// 测试单个节点的延迟
async function pingNode(host, count = 3) {
  try {
    const result = await execCommand(`ping -c ${count} -W 2 ${host} 2>/dev/null | tail -1`);
    if (result) {
      // 解析 ping 结果，格式如: rtt min/avg/max/mdev = 10.123/20.456/30.789/5.123 ms
      const match = result.match(/= ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+) ms/);
      if (match) {
        return {
          min: parseFloat(match[1]),
          avg: parseFloat(match[2]),
          max: parseFloat(match[3]),
          mdev: parseFloat(match[4])
        };
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// 获取三网延迟 - 真实数据
async function getDelayInfo(ip) {
  const results = {};
  
  for (const [isp, config] of Object.entries(TEST_NODES)) {
    results[isp] = {};
    
    for (const [city, node] of Object.entries(config.nodes)) {
      const pingResult = await pingNode(node.host);
      if (pingResult) {
        results[isp][city] = {
          min: pingResult.min.toFixed(1),
          avg: pingResult.avg.toFixed(1),
          max: pingResult.max.toFixed(1),
          mdev: pingResult.mdev.toFixed(1)
        };
      } else {
        results[isp][city] = null;
      }
    }
  }
  
  return results;
}

// AS 号码到运营商名称的映射
const AS_MAP = {
  'AS4134': '中国电信',
  'AS4809': '中国电信CN2',
  'AS4812': '中国电信CN2',
  'AS23764': '中国电信CTGNet',
  'AS9929': '中国电信CN2',
  'AS4837': '中国联通A网',
  'AS10099': '中国联通',
  'AS4847': '中国联通',
  'AS1789': '中国联通',
  'AS9808': '中国移动',
  'AS58807': '中国移动CMIN2',
  'AS58453': '中国移动CMI',
  'AS9800': '中国移动',
  'AS4538': '中国教育网CERNET',
  'AS7497': '中国科技网CSTNET',
  'AS38365': '中国教育网',
  'AS24345': '中国铁通',
  'AS9394': '中国铁通',
  'AS37963': '阿里巴巴',
  'AS45090': '阿里巴巴',
  'AS38283': '腾讯',
  'AS45062': '腾讯云',
  'AS55990': '华为云',
  'AS55933': '华为云',
  'AS38360': '华为云',
  'AS139019': '华为云',
  'AS139021': '华为云',
  'AS136907': '华为云',
  'AS136188': '华为云',
  'AS59019': '百度云',
  'AS55967': '百度云',
  'AS59027': '百度云',
  'AS23724': '中国电信IDC',
  'AS17638': '中国联通IDC',
  'AS24400': '中国移动IDC',
  // 国际运营商
  'AS3356': 'Level3',
  'AS174': 'Cogent',
  'AS1299': 'Telia',
  'AS2914': 'NTT',
  'AS3257': 'GTT',
  'AS6461': 'Zayo',
  'AS6453': 'Tata',
  'AS6762': 'Telecom Italia',
  'AS1273': 'Vodafone',
  'AS7018': 'AT&T',
  'AS209': 'CenturyLink',
  'AS1239': 'Sprint',
  'AS701': 'Verizon',
  'AS6939': 'Hurricane Electric',
  'AS4134': '中国电信',
  'AS4837': '中国联通',
  'AS9808': '中国移动'
};

// 解析 traceroute 输出获取 AS 路径
function parseTraceroute(output) {
  if (!output) return null;
  
  const lines = output.split('\n');
  const hops = [];
  
  for (const line of lines) {
    // 跳过空行和标题行
    if (!line.trim() || line.includes('traceroute to')) continue;
    
    // 解析每一跳
    const hopMatch = line.match(/^\s*(\d+)\s+(.+)/);
    if (hopMatch) {
      const hopNum = parseInt(hopMatch[1]);
      const rest = hopMatch[2];
      
      // 提取 IP 地址
      const ipMatch = rest.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) {
        const ip = ipMatch[1];
        
        // 提取延迟
        const latencyMatch = rest.match(/([\d.]+)\s*ms/g);
        const latencies = latencyMatch ? latencyMatch.map(l => parseFloat(l)) : [];
        
        hops.push({
          hop: hopNum,
          ip: ip,
          latencies: latencies
        });
      }
    }
  }
  
  return hops;
}

// 通过 IP 获取 AS 信息（使用在线 API）
async function getASInfo(ip) {
  try {
    // 使用 ip-api.com 的免费 API
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,as,asname,isp,country`, {
      timeout: 3000
    });
    const data = await response.json();
    
    if (data.status === 'success' && data.as) {
      // 提取 AS 号码
      const asMatch = data.as.match(/AS(\d+)/);
      const asn = asMatch ? `AS${asMatch[1]}` : null;
      
      return {
        asn: asn,
        asName: data.asname || data.isp,
        isp: data.isp,
        country: data.country
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

// 获取回程路由 - 使用在线 API 获取 AS 信息
async function getRouteInfo(ip) {
  const results = {};
  
  // 并行获取三个运营商节点的 AS 信息
  const routeNodes = {
    telecom: { 
      beijing: TEST_NODES.telecom.nodes.beijing,
      shanghai: TEST_NODES.telecom.nodes.shanghai,
      guangzhou: TEST_NODES.telecom.nodes.guangzhou
    },
    unicom: { 
      beijing: TEST_NODES.unicom.nodes.beijing,
      shanghai: TEST_NODES.unicom.nodes.shanghai,
      guangzhou: TEST_NODES.unicom.nodes.guangzhou
    },
    mobile: { 
      beijing: TEST_NODES.mobile.nodes.beijing,
      shanghai: TEST_NODES.mobile.nodes.shanghai,
      guangzhou: TEST_NODES.mobile.nodes.guangzhou
    }
  };
  
  for (const [isp, cities] of Object.entries(routeNodes)) {
    results[isp] = {};
    
    for (const [city, node] of Object.entries(cities)) {
      // 获取目标 IP 的 AS 信息
      const asInfo = await getASInfo(node.host);
      
      // 同时测试延迟
      const pingResult = await pingNode(node.host, 1);
      
      if (asInfo && asInfo.asn) {
        const asName = AS_MAP[asInfo.asn] || asInfo.asName || asInfo.isp || asInfo.asn;
        results[isp][city] = {
          asPath: `本地网络 → ${asName}`,
          asn: asInfo.asn,
          asName: asName,
          isp: asInfo.isp,
          avgLatency: pingResult ? pingResult.avg.toFixed(1) : null
        };
      } else {
        // 如果无法获取 AS 信息，使用预定义的运营商名称
        const ispNames = {
          telecom: '中国电信',
          unicom: '中国联通',
          mobile: '中国移动'
        };
        results[isp][city] = {
          asPath: `本地网络 → ${ispNames[isp]}`,
          asn: null,
          asName: ispNames[isp],
          avgLatency: pingResult ? pingResult.avg.toFixed(1) : null
        };
      }
      
      // 短暂延迟避免 API 请求过快
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

// 国际互连测试节点
const GLOBAL_NODES = {
  northAmerica: {
    name: '北美',
    nodes: [
      { host: '8.8.8.8', name: 'Google DNS (美国)', location: '美国' },
      { host: '1.1.1.1', name: 'Cloudflare (美国)', location: '美国' },
      { host: '208.67.222.222', name: 'OpenDNS (美国)', location: '美国' }
    ]
  },
  europe: {
    name: '欧洲', 
    nodes: [
      { host: '9.9.9.9', name: 'Quad9 (欧洲)', location: '欧洲' },
      { host: '185.228.168.9', name: 'CleanBrowsing (欧洲)', location: '欧洲' }
    ]
  },
  asia: {
    name: '亚洲',
    nodes: [
      { host: '209.244.0.3', name: 'Level3 (亚洲)', location: '亚太' },
      { host: '199.85.126.10', name: 'Norton DNS (亚洲)', location: '亚太' }
    ]
  }
};

// 获取国际互连 - 真实数据
async function getGlobalInfo() {
  const results = {};
  
  for (const [region, config] of Object.entries(GLOBAL_NODES)) {
    const latencies = [];
    
    for (const node of config.nodes) {
      const pingResult = await pingNode(node.host, 3);
      if (pingResult) {
        latencies.push({
          name: node.name,
          location: node.location,
          avg: pingResult.avg,
          min: pingResult.min,
          max: pingResult.max
        });
      }
    }
    
    if (latencies.length > 0) {
      const avgLatency = latencies.reduce((sum, l) => sum + l.avg, 0) / latencies.length;
      const minLatency = Math.min(...latencies.map(l => l.min));
      const maxLatency = Math.max(...latencies.map(l => l.max));
      
      results[region] = {
        name: config.name,
        avgLatency: avgLatency.toFixed(1),
        minLatency: minLatency.toFixed(1),
        maxLatency: maxLatency.toFixed(1),
        nodes: latencies,
        reachable: latencies.length,
        total: config.nodes.length
      };
    } else {
      results[region] = {
        name: config.name,
        avgLatency: null,
        reachable: 0,
        total: config.nodes.length
      };
    }
  }
  
  return results;
}

// 生成测试文件用于客户端测速
app.get('/speedtest/:size', (req, res) => {
  const size = parseInt(req.params.size) || 10; // 默认10MB
  const buffer = Buffer.alloc(size * 1024 * 1024, 'x');
  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Length', buffer.length);
  res.send(buffer);
});

// 测试网站访问情况
app.get('/test-websites', async (req, res) => {
  const websites = [
    { name: '百度', url: 'https://www.baidu.com', type: '国内' },
    { name: '淘宝', url: 'https://www.taobao.com', type: '国内' },
    { name: '京东', url: 'https://www.jd.com', type: '国内' },
    { name: '谷歌', url: 'https://www.google.com', type: '国际' },
    { name: 'YouTube', url: 'https://www.youtube.com', type: '国际' },
    { name: 'Facebook', url: 'https://www.facebook.com', type: '国际' }
  ];
  
  const results = [];
  
  for (const website of websites) {
    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(website.url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow'
      });
      
      clearTimeout(timeoutId);
      const endTime = Date.now();
      const status = response.ok ? '可访问' : '不可访问';
      const delay = (endTime - startTime).toFixed(2);
      
      results.push({
        name: website.name,
        url: website.url,
        type: website.type,
        status,
        delay
      });
    } catch (error) {
      results.push({
        name: website.name,
        url: website.url,
        type: website.type,
        status: '不可访问',
        delay: '超时'
      });
    }
  }
  
  res.json(results);
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});
