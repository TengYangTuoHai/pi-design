# pi-design Examples

真实的设计示例，展示 pi-design 可以创建什么。每个示例都包含完整的设计输出：DESIGN.md、tokens.css、原型页面，以及实现代码。

## 📚 示例列表

### 1. [登录页面](./01-login-page/) 🔐
**难度**：⭐ 入门  
**用时**：~5 分钟  
**技术栈**：React

一个现代简约的登录页面，包含：
- 邮箱 + 密码输入
- 密码显示切换
- 响应式布局
- 平滑入场动画

**学习点**：
- 基础表单设计
- 设计 tokens 系统
- 动画实现
- 响应式设计

---

### 2. 仪表板（即将推出）📊
**难度**：⭐⭐ 中级  
**用时**：~15 分钟  
**技术栈**：React + Recharts

包含图表、数据表格、卡片的仪表板。

---

### 3. 组件库（即将推出）🧩
**难度**：⭐⭐⭐ 高级  
**用时**：~30 分钟  
**技术栈**：React + Storybook

完整的可复用组件库：按钮、输入框、卡片、模态框等。

---

## 🚀 如何使用这些示例

### 方式 1：直接预览

在浏览器中打开原型文件：

```bash
open examples/01-login-page/.design/prototype/screens/login.html
```

### 方式 2：重新生成

使用 pi-design 从头创建：

```bash
# 进入你的项目目录
cd my-project

# 复制 brief（每个示例的 README 中有）
/design 一个简约的登录页面：邮箱 + 密码 + 登录按钮
```

### 方式 3：学习设计系统

阅读每个示例的 `.design/DESIGN.md` 文件，了解：
- 颜色选择的理由
- 排版层次
- 间距规则
- 动画设计决策

### 方式 4：实现到你的项目

将设计实现到你的 React/SwiftUI/Web 项目中：

```bash
# 复制 .design/ 目录到你的项目
cp -r examples/01-login-page/.design my-project/

# 让模型实现
/design implement
```

## 📖 示例结构

每个示例都包含：

```
01-login-page/
├── README.md                    # 示例说明
├── .design/                     # 设计输出（pi-design 生成）
│   ├── DESIGN.md               # 设计系统文档
│   ├── tokens.css              # CSS 变量
│   ├── config.json             # 配置
│   ├── prototype/
│   │   └── screens/*.html      # 高保真原型
│   └── shots/                  # 截图
├── src/                         # 实现代码（可选）
│   └── LoginPage.tsx
└── preview.gif                  # 演示动图（可选）
```

## 💡 学习路径

### 如果你是新手
1. 从 **01-login-page** 开始
2. 在浏览器中预览原型
3. 阅读 `DESIGN.md`，理解设计系统
4. 查看 `login.html` 源码，了解实现方式

### 如果你想快速上手
1. 选择一个类似你需求的示例
2. 复制它的 brief
3. 修改细节后运行 `/design`
4. 在审核时参考示例的设计决策

### 如果你想深入学习
1. 对比多个示例的 `DESIGN.md`
2. 分析不同场景的 token 选择
3. 研究动画实现模式
4. 尝试混合多个示例的特性

## 🎨 设计模式速查

| 模式 | 示例 | 适用场景 |
|------|------|----------|
| 居中卡片 | 01-login-page | 登录、注册、单一表单 |
| 侧边栏 + 主区域 | 02-dashboard | 应用主界面、后台 |
| 瀑布流 | 03-component-library | 展示型页面、画廊 |
| 固定导航 | (即将推出) | 多页面应用、落地页 |

## 🔧 自定义示例

基于示例创建你自己的设计：

```bash
# 1. 复制一个基础示例
cp -r examples/01-login-page my-custom-design

# 2. 修改设计系统
# 编辑 my-custom-design/.design/DESIGN.md
# 修改颜色、字体、间距等

# 3. 让模型重新生成
cd my-custom-design
/design 基于当前 DESIGN.md，重新设计登录页面，使用深色主题
```

## 📸 截图 & 演示

每个示例都包含：
- ✅ 桌面视图截图
- ✅ 移动视图截图
- ✅ 动画演示 GIF
- ✅ 设计 tokens 可视化

（截图将在构建时自动生成）

## 🤝 贡献示例

想要添加你的示例？

1. Fork 这个仓库
2. 使用 pi-design 创建你的设计
3. 整理 `.design/` 目录
4. 编写 README 说明
5. 提交 Pull Request

我们特别欢迎：
- 不同行业的应用（电商、教育、医疗等）
- 不同技术栈（Vue、Angular、SwiftUI）
- 不同设备（平板、手表、电视）
- 不同语言和文化的设计

## 📚 更多资源

- [快速开始](../QUICKSTART.md)
- [完整文档](../README.md)
- [设计指南](../docs/)
- [常见问题](../docs/FAQ.md)

---

💡 **提示**：这些示例都是用 pi-design 自动生成的。你也可以创建同样专业的设计！
