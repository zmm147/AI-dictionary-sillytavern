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
    enableTopBar: false,
    cloudSyncEnabled: false, // 云端同步开关
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
    confusableWordsPrompt: `请列出与单词 "%word%" 形近易混淆的单词（拼写相似但意思不同的词），并给出原词释义。

请严格按照以下格式输出：
【原词释义】
- %word%: 释义
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
    playphraseCsrfToken: '',
    playphraseLimit: 10,
    highlightConfusables: false,
    highlightColor: '#e0a800',
    autoCollapseYoudao: false,
    autoFetchAI: true,
    fetchAIOnYoudaoExpand: true,
    immersiveReview: true,
    reviewPrompt: `Naturally incorporate at least one of the following words into the narrative without making the story feel forced or awkward: [%words%]. You do not need to use all the words from the list in a single reply. If some words do not fit naturally into the current scene, feel free to expand or advance the story to set up opportunities for incorporating the remaining words in future responses.`,
    // Pet commentary settings
    petCommentary: {
        enabled: false,
        collapsed: true,         // 是否折叠设置面板
        autoTrigger: false,
        randomTrigger: false,    // 是否启用随机触发
        randomChance: 30,        // 随机触发概率 (%)
        connectionProfile: '',
        usePresetFile: false,     // 使用预设文件
        presetFileName: '',       // 选择的预设文件名
        mergeChatHistory: true,   // 是否合并聊天记录为一条消息
        systemPrompt: `你是飞天猫咪，总是跟随在你的主人 - {{user}}身边，你会对{{user}}当前的故事发展发表吐槽和感想等。语言风格：第一人称口语化表达，简短，只输出用" "包裹的中文台词。`,
        userPrompt: `以上是最近的聊天记录，请给出你的吐槽评论。`,
        maxMessages: 10,
        bubbleDuration: 20,      // 吐槽气泡持续时间（秒）
    },
};
