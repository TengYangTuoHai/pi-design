# 截图和 GIF 生成指南

由于环境限制，我为你准备了详细的截图生成指南。

## 📸 方式 1：手动截图（推荐，最简单）

### 登录页面示例截图

1. **在浏览器中打开原型**
   ```bash
   open examples/01-login-page/.design/prototype/screens/login.html
   ```

2. **调整浏览器窗口尺寸并截图**

   **桌面视图** (1280x800)
   - 调整浏览器窗口到 1280x800
   - 按 `Cmd+Shift+4` (macOS) 或 `Win+Shift+S` (Windows)
   - 截图并保存为：`assets/screenshots/login-desktop.png`

   **平板视图** (768x1024)
   - 打开开发者工具 (F12)
   - 点击设备工具栏图标（或按 `Cmd+Shift+M`）
   - 选择 "iPad Mini" 或自定义 768x1024
   - 截图保存为：`assets/screenshots/login-tablet.png`

   **手机视图** (390x844)
   - 在开发者工具中选择 "iPhone 14"
   - 或自定义 390x844
   - 截图保存为：`assets/screenshots/login-mobile.png`

### 工作流程截图

拍摄这些关键步骤：

1. **命令启动** - 在终端输入 `/design` 命令
   保存为：`assets/screenshots/workflow-01-command.png`

2. **模型工作** - 显示 PLAN → BUILD → SELF-REVIEW 进度
   保存为：`assets/screenshots/workflow-02-building.png`

3. **审核页面** - 浏览器中的审核界面
   保存为：`assets/screenshots/workflow-03-review.png`

4. **实现完成** - 最终的代码实现
   保存为：`assets/screenshots/workflow-04-implement.png`

---

## 🎬 方式 2：录制 GIF

### 工具推荐

**macOS:**
```bash
brew install kap
# 或下载：https://getkap.co/
```

**Windows:**
```bash
# ScreenToGif: https://www.screentogif.com/
```

**跨平台:**
```bash
# LICEcap: https://www.cockos.com/licecap/
```

### 录制步骤

#### GIF 1: 登录页动画 (5-10 秒)
```bash
# 1. 打开原型
open examples/01-login-page/.design/prototype/screens/login.html

# 2. 开始录制（Kap: Cmd+Shift+5）
# 3. 刷新页面以触发入场动画
# 4. 录制 5 秒
# 5. 保存为：assets/gifs/login-animation.gif
```

**优化设置：**
- 帧率：15-20 FPS
- 尺寸：800x600 左右
- 循环：是

#### GIF 2: 工作流演示 (30-45 秒)
```bash
# 1. 准备终端和浏览器窗口
# 2. 开始录制
# 3. 输入：/design 一个简约登录页面
# 4. 展示模型构建过程（可加速）
# 5. 展示审核页面打开
# 6. 点击"通过"按钮
# 7. 展示实现完成
# 8. 保存为：assets/gifs/workflow-demo.gif
```

#### GIF 3: 审核页面功能 (15-20 秒)
```bash
# 展示：
# - 视口切换 (1-4 键)
# - 缩放功能
# - 动画重播
# - 慢动作播放
# 保存为：assets/gifs/review-page-features.gif
```

---

## 🚀 方式 3：自动化脚本（需要解决权限）

如果需要自动化，先解决 npm 权限问题：

```bash
# 修复 npm 缓存权限
sudo chown -R $(whoami) ~/.npm

# 安装依赖
npm install

# 使用项目自带的截图工具
cd examples/01-login-page
node ../../dsh/cli.mjs render screens/login.html
```

或使用 Playwright：

```bash
npm install -D playwright
npx playwright install chromium

# 使用下面的脚本
node scripts/generate-screenshots-playwright.mjs
```

---

## 📐 推荐尺寸

### 截图
- **登录页 - 桌面**: 1280x800 @ 2x = 2560x1600
- **登录页 - 平板**: 768x1024 @ 2x = 1536x2048
- **登录页 - 手机**: 390x844 @ 2x = 780x1688
- **工作流**: 1200x800 左右

### GIF
- **最大宽度**: 800-1000px
- **帧率**: 15-20 FPS（流畅度与文件大小平衡）
- **时长**: 5-45 秒
- **文件大小**: < 5MB（GitHub README 友好）

---

## 🎨 后期优化

### 优化截图
```bash
# 使用 ImageOptim (macOS)
brew install imageoptim-cli
imageoptim assets/screenshots/*.png

# 或使用 pngquant
brew install pngquant
pngquant assets/screenshots/*.png --ext .png --force
```

### 优化 GIF
```bash
# 使用 gifsicle
brew install gifsicle
gifsicle -O3 --colors 256 assets/gifs/input.gif -o assets/gifs/output.gif

# 或在线工具
# https://ezgif.com/optimize
```

---

## 📋 检查清单

完成后确保有这些文件：

```
assets/
├── screenshots/
│   ├── login-desktop.png      ✅ 桌面视图
│   ├── login-tablet.png       ✅ 平板视图
│   ├── login-mobile.png       ✅ 手机视图
│   ├── workflow-01-command.png
│   ├── workflow-02-building.png
│   ├── workflow-03-review.png
│   └── workflow-04-implement.png
└── gifs/
    ├── login-animation.gif    ✅ 登录动画
    ├── workflow-demo.gif      ✅ 完整工作流
    └── review-features.gif    ✅ 审核页功能
```

---

## 📝 使用截图

生成后，在 README 中这样使用：

```markdown
## 📸 实际效果

### 登录页面示例

<table>
  <tr>
    <td width="33%"><img src="assets/screenshots/login-mobile.png" alt="手机视图"/><br/>📱 手机 (390x844)</td>
    <td width="33%"><img src="assets/screenshots/login-tablet.png" alt="平板视图"/><br/>📱 平板 (768x1024)</td>
    <td width="33%"><img src="assets/screenshots/login-desktop.png" alt="桌面视图"/><br/>💻 桌面 (1280x800)</td>
  </tr>
</table>

### 工作流演示

![工作流程](assets/gifs/workflow-demo.gif)

### 审核页面功能

![审核功能](assets/gifs/review-features.gif)
```

---

## 🎯 下一步

1. ✅ 创建 `assets/screenshots/` 和 `assets/gifs/` 目录
2. 📸 按照上面的指南生成截图
3. 🎬 录制 GIF 演示
4. 🖼️ 优化图片大小
5. 📝 更新 README.md 嵌入图片
6. 🚀 提交并推送到 GitHub

---

需要帮助？
- 截图工具问题：查看操作系统的截图快捷键
- GIF 录制：使用推荐的工具
- 自动化脚本：先解决 npm 权限问题

完成后你的项目将会非常吸引人！✨
