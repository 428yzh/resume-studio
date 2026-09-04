# DESIGN.md — 简历管理应用设计规范

采用 **Airtable DESIGN.md** 风格。

## 核心设计语言

- **白底黑字**：干净简约，内容优先
- **蓝色主调**：`#1456f0` 作为主品牌色
- **全扁平化**：卡片用 `border border-hairline` 替代阴影，只有弹窗/下拉使用阴影
- **全 pill 按钮**：所有按钮 `rounded-full`
- **数据表格**：类 Airtable 的表格组件用于技能库展示

## 色彩体系

| Token | 值 | 用途 |
|-------|-----|------|
| `canvas` | `#ffffff` | 页面/卡片背景 |
| `surface` | `#f7f8fa` | 次级背景/悬停态 |
| `hairline` | `#e2e8f0` | 边框/分割线 |
| `ink` | `#0a0a0a` | 标题/主按钮文字 |
| `charcoal` | `#222222` | 正文 |
| `slate` | `#475569` | 辅助文字 |
| `muted` | `#94a3b8` | 禁用/次要信息 |
| `blue` | `#1456f0` | 主品牌色/链接/主按钮 |
| `green` | `#059669` | 成功/熟练度高 |
| `amber` | `#d97706` | 警告/学习中 |
| `red` | `#dc2626` | 错误/删除 |

## 字体系统

| 角色 | 字体 |
|------|------|
| UI 界面 | DM Sans / Inter sans-serif |
| 字号 | 12px 辅助 / 14px 正文 / 16px 强调 / 24px 页面标题 |

## 组件规则

| 组件 | 样式 |
|------|------|
| 主按钮 | `bg-blue text-white rounded-full px-5 py-2 font-semibold text-sm` |
| 次按钮 | `bg-transparent text-ink border border-hairline rounded-full px-5 py-2` |
| 卡片 | `bg-canvas rounded-xl border border-hairline p-5` |
| 特色卡片 | `bg-[brand-color]-light border border-[brand-color]/20 rounded-xl p-5` |
| 输入框 | `border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue` |
| 表格 | `border border-hairline rounded-lg overflow-hidden` |
| 徽标 | `rounded-full px-2.5 py-0.5 text-xs font-semibold` |

## 间距体系

基础单位 4px：`xs:8 sm:12 md:16 lg:20 xl:24 xxl:32`

## 布局

- 固定头部导航 + 内容区域
- 最大内容宽度 `max-w-7xl` (1280px)
- 三栏布局用于简历编辑（编辑区 2/3 + 侧边栏 1/3）
- 两栏布局用于 JD 分析（输入 2/5 + 结果 3/5）
