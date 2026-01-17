# Supabase Egress 优化分析

## 什么是 Egress？

- **Egress** = 服务器返回给客户端的数据量
- **Ingress** = 客户端发送给服务器的数据量（免费）
- 免费套餐限制：5GB/月

## 当前代码问题分析

### 问题 1: 不必要的 `.select()` 返回数据

**位置：`syncWordToCloud` (supabase.js 第 214-226 行)**

```javascript
// ❌ 当前代码：返回完整行数据
const { data: wordData, error: wordError } = await supabaseClient
    .from('words')
    .upsert({
        user_id: currentUser.id,
        word: word.toLowerCase(),
        lookup_count: data.count,
        last_lookup_at: new Date().toISOString(),
        is_blacklisted: false
    }, {
        onConflict: 'user_id,word'
    })
    .select()      // ← 返回所有列！
    .single();

// ✅ 优化后：只返回需要的 id
const { data: wordData, error: wordError } = await supabaseClient
    .from('words')
    .upsert({...}, { onConflict: 'user_id,word' })
    .select('id')   // ← 只要 id，因为后续只用 wordData.id
    .single();
```

**节省：约 50% egress（减少 word, lookup_count, created_at, updated_at 等字段）**

---

### 问题 2: `select('*')` 获取过多列

**位置：`fetchWordsFromCloud` (supabase.js 第 305-309 行)**

```javascript
// ❌ 当前代码
const { data: words, error: wordsError } = await supabaseClient
    .from('words')
    .select('*')   // ← 返回所有列，包括 created_at, updated_at, is_blacklisted 等
    .eq('user_id', currentUser.id)
    .eq('is_blacklisted', false);

// ✅ 优化后：只选需要的列
const { data: words, error: wordsError } = await supabaseClient
    .from('words')
    .select('id, word, lookup_count')   // ← 只要这三个字段
    .eq('user_id', currentUser.id)
    .eq('is_blacklisted', false);
```

**节省：约 30-40% egress**

---

**位置：`fetchWordsIncrementally` (supabase.js 第 403-408 行)**

```javascript
// ❌ 当前代码
const { data: words, error: wordsError } = await supabaseClient
    .from('words')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('is_blacklisted', false)
    .gt('updated_at', sinceISO);

// ✅ 优化后
const { data: words, error: wordsError } = await supabaseClient
    .from('words')
    .select('id, word, lookup_count, updated_at')  // ← 只要需要的字段
    .eq('user_id', currentUser.id)
    .eq('is_blacklisted', false)
    .gt('updated_at', sinceISO);
```

---

### 问题 3: Flashcard 查询返回过多数据

**位置：`fetchFlashcardProgressFromCloud` (supabase.js 第 858-864 行)**

```javascript
// ❌ 当前代码
const { data, error } = await supabaseClient
    .from('flashcard_progress')
    .select(`
        *,
        words!inner(word)
    `)
    .eq('user_id', currentUser.id);

// ✅ 优化后：只选需要的字段
const { data, error } = await supabaseClient
    .from('flashcard_progress')
    .select(`
        mastery_level,
        easiness_factor,
        review_count,
        last_reviewed_at,
        next_review_at,
        words!inner(word)
    `)
    .eq('user_id', currentUser.id);
```

**节省：约 30% egress（减少 id, user_id, word_id, created_at, updated_at）**

---

**位置：`fetchFlashcardProgressIncrementally` (supabase.js 第 907-914 行)**

```javascript
// ❌ 当前代码
.select(`
    *,
    words!inner(word)
`)

// ✅ 优化后
.select(`
    mastery_level,
    easiness_factor,
    review_count,
    last_reviewed_at,
    next_review_at,
    updated_at,
    words!inner(word)
`)
```

---

### 问题 4: Immersive Review 查询优化

**位置：`fetchImmersiveReviewFromCloud` (supabase.js 第 1170-1176 行)**

```javascript
// ❌ 当前代码
const { data, error } = await supabaseClient
    .from('immersive_review')
    .select(`
        *,
        words!inner(word)
    `)
    .eq('user_id', currentUser.id);

// ✅ 优化后
const { data, error } = await supabaseClient
    .from('immersive_review')
    .select(`
        status,
        stage,
        added_at,
        next_review_at,
        last_used_at,
        mastered_at,
        words!inner(word)
    `)
    .eq('user_id', currentUser.id);
```

---

### 问题 5: 上传时的冗余查询

**位置：`uploadAllWordsToCloud` (supabase.js 第 499-679 行)**

当前流程产生多次往返：
1. 查询云端已有单词 → **egress**
2. Upsert 单词 → ingress
3. 再次查询获取新单词 ID → **egress**
4. 对每个单词查询已有 contexts → **egress × N**

**优化方案 A：使用 RPC 函数**

```sql
-- 在 Supabase SQL Editor 创建函数
CREATE OR REPLACE FUNCTION sync_words_batch(
    p_user_id uuid,
    p_words jsonb  -- [{word, count, contexts, lookups}, ...]
)
RETURNS jsonb AS $$
DECLARE
    result jsonb := '{"synced": 0}';
BEGIN
    -- 批量处理逻辑
    -- 只返回统计数据，不返回完整记录
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

```javascript
// 客户端调用
const { data } = await supabaseClient.rpc('sync_words_batch', {
    p_user_id: currentUser.id,
    p_words: wordsToSync
});
// 返回值极小：{"synced": 100}
```

**优化方案 B：Upsert 后不再查询 ID**

```javascript
// ❌ 当前：upsert 后再查询 ID
await supabaseClient.from('words').upsert(batch, { onConflict: 'user_id,word' });
// 然后
const { data: wordRows } = await supabaseClient
    .from('words')
    .select('id, word')  // ← 额外的 egress
    .in('word', batchWords);

// ✅ 优化：upsert 时直接返回 ID
const { data: wordRows } = await supabaseClient
    .from('words')
    .upsert(batch, { onConflict: 'user_id,word' })
    .select('id, word');  // ← 一次操作，减少往返
```

---

### 问题 6: syncWordToCloud 中的冗余查询

**位置：supabase.js 第 234-255 行**

```javascript
// ❌ 当前代码：先查询已有 contexts，再 insert 新的
const { data: existingContexts } = await supabaseClient
    .from('word_contexts')
    .select('context')  // ← egress
    .eq('word_id', wordData.id);

const existingSet = new Set((existingContexts || []).map(c => c.context));
const newContexts = data.contexts.filter(c => !existingSet.has(c));

if (newContexts.length > 0) {
    await supabaseClient.from('word_contexts').insert(contextInserts);
}

// ✅ 优化：直接 upsert，让数据库处理重复
await supabaseClient
    .from('word_contexts')
    .upsert(contextInserts, {
        onConflict: 'word_id,context',
        ignoreDuplicates: true
    });
// 无需先查询，减少一次 egress
```

---

**位置：supabase.js 第 259-285 行（lookups 同理）**

```javascript
// ❌ 当前代码：查询最新 lookup 再决定是否 insert
const { data: existingLookups } = await supabaseClient
    .from('word_lookups')
    .select('looked_up_at')  // ← egress
    .eq('word_id', wordData.id)
    .order('looked_up_at', { ascending: false })
    .limit(1);

// ✅ 优化：直接 insert，用唯一约束防重复
// 或者在数据库层面用 trigger 处理
```

---

## 优化总结表

| 位置 | 问题 | 优化方法 | 预估节省 |
|------|------|----------|----------|
| 第 225 行 | `.select()` 返回全部列 | `.select('id')` | ~50% |
| 第 306 行 | `select('*')` | 只选 `id, word, lookup_count` | ~40% |
| 第 405 行 | `select('*')` | 只选需要的列 | ~40% |
| 第 236-254 行 | 查询已有 contexts | 改用 upsert + ignoreDuplicates | ~100% (消除查询) |
| 第 265-284 行 | 查询已有 lookups | 改用 upsert 或 trigger | ~100% (消除查询) |
| 第 859 行 | `select(*)` with join | 只选需要的列 | ~30% |
| 第 909 行 | `select(*)` with join | 只选需要的列 | ~30% |
| 第 1171 行 | `select(*)` with join | 只选需要的列 | ~30% |
| 第 587-598 行 | upsert 后再查询 ID | upsert 时直接 `.select('id, word')` | ~50% (减少往返) |

---

## 高级优化：使用 RPC 函数

对于批量同步操作，可以创建服务端函数，一次性处理所有数据：

```sql
-- Supabase SQL Editor
CREATE OR REPLACE FUNCTION bulk_sync_words(
    p_words jsonb
)
RETURNS jsonb AS $$
DECLARE
    synced_count int := 0;
    word_record jsonb;
BEGIN
    FOR word_record IN SELECT * FROM jsonb_array_elements(p_words)
    LOOP
        -- 处理每个单词
        INSERT INTO words (user_id, word, lookup_count)
        VALUES (
            auth.uid(),
            word_record->>'word',
            (word_record->>'count')::int
        )
        ON CONFLICT (user_id, word) DO UPDATE
        SET lookup_count = GREATEST(words.lookup_count, EXCLUDED.lookup_count);

        synced_count := synced_count + 1;
    END LOOP;

    RETURN jsonb_build_object('synced', synced_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**优点：**
- 一次 HTTP 请求完成所有操作
- 返回值极小（只有统计数字）
- 减少网络往返延迟
- Egress 几乎为零

---

## 实施优先级

1. **高优先级（简单改动，效果明显）**
   - 所有 `select('*')` 改为只选需要的列
   - `.select()` 改为 `.select('id')` 或移除

2. **中优先级（需要测试）**
   - 用 upsert + ignoreDuplicates 替代先查询后 insert
   - 合并 upsert 和获取 ID 的操作

3. **低优先级（需要后端改动）**
   - 创建 RPC 函数进行批量操作
   - 添加数据库 trigger 处理重复检测

---

## 监控 Egress 使用

在 Supabase Dashboard 可以查看：
- **Project Settings → Usage → Database Egress**

建议在代码中添加日志追踪：

```javascript
// 开发时可以记录响应大小
const { data, error } = await supabaseClient.from('words').select('*');
console.log('Response size:', JSON.stringify(data).length, 'bytes');
```
