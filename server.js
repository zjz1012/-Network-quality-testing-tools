const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

// ==================== 常量定义 ====================
const CONFIG = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  RATE_LIMIT: {
    WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX) || 30,
    SPEEDTEST_LIMIT: parseInt(process.env.SPEEDTEST_RATE_LIMIT) || 5,
    CLEANUP_INTERVAL: 60000,
    STORE_MAX_SIZE: 10000
  },
  SPEEDTEST: {
    MIN_SIZE: 0.01,
    MAX_SIZE: 50,
    CHUNK_SIZE: 64 * 1024, // 64KB
    NEEDLE_LENGTH: 55,
    MAX_SPEEDOMETER_SPEED: 200,
    ARC_TOTAL_LENGTH: 251.2
  },
  LOG: {
    DIR: process.env.LOG_DIR || path.join(__dirname, 'logs'),
    MAX_SIZE: 10 * 1024 * 1024, // 10MB
    ERROR_FILE: 'error.log',
    MAX_LOG_FILES: 5
  }
};

// ==================== 错误日志系统 ====================
const Logger = {
  errorFile: null,

  init() {
    try {
      if (!fs.existsSync(CONFIG.LOG.DIR)) {
        fs.mkdirSync(CONFIG.LOG.DIR, { recursive: true });
      }
      this.errorFile = path.join(CONFIG.LOG.DIR, CONFIG.LOG.ERROR_FILE);
    } catch (err) {
      console.error('初始化日志系统失败:', err.message);
    }
  },

  formatMessage(level, context, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] [${context}] ${message}${metaStr}\n`;
  },

  error(context, error, meta = {}) {
    const message = error?.message || String(error);
    const stack = error?.stack || '';

    const logMessage = this.formatMessage('ERROR', context, message, meta);
    const stackMessage = stack ? `${logMessage}\nStack trace:\n${stack}\n${'='.repeat(80)}\n` : logMessage;

    // 输出到控制台
    console.error(stackMessage);

    // 写入文件（仅错误级别）
    if (this.errorFile) {
      try {
        this.rotateLogIfNeeded();
        fs.appendFileSync(this.errorFile, stackMessage, 'utf8');
      } catch (err) {
        console.error('写入日志文件失败:', err.message);
      }
    }
  },

  warn(context, message, meta = {}) {
    const logMessage = this.formatMessage('WARN', context, message, meta);
    console.warn(logMessage);
  },

  info(context, message, meta = {}) {
    const logMessage = this.formatMessage('INFO', context, message, meta);
    if (CONFIG.NODE_ENV === 'development') {
      console.info(logMessage);
    }
  },

  rotateLogIfNeeded() {
    try {
      if (fs.existsSync(this.errorFile)) {
        const stats = fs.statSync(this.errorFile);
        if (stats.size > CONFIG.LOG.MAX_SIZE) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const archiveName = `${this.errorFile}.${timestamp}`;
          fs.renameSync(this.errorFile, archiveName);

          // 清理旧日志文件
          this.cleanOldLogs();
        }
      }
    } catch (err) {
      console.error('日志轮转失败:', err.message);
    }
  },

  cleanOldLogs() {
    try {
      const files = fs.readdirSync(CONFIG.LOG.DIR)
        .filter(f => f.startsWith(CONFIG.LOG.ERROR_FILE) && f !== CONFIG.LOG.ERROR_FILE)
        .map(f => ({
          name: f,
          path: path.join(CONFIG.LOG.DIR, f),
          time: fs.statSync(path.join(CONFIG.LOG.DIR, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time)
        .slice(CONFIG.LOG.MAX_LOG_FILES);

      for (const file of files) {
        fs.unlinkSync(file.path);
      }
    } catch (err) {
      console.error('清理旧日志失败:', err.message);
    }
  }
};

// 初始化日志系统
Logger.init();

// ==================== 安全配置 ====================

// 请求频率限制（内存存储，生产环境应使用 Redis）
const rateLimitStore = new Map();

function rateLimiter(maxRequests = CONFIG.RATE_LIMIT.MAX_REQUESTS) {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${clientIP}:${req.path}`;
    const now = Date.now();

    const record = rateLimitStore.get(key) || { count: 0, resetTime: now + CONFIG.RATE_LIMIT.WINDOW };

    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + CONFIG.RATE_LIMIT.WINDOW;
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

// 定期清理过期的速率限制记录（使用批量删除优化性能）
setInterval(() => {
  const now = Date.now();
  const keysToDelete = [];

  // 第一步：收集所有过期的键
  for (const [key, record] of rateLimitStore) {
    if (now > record.resetTime + CONFIG.RATE_LIMIT.WINDOW) {
      keysToDelete.push(key);
    }
  }

  // 第二步：批量删除，减少 Map 重哈希次数
  for (const key of keysToDelete) {
    rateLimitStore.delete(key);
  }

  // 可选：如果 Map 过大，强制重建以优化性能
  if (rateLimitStore.size > CONFIG.RATE_LIMIT.STORE_MAX_SIZE) {
    Logger.warn('RateLimit', `速率限制记录过多 (${rateLimitStore.size})，触发重建优化`);
    const newStore = new Map(rateLimitStore);
    rateLimitStore.clear();
    for (const [key, value] of newStore) {
      rateLimitStore.set(key, value);
    }
  }
}, CONFIG.RATE_LIMIT.CLEANUP_INTERVAL);

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
  Logger.error('ServerError', err, {
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  // 不要暴露内部错误细节
  const message = CONFIG.NODE_ENV === 'production'
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

// 生成测试文件用于客户端测速（使用流式传输，避免大内存占用）
app.get('/speedtest/:size', rateLimiter(CONFIG.RATE_LIMIT.SPEEDTEST_LIMIT), (req, res) => {
  // 输入验证
  const sizeParam = req.params.size;
  const size = parseFloat(sizeParam);

  // 验证参数格式
  if (isNaN(size) || size < CONFIG.SPEEDTEST.MIN_SIZE || size > CONFIG.SPEEDTEST.MAX_SIZE) {
    return res.status(400).json({
      error: '无效的文件大小参数',
      hint: `大小范围: ${CONFIG.SPEEDTEST.MIN_SIZE} - ${CONFIG.SPEEDTEST.MAX_SIZE} MB`
    });
  }

  // 防止路径遍历攻击
  if (typeof sizeParam !== 'string' || !/^\d+\.?\d*$/.test(sizeParam)) {
    return res.status(400).json({ error: '参数格式错误' });
  }

  // 限制最大文件大小
  const safeSize = Math.min(Math.max(size, CONFIG.SPEEDTEST.MIN_SIZE), CONFIG.SPEEDTEST.MAX_SIZE);
  const bytes = Math.floor(safeSize * 1024 * 1024);

  // 检查请求的文件大小是否合理
  const maxBuffer = 100 * 1024 * 1024;
  if (bytes > maxBuffer) {
    return res.status(400).json({ error: '请求的文件过大' });
  }

  try {
    // 设置响应头
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Length', bytes);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Content-Disposition', 'attachment; filename="speedtest.bin"');

    // 使用流式传输，避免一次性分配大内存
    const CHUNK_SIZE = CONFIG.SPEEDTEST.CHUNK_SIZE;
    const totalChunks = Math.ceil(bytes / CHUNK_SIZE);
    let sentChunks = 0;

    // 创建一个缓冲区并重复使用
    const chunkBuffer = Buffer.alloc(CHUNK_SIZE, 'x');

    // 流式发送数据
    function sendChunk() {
      if (sentChunks >= totalChunks) {
        res.end();
        return;
      }

      // 发送数据块
      const remainingBytes = bytes - (sentChunks * CHUNK_SIZE);
      const chunkToSend = remainingBytes < CHUNK_SIZE
        ? chunkBuffer.subarray(0, remainingBytes)
        : chunkBuffer;

      const canWrite = res.write(chunkToSend);

      sentChunks++;

      if (!canWrite) {
        // 如果缓冲区已满，等待 drain 事件
        res.once('drain', sendChunk);
      } else {
        // 使用 setImmediate 让出 CPU，避免阻塞事件循环
        setImmediate(sendChunk);
      }
    }

    // 开始流式传输
    sendChunk();

  } catch (error) {
    Logger.error('Speedtest', error, { size: safeSize });
    if (!res.headersSent) {
      res.status(500).json({ error: '生成测试文件失败' });
    }
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

app.listen(CONFIG.PORT, () => {
  console.log(`服务器运行在 http://localhost:${CONFIG.PORT}`);
  console.log(`环境: ${CONFIG.NODE_ENV}`);
  console.log('安全措施已启用: 速率限制、安全头、输入验证');
  Logger.info('Server', `服务器启动成功，端口 ${CONFIG.PORT}`);
});
