# AI Dictionary for SillyTavern

A powerful dictionary extension for SillyTavern that combines Youdao Dictionary lookups with AI-powered definitions features.

一个强大的 SillyTavern 词典扩展，结合有道词典查询与 AI 智能释义功能。

<img width="458" height="741" alt="image" src="https://github.com/user-attachments/assets/845e498f-2117-4be6-8355-75df19a96f7c" />

---

## Features / 功能特点

### Dictionary Lookup / 词典查询
- **Youdao Dictionary Integration**: Automatically fetches definitions from Youdao Dictionary (Collins & EC dictionaries)
- **AI-Powered Definitions**: Get contextual definitions using your configured AI model
- **Audio Pronunciation**: Listen to UK/US pronunciations for words
- **Streaming Response**: Real-time streaming AI responses when enabled

- **有道词典集成**：自动从有道词典获取释义（柯林斯词典和英汉词典）
- **AI 智能释义**：使用配置的 AI 模型获取基于上下文的释义
- **发音功能**：支持英式/美式发音播放
- **流式输出**：支持实时流式 AI 响应

### Deep Study / 深度学习
- **One-Click Deep Learning**: Comprehensive word analysis including etymology, collocations, synonyms/antonyms, example sentences, and memory tips
- **Customizable Prompts**: Configure your own AI prompts for dictionary lookups and deep study

- **一键深度学习**：全面的单词分析，包括词根词缀、常见搭配、同义词/反义词、例句和记忆技巧
- **自定义提示词**：可配置查词和深度学习的 AI 提示词

### User Interface / 用户界面

**Desktop / 桌面端**:
- Draggable popup panel / 可拖拽移动的弹出面板
- Resizable width / 可调节宽度
- Pin function to prevent auto-close / 固定功能防止自动关闭
- Click outside to close (when not pinned) / 点击外部关闭（未固定时）

**Mobile / 移动端**:
- Slide-out side panel / 侧滑面板
- Draggable toggle button / 可拖拽的切换按钮
- Tap outside to collapse / 点击外部收起

### Other Features / 其他功能
- **Connection Profile Selection**: Use a specific API profile for dictionary lookups / 可为词典查询选择特定的连接配置
- **Context Range Options**: Full paragraph / Single paragraph / Single sentence / 上下文范围：全段/单段/一句
- **Direct Lookup Mode**: Skip icon, lookup immediately on text selection / 直接查词模式，选中即查询
- **Prompt Viewer**: View the actual prompts sent to AI / 查看发送给 AI 的实际提示词

---

## Installation / 安装

### Method 1: Git Clone / 方法一：Git 克隆

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/YOUR_USERNAME/AI-dictionary-sillytavern.git
```

### Method 2: Manual Download / 方法二：手动下载

1. Download the repository as a ZIP file / 下载仓库 ZIP 文件
2. Extract to `SillyTavern/public/scripts/extensions/third-party/AI-dictionary-sillytavern` / 解压到该目录
3. Restart SillyTavern / 重启 SillyTavern

---

## Usage / 使用方法

### Basic Lookup / 基本查词
1. Select any text on the page / 在页面上选中任意文本
2. Click the dictionary icon that appears / 点击出现的词典图标
3. View Youdao dictionary results and AI definitions / 查看有道词典结果和 AI 释义

### Direct Lookup Mode / 直接查词模式
1. Enable "Direct Lookup" in settings / 在设置中启用"直接查词"
2. Simply select text - lookup happens automatically / 选中文本即自动查词

### Deep Study / 深度学习
1. Look up a single word / 查询单个单词
2. Click the "深度学习此单词" button / 点击"深度学习此单词"按钮
3. AI will provide comprehensive analysis / AI 将提供全面的分析

### Pin Panel (Desktop) / 固定面板（桌面端）
- Click the pin icon (📌) in the panel header / 点击面板标题栏的图钉图标
- When pinned, clicking outside won't close the panel / 固定后点击外部不会关闭面板

---

## Settings / 设置

| Setting | Description | 说明 |
|---------|-------------|------|
| Enable AI Dictionary | Toggle extension on/off | 开关扩展 |
| Connection Profile | Select API profile for lookups | 选择查词使用的 API 配置 |
| System Prompt | AI system prompt | AI 系统提示词 |
| User Prompt | Query template with variables | 查询模板（支持变量） |
| Context Range | Full/Single paragraph/Sentence | 全段/单段/一句 |
| Direct Lookup | Lookup immediately on selection | 选中即查询 |
| Icon Position | Position of lookup icon | 查词图标位置 |
| Deep Study Prompt | AI prompt for deep learning | 深度学习提示词 |

---

## Supported Variables / 支持的变量

| Variable | Description | 说明 |
|----------|-------------|------|
| `%word%` | The selected word or phrase | 选中的单词或短语 |
| `%context%` | Surrounding context based on settings | 基于设置的周围上下文 |

---

## Files / 文件说明

| File | Description |
|------|-------------|
| `manifest.json` | Extension metadata / 扩展元数据 |
| `index.js` | Main extension code / 主要扩展代码 |
| `index.html` | Settings UI template / 设置界面模板 |
| `style.css` | Styles for UI / 界面样式 |

---

## Requirements / 系统要求

- SillyTavern 1.10.0 or higher / SillyTavern 1.10.0 或更高版本
- A configured AI API (OpenAI, Claude, etc.) / 已配置的 AI API

---

## Troubleshooting / 故障排除

### Extension not loading / 扩展未加载
- Check browser console for errors (F12 -> Console) / 检查浏览器控制台错误
- Verify the extension folder is in the correct location / 确认扩展文件夹位置正确

### Youdao dictionary not working / 有道词典不工作
- In the config.yaml file, set:   enableCorsProxy: true / 在config.yaml文件里设置：enableCorsProxy: true
- This may happen for phrases/sentences, AI lookup will still work / 短语/句子可能无法查询，但 AI 查词仍可用

### AI lookup not working / AI 查词不工作
- Verify your API connection is active / 确认 API 连接正常
- Check if streaming is enabled in your API settings / 检查 API 设置中的流式输出

---

## License / 许可证

MIT License

---

## Acknowledgments / 致谢

- Youdao Dictionary for dictionary data / 有道词典提供词典数据
- SillyTavern team for the amazing platform / SillyTavern 团队提供的优秀平台
- https://github.com/ninja33/ODH / 解析有道词典和样式排版chrome拓展