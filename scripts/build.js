const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG = {
  src: {
    css: 'public/css',
    js: 'public/js'
  },
  dist: {
    css: 'public/dist/css',
    js: 'public/dist/js'
  }
};

// 检查是否安装了压缩工具
function checkTool(command) {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 压缩 CSS
function minifyCSS(srcFile, distFile) {
  const cssnanoAvailable = checkTool('cssnano');
  const cssoAvailable = checkTool('csso');

  if (cssnanoAvailable) {
    try {
      execSync(`cssnano ${srcFile} ${distFile}`, { stdio: 'pipe' });
      console.log(`✓ CSS 压缩成功: ${srcFile} -> ${distFile}`);
      return true;
    } catch (err) {
      console.warn(`  cssnano 失败，使用简单压缩: ${err.message}`);
    }
  }

  if (cssoAvailable) {
    try {
      execSync(`csso ${srcFile} -o ${distFile}`, { stdio: 'pipe' });
      console.log(`✓ CSS 压缩成功: ${srcFile} -> ${distFile}`);
      return true;
    } catch (err) {
      console.warn(`  csso 失败，使用简单压缩: ${err.message}`);
    }
  }

  // 简单压缩：移除空白和注释
  try {
    const content = fs.readFileSync(srcFile, 'utf8');
    const minified = content
      .replace(/\/\*[\s\S]*?\*\//g, '') // 移除注释
      .replace(/\s+/g, ' ')             // 多个空白合并为一个
      .replace(/\s*([{}:;,])\s*/g, '$1') // 移除符号周围的空白
      .trim();

    fs.writeFileSync(distFile, minified, 'utf8');
    console.log(`✓ CSS 简单压缩成功: ${srcFile} -> ${distFile}`);
    return true;
  } catch (err) {
    console.error(`✗ CSS 压缩失败: ${err.message}`);
    return false;
  }
}

// 压缩 JS
function minifyJS(srcFile, distFile) {
  const terserAvailable = checkTool('terser');
  const uglifyjsAvailable = checkTool('uglifyjs');

  if (terserAvailable) {
    try {
      execSync(`terser ${srcFile} -c -m -o ${distFile}`, { stdio: 'pipe' });
      console.log(`✓ JS 压缩成功: ${srcFile} -> ${distFile}`);
      return true;
    } catch (err) {
      console.warn(`  terser 失败，使用简单压缩: ${err.message}`);
    }
  }

  if (uglifyjsAvailable) {
    try {
      execSync(`uglifyjs ${srcFile} -c -m -o ${distFile}`, { stdio: 'pipe' });
      console.log(`✓ JS 压缩成功: ${srcFile} -> ${distFile}`);
      return true;
    } catch (err) {
      console.warn(`  uglifyjs 失败，使用简单压缩: ${err.message}`);
    }
  }

  // 简单压缩：移除注释和多余空白
  try {
    const content = fs.readFileSync(srcFile, 'utf8');
    const minified = content
      .replace(/\/\/.*$/gm, '')               // 移除单行注释
      .replace(/\/\*[\s\S]*?\*\//g, '')      // 移除多行注释
      .replace(/^\s*[\r\n]/gm, '')           // 移除空行
      .replace(/\s+/g, ' ')                  // 多个空白合并为一个
      .replace(/\s*([{}();,:=+\-*/])\s*/g, '$1') // 移除符号周围的空白
      .trim();

    fs.writeFileSync(distFile, minified, 'utf8');
    console.log(`✓ JS 简单压缩成功: ${srcFile} -> ${distFile}`);
    return true;
  } catch (err) {
    console.error(`✗ JS 压缩失败: ${err.message}`);
    return false;
  }
}

// 获取文件大小（格式化）
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const bytes = stats.size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  } catch {
    return 'N/A';
  }
}

// 计算压缩率
function calculateCompressionRatio(srcSize, distSize) {
  if (!srcSize || !distSize || srcSize === 0) return 0;
  return ((srcSize - distSize) / srcSize * 100).toFixed(1);
}

// 主构建函数
function build(type = 'all') {
  console.log('\n🚀 开始构建...\n');

  const buildCSS = type === 'all' || type === '--css';
  const buildJS = type === 'all' || type === '--js';

  let cssSuccess = false;
  let jsSuccess = false;

  // 构建 CSS
  if (buildCSS) {
    console.log('📦 构建 CSS...');
    ensureDir(CONFIG.dist.css);

    const cssSrc = path.join(CONFIG.src.css, 'styles.css');
    const cssDist = path.join(CONFIG.dist.css, 'styles.min.css');

    if (fs.existsSync(cssSrc)) {
      cssSuccess = minifyCSS(cssSrc, cssDist);

      if (cssSuccess) {
        const srcSize = fs.statSync(cssSrc).size;
        const distSize = fs.statSync(cssDist).size;
        const ratio = calculateCompressionRatio(srcSize, distSize);

        console.log(`  原始大小: ${getFileSize(cssSrc)}`);
        console.log(`  压缩后: ${getFileSize(cssDist)}`);
        console.log(`  压缩率: ${ratio}%\n`);
      }
    } else {
      console.warn(`  源文件不存在: ${cssSrc}\n`);
    }
  }

  // 构建 JS
  if (buildJS) {
    console.log('📦 构建 JavaScript...');
    ensureDir(CONFIG.dist.js);

    const jsSrc = path.join(CONFIG.src.js, 'app.js');
    const jsDist = path.join(CONFIG.dist.js, 'app.min.js');

    if (fs.existsSync(jsSrc)) {
      jsSuccess = minifyJS(jsSrc, jsDist);

      if (jsSuccess) {
        const srcSize = fs.statSync(jsSrc).size;
        const distSize = fs.statSync(jsDist).size;
        const ratio = calculateCompressionRatio(srcSize, distSize);

        console.log(`  原始大小: ${getFileSize(jsSrc)}`);
        console.log(`  压缩后: ${getFileSize(jsDist)}`);
        console.log(`  压缩率: ${ratio}%\n`);
      }
    } else {
      console.warn(`  源文件不存在: ${jsSrc}\n`);
    }
  }

  // 构建结果
  console.log('='.repeat(50));

  if (buildCSS && cssSuccess && buildJS && jsSuccess) {
    console.log('✅ 构建成功！');
    console.log('\n提示：在生产环境中，请使用以下方式引入压缩后的文件：');
    console.log('  CSS: <link rel="stylesheet" href="/dist/css/styles.min.css">');
    console.log('  JS:  <script src="/dist/js/app.min.js" defer></script>');
  } else if (buildCSS && cssSuccess) {
    console.log('✅ CSS 构建成功！');
  } else if (buildJS && jsSuccess) {
    console.log('✅ JavaScript 构建成功！');
  } else {
    console.log('⚠️  构建部分完成，请检查错误信息');
  }

  console.log('\n提示：安装专业的压缩工具以获得更好的压缩效果：');
  console.log('  npm install -g cssnano csso terser uglify-js');

  process.exit((buildCSS && cssSuccess && buildJS && jsSuccess) || (buildCSS && cssSuccess) || (buildJS && jsSuccess) ? 0 : 1);
}

// 解析命令行参数
const args = process.argv.slice(2);
const type = args[0] || 'all';

if (['--css', '--js', 'all'].includes(type)) {
  build(type);
} else {
  console.log('用法: node scripts/build.js [--css|--js|all]');
  console.log('  --css: 仅压缩 CSS');
  console.log('  --js:  仅压缩 JavaScript');
  console.log('  all:   压缩所有文件（默认）');
  process.exit(1);
}
