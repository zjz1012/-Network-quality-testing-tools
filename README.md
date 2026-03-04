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
- **零依赖图表** - 纯 SVG 实现，无需外部库
- **速度仪表盘** - 动态仪表盘展示下载速度（最大 2500 Mbps）
- **延迟波动图** - 实时绘制延迟曲线
- **DNS 对比柱状图** - 四大 DNS 横向对比
- **历史趋势图** - localStorage 存储历史记录，支持近7次/14次/全部
- **响应式缩放** - 所有图表自适应屏幕尺寸

### 🛡️ 安全特性
- 速率限制（60次/分钟）
- 安全响应头（X-Frame-Options, CSP 等）
- XSS 防护（HTML 实体转义）
- URL 验证（只允许 http/https）
- 输入验证和超时控制

### 📱 响应式设计
- 支持桌面端、平板、手机
- 适配横屏模式
- 安全区域适配（刘海屏）
- 触摸优化
- 窗口大小变化自动重绘图表

### ⚡ 性能优化
- 流式传输大文件（内存占用降低 99.9%）
- 零外部依赖（所有图表本地化）
- 批量删除过期记录
- 静态资源压缩构建
- localStorage 降级方案（隐私模式支持）

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
│   └── index.ejs       # 主页面（HTML 结构）
├── public/
│   ├── css/
│   │   └── styles.css  # 样式文件
│   └── js/
│       └── app.js      # 前端逻辑
├── scripts/
│   └── build.js        # 构建脚本
├── logs/               # 日志目录（自动创建）
├── package.json        # 项目配置
├── .env.example        # 环境变量模板
└── README.md           # 说明文档
```

## 🔧 技术栈

| 类别 | 技术 |
|------|------|
| 后端 | Node.js, Express |
| 前端 | HTML, CSS, JavaScript (Vanilla) |
| 模板 | EJS |
| 图表 | 纯 SVG 实现（零依赖） |
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

### v1.1.0 (2026-03)
- 🎨 **重大更新：零依赖 SVG 图表**
  - 移除 Chart.js 依赖，使用纯 SVG 实现所有图表
  - 完全本地化，不再依赖外部 CDN
  - 加载速度更快，稳定性更高
- 📱 **响应式优化**
  - 所有图表支持自适应缩放
  - 添加窗口大小变化自动重绘
  - 优化移动端显示效果
- ⚡ **性能优化**
  - 大文件传输改用流式传输（内存占用降低 99.9%）
  - 速率限制优化（批量删除过期记录）
  - 移除无用依赖（child_process、node-fetch）
- 🏗️ **代码优化**
  - 前后端代码分离（CSS、JS 独立文件）
  - 统一配置管理（常量定义）
  - 环境变量支持（.env 配置）
  - 错误日志系统（日志轮转）
- 🎯 **功能改进**
  - 速度仪表盘最大值提升至 2500 Mbps
  - localStorage 降级方案（支持隐私模式）
  - 添加构建脚本（静态资源压缩）
  - 完善 .gitignore 配置
- 🛡️ **安全增强**
  - XSS 防护（HTML 实体转义）
  - URL 验证（只允许 http/https）
  - 输入验证和超时控制

### v1.0.0 (2026-02)
- 初始版本发布
- 客户端 IP、NAT 类型、速度、延迟检测
- DNS 解析测试
- 网站访问检测
- 数据可视化图表（Chart.js）
- 安全加固

## 📄 许可证

[MIT License](LICENSE)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

⭐ 如果这个项目对你有帮助，请给一个 Star！
