# Flashcard 模块

背单词卡片功能的模块化实现。

## 模块结构

```
modules/flashcard/
├── flashcard-config.js   # 配置常量（牌组大小、TTS端点等）
├── flashcard-state.js    # 状态管理（牌组状态、盲听状态、UI状态、TTS缓存）
├── flashcard-utils.js    # 工具函数（HTML转义、答案标准化、iOS检测等）
├── flashcard-tts.js      # TTS音频功能（获取音频、播放、缓存管理）
├── flashcard-deck.js     # 牌组管理（生成牌组、保存会话、复习定时器）
├── flashcard-blind.js    # 盲听模式（句子生成、盲听视图渲染）
├── flashcard-card.js     # 卡片操作（回答处理、删除、输入验证）
├── flashcard-render.js   # 渲染函数（主渲染、卡片视图、事件绑定）
└── flashcard.js          # 入口文件（导出 Flashcard 对象到 window）
```

## 模块依赖关系

```
flashcard.js (入口)
    ├── flashcard-render.js
    │   ├── flashcard-state.js
    │   ├── flashcard-utils.js
    │   ├── flashcard-config.js
    │   ├── flashcard-deck.js
    │   ├── flashcard-blind.js
    │   └── flashcard-card.js
    ├── flashcard-blind.js
    │   ├── flashcard-state.js
    │   ├── flashcard-utils.js
    │   ├── flashcard-tts.js
    │   └── flashcard-deck.js
    ├── flashcard-card.js
    │   ├── flashcard-state.js
    │   ├── flashcard-utils.js
    │   ├── flashcard-tts.js
    │   ├── flashcard-deck.js
    │   └── flashcard-blind.js
    └── flashcard-deck.js
        ├── flashcard-config.js
        ├── flashcard-state.js
        └── flashcard-tts.js
```

## 主要功能

### 背单词流程
1. `start()` - 开始背单词，恢复或生成新牌组
2. `render()` - 渲染卡片界面
3. `handleAnswer()` - 处理用户回答（认识/忘了）
4. `handleDelete()` - 永久删除单词

### 盲听模式
1. `startBlindListening()` - 进入盲听模式
2. `generateBlindListeningSentences()` - AI生成例句
3. `playBlindListeningSentence()` - TTS播放句子

### TTS功能
- 支持移动端TTS端点
- iOS设备使用Web Audio API
- 音频缓存和预加载

## 使用方式

模块通过 `farm-game.js` 动态加载：

```javascript
const script = document.createElement('script');
script.type = 'module';
script.src = 'modules/flashcard/flashcard.js';
document.head.appendChild(script);

// 加载后通过 window.Flashcard 访问
window.Flashcard.start(onComplete);
```

## 导出的API

```javascript
window.Flashcard = {
    start,              // 开始背单词
    render,             // 渲染界面
    getCompletedCount,  // 获取完成数量
    getRemainingCount,  // 获取剩余数量
    stopReviewTimer,    // 停止复习定时器
};
```
