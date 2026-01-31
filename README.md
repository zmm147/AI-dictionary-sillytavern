# AI Dictionary - SillyTavern 智能词典扩展

一个专为英语学习设计的 SillyTavern 扩展，让你在与 AI 对话的同时高效学习英语。

<img width="454" height="618" alt="image" src="https://github.com/user-attachments/assets/30165265-7463-445b-85b8-8a2bee4a5358" />

<img width="961" height="539" alt="image" src="https://github.com/user-attachments/assets/ed1f9aab-0ccb-44cd-8992-968e929f79c2" />



---

## ✨ 核心特色

### 1️⃣ 有道词典 + AI 智能查词

**双引擎查词，精准又智能**

- **有道词典**：柯林斯词典 + 英汉词典，权威释义
- **AI 智能释义**：结合上下文，给出最贴切的解释
- **发音播放**：英式/美式发音，随时跟读
- **选中即查**：鼠标选中文本，一键查询

---

### 2️⃣ PlayPhrase 视频例句

**从真实影视作品中学习单词用法**

- 自动搜索包含目标单词的影视片段
- 观看真实场景中的单词应用
- 查看原文台词和来源信息
- 支持多个例句切换


<img width="442" height="499" alt="image" src="https://github.com/user-attachments/assets/50ee7252-2836-44c9-afb0-1ea5d362cacb" />

---

### 3️⃣ 沉浸式复习

**在对话中自然复习单词，告别死记硬背**

- AI 会在回复中自然使用你的复习单词
- 无需刻意背诵，在真实语境中加深记忆
- 基于 SM-2 算法的科学复习计划
- 自动追踪单词掌握度

**工作原理：**
1. 查词后自动加入复习队列
2. 与 AI 对话时，系统提示 AI 使用复习单词
3. AI 在回复中自然融入这些单词
4. 你在阅读中自然复习，加深印象

---

### 4️⃣ 视频播放 + 字幕制作角色卡

**导入本地视频，边看边学，一键生成角色卡**

- 导入本地视频文件（支持 .srt 字幕）
- 点击字幕即可查词
- 一键将字幕内容制作成角色卡
- 与视频角色对话练习

**使用场景：**
- 看美剧学英语，遇到生词立即查询
- 将喜欢的角色台词制作成卡片
- 与角色对话，模拟真实场景

---

### 5️⃣ 云端同步

**多设备无缝切换，数据永不丢失**

- 查词记录云端同步
- 复习进度实时保存
- 闪卡数据跨设备共享
- 支持手动导入/导出备份

**数据保护：**
- 本地 IndexedDB 存储
- 自动备份到 SillyTavern 数据目录
- 可选云端同步（需配置）

---

## 📦 安装

### 方法一：Git 克隆（推荐）

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/zmm147/AI-dictionary-sillytavern.git
```

### 方法二：手动下载

1. 下载 [最新版本](https://github.com/zmm147/AI-dictionary-sillytavern/archive/refs/heads/main.zip)
2. 解压到 `SillyTavern/public/scripts/extensions/third-party/AI-dictionary-sillytavern`
3. 重启 SillyTavern

---

## ⚙️ 常见问题

### 有道词典无法使用？

在 SillyTavern 的 `config.yaml` 中设置：
```yaml
enableCorsProxy: true
```

### PlayPhrase 视频无法加载？

1. 访问 https://www.playphrase.me/
2. 打开浏览器开发者工具（F12）
3. 在 Network 中找到 API 请求，复制 CSRF Token
4. 在扩展设置中更新 Token

### 数据丢失怎么办？

- 数据自动保存到 `SillyTavern/data/default-user/` 目录
- 可在设置中手动导出备份
- 支持从备份文件恢复

---

## 🙏 致谢

- [Youdao Dictionary](https://www.youdao.com/) - 词典数据
- [SillyTavern](https://github.com/SillyTavern/SillyTavern) - 优秀平台
- [PlayPhrase](https://www.playphrase.me/) - 视频例句
- [ODH](https://github.com/ninja33/ODH) - 样式参考

---

## 📄 许可证

MIT License

---

**让英语学习更自然、更高效！** 🎉
