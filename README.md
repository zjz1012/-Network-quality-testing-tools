# 🌐 网络质量检测工具

一个现代化的网络质量检测 Web 应用，所有测试均在浏览器端完成，真实反映用户的网络状况。

![预览图](https://img.shields.io/badge/状态-可用-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-green)

## ✨ 功能特性

### 🔍 核心检测功能
- **公网 IP 获取** - 通过第三方 API 获取用户公网 IP
- **NAT 类型检测** - 使用 WebRTC STUN 检测 NAT 类型
- **下载速度测试** - 真实下载测速，移动端自适应
- **网络延迟测试** - 多次采样，展示抖动情况
- **DNS 解析测试** - 对比 Google/Cloudflare/阿里/腾讯 DNS
- **网站访问检测** - 检测常用网站可访问性

### 📊 数据可视化
- **速度仪表盘** - SVG 动态仪表盘展示下载速度
- **延迟波动图** - 实时绘制延迟曲线
- **DNS 对比柱状图** - 四大 DNS 横向对比
- **历史趋势图** - localStorage 存储历史记录

### 🛡️ 安全特性
- 速率限制（60次/分钟）
- 安全响应头（X-Frame-Options, CSP 等）
- XSS 防护
- URL 验证
- 输入验证

### 📱 响应式设计
- 支持桌面端、平板、手机
- 适配横屏模式
- 安全区域适配（刘海屏）
- 触摸优化

## 🚀 快速开始

### 环境要求
- Node.js >= 16.0.0
- pnpm（推荐）或 npm

### 安装依赖

```bash
pnpm install
# 或
npm install
```

### 开发模式

```bash
pnpm dev
# 或
npm run dev
```

访问 http://localhost:5000

### 生产模式

```bash
pnpm build
pnpm start
# 或
npm run build
npm run start
```

## 📁 项目结构

```
.
├── server.js           # Express 服务器
├── views/
│   └── index.ejs       # 主页面（含前端逻辑）
├── public/             # 静态资源
├── package.json        # 项目配置
└── README.md           # 说明文档
```

## 🔧 技术栈

| 类别 | 技术 |
|------|------|
| 后端 | Node.js, Express |
| 前端 | HTML, CSS, JavaScript (Vanilla) |
| 模板 | EJS |
| 图表 | Chart.js (CDN) |
| 样式 | 原生 CSS 变量 |

## 📊 API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/speedtest/:size` | GET | 下载测速文件（MB） |

## 🎨 主题配色

| 变量 | 颜色 | 用途 |
|------|------|------|
| `--bg-main` | #0f172a | 主背景 |
| `--bg-card` | #1e293b | 卡片背景 |
| `--primary` | #6366f1 | 主色调 |
| `--success` | #10b981 | 成功状态 |
| `--warning` | #f59e0b | 警告状态 |
| `--danger` | #ef4444 | 错误状态 |

## 🔒 安全说明

- 所有检测均在用户浏览器中完成
- 数据不会上传到服务器
- 不收集任何用户隐私信息
- 本地存储的历史数据可随时清除

## 📝 更新日志

### v1.0.0 (2024-03)
- 初始版本发布
- 客户端 IP、NAT 类型、速度、延迟检测
- DNS 解析测试
- 网站访问检测
- 数据可视化图表
- 安全加固

## 📄 许可证

[MIT License](LICENSE)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

⭐ 如果这个项目对你有帮助，请给一个 Star！
