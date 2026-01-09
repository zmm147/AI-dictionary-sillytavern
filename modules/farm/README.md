# Farm Game 模块化结构

农场游戏已经完成模块化拆分，代码更加清晰、易于维护。

## 目录结构

```
modules/farm/
├── farm-config.js      # 游戏配置和常量
├── farm-state.js       # 游戏状态管理
├── farm-storage.js     # 本地存储管理
├── farm-crop.js        # 作物相关逻辑
├── farm-shop.js        # 商店相关逻辑
├── farm-inventory.js   # 库存相关逻辑
└── farm-render.js      # 渲染相关功能

farm-game.js            # 主入口文件
```

## 模块说明

### 1. farm-config.js - 游戏配置
包含所有游戏常量和配置：
- `GRID_SIZE` - 网格大小
- `SAVE_KEY` - 存储键名
- `DAY_IN_MS` - 一天的毫秒数
- `CROPS` - 作物定义
- `GROWTH_STAGES` - 生长阶段
- `PETS` - 宠物定义

### 2. farm-state.js - 状态管理
管理游戏状态和UI状态：
- `gameState` - 游戏数据（金币、地块、物品等）
- `uiState` - UI状态（显示哪个界面）
- `initGameState()` - 初始化游戏状态
- `resetGameState()` - 重置游戏状态
- `resetUIState()` - 重置UI状态

### 3. farm-storage.js - 存储管理
处理本地存储：
- `saveGame()` - 保存游戏
- `loadGame()` - 加载游戏（包含旧数据兼容）

### 4. farm-crop.js - 作物逻辑
作物相关的所有逻辑：
- `getGrowthProgress()` - 获取生长进度
- `getGrowthStage()` - 获取生长阶段
- `getRemainingDays()` - 获取剩余时间
- `isRipe()` - 判断是否成熟
- `isCropUnlocked()` - 检查是否已解锁
- `unlockCrop()` - 解锁作物
- `plantCrop()` - 种植作物
- `harvestCrop()` - 收获作物
- `addBoost()` - 添加加速
- `boostAllCrops()` - 使用加速

### 5. farm-shop.js - 商店逻辑
商店和兑换相关：
- `exchangePet()` - 兑换宠物
- `getOwnedPetCount()` - 获取已拥有数量
- `canExchange()` - 检查是否可兑换

### 6. farm-inventory.js - 库存管理
物品库存相关：
- `getAllItems()` - 获取所有物品
- `getItemCount()` - 获取物品数量
- `getItemsByType()` - 按类型获取物品
- `formatItemTimestamp()` - 格式化时间戳
- `getItemTypeName()` - 获取类型名称

### 7. farm-render.js - 渲染模块
所有界面渲染功能：
- `renderPlot()` - 渲染地块
- `renderSeedsTab()` - 渲染种子标签页
- `renderExchangeTab()` - 渲染兑换标签页
- `renderShopView()` - 渲染商店界面
- `renderInventoryView()` - 渲染库存界面
- `renderFlashcardView()` - 渲染背单词界面
- `renderMainView()` - 渲染主界面
- `showHarvestMessage()` - 显示收获消息
- `showBoostMessage()` - 显示加速消息
- `showBoostAppliedMessage()` - 显示加速应用消息
- `showMessage()` - 显示提示消息

### 8. farm-game.js - 主入口
协调所有模块，处理事件绑定和游戏循环：
- `render()` - 主渲染函数
- `bindEvents()` - 绑定主界面事件
- `bindShopEvents()` - 绑定商店事件
- `bindInventoryEvents()` - 绑定库存事件
- `bindFlashcardEvents()` - 绑定背单词事件
- `handlePlotClick()` - 处理地块点击
- `init()` - 初始化游戏
- `reset()` - 重置游戏
- `cleanup()` - 清理资源

## 模块化优势

1. **职责清晰**：每个模块只负责特定功能
2. **易于维护**：修改某个功能只需关注对应模块
3. **可复用性**：模块可以独立导出和测试
4. **代码组织**：避免单一文件过大
5. **可扩展性**：添加新功能只需创建新模块

## 使用 ES6 模块

所有模块使用 ES6 的 `import/export` 语法：

```javascript
// 导入
import { gameState, uiState } from './modules/farm/farm-state.js';
import { saveGame, loadGame } from './modules/farm/farm-storage.js';

// 导出
export const CROPS = { ... };
export function plantCrop() { ... }
```

## 加载方式

主文件通过模块方式加载：

```javascript
const script = document.createElement('script');
script.type = 'module'; // 重要：标记为模块
script.src = `${extensionUrl}/farm-game.js`;
```

## 添加新功能

要添加新功能，只需：
1. 在对应模块中添加函数
2. 导出该函数
3. 在需要的地方导入使用

例如添加新的道具类型：
1. 在 `farm-config.js` 添加定义
2. 在 `farm-shop.js` 添加兑换逻辑
3. 在 `farm-render.js` 添加渲染
4. 在 `farm-game.js` 绑定事件
