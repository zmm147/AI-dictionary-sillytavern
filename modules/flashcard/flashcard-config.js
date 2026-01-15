/**
 * Flashcard - Configuration Module
 * 配置常量定义
 */

// 牌组配置
export const DECK_SIZE = 20; // 每组单词数量
export const REVIEW_INTERVAL = 5 * 60 * 1000; // 每隔5分钟复习一次

// TTS 配置
export const MOBILE_TTS_ENDPOINT = 'https://tts.wangwangit.com/v1/audio/speech';
export const MOBILE_TTS_VOICE = 'en-US-JennyNeural';

// 默认语速
export const DEFAULT_TTS_SPEED = 1.0;

// LocalStorage 键名
export const TTS_SPEED_STORAGE_KEY = 'flashcard_tts_speed';
