# Screenshots & Visual Assets

这个目录包含 pi-design 项目的截图和视觉资源。

## 📁 目录结构

```
assets/
├── screenshots/          # 静态截图
│   ├── login-desktop-placeholder.svg    ✅ 桌面视图占位图
│   ├── login-tablet-placeholder.svg     ✅ 平板视图占位图
│   ├── login-mobile-placeholder.svg     ✅ 手机视图占位图
│   ├── login-desktop.png                🔜 实际桌面截图
│   ├── login-tablet.png                 🔜 实际平板截图
│   ├── login-mobile.png                 🔜 实际手机截图
│   ├── workflow-01-command.png          🔜 工作流步骤1
│   ├── workflow-02-building.png         🔜 工作流步骤2
│   ├── workflow-03-review.png           🔜 工作流步骤3
│   └── workflow-04-implement.png        🔜 工作流步骤4
└── gifs/                 # 动态演示
    ├── login-animation.gif              🔜 登录页动画
    ├── workflow-demo.gif                🔜 完整工作流
    └── review-features.gif              🔜 审核页功能

```

## 🎯 当前状态

- ✅ **占位图已创建** - SVG 格式，展示基本布局
- 🔜 **实际截图待生成** - 需要手动截图或使用自动化工具

## 📸 如何生成实际截图

查看详细指南：[docs/SCREENSHOT_GUIDE.md](../docs/SCREENSHOT_GUIDE.md)

### 快速开始

1. **打开示例页面**
   ```bash
   open examples/01-login-page/.design/prototype/screens/login.html
   ```

2. **按照指南截图**
   - 桌面: 1280x800
   - 平板: 768x1024
   - 手机: 390x844

3. **保存到此目录**
   ```
   assets/screenshots/login-{desktop|tablet|mobile}.png
   ```

## 🔧 自动化工具

### 方式 1: 使用项目 CLI（推荐）
```bash
cd examples/01-login-page
node ../../dsh/cli.mjs render screens/login.html --viewport 1280x800
```

### 方式 2: 使用 Playwright
```bash
npm install -D playwright
npx playwright install chromium
node scripts/generate-screenshots-playwright.mjs
```

### 方式 3: 手动截图
参考 [SCREENSHOT_GUIDE.md](../docs/SCREENSHOT_GUIDE.md) 的详细步骤

## 📐 规格要求

### 截图
- **格式**: PNG
- **分辨率**: 2x (Retina)
- **压缩**: 优化后 < 500KB

### GIF
- **格式**: GIF
- **帧率**: 15-20 FPS
- **时长**: 5-45 秒
- **文件大小**: < 5MB

## 🎨 使用示例

在 README.md 中使用：

```markdown
## 📸 示例效果

<table>
  <tr>
    <td><img src="assets/screenshots/login-mobile-placeholder.svg" width="200"/></td>
    <td><img src="assets/screenshots/login-tablet-placeholder.svg" width="300"/></td>
    <td><img src="assets/screenshots/login-desktop-placeholder.svg" width="400"/></td>
  </tr>
  <tr>
    <td align="center">📱 手机</td>
    <td align="center">📱 平板</td>
    <td align="center">💻 桌面</td>
  </tr>
</table>
```

## 🔄 更新流程

1. 生成新截图
2. 优化文件大小
3. 替换占位图
4. 更新 README
5. 提交到 Git

---

**注意**: 占位图（`.svg` 文件）仅用于展示布局，实际截图（`.png` 文件）会提供更好的视觉效果。
