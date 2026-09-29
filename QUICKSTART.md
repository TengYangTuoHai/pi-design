# 快速开始 - 5 分钟上手 pi-design

从零到完整设计实现，只需 5 分钟。

## ⚡ 极速体验

### Pi 用户（推荐）

```bash
# 1. 安装扩展
pi install npm:pi-design

# 2. 在任意项目中使用
cd your-project

# 3. 一句话开始
/design 一个简约的登录页面：邮箱 + 密码 + 登录按钮

# 4. 等待模型工作...
# ✓ 规划屏幕
# ✓ 创建设计系统
# ✓ 构建原型
# ✓ 自我审查 3 轮
# ✓ 打开浏览器审核页面

# 5. 在浏览器中审核
# 点击 "通过" 或提供反馈

# 6. 自动实现到你的项目 ✨
```

### DSH 用户

```bash
# 1. 安装 CLI
npm install -g pi-design
pi-design install-skill

# 2. 在项目中使用
cd your-project

# 3. 开始设计
/design 一个简约的登录页面：邮箱 + 密码 + 登录按钮

# 4. 查看截图（模型会自动调用 read_image）
# 5. 审核时会自动打开浏览器
# 6. 在对话中说 "通过" 或提供反馈
```

## 📦 完整安装

### 系统要求

- **Node.js**: ≥ 18.0
- **浏览器**: Chrome、Edge 或 Safari（用于审核）
- **可选**: Playwright（自动安装，用于截图）

### Pi 扩展安装

```bash
# 从 npm 安装（推荐）
pi install npm:pi-design

# 或从 GitHub
pi install git:github.com/TengYangTuoHai/pi-design@v0.1.0

# 或本地开发
pi --extension ./extensions/index.ts
```

### DSH CLI 安装

```bash
# 全局安装
npm install -g pi-design

# 安装 DSH 技能
pi-design install-skill

# 验证安装
pi-design --version
```

### 验证安装

```bash
# 检查环境
pi-design debug

# 查看帮助
pi-design --help
```

## 🎯 你的第一个设计

### 场景 1：登录页面

```bash
/design 一个现代登录页面，包含：
- 邮箱和密码输入框
- "记住我"复选框
- "忘记密码"链接
- 主要登录按钮
- 使用蓝色作为主色调
```

**期望输出**：
- `.design/DESIGN.md` - 设计系统文档
- `.design/tokens.css` - CSS 变量
- `.design/prototype/screens/login.html` - 原型
- 实现到你的 React/SwiftUI/Web 项目

### 场景 2：仪表板

```bash
/design 一个数据仪表板，显示：
- 顶部导航栏
- 左侧边栏菜单
- 主区域包含 4 个统计卡片
- 一个折线图
- 一个数据表格
```

### 场景 3：单个组件

```bash
/design --scope component 一个主按钮组件：
- 三种尺寸：small、medium、large
- 三种状态：default、hover、disabled
- 支持图标和加载状态
```

## 🎨 工作流详解

```
你说 → /design <需求>
      ↓
   【BRIEF】模型分析需求
      ↓
   【PLAN】规划屏幕列表
      ↓
   【BUILD】创建 DESIGN.md + tokens.css + 原型页面
      ↓
   【SELF-REVIEW】截图 → 自我批评 → 优化（≤3 轮/屏幕）
      ↓
   【REVIEW】打开浏览器 → 你审核 → 通过/反馈
      ↓                           ↓
   【IMPLEMENT】              【BUILD】重新构建
      ↓
   【DONE】✨
```

## 🎮 审核页面操作

打开的审核页面支持：

### 键盘快捷键
- `A` - 通过
- `R` - 拒绝
- `/` - 聚焦反馈输入框
- `1`-`4` - 切换视口预设（375/390/768/1280）

### 视口预设
- 📱 375 - iPhone SE
- 📱 390 - iPhone 13/14
- 📱 768 - iPad 竖屏
- 💻 1280 - 桌面

### 动画控制
- ▶ 重播 - 所有屏幕重播动画
- ⏸ 暂停 - 暂停所有动画
- ½× / ¼× - 慢动作播放
- ↺ - 单个屏幕重播

### 其他功能
- 📸 - 查看自我审查截图对比
- ↗ - 全屏打开单个屏幕
- 🔍 - 缩放（25%-100%）

## 🎯 常见使用场景

### 快速原型验证

```bash
# 快速验证想法
/design 一个 todo 应用主界面

# 审核后不实现，只要原型
# 在审核页面选择 "拒绝" 并说 "只要原型，不需要实现"
```

### 设计迭代

```bash
# 第一版
/design 一个博客首页

# 审核时给反馈：
"颜色太亮了，改用深色主题，增加卡片阴影"

# 模型会重新构建并再次提交审核
```

### 组件库开发

```bash
# 一次一个组件
/design --scope component 一个卡片组件

# 通过后
/design --scope component 一个模态框组件

# 最后实现到统一的组件库项目
```

### 多端适配

```bash
# 先设计移动端
/design 一个新闻阅读应用（移动优先）

# 在 config.json 中配置多视口检查
# 模型会自动验证响应式布局
```

## 🔧 配置项目

创建 `.design/config.json`：

```json
{
  "target": "react",           // react | swiftui | web
  "viewport": {                // 主视口
    "width": 390,
    "height": 844
  },
  "viewports": [               // 额外检查视口（≤3）
    { "width": 768, "height": 1024 },
    { "width": 1280, "height": 800 }
  ]
}
```

或者让模型自动创建：

```bash
/design --target react --viewport 390x844 登录页面
```

## 🐛 故障排查

### 问题：截图失败

```bash
# 检查 Chrome 是否安装
which chrome
which google-chrome

# 或安装 Playwright 浏览器
npx playwright install chromium

# 设置自定义 Chrome 路径
export PI_DESIGN_CHROME=/path/to/chrome
```

### 问题：审核页面打开失败

```bash
# 检查端口是否被占用
lsof -i :3374

# 或使用自定义端口
export PI_DESIGN_PORT=8888
```

### 问题：DSH 无法查看截图

```bash
# 确保你的模型支持 read_image
# 或者在浏览器中手动打开 playground
pi-design playground
```

### 运行诊断

```bash
# 完整的健康检查
pi-design debug

# 查看详细日志
PI_DESIGN_DEBUG=1 /design 登录页面
```

## 📚 下一步

现在你已经掌握基础了！接下来：

### 1. 查看示例
浏览 [examples/](./examples/) 目录，查看真实的设计输出：
- [登录页面](./examples/01-login-page/) - 简单开始
- 仪表板（即将推出）- 复杂布局
- 组件库（即将推出）- 可复用组件

### 2. 深入学习
- [DESIGN.md 规范](./docs/design-md-spec.md) - 设计系统格式
- [动画指南](./docs/motion-guidelines.md) - 如何设计动画
- [实现指南](./docs/implement-react.md) - 目标技术栈实现细节

### 3. 高级用法
- [自定义模板](./docs/templates.md) - 创建可复用模板
- [集成 Figma](./docs/figma-integration.md) - 导入现有设计
- [CI/CD 集成](./docs/ci-integration.md) - 自动化视觉测试

### 4. 参与贡献
- [贡献指南](./CONTRIBUTING.md) - 如何参与开发
- [路线图](./ROADMAP.md) - 未来计划

## 💬 获取帮助

- **文档**: [完整 README](./README.md)
- **示例**: [examples/](./examples/)
- **问题**: [GitHub Issues](https://github.com/TengYangTuoHai/pi-design/issues)
- **讨论**: [GitHub Discussions](https://github.com/TengYangTuoHai/pi-design/discussions)

## 🎉 你准备好了！

现在开始你的第一个设计：

```bash
/design 创建一个漂亮的界面吧！
```

---

💡 **小提示**：设计需求越具体，结果越好。明确说明颜色、布局、组件等细节。
