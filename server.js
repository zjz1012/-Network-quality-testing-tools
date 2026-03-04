const express = require('express');
const { exec } = require('child_process');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();
const port = process.env.PORT || 5000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 主页路由
app.get('/', (req, res) => {
  res.render('index', { title: '网络质量检测' });
});

// 执行网络质量检测
app.post('/check', async (req, res) => {
  try {
    // 获取客户端 IP 地址（优先使用客户端发送的 IP）
    let clientIP = req.body.clientIP || req.ip || req.connection.remoteAddress;
    
    // 1. 获取本地状态信息
    const localInfo = await getLocalInfo();
    
    // 2. 获取三网延迟
    const delayInfo = await getDelayInfo(clientIP);
    
    // 5. 获取回程路由
    const routeInfo = await getRouteInfo(clientIP);
    
    // 6. 国内测速在客户端执行
    const speedtestInfo = { clientTest: true };
    
    // 7. 获取国际互连
    const globalInfo = await getGlobalInfo();
    
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

// 获取 BGP 信息
async function getBgpInfo(ip) {
  try {
    const response = await fetch(`https://bgp.tools/prefix/${ip}`);
    const html = await response.text();
    
    // 解析 HTML 获取 BGP 信息
    // 这里需要实现 HTML 解析逻辑
    
    return {
      asn: 'AS12345',
      org: '测试组织',
      country: '中国',
      prefix: '192.168.1.0/24'
    };
  } catch (error) {
    console.error('获取 BGP 信息失败:', error);
    return { error: '获取 BGP 信息失败' };
  }
}

// 获取本地状态信息
async function getLocalInfo() {
  try {
    // 这里可以通过执行系统命令获取本地网络状态
    return {
      natType: 'Full Cone',
      tcpCongestion: 'cubic',
      queueDiscipline: 'fq_codel',
      tcpReceiveBuffer: '4096 87380 6291456',
      tcpSendBuffer: '4096 16384 4194304'
    };
  } catch (error) {
    console.error('获取本地状态信息失败:', error);
    return { error: '获取本地状态信息失败' };
  }
}

// 获取连通性信息
async function getConnectivityInfo(ip) {
  try {
    // 实现连通性检测逻辑
    return {
      ixCount: 5,
      upstreamCount: 2,
      peerCount: 10
    };
  } catch (error) {
    console.error('获取连通性信息失败:', error);
    return { error: '获取连通性信息失败' };
  }
}

// 获取三网延迟
async function getDelayInfo(ip) {
  try {
    // 实现三网延迟检测逻辑
    return {
      telecom: {
        beijing: 50,
        shanghai: 40,
        guangzhou: 30
      },
      unicom: {
        beijing: 55,
        shanghai: 45,
        guangzhou: 35
      },
      mobile: {
        beijing: 60,
        shanghai: 50,
        guangzhou: 40
      }
    };
  } catch (error) {
    console.error('获取三网延迟失败:', error);
    return { error: '获取三网延迟失败' };
  }
}

// 获取回程路由
async function getRouteInfo(ip) {
  try {
    // 实现回程路由检测逻辑
    return {
      telecom: {
        beijing: 'AS12345 -> AS4134',
        shanghai: 'AS12345 -> AS4134',
        guangzhou: 'AS12345 -> AS4134'
      },
      unicom: {
        beijing: 'AS12345 -> AS4837',
        shanghai: 'AS12345 -> AS4837',
        guangzhou: 'AS12345 -> AS4837'
      },
      mobile: {
        beijing: 'AS12345 -> AS9808',
        shanghai: 'AS12345 -> AS9808',
        guangzhou: 'AS12345 -> AS9808'
      }
    };
  } catch (error) {
    console.error('获取回程路由失败:', error);
    return { error: '获取回程路由失败' };
  }
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
      const response = await fetch(website.url, {
        method: 'HEAD',
        timeout: 10000,
        redirect: 'follow'
      });
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
        delay: '未知'
      });
    }
  }
  
  res.json(results);
});

// 获取国际互连
async function getGlobalInfo() {
  try {
    // 实现国际互连检测逻辑
    return {
      northAmerica: {
        upload: 20,
        download: 40,
        ping: 150
      },
      europe: {
        upload: 15,
        download: 30,
        ping: 200
      },
      asia: {
        upload: 30,
        download: 60,
        ping: 80
      }
    };
  } catch (error) {
    console.error('获取国际互连失败:', error);
    return { error: '获取国际互连失败' };
  }
}

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});
