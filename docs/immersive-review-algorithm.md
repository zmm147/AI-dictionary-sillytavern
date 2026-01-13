# 沉浸式复习算法说明

## 概述

沉浸式复习是 AI Dictionary 的核心功能之一，它将单词复习融入日常 AI 对话中，通过艾宾浩斯遗忘曲线间隔，让用户在与 AI 自然对话的过程中复习单词。

## 1. 数据结构

```javascript
reviewData = {
    pendingWords: [
        { word: "apple", addedDate: 1704100000000 }
    ],
    reviewingWords: {
        "banana": {
            stage: 2,              // 当前阶段 0-5
            nextReviewDate: xxx,   // 下次复习时间
            lastUsedDate: xxx      // 上次被AI使用的时间
        }
    },
    masteredWords: [
        { word: "cat", masteredDate: xxx }
    ],
    currentSession: {
        words: ["apple", "banana"],  // 本次会话要复习的单词
        lastUpdated: xxx
    }
}
```

### 状态说明

| 状态 | 说明 | 数据结构 |
|------|------|----------|
| **pending** | 新添加的单词，等待首次复习 | `pendingWords` 数组 |
| **reviewing** | 正在复习中，按艾宾浩斯间隔推进 | `reviewingWords` 对象 |
| **mastered** | 已完成所有复习阶段 | `masteredWords` 数组 |

## 2. 艾宾浩斯间隔

```
EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30]  // 单位：天

stage 0 → 1天后复习
stage 1 → 2天后复习
stage 2 → 4天后复习
stage 3 → 7天后复习
stage 4 → 15天后复习
stage 5 → 30天后复习
stage 6 → 掌握 (mastered)
```

## 3. 完整流程

### 3.1 添加单词

```
用户查询单词 "ephemeral"
        ↓
addWordToPendingReview("ephemeral", enabled)
        ↓
检查：是否已在 pending/reviewing/mastered 中？
        ↓
   否 → 添加到 pendingWords
   { word: "ephemeral", addedDate: Date.now() }
```

### 3.2 生成复习提示词

```
AI生成消息触发 GENERATION_STARTED 事件
        ↓
generateReviewPrompt(enabled, promptTemplate)
        ↓
buildCurrentSessionWords()
        │
        ├── 如果 currentSession.words 有内容 → 直接返回
        │
        └── 否则调用 getWordsToReviewToday():
            │
            ├── 1. 遍历 pendingWords
            │     筛选：addedDate < 今天午夜（昨天添加的）
            │
            ├── 2. 遍历 reviewingWords
            │     筛选：nextReviewDate <= 明天午夜
            │
            └── 3. 返回前 MAX_DAILY_REVIEW_WORDS(20) 个
        ↓
返回: "Please use these words: ephemeral, transient"
```

### 3.3 注入提示词

```
原消息: "Tell me about nature"

注入后: "Tell me about nature

         Please naturally use these words in your response:
         ephemeral, transient"
```

### 3.4 检测使用情况

```
AI 生成响应:
"The ephemeral beauty of cherry blossoms..."
        ↓
checkAIResponseForReviewWords(aiResponse, enabled)
        │
        ├── 1. 将响应转小写，构建正则: \bephemeral\b
        │
        ├── 2. 检测：
        │       ephemeral 在响应中 ✓
        │       transient 不在响应中 ✗
        │
        ├── 3. processWordUsed("ephemeral")
        │       查找 pendingWords → 找到！
        │       → 从 pendingWords 移除
        │       → 添加到 reviewingWords:
        │         { stage: 0,
        │           nextReviewDate: 现在+1天,
        │           lastUsedDate: 现在 }
        │
        └── 4. currentSession.words = ["transient"]
            (ephemeral 被移除，transient 保留下次继续)
```

### 3.5 后续复习

```
次日对话
        ↓
buildCurrentSessionWords()
        ↓
ephemeral 在 reviewingWords，stage=0
nextReviewDate = 昨天 + 1天 = 今天 ✓
        ↓
加入今日复习列表
        ↓
AI再次使用了 "ephemeral"
        ↓
processWordUsed("ephemeral")
        查找 reviewingWords → 找到！stage=0
        → stage += 1 → stage=1
        → nextReviewDate = 现在 + 2天
```

## 4. 状态转换图

```
          添加单词
    ┌─────────────────┐
    │                 │
    ▼                 │
┌────────┐   成功使用   ┌───────────┐   stage达6   ┌──────────┐
│ Pending│ ──────────► │ Reviewing │ ──────────► │ Mastered │
└────────┘            └───────────┘              └──────────┘
    ▲                     │
    │                     │ 失败未使用
    │                     ▼
    │            ┌─────────────────┐
    │            │ 保留在Session中 │
    │            │ 下次继续复习    │
    │            └─────────────────┘
    │
    │ 用户手动移除/清空
    └───────────────────┘
```

## 5. 边界情况处理

### 5.1 清空当前会话

`clearCurrentSession()` 会重置今天的复习进度：

- 今天内完成复习的单词 → `stage -= 1`，退回到上一阶段
- 今天内掌握的单词 → 从 `mastered` 移回 `reviewing` (stage=5)

### 5.2 最大每日复习量

`MAX_DAILY_REVIEW_WORDS = 20`

每天最多复习 20 个单词，超出部分留待次日。

### 5.3 单词去重

添加单词时会检查是否已存在于任意状态中，避免重复。

## 6. 代码位置

| 功能 | 文件位置 |
|------|----------|
| 复习核心逻辑 | `modules/review.js` |
| 数据库存储 | `modules/database.js` |
| 备份恢复 | `modules/backup.js` |
| 统计面板 | `modules/statisticsPanel.js` |

## 7. 存储架构

```
┌─────────────────┐     ┌─────────────────┐
│   IndexedDB     │◄────┤   JSON Backup   │
│  (主存储)        │     │   (自动备份)     │
└─────────────────┘     └─────────────────┘
        │
        │ 启动时检测
        │ IndexedDB为空时
        ▼
   从备份恢复
```

## 8. 与SillyTavern集成

复习系统通过以下事件与 SillyTavern 集成：

| 事件 | 触发时机 | 作用 |
|------|----------|------|
| `GENERATION_STARTED` | AI开始生成前 | 注入复习提示词 |
| `MESSAGE_RECEIVED` | 收到AI消息后 | 检测复习单词使用情况 |
