const express = require('express');
const app = express();
const port = 5000;

// ==================== 安全配置 ====================

// 请求频率限制（内存存储，生产环境应使用 Redis）
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1分钟窗口
const RATE_LIMIT_MAX = 30; // 每分钟最多30次请求
const SPEEDTEST_RATE_LIMIT = 5; // 测速接口每分钟最多5次

function rateLimiter(maxRequests = RATE_LIMIT_MAX) {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${clientIP}:${req.path}`;
    const now = Date.now();
    
    const record = rateLimitStore.get(key) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    
    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + RATE_LIMIT_WINDOW;
    }
    
    record.count++;
    rateLimitStore.set(key, record);
    
    // 设置速率限制头
    res.set('X-RateLimit-Limit', maxRequests);
    res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    res.set('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
    
    if (record.count > maxRequests) {
      return res.status(429).json({
        error: '请求过于频繁，请稍后再试',
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }
    
    next();
  };
}

// 定期清理过期的速率限制记录
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore) {
    if (now > record.resetTime + RATE_LIMIT_WINDOW) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000);

// 安全响应头中间件
function securityHeaders(req, res, next) {
  // 防止点击劫持
  res.set('X-Frame-Options', 'DENY');
  
  // 防止 MIME 类型嗅探
  res.set('X-Content-Type-Options', 'nosniff');
  
  // XSS 保护
  res.set('X-XSS-Protection', '1; mode=block');
  
  // 引用策略
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // 权限策略
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // 内容安全策略（允许内联样式和脚本，因为使用了 EJS）
  res.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: http:",
    "connect-src 'self' https://api.ipify.org https://dns.google https://cloudflare-dns.com https://dns.alidns.com https://doh.pub https://www.baidu.com https://www.taobao.com https://www.jd.com https://www.bilibili.com https://www.google.com https://www.youtube.com https://github.com https://twitter.com https://www.wikipedia.org",
    "frame-ancestors 'none'"
  ].join('; '));
  
  next();
}

// 请求体验证中间件
function validateBody(req, res, next) {
  // 只对有 body 的请求进行验证
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }
  
  // 检查 Content-Type
  const contentType = req.get('Content-Type');
  if (contentType && !contentType.includes('application/json')) {
    return res.status(415).json({ error: '不支持的 Content-Type' });
  }
  
  // 检查 body 大小（防止大 payload 攻击）
  const contentLength = parseInt(req.get('Content-Length') || '0');
  if (contentLength > 1024 * 10) { // 限制 10KB
    return res.status(413).json({ error: '请求体过大' });
  }
  
  next();
}

// 全局错误处理
function errorHandler(err, req, res, next) {
  console.error('服务器错误:', err);
  
  // 不要暴露内部错误细节
  const message = process.env.NODE_ENV === 'production' 
    ? '服务器内部错误' 
    : err.message;
  
  res.status(err.status || 500).json({
    error: message,
    timestamp: new Date().toISOString()
  });
}

// ==================== 应用配置 ====================

app.set('view engine', 'ejs');
app.set('trust proxy', 1); // 信任代理

// 应用安全中间件
app.use(securityHeaders);
app.use(express.static('public', {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(validateBody);

// ==================== 路由 ====================

// 主页路由
app.get('/', rateLimiter(60), (req, res) => {
  res.render('index', { 
    title: '网络质量检测',
    nonce: require('crypto').randomBytes(16).toString('base64')
  });
});

// 健康检查接口
app.get('/health', rateLimiter(120), (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 生成测试文件用于客户端测速
app.get('/speedtest/:size', rateLimiter(SPEEDTEST_RATE_LIMIT), (req, res) => {
  // 输入验证
  const sizeParam = req.params.size;
  const size = parseFloat(sizeParam);
  
  // 验证参数格式
  if (isNaN(size) || size < 0.01 || size > 50) {
    return res.status(400).json({
      error: '无效的文件大小参数',
      hint: '大小范围: 0.01 - 50 MB'
    });
  }
  
  // 防止路径遍历攻击
  if (typeof sizeParam !== 'string' || !/^\d+\.?\d*$/.test(sizeParam)) {
    return res.status(400).json({ error: '参数格式错误' });
  }
  
  // 限制最大文件大小
  const safeSize = Math.min(Math.max(size, 0.01), 50);
  const bytes = Math.floor(safeSize * 1024 * 1024);
  
  // 检查内存是否足够
  const maxBuffer = 100 * 1024 * 1024; // 100MB 上限
  if (bytes > maxBuffer) {
    return res.status(400).json({ error: '请求的文件过大' });
  }
  
  try {
    const buffer = Buffer.alloc(bytes, 'x');
    
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Length', buffer.length);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Content-Disposition', 'attachment; filename="speedtest.bin"');
    
    res.send(buffer);
  } catch (error) {
    console.error('测速文件生成失败:', error);
    res.status(500).json({ error: '生成测试文件失败' });
  }
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    error: '资源不存在',
    path: req.path
  });
});

// 全局错误处理
app.use(errorHandler);

// ==================== 启动服务 ====================

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log('安全措施已启用: 速率限制、安全头、输入验证');
});
