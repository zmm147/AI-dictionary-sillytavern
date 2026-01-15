/**
 * AI Dictionary Flashcard - 背单词卡片
 * 背单词加速作物收获！
 * 支持进度保存和SM-2算法
 *
 * 模块化入口文件
 */

console.log('[Flashcard] Script loading...');

// 导入模块
import { render } from './flashcard-render.js';
import { setRenderFunction as setBlindRenderFunction } from './flashcard-blind.js';
import { setRenderFunction as setCardRenderFunction, start } from './flashcard-card.js';
import { getCompletedCount, getRemainingCount, stopReviewTimer } from './flashcard-deck.js';

// 设置渲染函数引用
setBlindRenderFunction(render);
setCardRenderFunction(render);

// 创建 Flashcard 对象
const Flashcard = {
    start,
    render,
    getCompletedCount,
    getRemainingCount,
    stopReviewTimer,
};

// 导出到 window
if (typeof window !== 'undefined') {
    window.Flashcard = Flashcard;
    console.log('[Flashcard] Script loaded successfully, window.Flashcard set');
}

export default Flashcard;
