# 查词时的云端同步流程分析

## 调用链路

```
用户查词
    ↓
wordHistory.js: markWordForSave(word)  (第 167-177 行)
    ↓
pendingCloudSyncs.add(word)
    ↓
syncToCloudDebounced()  (2秒防抖，第 146-161 行)
    ↓
cloudSyncCallback(word, data)
    ↓
top-bar-auth.js: 第 395-397 行
    onSync: async (word, data) => {
        await syncWordToCloud(word, data);
    }
    ↓
supabase.js: syncWordToCloud()  (第 207-292 行)
```

---

## 当前代码分析 (supabase.js 207-292行)

### 每次查词触发的请求

| 步骤 | 操作 | 代码位置 | 请求类型 | Egress 问题 |
|------|------|----------|----------|-------------|
| 1 | Upsert 单词 + `.select()` | 214-226 | POST | ❌ 返回完整行数据 |
| 2 | 查询已有 contexts | 236-239 | GET | ❌ 返回所有 context 字符串 |
| 3 | Insert 新 contexts | 252-254 | POST | ✅ 无返回 |
| 4 | 查询最新 lookup | 264-270 | GET | ❌ 返回 1 条记录 |
| 5 | Insert 新 lookup | 277-283 | POST | ✅ 无返回 |

**总计：每次查词最多 5 个请求，其中 3 个产生 egress**

---

## 当前代码详解

### 步骤 1: Upsert 单词 (问题：返回过多数据)

```javascript
// 第 214-226 行
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
    .select()      // ← 问题：返回所有列
    .single();
```

**问题：** `.select()` 返回完整行，包括 `id, user_id, word, lookup_count, last_lookup_at, is_blacklisted, created_at, updated_at`

**实际需要：** 只需要 `id` 用于后续操作

---

### 步骤 2: 查询已有 contexts (问题：冗余查询)

```javascript
// 第 234-255 行
if (data.contexts && data.contexts.length > 0) {
    // 查询已有 contexts
    const { data: existingContexts } = await supabaseClient
        .from('word_contexts')
        .select('context')      // ← 产生 egress
        .eq('word_id', wordData.id);

    const existingSet = new Set((existingContexts || []).map(c => c.context));

    // 过滤出新的 contexts
    const newContexts = data.contexts.filter(c => !existingSet.has(c));

    if (newContexts.length > 0) {
        const contextInserts = newContexts.map(context => ({
            word_id: wordData.id,
            user_id: currentUser.id,
            context
        }));

        await supabaseClient
            .from('word_contexts')
            .insert(contextInserts);
    }
}
```

**问题：** 先查询所有已有 context，再过滤插入新的

**更好方案：** 使用 `upsert` + `ignoreDuplicates`，让数据库处理重复

---

### 步骤 3: 查询最新 lookup (问题：冗余查询)

```javascript
// 第 258-285 行
if (data.lookups && data.lookups.length > 0) {
    const latestLookup = data.lookups[data.lookups.length - 1];

    // 查询最新的 lookup
    const { data: existingLookups, error: lookupCheckError } = await supabaseClient
        .from('word_lookups')
        .select('looked_up_at')      // ← 产生 egress
        .eq('word_id', wordData.id)
        .eq('user_id', currentUser.id)
        .order('looked_up_at', { ascending: false })
        .limit(1);

    const latestLookupTime = new Date(latestLookup).toISOString();
    const existingLatest = existingLookups?.[0]?.looked_up_at;

    // 只有当本地时间更新时才插入
    if (!existingLatest || new Date(existingLatest).getTime() < latestLookup) {
        await supabaseClient
            .from('word_lookups')
            .insert({
                word_id: wordData.id,
                user_id: currentUser.id,
                looked_up_at: latestLookupTime
            });
    }
}
```

**问题：** 每次都查询云端最新 lookup 来比较

**更好方案：** 使用 `upsert` + 唯一约束，让数据库处理重复

---

## 优化方案

### 优化后的 syncWordToCloud

```javascript
/**
 * Sync a word to cloud (real-time single word sync)
 * 优化版本：减少请求数和 egress
 */
export async function syncWordToCloud(word, data) {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        // 1. Upsert 单词，只返回 id
        const { data: wordData, error: wordError } = await supabaseClient
            .from('words')
            .upsert({
                user_id: currentUser.id,
                word: word.toLowerCase(),
                lookup_count: data.count,
                last_lookup_at: new Date().toISOString(),
                is_blacklisted: false
            }, { onConflict: 'user_id,word' })
            .select('id')  // ✅ 只要 id，减少 egress
            .single();

        if (wordError) {
            console.error(`[${EXTENSION_NAME}] Sync word error:`, wordError);
            return { success: false, error: wordError.message };
        }

        // 2. Contexts: 直接 upsert，不先查询
        if (data.contexts && data.contexts.length > 0) {
            const contextInserts = data.contexts.map(context => ({
                word_id: wordData.id,
                user_id: currentUser.id,
                context
            }));

            // ✅ 使用 upsert + ignoreDuplicates，消除查询
            await supabaseClient
                .from('word_contexts')
                .upsert(contextInserts, {
                    onConflict: 'word_id,context',
                    ignoreDuplicates: true
                });
        }

        // 3. Lookups: 直接 upsert，不先查询
        if (data.lookups && data.lookups.length > 0) {
            const latestLookup = data.lookups[data.lookups.length - 1];

            // ✅ 使用 upsert + ignoreDuplicates，消除查询
            await supabaseClient
                .from('word_lookups')
                .upsert({
                    word_id: wordData.id,
                    user_id: currentUser.id,
                    looked_up_at: new Date(latestLookup).toISOString()
                }, {
                    onConflict: 'word_id,user_id,looked_up_at',
                    ignoreDuplicates: true
                });
        }

        return { success: true };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Sync word exception:`, e);
        return { success: false, error: e.message };
    }
}
```

---

## 优化对比

| 指标 | 优化前 | 优化后 | 改善 |
|------|--------|--------|------|
| HTTP 请求数 | 5 | 3 | -40% |
| 产生 egress 的请求 | 3 | 1 | -67% |
| 第一个请求返回数据 | ~200 bytes | ~20 bytes | -90% |
| contexts 查询 | 每次都查 | 不查询 | -100% |
| lookups 查询 | 每次都查 | 不查询 | -100% |

---

## 数据库约束要求

优化方案需要在 Supabase 数据库添加唯一约束：

### word_contexts 表

```sql
-- 如果还没有，添加唯一约束
ALTER TABLE word_contexts
ADD CONSTRAINT word_contexts_word_id_context_unique
UNIQUE (word_id, context);
```

### word_lookups 表

```sql
-- 添加唯一约束（防止同一时间重复插入）
ALTER TABLE word_lookups
ADD CONSTRAINT word_lookups_word_id_user_id_looked_up_at_unique
UNIQUE (word_id, user_id, looked_up_at);
```

---

## 进一步优化：使用 RPC 函数

如果想进一步减少请求数（3 → 1），可以创建一个 PostgreSQL 函数：

```sql
CREATE OR REPLACE FUNCTION sync_word_with_data(
    p_word text,
    p_count int,
    p_contexts text[],
    p_latest_lookup timestamptz
)
RETURNS void AS $$
DECLARE
    v_word_id uuid;
BEGIN
    -- 1. Upsert word
    INSERT INTO words (user_id, word, lookup_count, last_lookup_at, is_blacklisted)
    VALUES (auth.uid(), lower(p_word), p_count, now(), false)
    ON CONFLICT (user_id, word) DO UPDATE
    SET lookup_count = EXCLUDED.lookup_count,
        last_lookup_at = EXCLUDED.last_lookup_at
    RETURNING id INTO v_word_id;

    -- 2. Upsert contexts
    IF p_contexts IS NOT NULL AND array_length(p_contexts, 1) > 0 THEN
        INSERT INTO word_contexts (word_id, user_id, context)
        SELECT v_word_id, auth.uid(), unnest(p_contexts)
        ON CONFLICT (word_id, context) DO NOTHING;
    END IF;

    -- 3. Upsert lookup
    IF p_latest_lookup IS NOT NULL THEN
        INSERT INTO word_lookups (word_id, user_id, looked_up_at)
        VALUES (v_word_id, auth.uid(), p_latest_lookup)
        ON CONFLICT (word_id, user_id, looked_up_at) DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

客户端调用：

```javascript
export async function syncWordToCloud(word, data) {
    if (!supabaseClient || !currentUser) {
        return { success: false, error: 'Not logged in' };
    }

    try {
        const latestLookup = data.lookups?.length > 0
            ? new Date(data.lookups[data.lookups.length - 1]).toISOString()
            : null;

        const { error } = await supabaseClient.rpc('sync_word_with_data', {
            p_word: word,
            p_count: data.count || 1,
            p_contexts: data.contexts || [],
            p_latest_lookup: latestLookup
        });

        if (error) {
            console.error(`[${EXTENSION_NAME}] Sync word error:`, error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Sync word exception:`, e);
        return { success: false, error: e.message };
    }
}
```

**RPC 优化结果：**
- 请求数：3 → 1
- Egress：~20 bytes → 0 (RPC 无返回值)
- 网络延迟：3 次往返 → 1 次往返

---

## 实施步骤

1. **简单优化（无需数据库改动）**
   - 修改 `.select()` 为 `.select('id')`
   - 立即生效，减少 egress

2. **中级优化（需要添加约束）**
   - 在 Supabase 添加唯一约束
   - 修改代码使用 `upsert` + `ignoreDuplicates`
   - 消除 2 个查询请求

3. **高级优化（需要创建 RPC）**
   - 在 Supabase 创建 `sync_word_with_data` 函数
   - 修改客户端使用 RPC 调用
   - 最大化减少请求和 egress
