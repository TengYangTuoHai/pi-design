# Example 1: Login Page

这是一个使用 pi-design 创建的简约登录页面示例。

## 🎨 设计特点

- **现代简约**：干净的界面，清晰的视觉层次
- **专业蓝色**：使用蓝色传达信任感
- **响应式**：支持移动端和桌面端
- **可访问性**：符合 WCAG AA 标准，支持键盘导航
- **动画**：平滑的入场动画和交互反馈

## 📁 文件结构

```
.design/
├── DESIGN.md              # 设计系统文档（设计 tokens + 设计理念）
├── tokens.css             # CSS 变量（从 DESIGN.md 自动生成）
├── config.json            # 项目配置（目标技术栈：React）
├── prototype/
│   └── screens/
│       └── login.html     # 高保真原型
└── shots/                 # 截图缓存（自动生成）
```

## 🚀 如何创建这个示例

使用 pi-design，你只需要一句话：

```bash
/design 一个简约的登录页面：邮箱 + 密码 + 登录按钮
```

然后模型会：
1. **规划**：分析需求，定义设计系统
2. **构建**：创建 DESIGN.md、tokens.css、原型页面
3. **自我审查**：截图并优化设计（最多 3 轮）
4. **等待审核**：在浏览器中打开审核页面
5. **实现**：审核通过后，自动实现到 React 项目中

## 👀 预览原型

在浏览器中打开查看：

```bash
open examples/01-login-page/.design/prototype/screens/login.html
```

## 🎬 动画特性

这个设计包含以下动画：

- **入场动画**：卡片淡入 + 向上滑动（300ms，标准缓动）
- **输入框焦点**：边框颜色过渡（150ms）
- **按钮悬停**：背景色变暗（150ms）
- **无障碍**：支持 `prefers-reduced-motion`

所有动画都使用设计 tokens：
```css
--motion-duration-fast: 150ms
--motion-duration-normal: 300ms
--motion-easing-standard: cubic-bezier(0.2, 0, 0, 1)
```

## 🎨 设计 Tokens

### 颜色
- Primary: `#3B6DFF` - 主要操作
- Neutral: `#1F2937` - 文本
- Background: `#FFFFFF` - 背景

### 排版
- 字体：Inter
- H1: 32px / 700 weight
- Body: 16px / 400 weight

### 圆角
- Medium: 8px - 输入框和按钮
- Large: 12px - 卡片

### 间距
- Small: 8px
- Medium: 16px
- Large: 24px
- XL: 32px

## 📦 实现到 React

这个原型可以实现到 React 项目中：

```bash
# 在你的 React 项目中
/design implement
```

模型会：
1. 扫描你的项目结构（Vite、CRA、Next.js 等）
2. 将设计 tokens 转换为项目的主题系统
3. 创建 `<LoginPage>` 组件
4. 复用项目现有的样式方案
5. 运行 `npm run build` 验证

## 🔍 设计细节

### 表单验证
- HTML5 原生验证（`required`、`type="email"`）
- 清晰的错误提示位置

### 密码显示切换
- 眼睛图标切换密码可见性
- 键盘可访问

### 链接和引导
- "忘记密码" 链接
- "注册账号" 引导

### 响应式
- 移动端：优化触摸目标（48px 最小高度）
- 桌面端：最大宽度 420px，居中显示

## 💡 学到的模式

这个示例展示了：

1. **设计系统优先**：所有视觉值都来自 tokens
2. **原子设计**：可复用的组件（button-primary、input）
3. **渐进增强**：基础功能 + 动画增强
4. **无障碍优先**：语义化 HTML、ARIA 标签、键盘导航

## 🔗 相关资源

- [DESIGN.md 规范](../../docs/design-md-spec.md)
- [动画指南](../../docs/motion-guidelines.md)
- [实现指南 - React](../../docs/implement-react.md)

## 下一步

- 查看 [示例 2：仪表板](../02-dashboard/) - 更复杂的布局
- 查看 [示例 3：组件库](../03-component-library/) - 可复用组件
