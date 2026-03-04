const express = require('express');
const app = express();
const port = 5000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 主页路由
app.get('/', (req, res) => {
  res.render('index', { title: '网络质量检测' });
});

// 生成测试文件用于客户端测速
app.get('/speedtest/:size', (req, res) => {
  const size = parseFloat(req.params.size) || 10; // MB
  const bytes = size * 1024 * 1024;
  const buffer = Buffer.alloc(bytes, 'x');
  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Length', buffer.length);
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(buffer);
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});
