# Top Bar Module

顶栏模块提供 SillyTavern 顶部设置栏的 AI Dictionary 图标和下拉面板功能。

## 目录结构

```
modules/topBar/
├── top-bar-config.js       # 常量和配置
├── top-bar-state.js        # 状态管理
├── top-bar-storage.js      # 字幕设置持久化
├── top-bar-subtitle.js     # 字幕解析逻辑
├── top-bar-video.js        # 视频播放器逻辑
├── top-bar-render.js       # HTML 生成
├── top-bar-drawer.js       # 抽屉开关逻辑
└── README.md               # 本文档

styles/topBar/
├── top-bar-base.css        # 基础面板样式
├── top-bar-video.css       # 视频播放器样式
├── top-bar-subtitle.css    # 字幕相关样式
└── top-bar-mobile.css      # 移动端响应式样式
```

## 模块说明

### top-bar-config.js

常量和默认配置：
- `TOP_BAR_ICON_ID` - 顶栏图标 ID
- `TOP_BAR_DRAWER_ID` - 抽屉容器 ID
- `SUBTITLE_SETTINGS_STORAGE_KEY` - localStorage 键名
- `DEFAULT_SUBTITLE_SETTINGS` - 默认字幕设置 (桌面/移动端)
- `SUBTITLE_SIZE_LIMITS` - 字幕大小限制 (min, max, step)
- `SUBTITLE_OFFSET_STEP` - 字幕位置调整步长

### top-bar-state.js

状态管理：
- `drawerState` - 抽屉状态 { isOpen }
- `videoState` - 视频状态 { currentSubtitleCues, originalParent, originalNextSibling }
- `resetDrawerState()` - 重置抽屉状态
- `resetVideoState()` - 重置视频状态

### top-bar-storage.js

字幕设置持久化：
- `loadSubtitleSettings(defaults)` - 从 localStorage 加载设置
- `saveSubtitleSettings(settings)` - 保存设置到 localStorage

### top-bar-subtitle.js

字幕文件解析：
- `normalizeSubtitleText(text)` - 处理换行标签
- `parseTimestamp(timestamp)` - 时间戳转秒数
- `parseVttCues(vttContent)` - 解析 VTT 为 cue 数组
- `convertSrtToVtt(srtContent)` - SRT 转 VTT
- `normalizeVtt(vttContent)` - 标准化 VTT 格式

### top-bar-video.js

视频播放器逻辑：
- `clearSubtitles(videoPlayer)` - 清除字幕
- `clearSubtitlePanel()` - 清除字幕面板 UI
- `updateCustomSubtitle(videoPlayer)` - 更新字幕显示
- `handleSubtitleFile(file, videoPlayer)` - 处理字幕导入
- `bindVideoEvents()` - 绑定视频相关事件

### top-bar-render.js

HTML 生成：
- `createPanelContent(options)` - 生成面板内容
- `formatSubtitleContent(vttContent)` - 格式化字幕面板内容
- `showSubtitleError(message)` - 显示错误信息

### top-bar-drawer.js

抽屉开关逻辑：
- `toggleDrawer(icon, content)` - 切换抽屉状态
- `openDrawer(icon, content)` - 打开抽屉
- `closeDrawer(icon, content)` - 关闭抽屉

## 入口点

`modules/topBar.js` 是入口点，整合所有子模块：

```javascript
import { createTopBarIcon, updateTopBar, removeTopBarIcon, bindTopBarEvents } from './modules/topBar.js';
```

## 依赖关系

```
config (无依赖)
    ↓
state (无依赖)
    ↓
storage (导入 config)
    ↓
subtitle (无依赖)
    ↓
video (导入 config, state, storage, subtitle, render)
    ↓
render (导入 utils, subtitle)
    ↓
drawer (导入 config, state)
    ↓
topBar.js 入口 (导入 config, state, drawer, render, video)
```

## 功能特性

1. **快速查词** - 输入框直接查词
2. **快捷功能** - 统计、闪卡、农场、视频按钮
3. **视频播放器** - 导入本地视频文件
4. **字幕支持** - 支持 VTT/SRT 格式
5. **字幕控制** - 大小调整、位置调整、重置
6. **伪全屏** - ESC 退出全屏
7. **设置持久化** - 字幕设置保存到 localStorage

## CSS 样式

- `top-bar-base.css` - 面板、头部、输入框、按钮基础样式
- `top-bar-video.css` - 视频容器、控件、全屏样式
- `top-bar-subtitle.css` - 字幕覆层、字幕面板样式
- `top-bar-mobile.css` - 移动端响应式调整
