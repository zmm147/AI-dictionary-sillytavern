/**
 * AI Dictionary - Constants Module
 * All configuration constants used across the extension
 */

// Extension identification
export const EXTENSION_NAME = 'ai-dictionary';

// Word history limits
export const WORD_HISTORY_MAX_CONTEXTS = 10;
export const WORD_HISTORY_MAX_CONTEXT_LENGTH = 500;

// Ebbinghaus spaced repetition intervals (days)
export const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30];
export const MAX_DAILY_REVIEW_WORDS = 20;

// Flashcard configuration
export const FLASHCARD_DECK_SIZE = 20; // 每组单词数量
export const FLASHCARD_REVIEW_INTERVAL = 5; // 每隔5张卡复习一次
export const FLASHCARD_MASTERY_THRESHOLD = 2; // Session内答对2次视为掌握
export const FLASHCARD_NEW_WORD_RATIO = 0.6; // 新词占比60%，旧词40%

// IndexedDB configuration
export const DB_NAME = 'ai-dictionary-db';
export const DB_VERSION = 2; // Upgraded for flashcard progress tracking
export const STORE_WORD_HISTORY = 'wordHistory';
export const STORE_REVIEW_PENDING = 'reviewPending';
export const STORE_REVIEW_PROGRESS = 'reviewProgress';
export const STORE_REVIEW_MASTERED = 'reviewMastered';
export const STORE_SESSION = 'sessionData';
export const STORE_FLASHCARD_PROGRESS = 'flashcardProgress';
export const STORE_FLASHCARD_SESSION = 'flashcardSession';

// JSON backup file names
export const BACKUP_WORD_HISTORY_FILE = 'ai-dictionary-word-history.json';
export const BACKUP_REVIEW_DATA_FILE = 'ai-dictionary-review-data.json';
export const BACKUP_FLASHCARD_DATA_FILE = 'ai-dictionary-flashcard-data.json';

// Default settings
export const defaultSettings = {
    enabled: true,
    systemPrompt: 'You are a professional English teacher.',
    userPrompt: `输入：%word%
上下文：%context%

请根据输入内容进行处理：
1. 如果是单词：给出基础释义（用【解释性描述】），然后分析在上下文中的具体含义。
2. 如果是短语或句子：先给出中文翻译再分析句子结构。`,
    contextRange: 'all',
    connectionProfile: '',
    enableDirectLookup: false,
    iconPosition: 'bottom-left',
    mobileTogglePosition: null,
    deepStudyPrompt: `请帮我深度学习单词 "%word%"：
1. 词根词缀分析（如有）
2. 常见搭配和用法
3. 同义词/反义词/易混淆单词
4. 记忆技巧建议`,
    confusableWordsPrompt: `请列出与单词 "%word%" 形近易混淆的单词（拼写相似但意思不同的词）。

请严格按照以下格式输出：
【形近词列表】word1, word2, word3
【释义】
- word1: 释义
- word2: 释义
- word3: 释义

注意：
1. 只列出拼写相似、容易混淆的单词
2. 每个单词给出简短的中文释义
3. 如果没有常见的形近词，请说明`,
    confusableWords: {},
    highlightConfusables: false,
    highlightColor: '#e0a800',
    autoCollapseYoudao: false,
    autoFetchAI: true,
    fetchAIOnYoudaoExpand: true,
    immersiveReview: true,
    reviewPrompt: `Naturally incorporate the following words into the narrative at least once, without making the story feel forced or awkward: [%words%]. If the current part of the story does not naturally fit these words, you may develop the scene to make their use plausible.`,
    // Pet commentary settings
    petCommentary: {
        enabled: false,
        autoTrigger: false,
        connectionProfile: '',
        useProfilePrompt: false,  // 使用API预设绑定的提示词
        systemPrompt: `你是一只可爱又毒舌的宠物，名叫{{petName}}，正在旁观主人{{user}}和AI角色的聊天。请用简短（1-2句话）、俏皮、略带吐槽的语气评论这段对话。可以评论剧情发展、角色行为、或者主人的选择。保持轻松幽默的风格。`,
        maxMessages: 10,
    },
};
