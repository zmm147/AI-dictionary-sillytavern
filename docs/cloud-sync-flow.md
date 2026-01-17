# 云端同步流程文档

## 刷新网页后的云端同步流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        刷新网页后的云端同步流程                           │
└─────────────────────────────────────────────────────────────────────────┘

1. loadSettings()
   ↓ 读取 settings.cloudSyncEnabled

2. setCloudSyncMode(true)
   ↓ 设置备份模块跳过本地 JSON 备份

3. initDatabase()
   ↓ 初始化 IndexedDB

4. 如果 cloudSyncEnabled = true:
   ↓
   initAuth(true, true)
   │
   ├─→ initSupabase()
   │   ↓ 加载 Supabase SDK，自动恢复登录状态
   │
   ├─→ onAuthStateChange(handleAuthStateChange)
   │   ↓ 注册登录状态变化监听器
   │
   └─→ 如果已登录 (isLoggedIn()):
       │
       ├─→ enableCloudSync()        ← 启用实时同步回调
       ├─→ enableFlashcardCloudSync()
       ├─→ enableReviewCloudSync()
       │
       └─→ autoDownloadFromCloud()  ← 【核心】增量同步
           │
           ├─→ getLastSyncTime('words'/'flashcard'/'review')
           │   ↓ 从 IndexedDB 获取上次同步时间
           │
           ├─→ 如果是首次同步 (lastSyncTime = 0):
           │   │
           │   └─→ performFullDownload()  ← 全量下载
           │       │
           │       ├─→ fetchWordsFromCloud()
           │       │   ↓ replaceAllWordHistory()
           │       │
           │       ├─→ fetchFlashcardProgressFromCloud()
           │       │   ↓ replaceAllFlashcardProgress()
           │       │
           │       └─→ fetchImmersiveReviewFromCloud()
           │           ↓ replaceAllReviewData()
           │
           └─→ 如果不是首次同步:
               │
               └─→ performIncrementalSync()  ← 增量下载
                   │
                   ├─→ fetchWordsIncrementally(lastSyncTime)
                   │   ↓ 只获取 updated_at > lastSyncTime 的记录
                   │   ↓ mergeCloudData()  ← 合并而非替换
                   │
                   ├─→ fetchFlashcardProgressIncrementally()
                   │   ↓ mergeCloudFlashcardData()
                   │
                   └─→ fetchImmersiveReviewIncrementally()
                       ↓ mergeCloudReviewData()

5. loadWordHistoryFromFile()
   ↓ 从 IndexedDB 加载数据到内存

6. loadReviewDataFromFile()
   ↓

7. loadFlashcardProgress()
   ↓

8. 初始化 UI...
```

## 增量同步 vs 全量同步

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         同步策略对比                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  首次同步 (lastSyncTime = 0):                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 1. 下载云端全部数据                                               │   │
│  │ 2. 完全替换本地数据 (replaceAll)                                  │   │
│  │ 3. 记录当前时间为 lastSyncTime                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  增量同步 (lastSyncTime > 0):                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 1. 只下载 updated_at > lastSyncTime 的记录                        │   │
│  │ 2. 合并到本地数据 (merge)                                         │   │
│  │ 3. 更新 lastSyncTime 为最新的 updated_at                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  优势:                                                                  │
│  - 减少网络流量 (只传输变更数据)                                         │
│  - 加快同步速度 (数据量小)                                               │
│  - 减少 Supabase API 调用次数                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 数据存储架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           数据存储层级                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  云端同步关闭时:                                                         │
│  1. IndexedDB (主存储)  ← 所有操作实时保存到这里                          │
│  2. JSON 备份文件       ← 刷新页面时自动备份，IndexedDB 为空时用于恢复     │
│                                                                         │
│  云端同步开启时:                                                         │
│  1. Supabase 云端      ← 数据的唯一真实来源                              │
│  2. IndexedDB          ← 云端数据的本地缓存                              │
│  3. lastSyncTime       ← 存储在 IndexedDB 的 sessionData store          │
│  4. JSON 备份文件      ← 不再使用（跳过备份）                             │
└─────────────────────────────────────────────────────────────────────────┘
```

## lastSyncTime 存储结构

存储在 IndexedDB 的 `sessionData` store 中，key 为 `cloud-sync-time`:

```javascript
{
  id: 'cloud-sync-time',
  words: 1736567372913,      // 单词数据最后同步时间 (毫秒时间戳)
  flashcard: 1736567372913,  // 闪卡数据最后同步时间
  review: 1736567372913      // 复习数据最后同步时间
}
```

## Supabase 数据库表结构

### words 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| user_id | uuid | 用户 ID |
| word | text | 单词 |
| lookup_count | int | 查词总次数 |
| last_lookup_at | timestamp | 最后一次查词时间 |
| is_blacklisted | boolean | 是否已删除 |
| created_at | timestamp | 创建时间 |
| **updated_at** | **timestamp** | **更新时间 (用于增量同步)** |

### word_contexts 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| word_id | uuid | 关联 words.id |
| user_id | uuid | 用户 ID |
| context | text | 上下文句子 |
| created_at | timestamp | 创建时间 |

### word_lookups 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| word_id | uuid | 关联 words.id |
| user_id | uuid | 用户 ID |
| looked_up_at | timestamp | 查词时间 |

### flashcard_progress 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| user_id | uuid | 用户 ID |
| word_id | uuid | 关联 words.id |
| mastery_level | int | 熟练度 (0-5) |
| easiness_factor | float | SM-2 易度因子 |
| review_count | int | 复习次数 |
| last_reviewed_at | timestamp | 上次复习时间 |
| next_review_at | timestamp | 下次复习时间 |
| **updated_at** | **timestamp** | **更新时间 (用于增量同步)** |

### immersive_review 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| user_id | uuid | 用户 ID |
| word_id | uuid | 关联 words.id |
| status | text | 状态: pending/reviewing/mastered |
| stage | int | 复习阶段 |
| next_review_at | timestamp | 下次复习时间 |
| last_used_at | timestamp | 上次使用时间 |
| added_at | timestamp | 添加时间 |
| mastered_at | timestamp | 掌握时间 |
| **updated_at** | **timestamp** | **更新时间 (用于增量同步)** |

## 关键函数说明

### 增量获取函数

#### fetchWordsIncrementally(sinceTimestamp)
```javascript
// 只获取 updated_at > sinceTimestamp 的单词
const { data: words } = await supabaseClient
    .from('words')
    .select('*')
    .eq('user_id', currentUser.id)
    .gt('updated_at', sinceISO);  // 关键：只获取更新的记录

// 返回格式
{
  success: true,
  data: { word1: {...}, word2: {...} },
  latestUpdatedAt: 1736567372913  // 最新的 updated_at 时间戳
}
```

#### fetchFlashcardProgressIncrementally(sinceTimestamp)
同上，只获取 `updated_at > sinceTimestamp` 的闪卡进度。

#### fetchImmersiveReviewIncrementally(sinceTimestamp)
同上，只获取 `updated_at > sinceTimestamp` 的复习数据。

### 合并函数

#### mergeCloudData(cloudData)
合并云端单词数据到本地：
- 如果本地不存在该单词，添加
- 如果本地存在，保留较高的 count 值，合并 contexts

#### mergeCloudFlashcardData(cloudData)
合并云端闪卡数据到本地：
- 如果本地不存在，添加
- 如果本地存在，保留较高的 masteryLevel 或 reviewCount

#### mergeCloudReviewData(cloudData)
合并云端复习数据到本地：
- pending → reviewing → mastered 状态只能前进
- reviewing 状态下保留较高的 stage

### 同步时间管理

#### getLastSyncTime(dataType)
从 IndexedDB 获取指定数据类型的最后同步时间。

#### setLastSyncTime(dataType, timestamp)
保存指定数据类型的最后同步时间。

#### clearAllSyncTimes()
清除所有同步时间（关闭云端同步时调用）。

## 同步策略

### 云端同步开启时
- **刷新页面**：
  - 首次同步：全量下载，替换本地数据
  - 后续同步：增量下载，合并到本地数据
- **查词操作**：实时同步到云端（fire-and-forget，不阻塞 UI）
- **删除操作**：实时同步到云端
- **本地备份**：跳过（不创建 JSON 备份文件）

### 云端同步关闭时
- **刷新页面**：从 IndexedDB 加载，如果为空则从 JSON 备份恢复
- **查词操作**：只保存到 IndexedDB
- **本地备份**：刷新页面时自动备份到 JSON 文件
- **同步时间**：清除所有 lastSyncTime

## 冲突处理

当前策略：**合并优先**

增量同步时：
- 单词数据：保留较高的 count，合并 contexts
- 闪卡数据：保留较高的 masteryLevel 或 reviewCount
- 复习数据：状态只能前进（pending → reviewing → mastered）

首次同步时：
- 云端数据完全覆盖本地数据
- 如果云端为空，保留本地数据

## 相关文件

- `index.js` - 初始化流程
- `modules/topBar/top-bar-auth.js` - 云端同步 UI 和逻辑
- `modules/supabase.js` - Supabase API 调用（含增量获取函数）
- `modules/wordHistory.js` - 单词历史数据管理
- `modules/flashcardProgress.js` - 闪卡进度管理
- `modules/review.js` - 沉浸式复习数据管理
- `modules/backup.js` - 本地 JSON 备份
- `modules/database.js` - IndexedDB 操作（含 lastSyncTime 管理）
