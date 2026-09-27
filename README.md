# pi-design

Pi 扩展：`/design <设计要求>` → 模型自主产出高保真 HTML 原型并自我迭代 → 本地浏览器人工审核 → 通过后以原型稿为规格实现目标技术栈 UI。

```
BRIEF → PLAN → BUILD → SELF-REVIEW(每屏≤3轮) → REVIEW(人工门) ─┬→ 驳回+意见 → BUILD
                                                              └→ 通过 → IMPLEMENT → done
```

模型是唯一执行者；扩展只提供三个工具 + 一条审核回流通道，流程逻辑全部在 `extensions/prompt.ts` 的提示词状态机里。

## 安装

```bash
pi install git:github.com/<you>/pi-design@v0.1.0   # 或 npm:/local: 源
# 开发期直载：
pi --extension ./extensions/index.ts
```

依赖说明：
- 运行时仅依赖 `playwright-core`（不含浏览器下载），优先用 `channel:"chrome"` 驱动系统已装的 Chrome/Edge；没有 Playwright 可用时自动退回裸 `chrome --headless --screenshot`（零依赖路径）。两者都没有时报错并提示安装 Chrome 或设置 `PI_DESIGN_CHROME`。
- `@earendil-works/pi-coding-agent` 等宿主包由 Pi 提供，声明为 `peerDependencies`。

## 用法

```
/design 一个极简登录页：邮箱+密码+登录按钮     # 启动/重置工作流（回到 BRIEF）
/design stop                                  # 结束工作流并停用 design 工具
```

工作流激活后，浏览器会弹出审核页（通过 / 驳回+意见）；也可以直接在会话里回复"通过"或意见——两者等价。审核结果作为用户消息回流会话，继续驱动状态机。

## 项目内约定（`.design/`）

```
.design/
  DESIGN.md          # 设计身份，遵循 Google DESIGN.md 格式规范（见下）
  tokens.css         # 从 DESIGN.md front matter 确定性投影的 CSS 变量（派生产物）
  config.json        # { "target": "swiftui"|"react"|"web", "viewport": [390,844], "viewports": [[768,1024]] }
  state.json         # 工作流状态（扩展维护，断点续做）
  review-server.json # 审核门运行信息（游离服务器存活期间；瞬态）
  review-round-*.json# 审核结果落盘（等待会话拾取；瞬态）
  prototype/
    index.html       # 导航壳（iframe 各屏 + 桌面/手机框）
    screens/*.html   # 一屏一文件
  shots/             # 截图缓存（建议加入 .gitignore）
```

### DESIGN.md 格式规范（Google Labs）

对齐 [google-labs-code/design.md](https://github.com/google-labs-code/design.md)：YAML front matter 承载**规范化设计 token**（colors / typography / rounded / spacing / components，组件值可用 `{colors.primary}` 引用），Markdown 正文按固定顺序（Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts）写设计理由。数值唯一来源是 front matter；`tokens.css` 按确定性映射派生（`colors.primary`→`--color-primary`、`typography.h1.fontSize`→`--type-h1-size`、`components.button-primary.backgroundColor`→`--component-button-primary-background`…）。

`design_review` 开门前做**机械 lint**（内置实现，`extensions/designmd.ts`，无需网络）：

- **error（阻断开门）**：front matter 缺失/不可解析、token 引用未解析、重复章节
- **warning（透出给审核者）**：缺 primary 色/typography、孤儿色、组件前景/背景对比度低于 WCAG AA(4.5:1)、章节乱序、tokens.css 与 front matter 失同步

`viewport` 是主视口；可选 `viewports` 数组（≤3 个）声明额外自查视口——SELF-REVIEW 时每屏会在这些视口各截一张确认响应式布局未破。截图按 `<screen>@<w>x<h>-<时间戳>.jpg` 命名，各视口独立保留最近 3 张。

## IMPLEMENT 翻译规则（按 target）

规则全文在 `extensions/prompt.ts` 的 `IMPLEMENT_TARGET_RULES`，注入到工作流提示词、审核通过回流消息和 implement 阶段的每轮注入（compaction 后依然有效）。所有模型侧提示词均为英文（工具描述、结果文本、报错亦同）；人类界面（审核页、TUI 通知）保持中文。要点：

- **react**：先侦察目标工程（框架/样式方案/命名惯例），设计 token（front matter 为源，tokens.css 为投影）翻译为工程主题层（Tailwind theme / `:root` 变量 / theme 对象），一屏一页面组件，本地 `useState`，不引新依赖，跑工程自带 build/lint 收尾。
- **swiftui**：tokens → `DesignTokens.swift`（`Color(hex:)` 或 `Color(red:green:blue:)`，注释原值），纵向/横向/层叠 → V/H/ZStack，一屏一 `struct <Screen>View` + `#Preview`，原生组件与 SF Symbol，有工具链则 `swift build` 验证。
- **web**：侦察模板与 CSS 组织，tokens 合并进工程全局自定义属性，语义化标签，不引入框架/构建。

三目标均已真模型实测（Vite React TS 工程、Swift Package 工程、静态站点工程）：react 产物 64 处 `var(--)` 零魔法值且 `vite build` 通过；swiftui 产物 `swift build` 零警告；web 产物 tokens 复制进工程、页面样式全 `var(--)`、`:root` 之外零魔法值。

## 审核页

每轮审核在本地固定端口的页面上进行（自动用系统默认浏览器打开）。**审核地址整个工作流保持不变**：默认端口 3374（"DESI"），被占用时 +1 游走（最多 25 个），全满才退回随机；token 按工作流稳定、工作流结束轮换——驳回-修改-再审循环里浏览器标签页可以一直开着：

- **会话退出后依然可达**：服务器跑在游离子进程里，一次性/print/RPC 模式跑完即退也不影响；点「通过/驳回」后结果落盘，运行中的会话秒级拾取，下次会话启动时自动拾取回流（30 分钟无人操作自动关闭）；
- 视口预设（375 / 390 / 768 / 1280，键 1-4）与 25%-100% 缩放，宽屏原型也能整屏审阅；
- 每屏可「↗ 新标签」全屏打开，或点「截图」与模型最后一张自检截图对照；
- 键盘快捷键：`A` 通过 · `R` 驳回 · `/` 聚焦意见框；
- 决策端点单次有效，提交后页面提示可关闭。

## 架构与关键决策

| 决策 | 实现 |
|---|---|
| 人工门是硬边界 | `design_review` 工具结果返回 `terminate: true`，agent 在该批次后跳过自动跟进——不依赖模型自觉停 |
| 审核门独立于会话存活 | 审核服务器跑在游离子进程里（Node ≥23 原生跑 .ts；旧环境自动回退进程内）：一次性/print/RPC 模式跑完即退也不影响审核页可达；审核结果落盘 `.design/review-round-<n>.json`，运行中的会话 1.5s 轮询拾取，下次会话启动自动拾取回流 |
| 审核回流 | 审核页按钮 → 本地服务器 → `pi.sendUserMessage()`（等同用户发言，总是触发 turn） |
| 跨 turn 状态连续性 | design 工具仅在工作流激活时可见（`pi.setActiveTools()`），其 `promptGuidelines` 携带状态机规则；`before_agent_start` 每轮把当前阶段注入 `systemPromptOptions.promptGuidelines`——compaction 后依然成立 |
| 断点续做 | 状态落盘 `.design/state.json`；`session_start` 时按状态恢复工具可见性并拾取离线期间到达的审核结果 |
| 图片回流 | `design_render` 以 `AgentToolResult.content` 的 `ImageContent`（type-level 官方支持）直接附截图 |
| 无 TUI 兼容（RPC/wuhu） | 全部交互走聊天 + 浏览器（默认浏览器自动打开）；`open` 失败不是错误（URL 总在工具结果里） |

## 审核服务器安全模型

本服务器是能把用户消息注入全权限 agent 会话的本地端点，按敌意面处理：

- 仅绑定 `127.0.0.1`；默认固定端口 3374（`PI_DESIGN_PORT` 可覆盖），占用时 +1 游走，全满才随机；
- 192-bit 随机 token 放进 URL 路径且**按工作流稳定**（审核地址跨轮不变，工作流结束即轮换），未知 token 一律无差别 404；
- `POST /decision` 校验 `Host`（必须是 `127.0.0.1/localhost:<port>`，防 DNS rebinding）、`Sec-Fetch-Site`（拒绝 cross-site）与 `Origin`；
- 决策端点单次有效，决策后服务器即关；30 分钟空闲自动关闭；
- 静态服务路径限定在 `.design/` 内；
- `session_shutdown` 幂等清理。

## 开发

```bash
npm run typecheck        # tsc --noEmit（strict + exactOptionalPropertyTypes）
npm run smoke            # 四套冒烟：服务器安全矩阵 / 截图双引擎 / 扩展全链路 / 审核页浏览器交互
```

注意：本仓库在部分外置盘上会遇到 npm 静默漏装个别包（typescript/jiti/typebox/pi-coding-agent 解压失败但 npm 报成功）。若 `typecheck`/`smoke` 报模块缺失，用 `npm pack <pkg>@<version>` 下载后手工解压到 `node_modules/` 对应目录。

## 发布验证（已验证的流程）

`files` 字段限定发布内容为 `extensions/` + `README.md` + `LICENSE`（tarball 8 文件 / ~22KB）。本地安装链路已实测：

```bash
npm pack                                            # 产出 tgz
mkdir /tmp/pkg && tar xzf pi-design-0.1.0.tgz -C /tmp/pkg
cd /tmp/pkg/package && npm install --omit=dev       # 自包含（peerDeps 会一并装上）
cd <目标工程> && pi install /tmp/pkg/package -l     # 项目本地安装
# 项目首次使用需信任（写入 ~/.pi/agent/trust.json），否则项目级 .pi/settings.json 不加载
```

发布到 npm 后用户侧即 `pi install npm:pi-design`。

## 里程碑状态

- [x] M0 事实核验（工具结果图片类型层确认；sendUserMessage 触发 turn；headless 截图双路径；terminate 硬停）
- [x] M1 骨架：命令/工具/状态机/截图回流/自迭代提示词
- [x] M2 审核服务器 + 双通道（按钮 + 聊天文字）
- [x] M3 IMPLEMENT 翻译 prompt 按 target 实测调优（react/swiftui/web 真模型 e2e 通过）
- [x] M4 打磨：多视口（config.viewports + 视口标签截图）、审核页交互增强（预设/缩放/快捷键/截图对照）、package 发布验证
- [x] M5 对齐 Google [DESIGN.md 格式规范](https://github.com/google-labs-code/design.md)：front matter 规范化 token + 确定性 tokens.css 投影 + 审核门前机械 lint（真模型 e2e 通过：0 error / 2 warning）
- [x] M6 审核门游离化：服务器跑在 detached 子进程，会话退出后审核页仍可达，决策落盘跨会话拾取（真机验证：进程退出后 URL 200 → curl 过审 → 重启会话自动回流完成实现）
- 修复：审核页决策 fetch 曾用相对 URL 导致双重 token 404（按钮路径自 M2 起即失效），已改为根相对路径并加浏览器级回归测试

## License

MIT
