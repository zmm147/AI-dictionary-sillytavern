/**
 * AI Dictionary - Character Creation Module
 * Character card creation with AI-generated descriptions
 */

import { EXTENSION_NAME } from '../constants.js';
import { videoState } from './top-bar-state.js';

/**
 * Default character prompt template
 */
const DEFAULT_CHARACTER_PROMPT = `<srt>
{{字幕内容}}
</srt>
阅读上面srt字幕文本，按照下面的格式，生成{{角色}}的角色扮演卡片。

  [{{char}}'s Personality= "性格关键词1", "性格关键词2", "性格关键词3", "...", "..."]
  [{{char}}'s body= "外貌特征1", "外貌特征2", "服装特征", "...", "..."]
  <START>
  {{user}}: "Describe your traits?"
  {{char}}: *在此处描写角色的微表情、动作或周围的环境氛围，体现角色的性格。* "在此处填入角色关于自己性格的自述，展现其说话的语气、口癖和态度。"
  {{user}}: "Describe your body and features."
  {{char}}: *描写角色听到问题后的反应（如笑声、羞涩、自信等）。* "在此处通过角色的口吻描述自己的外貌（头发、眼睛、身材、衣着）。"
  First message = *描写该角色出现在{{场景}}的场景状态。* "角色的第一句话" `;

/**
 * Character framework prompt template
 */
const DEFAULT_FRAMEWORK_PROMPT = `<srt>
{{字幕内容}}
</srt>

# Character Plot Flowchart Agent

You are a specialized Script Analysis Agent designed to map out a specific character's journey. You will analyze the provided subtitle text (SRT context) to create a **Character Plot Flowchart**.

## Configuration
**TARGET CHARACTER**: [{{角色}}]
**DATA SOURCE**: The subtitle text provided in the current context.

## Your Task

Analyze the provided text and generate a structured summary of the Target Character's scenes, showing:
1. **Scene Flow**: A chronological list of scenes acting as a high-level flowchart.
2. **Scene Details**: Key interactions, location, and verbatim dialogues for each scene.

## Process

1. **Scan**: Read the provided text and identify every scene where the **TARGET CHARACTER** is present.
2. **Filter**: Select only dialogues that drive the plot or reveal character depth (exclude small talk).
3. **Format**: Output the data strictly following the structure below.

## Output Structure

\`\`\`markdown
# Plot Flowchart: [TARGET CHARACTER]

## Scene 1: [Scene Title]
**Location**: [Where]
**Characters Present**: [List]
**Key Action**: [Brief summary]

### Dialogue Excerpt
> **[Character Name]**: "[Exact quote from text]"
> **[Character Name]**: "[Exact quote from text]"

---

## Scene 2: [Scene Title]
...
\`\`\`

## Rules
- Use **exact quotes** from the text (no paraphrasing).
- Include scene numbers for easy reference.
- Focus on plot-critical moments.
- Maintain chronological order.`;

/**
 * Default system prompt for character generation
 */
const DEFAULT_SYSTEM_PROMPT = '你是专业的srt-script角色扮演卡片制作大师';

/**
 * Extraction prompt for characters and locations
 */
const EXTRACTION_PROMPT = `分析以下SRT字幕内容，提取所有主要角色名称和推断场景。

<srt>
{{字幕内容}}
</srt>

请以JSON格式返回结果，格式如下：
{
  "characters": ["角色1", "角色2", "角色3"],
  "scenes": ["场景1", "场景2", "场景3"]
}

要求：
1. 只提取在字幕中明确出现的角色名称（不要推测）
2. 根据对话内容和上下文推断场景（例如：办公室、咖啡厅、家中、街道等）
3. 场景描述要简洁明确（2-4个字）
4. 每个列表最多返回10个项目
5. 只返回JSON，不要其他解释文字`;

/**
 * Get default system prompt
 * @returns {string}
 */
function getDefaultSystemPrompt() {
    return DEFAULT_SYSTEM_PROMPT;
}

/**
 * Storage key for character presets
 */
const PRESETS_STORAGE_KEY = 'ai-dict-character-presets';

/**
 * Storage key for preset generated contents
 */
const PRESET_CONTENTS_STORAGE_KEY = 'ai-dict-preset-contents';

/**
 * Current session preset contents (preset name -> generated content)
 */
let presetContents = [];

/**
 * Load preset contents from localStorage
 * @returns {Array<{id: string, name: string, content: string, selected: boolean}>}
 */
function loadPresetContents() {
    try {
        const stored = localStorage.getItem(PRESET_CONTENTS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('[AI Dictionary] Error loading preset contents:', error);
        return [];
    }
}

/**
 * Save preset contents to localStorage
 * @param {Array<{id: string, name: string, content: string, selected: boolean}>} contents
 */
function savePresetContents(contents) {
    try {
        localStorage.setItem(PRESET_CONTENTS_STORAGE_KEY, JSON.stringify(contents));
    } catch (error) {
        console.error('[AI Dictionary] Error saving preset contents:', error);
    }
}

/**
 * Render preset tags
 */
function renderPresetTags() {
    const tagsContainer = document.getElementById('ai-dict-preset-tags');
    const tagsWrapper = document.getElementById('ai-dict-preset-tags-container');

    if (!tagsContainer || !tagsWrapper) return;

    presetContents = loadPresetContents();

    if (presetContents.length === 0) {
        tagsWrapper.style.display = 'none';
        return;
    }

    tagsWrapper.style.display = 'block';
    tagsContainer.innerHTML = '';

    presetContents.forEach((preset, index) => {
        const tag = document.createElement('div');
        tag.className = 'ai-dict-preset-tag' + (preset.selected ? ' selected' : '');
        tag.draggable = true;
        tag.dataset.presetId = preset.id;
        tag.dataset.index = index;
        tag.innerHTML = `
            <span class="ai-dict-preset-tag-name">${preset.name}</span>
        `;

        // Click to toggle selection
        tag.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            togglePresetSelection(preset.id);
        });

        // Drag events
        tag.addEventListener('dragstart', handleDragStart);
        tag.addEventListener('dragover', handleDragOver);
        tag.addEventListener('drop', handleDrop);
        tag.addEventListener('dragend', handleDragEnd);

        tagsContainer.appendChild(tag);
    });

    // Bind trash events
    const trash = document.getElementById('ai-dict-preset-trash');
    if (trash) {
        trash.addEventListener('dragover', handleTrashDragOver);
        trash.addEventListener('dragleave', handleTrashDragLeave);
        trash.addEventListener('drop', handleTrashDrop);
    }

    // Update output based on current selection
    updateOutputFromTags();
}

/**
 * Toggle preset selection
 * @param {string} presetId
 */
function togglePresetSelection(presetId) {
    presetContents = loadPresetContents();
    const preset = presetContents.find(p => p.id === presetId);

    if (preset) {
        preset.selected = !preset.selected;
        savePresetContents(presetContents);
        renderPresetTags();
    }
}

/**
 * Update output textarea based on selected tags
 */
function updateOutputFromTags() {
    const outputTextarea = document.getElementById('ai-dict-character-output');
    if (!outputTextarea) return;

    presetContents = loadPresetContents();

    // Concatenate selected preset contents in order
    const selectedContents = presetContents
        .filter(p => p.selected)
        .map(p => p.content)
        .join('\n\n');

    outputTextarea.value = selectedContents;
}

/**
 * Drag and drop handlers
 */
let draggedElement = null;

function handleDragStart(e) {
    draggedElement = e.currentTarget;
    e.currentTarget.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';

    const target = e.currentTarget;
    if (draggedElement !== target) {
        target.classList.add('drag-over');
    }

    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    e.currentTarget.classList.remove('drag-over');

    if (draggedElement !== e.currentTarget) {
        // Get indices
        const draggedIndex = parseInt(draggedElement.dataset.index);
        const targetIndex = parseInt(e.currentTarget.dataset.index);

        // Reorder array
        presetContents = loadPresetContents();
        const [removed] = presetContents.splice(draggedIndex, 1);
        presetContents.splice(targetIndex, 0, removed);

        savePresetContents(presetContents);
        renderPresetTags();
    }

    return false;
}

function handleDragEnd(e) {
    e.currentTarget.style.opacity = '1';

    // Remove drag-over class from all tags and trash
    document.querySelectorAll('.ai-dict-preset-tag').forEach(tag => {
        tag.classList.remove('drag-over');
    });
    const trash = document.getElementById('ai-dict-preset-trash');
    if (trash) {
        trash.classList.remove('drag-over');
    }
}

/**
 * Handle drag over trash
 */
function handleTrashDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
    return false;
}

/**
 * Handle drag leave trash
 */
function handleTrashDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

/**
 * Handle drop on trash
 */
function handleTrashDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    if (e.preventDefault) {
        e.preventDefault();
    }

    e.currentTarget.classList.remove('drag-over');

    if (draggedElement) {
        // Get the preset name from the dragged element
        const presetName = draggedElement.querySelector('.ai-dict-preset-tag-name').textContent;

        // Remove from presetContents
        presetContents = loadPresetContents();
        const updatedContents = presetContents.filter(p => p.name !== presetName);
        savePresetContents(updatedContents);

        // Re-render tags
        renderPresetTags();

        if (typeof toastr !== 'undefined') {
            toastr.success(`标签 "${presetName}" 已删除`, '成功');
        }
    }

    return false;
}

/**
 * Update subtitle display in character modal
 */
export function updateCharacterSubtitleDisplay() {
    const subtitleToggle = document.getElementById('ai-dict-character-subtitle-toggle');
    const subtitleStatus = document.getElementById('ai-dict-character-subtitle-status');
    const subtitleText = document.getElementById('ai-dict-character-subtitle-text');

    if (!subtitleToggle || !subtitleStatus || !subtitleText) return;

    // Check if subtitles are loaded
    if (videoState.currentSubtitleCues && videoState.currentSubtitleCues.length > 0) {
        subtitleStatus.textContent = `(${videoState.currentSubtitleCues.length}条)`;
        subtitleStatus.classList.remove('no-subtitle');

        // Format subtitle content for display
        let html = '';
        videoState.currentSubtitleCues.forEach((cue, index) => {
            const time = cue.start ? formatTime(cue.start) : '';
            const text = cue.text ? escapeHtml(cue.text).replace(/\n/g, '<br>') : '';
            html += `<div class="ai-dict-character-subtitle-line">
                <span class="ai-dict-character-subtitle-time">${time}</span>
                <span class="ai-dict-character-subtitle-text">${text}</span>
            </div>`;
        });
        subtitleText.innerHTML = html;
    } else {
        subtitleStatus.textContent = '(无字幕)';
        subtitleStatus.classList.add('no-subtitle');
        subtitleText.innerHTML = '<div class="ai-dict-character-subtitle-empty">未加载字幕文件</div>';
    }
}

/**
 * Format time in seconds to MM:SS format
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Escape HTML characters
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Toggle subtitle content visibility
 */
export function toggleCharacterSubtitle() {
    const subtitleToggle = document.getElementById('ai-dict-character-subtitle-toggle');
    const subtitleContent = document.getElementById('ai-dict-character-subtitle-content');

    if (!subtitleToggle || !subtitleContent) return;

    const isExpanded = subtitleContent.style.display !== 'none';
    subtitleContent.style.display = isExpanded ? 'none' : 'block';
    subtitleToggle.classList.toggle('expanded', !isExpanded);
    subtitleToggle.querySelector('i').className = isExpanded ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
}

/**
 * Save system prompt to localStorage
 */
export function saveSystemPrompt() {
    const systemPromptTextarea = document.getElementById('ai-dict-character-system-prompt');
    if (systemPromptTextarea) {
        localStorage.setItem('ai-dict-character-system-prompt', systemPromptTextarea.value);
    }
}

/**
 * Extract characters and locations from subtitle using AI
 * @param {Object} options
 * @param {Object} options.settings - Extension settings
 * @param {Function} options.sendOpenAIRequest - Send OpenAI request function
 * @param {Object} options.oaiSettings - OAI settings
 * @returns {Promise<{characters: string[], locations: string[]}>}
 */
async function extractCharactersAndLocations(options) {
    const { settings, sendOpenAIRequest, oaiSettings } = options;

    try {
        // Get subtitle content
        let subtitleContext = '';
        if (videoState.originalSubtitleContent && videoState.originalSubtitleContent.trim()) {
            subtitleContext = videoState.originalSubtitleContent;
        } else {
            throw new Error('没有加载字幕文件');
        }

        // Get system prompt
        const systemPromptTextarea = document.getElementById('ai-dict-character-system-prompt');
        const customSystemPrompt = systemPromptTextarea ? systemPromptTextarea.value.trim() : '';

        // Build messages
        const messages = [];

        if (customSystemPrompt) {
            messages.push({
                role: 'system',
                content: customSystemPrompt
            });
        }

        // Replace {{字幕内容}} in extraction prompt
        const promptWithSubtitle = EXTRACTION_PROMPT.replace(/\{\{字幕内容\}\}/g, subtitleContext);

        messages.push({
            role: 'user',
            content: promptWithSubtitle
        });

        // Create abort controller
        const abortController = new AbortController();

        // Stream response
        let fullResponse = '';
        const streamEnabled = oaiSettings.stream_openai;

        if (streamEnabled) {
            const generator = await sendOpenAIRequest('normal', messages, abortController.signal);

            if (typeof generator === 'function') {
                for await (const data of generator()) {
                    if (data && data.text) {
                        fullResponse = data.text;
                    }
                }
            } else {
                throw new Error('Invalid generator returned from sendOpenAIRequest');
            }
        } else {
            throw new Error('Non-streaming mode not supported yet. Please enable streaming in API settings.');
        }

        // Parse JSON response
        console.log('[AI Dictionary] Extraction response:', fullResponse);

        // Try to extract JSON from response
        let jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('无法从AI响应中提取JSON数据');
        }

        const result = JSON.parse(jsonMatch[0]);

        if (!result.characters || !result.scenes) {
            throw new Error('AI响应格式不正确');
        }

        return {
            characters: result.characters || [],
            locations: result.scenes || []  // Map scenes to locations for compatibility
        };

    } catch (error) {
        console.error('[AI Dictionary] Error extracting characters and locations:', error);
        throw error;
    }
}

/**
 * Update character and location selects with extracted data
 * @param {string[]} characters
 * @param {string[]} locations
 */
function updateInfoSelects(characters, locations) {
    const characterSelect = document.getElementById('ai-dict-character-select');
    const locationSelect = document.getElementById('ai-dict-location-select');

    if (!characterSelect || !locationSelect) return;

    // Clear existing options
    characterSelect.innerHTML = '<option value="">-- 选择角色 --</option>';
    locationSelect.innerHTML = '<option value="">-- 选择地点 --</option>';

    // Add character options
    characters.forEach(char => {
        const option = document.createElement('option');
        option.value = char;
        option.textContent = char;
        characterSelect.appendChild(option);
    });

    // Add location options
    locations.forEach(loc => {
        const option = document.createElement('option');
        option.value = loc;
        option.textContent = loc;
        locationSelect.appendChild(option);
    });

    // Show selects
    characterSelect.style.display = 'block';
    locationSelect.style.display = 'block';
}

/**
 * Save generated content with preset name
 * @param {string} presetName - Name of the preset used
 * @param {string} content - Generated content
 */
function saveGeneratedContent(presetName, content) {
    if (!presetName || !content) return;

    presetContents = loadPresetContents();

    // Check if this preset already has content
    const existingIndex = presetContents.findIndex(p => p.name === presetName);

    if (existingIndex >= 0) {
        // Update existing content
        presetContents[existingIndex].content = content;
    } else {
        // Add new content (user can delete and it will reappear when generating again)
        presetContents.push({
            id: `content-${Date.now()}`,
            name: presetName,
            content: content,
            selected: true
        });
    }

    savePresetContents(presetContents);
    renderPresetTags();
}

/**
 * Load presets from localStorage
 * @returns {Array<{id: string, name: string, content: string}>}
 */
function loadPresets() {
    try {
        const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('[AI Dictionary] Error loading presets:', error);
        return [];
    }
}

/**
 * Save presets to localStorage
 * @param {Array<{id: string, name: string, content: string}>} presets
 */
function savePresets(presets) {
    try {
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch (error) {
        console.error('[AI Dictionary] Error saving presets:', error);
        throw error;
    }
}

/**
 * Update preset select dropdown
 */
function updatePresetSelect() {
    const presetSelect = document.getElementById('ai-dict-preset-select');
    if (!presetSelect) return;

    const presets = loadPresets();
    const currentValue = presetSelect.value;

    // Clear existing options except the first one
    presetSelect.innerHTML = '<option value="">-- 选择预设 --</option>';

    // Add preset options
    presets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        presetSelect.appendChild(option);
    });

    // Restore selection if it still exists
    if (currentValue && presets.some(p => p.id === currentValue)) {
        presetSelect.value = currentValue;
    }
}

/**
 * Save to current selected preset
 */
function saveToCurrentPreset() {
    const presetSelect = document.getElementById('ai-dict-preset-select');
    const inputTextarea = document.getElementById('ai-dict-character-input');
    const content = inputTextarea?.value?.trim();

    if (!content) {
        if (typeof toastr !== 'undefined') {
            toastr.warning('请先输入内容', '提示');
        }
        return;
    }

    if (!presetSelect || !presetSelect.value) {
        if (typeof toastr !== 'undefined') {
            toastr.warning('请先选择一个预设', '提示');
        }
        return;
    }

    try {
        const presets = loadPresets();
        const preset = presets.find(p => p.id === presetSelect.value);

        if (!preset) {
            if (typeof toastr !== 'undefined') {
                toastr.error('预设不存在', '错误');
            }
            return;
        }

        // Update preset content
        preset.content = content;
        savePresets(presets);

        if (typeof toastr !== 'undefined') {
            toastr.success(`预设 "${preset.name}" 已更新`, '成功');
        }
    } catch (error) {
        console.error('[AI Dictionary] Error saving preset:', error);
        if (typeof toastr !== 'undefined') {
            toastr.error('保存预设失败', '错误');
        }
    }
}

/**
 * Save as new preset
 */
function saveAsNewPreset() {
    const inputTextarea = document.getElementById('ai-dict-character-input');
    const content = inputTextarea?.value?.trim();

    if (!content) {
        if (typeof toastr !== 'undefined') {
            toastr.warning('请先输入内容', '提示');
        }
        return;
    }

    // Prompt for preset name
    const presetName = prompt('请输入预设名称：');
    if (!presetName || !presetName.trim()) {
        return;
    }

    try {
        const presets = loadPresets();
        const newPreset = {
            id: `preset-${Date.now()}`,
            name: presetName.trim(),
            content: content
        };

        presets.push(newPreset);
        savePresets(presets);
        updatePresetSelect();

        // Select the newly created preset
        const presetSelect = document.getElementById('ai-dict-preset-select');
        if (presetSelect) {
            presetSelect.value = newPreset.id;
            // Save selection
            localStorage.setItem('ai-dict-selected-preset', newPreset.id);
        }

        // Create corresponding preset content tag immediately
        presetContents = loadPresetContents();
        const existingContent = presetContents.find(p => p.name === presetName.trim());
        if (!existingContent) {
            presetContents.push({
                id: `content-${Date.now()}`,
                name: presetName.trim(),
                content: '',
                selected: false
            });
            savePresetContents(presetContents);
            renderPresetTags();
        }

        if (typeof toastr !== 'undefined') {
            toastr.success(`预设 "${presetName}" 已保存`, '成功');
        }
    } catch (error) {
        console.error('[AI Dictionary] Error saving preset:', error);
        if (typeof toastr !== 'undefined') {
            toastr.error('保存预设失败', '错误');
        }
    }
}

/**
 * Load selected preset
 */
function loadSelectedPreset() {
    const presetSelect = document.getElementById('ai-dict-preset-select');
    const inputTextarea = document.getElementById('ai-dict-character-input');

    if (!presetSelect || !inputTextarea) return;

    const presetId = presetSelect.value;
    if (!presetId) {
        return;
    }

    const presets = loadPresets();
    const preset = presets.find(p => p.id === presetId);

    if (preset) {
        inputTextarea.value = preset.content;
    }
}

/**
 * Delete selected preset
 */
function deleteSelectedPreset() {
    const presetSelect = document.getElementById('ai-dict-preset-select');
    if (!presetSelect) return;

    const presetId = presetSelect.value;
    if (!presetId) {
        if (typeof toastr !== 'undefined') {
            toastr.warning('请先选择一个预设', '提示');
        }
        return;
    }

    const presets = loadPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset) return;

    // Prevent deletion of default "角色" preset
    if (preset.name === '角色') {
        if (typeof toastr !== 'undefined') {
            toastr.warning('默认预设"角色"不能删除', '提示');
        }
        return;
    }

    // Prevent deletion of default "剧情框架" preset
    if (preset.name === '剧情框架') {
        if (typeof toastr !== 'undefined') {
            toastr.warning('默认预设"剧情框架"不能删除', '提示');
        }
        return;
    }

    // Confirm deletion
    if (!confirm(`确定要删除预设 "${preset.name}" 吗？`)) {
        return;
    }

    try {
        const updatedPresets = presets.filter(p => p.id !== presetId);
        savePresets(updatedPresets);

        // Also remove corresponding preset content tag
        presetContents = loadPresetContents();
        const updatedContents = presetContents.filter(c => c.name !== preset.name);
        savePresetContents(updatedContents);

        // Clear saved selected preset if it was this one
        const savedPresetId = localStorage.getItem('ai-dict-selected-preset');
        if (savedPresetId === presetId) {
            localStorage.removeItem('ai-dict-selected-preset');
        }

        updatePresetSelect();
        renderPresetTags();

        if (typeof toastr !== 'undefined') {
            toastr.success(`预设 "${preset.name}" 已删除`, '成功');
        }
    } catch (error) {
        console.error('[AI Dictionary] Error deleting preset:', error);
        if (typeof toastr !== 'undefined') {
            toastr.error('删除预设失败', '错误');
        }
    }
}

/**
 * Extract First message from AI generated description
 * @param {string} description - AI generated description
 * @returns {string} Extracted first message or empty string
 */
function extractFirstMessage(description) {
    if (!description) return '';

    // Match pattern: First message = content (without brackets)
    // The content continues until the end of the line or string
    const match = description.match(/First message\s*=\s*(.+?)(?:\n|$)/is);
    if (match && match[1]) {
        return match[1].trim();
    }

    return '';
}

/**
 * Remove First message pattern from description
 * @param {string} description - AI generated description
 * @returns {string} Description with first message removed
 */
function removeFirstMessageFromDescription(description) {
    if (!description) return '';

    // Remove pattern: First message = content (without brackets)
    return description.replace(/First message\s*=\s*(.+?)(?:\n|$)/is, '').trim();
}

/**
 * Show character creation modal
 */
export function showCharacterModal() {
    const modal = document.getElementById('ai-dict-character-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Clear previous inputs
        const nameInput = document.getElementById('ai-dict-character-name');
        const inputTextarea = document.getElementById('ai-dict-character-input');
        const outputTextarea = document.getElementById('ai-dict-character-output');
        const presetPanel = document.getElementById('ai-dict-character-preset-panel');
        const systemPromptTextarea = document.getElementById('ai-dict-character-system-prompt');
        if (nameInput) nameInput.value = '';
        if (outputTextarea) outputTextarea.value = '';
        if (presetPanel) presetPanel.style.display = 'none';

        // Load system prompt
        if (systemPromptTextarea) {
            const savedSystemPrompt = localStorage.getItem('ai-dict-character-system-prompt');
            systemPromptTextarea.value = savedSystemPrompt || getDefaultSystemPrompt();
        }

        // Ensure default preset exists
        const presets = loadPresets();
        let presetsUpdated = false;
        let defaultPreset = presets.find(p => p.name === '角色');
        let frameworkPreset = presets.find(p => p.name === '剧情框架');

        if (!defaultPreset) {
            // Create default preset if it doesn't exist
            defaultPreset = {
                id: `preset-default-${Date.now()}`,
                name: '角色',
                content: DEFAULT_CHARACTER_PROMPT
            };
            presets.push(defaultPreset);
            presetsUpdated = true;
        }

        if (!frameworkPreset) {
            // Create framework preset if it doesn't exist
            frameworkPreset = {
                id: `preset-framework-${Date.now()}`,
                name: '剧情框架',
                content: DEFAULT_FRAMEWORK_PROMPT
            };
            presets.push(frameworkPreset);
            presetsUpdated = true;
        }

        // Save presets if any were created
        if (presetsUpdated) {
            savePresets(presets);
        }

        // Ensure default preset has a corresponding tag
        presetContents = loadPresetContents();
        let presetContentsUpdated = false;
        const defaultTag = presetContents.find(p => p.name === '角色');
        if (!defaultTag) {
            presetContents.push({
                id: `content-default-${Date.now()}`,
                name: '角色',
                content: '',
                selected: false
            });
            presetContentsUpdated = true;
        }

        // Ensure framework preset has a corresponding tag
        const frameworkTag = presetContents.find(p => p.name === '剧情框架');
        if (!frameworkTag) {
            presetContents.push({
                id: `content-framework-${Date.now()}`,
                name: '剧情框架',
                content: '',
                selected: false
            });
            presetContentsUpdated = true;
        }

        // Save preset contents if any were created
        if (presetContentsUpdated) {
            savePresetContents(presetContents);
        }

        // Update preset select dropdown
        updatePresetSelect();

        // Try to restore last selected preset, or use default
        const savedPresetId = localStorage.getItem('ai-dict-selected-preset');
        let presetToSelect = null;

        if (savedPresetId) {
            // Check if saved preset still exists
            presetToSelect = presets.find(p => p.id === savedPresetId);
        }

        // If saved preset doesn't exist, use default preset
        if (!presetToSelect) {
            presetToSelect = defaultPreset;
        }

        // Select the preset
        const presetSelect = document.getElementById('ai-dict-preset-select');
        if (presetSelect && presetToSelect) {
            presetSelect.value = presetToSelect.id;
            // Load the preset content into the input textarea
            if (inputTextarea) {
                inputTextarea.value = presetToSelect.content;
            }
        }

        // Update subtitle display
        updateCharacterSubtitleDisplay();

        // Reset subtitle content to collapsed state
        const subtitleToggle = document.getElementById('ai-dict-character-subtitle-toggle');
        const subtitleContent = document.getElementById('ai-dict-character-subtitle-content');
        if (subtitleToggle && subtitleContent) {
            subtitleToggle.classList.remove('expanded');
            subtitleContent.style.display = 'none';
            subtitleToggle.querySelector('i').className = 'fa-solid fa-chevron-right';
        }

        // Render preset tags
        renderPresetTags();
    }
}

/**
 * Hide character creation modal
 */
export function hideCharacterModal() {
    const modal = document.getElementById('ai-dict-character-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Generate character description using AI
 * @param {Object} options
 * @param {string} options.input - User input for character description
 * @param {string} options.characterName - Character name to replace {{角色}} variable
 * @param {Object} options.settings - Extension settings
 * @param {Function} options.sendOpenAIRequest - Send OpenAI request function
 * @param {Object} options.oaiSettings - OAI settings
 * @returns {Promise<string>} Generated description
 */
export async function generateCharacterDescription(options) {
    const { input, characterName, settings, sendOpenAIRequest, oaiSettings } = options;

    const outputTextarea = document.getElementById('ai-dict-character-output');
    if (!outputTextarea) {
        throw new Error('Output textarea not found');
    }

    // Clear previous output
    outputTextarea.value = '';

    try {
        // Apply connection profile if specified
        const extensionSettings = SillyTavern.getContext().extensionSettings[EXTENSION_NAME];
        const originalProfile = extensionSettings.connectionManager?.selectedProfile;
        let profileApplied = false;

        if (settings.connectionProfile) {
            try {
                const connectionManager = extensionSettings.connectionManager;
                if (connectionManager && Array.isArray(connectionManager.profiles)) {
                    const profile = connectionManager.profiles.find(p => p.id === settings.connectionProfile);
                    if (profile) {
                        const profileSelect = document.getElementById('connection_profiles');
                        if (profileSelect) {
                            profileSelect.value = profile.id;
                            profileSelect.dispatchEvent(new Event('change'));
                            profileApplied = true;
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                }
            } catch (err) {
                console.warn(`[AI Dictionary] Failed to apply connection profile: ${err.message}`);
            }
        }

        // Extract subtitle text as context (preserve original SRT format)
        let subtitleContext = '';
        if (videoState.originalSubtitleContent && videoState.originalSubtitleContent.trim()) {
            subtitleContext = videoState.originalSubtitleContent;
            console.log(`[AI Dictionary] Using original subtitle content (${subtitleContext.length} chars)`);
        }

        // Build messages
        const messages = [];

        // Get custom system prompt from input
        const systemPromptTextarea = document.getElementById('ai-dict-character-system-prompt');
        const customSystemPrompt = systemPromptTextarea ? systemPromptTextarea.value.trim() : '';

        // Add custom system prompt if provided
        if (customSystemPrompt) {
            messages.push({
                role: 'system',
                content: customSystemPrompt
            });
        }

        // Replace {{角色}} variable with actual character name before sending to AI
        let inputWithName = characterName ? input.replace(/\{\{角色\}\}/g, characterName) : input;

        // Replace {{字幕内容}} placeholder with actual subtitle content
        if (subtitleContext) {
            inputWithName = inputWithName.replace(/\{\{字幕内容\}\}/g, subtitleContext);
        }

        // Replace {{场景}} placeholder with selected location/scene
        const locationSelect = document.getElementById('ai-dict-location-select');
        const selectedLocation = locationSelect ? locationSelect.value : '';
        if (selectedLocation) {
            inputWithName = inputWithName.replace(/\{\{场景\}\}/g, selectedLocation);
        }

        // Build user content
        let userContent = inputWithName;

        messages.push({
            role: 'user',
            content: userContent
        });

        // Create abort controller
        const abortController = new AbortController();

        // Stream response
        let fullResponse = '';
        const streamEnabled = oaiSettings.stream_openai;

        if (streamEnabled) {
            const generator = await sendOpenAIRequest('normal', messages, abortController.signal);

            if (typeof generator === 'function') {
                for await (const data of generator()) {
                    if (data && data.text) {
                        fullResponse = data.text;
                        outputTextarea.value = fullResponse;
                        // Auto-scroll to bottom
                        outputTextarea.scrollTop = outputTextarea.scrollHeight;
                    }
                }
            } else {
                throw new Error('Invalid generator returned from sendOpenAIRequest');
            }
        } else {
            // Non-streaming mode - use generateRaw if available
            throw new Error('Non-streaming mode not supported yet. Please enable streaming in API settings.');
        }

        // Restore original profile if we changed it
        if (profileApplied && originalProfile !== settings.connectionProfile) {
            try {
                const profileSelect = document.getElementById('connection_profiles');
                if (profileSelect) {
                    profileSelect.value = originalProfile || '';
                    profileSelect.dispatchEvent(new Event('change'));
                }
            } catch (err) {
                console.warn(`[AI Dictionary] Failed to restore connection profile: ${err.message}`);
            }
        }

        // Save generated content with preset name if a preset is selected
        const presetSelect = document.getElementById('ai-dict-preset-select');
        if (presetSelect && presetSelect.value) {
            const presets = loadPresets();
            const selectedPreset = presets.find(p => p.id === presetSelect.value);
            if (selectedPreset && fullResponse) {
                saveGeneratedContent(selectedPreset.name, fullResponse);
            }
        }

        return fullResponse;

    } catch (error) {
        console.error('[AI Dictionary] Error generating character description:', error);
        outputTextarea.value = `生成失败: ${error.message}`;
        throw error;
    }
}

/**
 * Create character card in SillyTavern
 * @param {Object} options
 * @param {string} options.name - Character name
 * @param {string} options.description - Character description
 * @param {string} options.firstMessage - First message (optional)
 * @param {Function} options.getCharacters - Function to reload character list
 * @param {Function} options.selectRmInfo - Function to update character list UI
 * @returns {Promise<void>}
 */
export async function createCharacterCard(options) {
    const { name, description, firstMessage = '', getCharacters, selectRmInfo } = options;

    if (!name || !name.trim()) {
        throw new Error('角色名称不能为空');
    }

    if (!description || !description.trim()) {
        throw new Error('角色描述不能为空');
    }

    try {
        // Create FormData for character creation
        const formData = new FormData();

        // Core fields - ch_name is the correct field name, not "name"
        formData.append('ch_name', name.trim());
        formData.append('description', description.trim());
        formData.append('fav', 'false');

        // Empty string fields
        formData.append('first_mes', firstMessage.trim());
        formData.append('json_data', '');
        formData.append('avatar_url', '');
        formData.append('chat', '');
        formData.append('create_date', '');
        formData.append('last_mes', '');
        formData.append('world', '');
        formData.append('system_prompt', '');
        formData.append('post_history_instructions', '');
        formData.append('creator', 'AI Dictionary');
        formData.append('character_version', '');
        formData.append('creator_notes', '由AI Dictionary扩展创建');
        formData.append('tags', '');
        formData.append('personality', '');
        formData.append('scenario', '');
        formData.append('mes_example', '');

        // Depth prompt settings
        formData.append('depth_prompt_prompt', '');
        formData.append('depth_prompt_depth', '4');
        formData.append('depth_prompt_role', 'system');

        // Talkativeness
        formData.append('talkativeness', '0.5');

        // Extensions as JSON string
        formData.append('extensions', '{}');

        // Create a default avatar image
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');

        // Fill with a default color
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(0, 0, 400, 400);

        // Add text
        ctx.fillStyle = '#666666';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name.charAt(0).toUpperCase(), 200, 200);

        // Convert canvas to blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        formData.append('avatar', blob, 'avatar.png');

        // Get request headers using SillyTavern's method
        const getRequestHeaders = window.SillyTavern?.getContext()?.getRequestHeaders;
        const headers = getRequestHeaders ? getRequestHeaders({ omitContentType: true }) : {};

        // Send request to create character
        const response = await fetch('/api/characters/create', {
            method: 'POST',
            headers: headers,
            body: formData,
            cache: 'no-cache'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`创建角色卡失败: ${response.status} ${errorText}`);
        }

        const avatarId = await response.text();
        console.log(`[AI Dictionary] Character created successfully: ${avatarId}`);

        // Close modal
        hideCharacterModal();

        // Reload character list
        if (getCharacters && typeof getCharacters === 'function') {
            try {
                await getCharacters();
                if (selectRmInfo && typeof selectRmInfo === 'function') {
                    selectRmInfo('char_create', avatarId);
                }
                console.log('[AI Dictionary] Character list reloaded successfully');
            } catch (err) {
                console.warn('[AI Dictionary] Failed to reload character list:', err);
            }
        }

    } catch (error) {
        console.error('[AI Dictionary] Error creating character card:', error);
        if (typeof toastr !== 'undefined') {
            toastr.error(error.message, '创建失败');
        }
        throw error;
    }
}

/**
 * Bind character creation events
 * @param {Object} options
 * @param {Object} options.settings - Extension settings
 * @param {Function} options.sendOpenAIRequest - Send OpenAI request function
 * @param {Object} options.oaiSettings - OAI settings
 * @param {Function} options.getCharacters - Function to reload character list
 * @param {Function} options.selectRmInfo - Function to update character list UI
 * @param {Function} options.saveSettings - Function to save extension settings
 */
export function bindCharacterCreationEvents(options) {
    const { settings, sendOpenAIRequest, oaiSettings, getCharacters, selectRmInfo, saveSettings } = options;

    // Show modal button
    const showModalBtn = document.getElementById('ai-dict-create-character-btn');
    if (showModalBtn) {
        showModalBtn.addEventListener('click', () => {
            showCharacterModal();
        });
    }

    // Close modal button
    const closeModalBtn = document.getElementById('ai-dict-character-modal-close');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            hideCharacterModal();
        });
    }

    // Reset all button
    const resetAllBtn = document.getElementById('ai-dict-character-reset-all-btn');
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', () => {
            if (!confirm('确定要重置所有内容吗？这将删除所有用户创建的预设，并将所有设置还原到初始状态。')) {
                return;
            }

            // Clear all inputs
            const nameInput = document.getElementById('ai-dict-character-name');
            const inputTextarea = document.getElementById('ai-dict-character-input');
            const outputTextarea = document.getElementById('ai-dict-character-output');
            const characterSelect = document.getElementById('ai-dict-character-select');
            const locationSelect = document.getElementById('ai-dict-location-select');
            const systemPromptTextarea = document.getElementById('ai-dict-character-system-prompt');

            if (nameInput) nameInput.value = '';
            if (outputTextarea) outputTextarea.value = '';

            // Reset system prompt to default
            if (systemPromptTextarea) {
                systemPromptTextarea.value = getDefaultSystemPrompt();
                localStorage.setItem('ai-dict-character-system-prompt', getDefaultSystemPrompt());
            }

            // Delete all user-created presets, keep only default ones
            const allPresets = loadPresets();
            const defaultPresets = allPresets.filter(p => p.name === '角色' || p.name === '剧情框架');

            // If default presets don't exist, recreate them
            let defaultPreset = defaultPresets.find(p => p.name === '角色');
            let frameworkPreset = defaultPresets.find(p => p.name === '剧情框架');

            const newPresets = [];

            if (!defaultPreset) {
                defaultPreset = {
                    id: `preset-default-${Date.now()}`,
                    name: '角色',
                    content: DEFAULT_CHARACTER_PROMPT
                };
                newPresets.push(defaultPreset);
            } else {
                // Update content to default
                defaultPreset.content = DEFAULT_CHARACTER_PROMPT;
                newPresets.push(defaultPreset);
            }

            if (!frameworkPreset) {
                frameworkPreset = {
                    id: `preset-framework-${Date.now()}`,
                    name: '剧情框架',
                    content: DEFAULT_FRAMEWORK_PROMPT
                };
                newPresets.push(frameworkPreset);
            } else {
                // Update content to default
                frameworkPreset.content = DEFAULT_FRAMEWORK_PROMPT;
                newPresets.push(frameworkPreset);
            }

            // Save only default presets
            savePresets(newPresets);

            // Reset to default preset
            if (defaultPreset && inputTextarea) {
                inputTextarea.value = defaultPreset.content;
            }

            // Hide and clear selects
            if (characterSelect) {
                characterSelect.innerHTML = '<option value="">-- 选择角色 --</option>';
                characterSelect.style.display = 'none';
            }
            if (locationSelect) {
                locationSelect.innerHTML = '<option value="">-- 选择场景 --</option>';
                locationSelect.style.display = 'none';
            }

            // Clear all preset tags
            localStorage.removeItem(PRESET_CONTENTS_STORAGE_KEY);

            // Update preset dropdown
            updatePresetSelect();

            // Reset preset selection to default
            const presetSelect = document.getElementById('ai-dict-preset-select');
            if (presetSelect && defaultPreset) {
                presetSelect.value = defaultPreset.id;
                localStorage.setItem('ai-dict-selected-preset', defaultPreset.id);
            }

            // Re-render tags (should be empty now)
            renderPresetTags();

            if (typeof toastr !== 'undefined') {
                toastr.success('已重置到初始状态', '成功');
            }
        });
    }

    // Close modal when clicking outside
    const modal = document.getElementById('ai-dict-character-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideCharacterModal();
            }
        });
    }

    // Subtitle toggle button
    const subtitleToggle = document.getElementById('ai-dict-character-subtitle-toggle');
    if (subtitleToggle) {
        subtitleToggle.addEventListener('click', () => {
            toggleCharacterSubtitle();
        });
    }

    // System prompt toggle button
    const systemPromptToggle = document.getElementById('ai-dict-character-system-prompt-toggle');
    const systemPromptGroup = document.getElementById('ai-dict-character-system-prompt-group');
    if (systemPromptToggle && systemPromptGroup) {
        systemPromptToggle.addEventListener('click', () => {
            const isExpanded = systemPromptGroup.style.display !== 'none';
            systemPromptGroup.style.display = isExpanded ? 'none' : 'block';
            systemPromptToggle.classList.toggle('expanded', !isExpanded);
            const icon = systemPromptToggle.querySelector('i');
            if (icon) {
                icon.className = isExpanded ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
            }
        });
    }

    // System prompt input - save on change
    const systemPromptTextarea = document.getElementById('ai-dict-character-system-prompt');
    if (systemPromptTextarea) {
        systemPromptTextarea.addEventListener('change', () => {
            saveSystemPrompt();
        });
        systemPromptTextarea.addEventListener('blur', () => {
            saveSystemPrompt();
        });
    }

    // Extract info button
    const extractBtn = document.getElementById('ai-dict-extract-info-btn');
    if (extractBtn) {
        extractBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Disable button during extraction
            extractBtn.disabled = true;
            extractBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const result = await extractCharactersAndLocations({
                    settings,
                    sendOpenAIRequest,
                    oaiSettings
                });

                updateInfoSelects(result.characters, result.locations);

                if (typeof toastr !== 'undefined') {
                    toastr.success(`提取成功：${result.characters.length}个角色，${result.locations.length}个场景`, '成功');
                }
            } catch (error) {
                console.error('[AI Dictionary] Error in extract button:', error);
                if (typeof toastr !== 'undefined') {
                    toastr.error(error.message, '提取失败');
                }
            } finally {
                // Re-enable button
                extractBtn.disabled = false;
                extractBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
            }
        });
    }

    // Character select change
    const characterSelect = document.getElementById('ai-dict-character-select');
    const nameInput = document.getElementById('ai-dict-character-name');
    if (characterSelect && nameInput) {
        characterSelect.addEventListener('change', () => {
            if (characterSelect.value) {
                nameInput.value = characterSelect.value;
            }
        });
    }

    // Preset select change
    const presetSelect = document.getElementById('ai-dict-preset-select');
    if (presetSelect) {
        presetSelect.addEventListener('change', () => {
            loadSelectedPreset();
            // Save selected preset ID to localStorage
            if (presetSelect.value) {
                localStorage.setItem('ai-dict-selected-preset', presetSelect.value);
            }
        });
    }

    // Save preset button
    const savePresetBtn = document.getElementById('ai-dict-save-preset-btn');
    if (savePresetBtn) {
        savePresetBtn.addEventListener('click', () => {
            saveToCurrentPreset();
        });
    }

    // Save as preset button
    const saveAsPresetBtn = document.getElementById('ai-dict-save-as-preset-btn');
    if (saveAsPresetBtn) {
        saveAsPresetBtn.addEventListener('click', () => {
            saveAsNewPreset();
        });
    }

    // Delete preset button
    const deletePresetBtn = document.getElementById('ai-dict-delete-preset-btn');
    if (deletePresetBtn) {
        deletePresetBtn.addEventListener('click', () => {
            deleteSelectedPreset();
        });
    }

    // Reset prompt button
    const resetPromptBtn = document.getElementById('ai-dict-reset-prompt-btn');
    if (resetPromptBtn) {
        resetPromptBtn.addEventListener('click', () => {
            const inputTextarea = document.getElementById('ai-dict-character-input');

            if (inputTextarea) {
                // Restore original template without any replacement
                inputTextarea.value = DEFAULT_CHARACTER_PROMPT;
                if (typeof toastr !== 'undefined') {
                    toastr.success('已重置为默认提示词模板', '提示');
                }
            }
        });
    }

    // Generate description button
    const generateBtn = document.getElementById('ai-dict-generate-description-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            const nameInput = document.getElementById('ai-dict-character-name');
            const inputTextarea = document.getElementById('ai-dict-character-input');
            const input = inputTextarea?.value?.trim();
            const characterName = nameInput?.value?.trim();

            if (!input) {
                if (typeof toastr !== 'undefined') {
                    toastr.warning('请先输入角色相关信息', '提示');
                }
                return;
            }

            // Disable button during generation
            generateBtn.disabled = true;
            generateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 生成中...';

            try {
                await generateCharacterDescription({
                    input,
                    characterName,
                    settings,
                    sendOpenAIRequest,
                    oaiSettings
                });
            } catch (error) {
                console.error('[AI Dictionary] Error in generate button:', error);
            } finally {
                // Re-enable button
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 生成描述';
            }
        });
    }

    // Create character button
    const createBtn = document.getElementById('ai-dict-create-character-submit-btn');
    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const nameInput = document.getElementById('ai-dict-character-name');
            const outputTextarea = document.getElementById('ai-dict-character-output');

            const name = nameInput?.value?.trim();
            const description = outputTextarea?.value?.trim();

            if (!name) {
                if (typeof toastr !== 'undefined') {
                    toastr.warning('请输入角色名称', '提示');
                }
                return;
            }

            if (!description) {
                if (typeof toastr !== 'undefined') {
                    toastr.warning('请先生成角色描述', '提示');
                }
                return;
            }

            // Extract first message from description
            const firstMessage = extractFirstMessage(description);

            // Remove first message pattern from description
            const cleanedDescription = removeFirstMessageFromDescription(description);

            // Disable button during creation
            createBtn.disabled = true;
            createBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 创建中...';

            try {
                await createCharacterCard({ name, description: cleanedDescription, firstMessage, getCharacters, selectRmInfo });
            } catch (error) {
                console.error('[AI Dictionary] Error in create button:', error);
            } finally {
                // Re-enable button
                createBtn.disabled = false;
                createBtn.innerHTML = '<i class="fa-solid fa-check"></i> 创建角色卡';
            }
        });
    }
}
