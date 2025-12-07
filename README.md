# AI Dictionary Extension for SillyTavern

An AI-powered dictionary lookup extension for SillyTavern that provides word definitions with context using your configured AI presets.

## Features

- **AI-Powered Definitions**: Look up word definitions using SillyTavern's configured AI presets
- **Context Extraction**: Automatically extracts context from the page content (sentence, paragraph, or custom)
- **Keyboard Shortcut**: Use Ctrl+Shift+D to quickly look up selected words
- **Customizable Prompts**: Configure the system prompt for dictionary lookups
- **Easy Settings**: Simple UI for selecting presets and customizing behavior
- **Non-Intrusive**: Clean popup UI that doesn't interfere with the main application
- **No API Keys Required**: Uses SillyTavern's existing AI infrastructure

## Installation

1. Copy this folder (renaming it to `ai-dictionary` if desired) into the `public/scripts/extensions/` directory of your SillyTavern installation
2. Restart SillyTavern
3. The extension should appear in your Extensions panel

## Usage

### Basic Word Lookup
1. Select any word on the page by highlighting it with your mouse
2. Press `Ctrl+Shift+D` to look up the word
3. The AI will provide a definition with context

### Configuration

Open the Extensions panel in SillyTavern and configure:

- **Enable AI Dictionary**: Toggle the extension on/off
- **System Prompt**: Customize the prompt used for dictionary lookups
- **Context Range**: Select how much context to provide (sentence, paragraph, or custom length)
- **Enable Keyboard Shortcut**: Toggle the Ctrl+Shift+D shortcut

Note: The extension uses your currently active API connection in SillyTavern (OpenAI, Claude, etc.).

## Settings

### System Prompt
The default system prompt instructs the AI to provide:
- Concise definitions (1-2 sentences)
- Part of speech
- Example usage

You can customize this to get different types of definitions (etymological, technical, poetic, etc.).

### Context Range
- **Sentence**: Extracts the sentence containing the selected word
- **Paragraph**: Extracts the full paragraph containing the selected word
- **Custom**: Allows you to specify the exact number of characters of context to include

## Files

- `manifest.json` - Extension metadata and configuration
- `index.js` - Main extension code with all functionality
- `index.html` - Settings UI template
- `style.css` - Styling for the popup and settings UI
- `README.md` - This file

## Technical Details

### Architecture
- Uses SillyTavern's extension lifecycle hooks (setup/cleanup)
- Integrates with the event system for settings updates
- Follows SillyTavern's extension patterns and conventions

### API Integration
- Leverages SillyTavern's `getContext()` for accessing context
- Uses `generateRaw()` for AI generation
- Integrates with `getRequestHeaders()` for authentication
- Uses `renderExtensionTemplateAsync()` for settings UI

### Storage
- Settings are persisted in `extension_settings`
- Uses browser's extension storage mechanism
- Per-user configuration support via `accountStorage`

## Keyboard Shortcuts

- **Ctrl+Shift+D**: Look up selected word (when enabled)

## Troubleshooting

### Extension not loading
- Check browser console for errors (F12 -> Console)
- Ensure manifest.json is valid JSON
- Verify the extension folder is in the correct location

### No API connection available
- Configure an AI API connection in SillyTavern (OpenAI, Claude, KoboldAI, etc.)
- Make sure the API connection is working in the main chat

### AI lookup not working
- Verify that your API connection is active and working
- Check that you have selected a character or are in a chat
- Look for errors in the browser console

## Future Enhancements

- Context menu integration for word lookup
- History of looked-up words
- Word suggestions/autocomplete
- Multiple languages support
- Custom vocabulary lists
- Export definitions to notes

## Compatibility

- SillyTavern 1.8.0+
- Modern browsers with ES6 module support
- Requires an active AI API connection (OpenAI, Claude, KoboldAI, etc.)

## Authorship

- 模型作者 (Model Author): ChatGPT (OpenAI GPT-4o)
- 代码作者 (Code Author): ChatGPT (OpenAI GPT-4o)

## License

Same as SillyTavern
