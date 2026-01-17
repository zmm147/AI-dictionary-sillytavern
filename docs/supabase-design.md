# AI Dictionary - Supabase 云同步数据库设计方案

## 概述

本文档描述 AI Dictionary 扩展与 Supabase 云同步的数据库设计方案。

---

## 现有数据结构分析

### 1. Word History (查词历史)
```javascript
{
    word: string,           // 主键，小写
    count: number,          // 查词次数
    lookups: number[],      // 每次查词的时间戳
    contexts: string[]      // 上下文数组 (最多5个)
}
```

### 2. Flashcard Progress (闪卡进度)
```javascript
{
    word: string,           // 主键
    masteryLevel: number,   // 0-5 熟练度
    easinessFactor: number, // 1.3-2.5 SM-2因子
    reviewCount: number,    // 复习次数
    lastReviewed: number,   // 上次复习时间戳
    nextReview: number,     // 下次复习时间戳
    context: string         // 上下文
}
```

### 3. Immersive Review (沉浸式复习)
```javascript
// Pending Words
{ word: string, addedDate: number }

// Reviewing Words
{ word: string, stage: number, nextReviewDate: number, lastUsedDate: number }

// Mastered Words
{ word: string, masteredDate: number }
```

### 4. Word Blacklist (黑名单)
```javascript
{ words: string[] }
```

---

## Supabase 表结构设计

### 方案: 统一单词表 + 进度表

将数据归一化为几个核心表，避免数据重复，便于查询和同步。

### 表1: `users` (用户表)
> 可选：如果使用 Supabase Auth，可以直接用 `auth.users`

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_sync_at TIMESTAMPTZ
);
```

### 表2: `words` (单词主表)

存储所有查过的单词及其统计信息。

```sql
CREATE TABLE words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    lookup_count INTEGER DEFAULT 1,
    first_lookup_at TIMESTAMPTZ DEFAULT NOW(),
    last_lookup_at TIMESTAMPTZ DEFAULT NOW(),
    is_blacklisted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, word)
);

-- 索引
CREATE INDEX idx_words_user_id ON words(user_id);
CREATE INDEX idx_words_word ON words(word);
CREATE INDEX idx_words_lookup_count ON words(user_id, lookup_count DESC);
CREATE INDEX idx_words_last_lookup ON words(user_id, last_lookup_at DESC);
```

### 表3: `word_lookups` (查词记录表)

存储每次查词的时间戳，用于统计趋势。

```sql
CREATE TABLE word_lookups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    looked_up_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_lookups_word_id ON word_lookups(word_id);
CREATE INDEX idx_lookups_user_date ON word_lookups(user_id, looked_up_at DESC);
```

### 表4: `word_contexts` (上下文表)

存储查词时的上下文。

```sql
CREATE TABLE word_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    context TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_contexts_word_id ON word_contexts(word_id);

-- 限制每个单词最多保存5个上下文 (应用层控制)
```

### 表5: `flashcard_progress` (闪卡进度表)

SM-2 算法的学习进度。

```sql
CREATE TABLE flashcard_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    mastery_level INTEGER DEFAULT 0 CHECK (mastery_level >= 0 AND mastery_level <= 5),
    easiness_factor DECIMAL(3,2) DEFAULT 2.50 CHECK (easiness_factor >= 1.30 AND easiness_factor <= 2.50),
    review_count INTEGER DEFAULT 0,
    last_reviewed_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, word_id)
);

-- 索引
CREATE INDEX idx_flashcard_user_id ON flashcard_progress(user_id);
CREATE INDEX idx_flashcard_next_review ON flashcard_progress(user_id, next_review_at);
CREATE INDEX idx_flashcard_mastery ON flashcard_progress(user_id, mastery_level);
```

### 表6: `immersive_review` (沉浸式复习表)

艾宾浩斯间隔复习系统的进度。

```sql
CREATE TYPE review_status AS ENUM ('pending', 'reviewing', 'mastered');

CREATE TABLE immersive_review (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    status review_status DEFAULT 'pending',
    stage INTEGER DEFAULT 0,                    -- 复习阶段 (0-6, 对应艾宾浩斯间隔)
    added_at TIMESTAMPTZ DEFAULT NOW(),         -- 添加时间
    next_review_at TIMESTAMPTZ,                 -- 下次复习时间
    last_used_at TIMESTAMPTZ,                   -- 上次被AI使用时间
    mastered_at TIMESTAMPTZ,                    -- 掌握时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, word_id)
);

-- 索引
CREATE INDEX idx_review_user_status ON immersive_review(user_id, status);
CREATE INDEX idx_review_next_review ON immersive_review(user_id, next_review_at);
```

---

## 行级安全策略 (RLS)

确保用户只能访问自己的数据。

```sql
-- 启用 RLS
ALTER TABLE words ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE immersive_review ENABLE ROW LEVEL SECURITY;

-- words 表策略
CREATE POLICY "Users can view own words"
    ON words FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own words"
    ON words FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own words"
    ON words FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own words"
    ON words FOR DELETE
    USING (auth.uid() = user_id);

-- 其他表类似...
```

---

## 数据同步策略

### 1. 冲突解决策略

使用 **"最后写入者胜出 + 合并计数"** 策略：

| 字段 | 冲突解决方式 |
|------|-------------|
| lookup_count | 取较大值 (max) |
| contexts | 合并去重，保留最新5个 |
| mastery_level | 取较大值 |
| easiness_factor | 取本地值 (用户体验优先) |
| review_count | 取较大值 |
| next_review_at | 取较早值 (确保不错过复习) |
| is_blacklisted | 取 true (删除优先) |

### 2. 同步触发时机

- **上传**: 查词后、闪卡复习后、沉浸式复习标记后
- **下载**: 应用启动时、用户手动触发、定时同步 (可选)

### 3. 增量同步

使用 `updated_at` 时间戳实现增量同步：

```sql
-- 获取上次同步后更新的数据
SELECT * FROM words
WHERE user_id = $1 AND updated_at > $2;
```

---

## 数据库函数 (可选)

### 1. 记录查词

```sql
CREATE OR REPLACE FUNCTION record_lookup(
    p_user_id UUID,
    p_word TEXT,
    p_context TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_word_id UUID;
BEGIN
    -- 插入或更新单词
    INSERT INTO words (user_id, word, lookup_count, last_lookup_at)
    VALUES (p_user_id, LOWER(p_word), 1, NOW())
    ON CONFLICT (user_id, word)
    DO UPDATE SET
        lookup_count = words.lookup_count + 1,
        last_lookup_at = NOW(),
        updated_at = NOW()
    RETURNING id INTO v_word_id;

    -- 记录查词时间
    INSERT INTO word_lookups (word_id, user_id)
    VALUES (v_word_id, p_user_id);

    -- 记录上下文 (如果提供)
    IF p_context IS NOT NULL AND p_context != '' THEN
        INSERT INTO word_contexts (word_id, user_id, context)
        VALUES (v_word_id, p_user_id, p_context);

        -- 删除多余的上下文 (只保留最新5个)
        DELETE FROM word_contexts
        WHERE id IN (
            SELECT id FROM word_contexts
            WHERE word_id = v_word_id
            ORDER BY created_at DESC
            OFFSET 5
        );
    END IF;

    RETURN v_word_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. 批量同步

```sql
CREATE OR REPLACE FUNCTION sync_words(
    p_user_id UUID,
    p_words JSONB,
    p_last_sync TIMESTAMPTZ
) RETURNS JSONB AS $$
-- 复杂的同步逻辑...
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 存储估算

假设用户平均：
- 1000 个单词
- 每个单词 3 个上下文
- 每个单词 10 次查询记录

| 表 | 行数/用户 | 每行大小 | 总大小/用户 |
|----|----------|---------|------------|
| words | 1,000 | ~200B | ~200KB |
| word_lookups | 10,000 | ~50B | ~500KB |
| word_contexts | 3,000 | ~500B | ~1.5MB |
| flashcard_progress | 1,000 | ~100B | ~100KB |
| immersive_review | 1,000 | ~100B | ~100KB |
| **合计** | | | **~2.4MB** |

Supabase 免费版提供 500MB 数据库存储，可支持约 200 个活跃用户。

---

## 客户端集成建议

### 1. 初始化 Supabase 客户端

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'YOUR_SUPABASE_URL',
    'YOUR_SUPABASE_ANON_KEY'
);
```

### 2. 用户认证

```javascript
// 登录
const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github'  // 或 google, discord 等
});

// 获取当前用户
const user = supabase.auth.getUser();
```

### 3. 数据操作示例

```javascript
// 记录查词
async function recordLookup(word, context) {
    const { data, error } = await supabase.rpc('record_lookup', {
        p_user_id: user.id,
        p_word: word,
        p_context: context
    });
}

// 获取用户所有单词
async function getAllWords() {
    const { data, error } = await supabase
        .from('words')
        .select(`
            *,
            contexts:word_contexts(context, created_at),
            flashcard:flashcard_progress(*),
            review:immersive_review(*)
        `)
        .order('last_lookup_at', { ascending: false });
}

// 增量同步
async function syncChanges(lastSyncAt) {
    const { data, error } = await supabase
        .from('words')
        .select('*')
        .gt('updated_at', lastSyncAt);
}
```

---

## 实体关系图 (ER Diagram)

```
┌─────────────────┐
│     users       │
│  (auth.users)   │
└────────┬────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐       1:N      ┌─────────────────┐
│     words       │───────────────▶│  word_lookups   │
│                 │                └─────────────────┘
│  - word         │       1:N      ┌─────────────────┐
│  - lookup_count │───────────────▶│  word_contexts  │
│  - blacklisted  │                └─────────────────┘
└────────┬────────┘
         │
         │ 1:1
         ▼
┌─────────────────┐       ┌─────────────────┐
│ flashcard_      │       │ immersive_      │
│ progress        │       │ review          │
│                 │       │                 │
│ - mastery_level │       │ - status        │
│ - easiness      │       │ - stage         │
│ - next_review   │       │ - next_review   │
└─────────────────┘       └─────────────────┘
```

---

## 下一步

1. **在 Supabase 控制台创建项目**
2. **执行上述 SQL 创建表结构**
3. **配置 RLS 策略**
4. **在扩展中添加 Supabase 客户端**
5. **实现同步模块** (`modules/cloudSync.js`)
6. **添加登录/注册 UI**
7. **测试同步功能**

---

## 注意事项

1. **隐私**: 所有数据都与用户绑定，使用 RLS 确保数据隔离
2. **离线优先**: IndexedDB 仍为主存储，云端为备份/同步
3. **冲突处理**: 合并策略需在客户端实现
4. **性能**: 批量同步而非单条同步，减少请求次数
5. **成本**: 监控数据库大小和 API 调用次数
