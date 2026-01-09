# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Dictionary is a SillyTavern extension that combines Youdao Dictionary lookups with AI-powered definitions. It provides word lookup, deep learning features, flashcard-based spaced repetition with SM-2 algorithm, confusable word tracking, immersive review prompts, and a farm game reward system.

## Development Environment

This is a client-side JavaScript extension for SillyTavern. There is no build system or bundler - all files are loaded directly by SillyTavern at runtime.

**Local Development:**
- Edit files directly in this folder
- Refresh the SillyTavern page in browser to reload the extension
- Or restart SillyTavern to fully reload
- Install path: `SillyTavern/public/scripts/extensions/third-party/AI-dictionary-sillytavern`

**No build/test commands** - this is a pure browser-based extension with no compilation step.

## Architecture

### Module System

The extension uses ES6 modules (`type="module"`) with explicit imports/exports:

- **Entry point:** `index.js` - Wires all modules together, handles initialization and event binding
- **Modules:** All feature code lives in `modules/` directory, organized by functionality
- **Standalone features:** `farm-game.js` and `flashcard.js` are loaded dynamically via script tags

### Core Modules

**Data Layer:**
- `modules/database.js` - IndexedDB wrapper for persistent storage (word history, review data, flashcard progress)
- `modules/wordHistory.js` - Tracks word lookup history with context
- `modules/review.js` - Spaced repetition review system, integrates with chat generation events
- `modules/flashcardProgress.js` - SM-2 algorithm implementation for flashcard learning
- `modules/backup.js` - JSON backup/restore for all data stores

**UI Layer:**
- `modules/panel.js` - Side panel (desktop) and mobile drawer UI, pin/collapse behavior
- `modules/settingsUi.js` - Extension settings interface
- `modules/statisticsPanel.js` - Word statistics dashboard
- `modules/contentBuilder.js` - HTML content generation for lookup results

**Lookup Logic:**
- `modules/selection.js` - Text selection detection (mouse + touch), icon positioning
- `modules/context.js` - Extract surrounding context based on user settings
- `modules/youdao.js` - Youdao Dictionary API integration
- `modules/aiLookup.js` - AI definition fetching, deep study, chat interface
- `modules/confusables.js` - Similar word tracking and highlighting in chat

**Utilities:**
- `modules/utils.js` - Helper functions (mobile detection, single word check, etc.)
- `modules/constants.js` - Extension constants and default settings

### Farm Game (Modularized)

Farm game is a reward system where users earn items by reviewing words. Located in `modules/farm/`:

- `farm-config.js` - Game constants (crops, pets, grid size, etc.)
- `farm-state.js` - Game state and UI state management
- `farm-storage.js` - LocalStorage save/load with backward compatibility
- `farm-crop.js` - Crop lifecycle (planting, growth, harvest, boost)
- `farm-shop.js` - Pet exchange logic
- `farm-inventory.js` - Item inventory management
- `farm-quickslot.js` - Quick slot for seed selection
- `farm-seed-inventory.js` - Seed inventory UI
- `farm-pet.js` - Pet management
- `farm-render.js` - All rendering functions for game UI
- `farm-game.js` (root) - Entry point, event binding, game loop

Farm game is loaded on-demand via `modules/farmGameLoader.js` when user clicks the farm button.

See `modules/farm/README.md` for detailed Chinese documentation.

### Data Flow

1. **Text selection** → `selection.js` captures text + context → icon appears
2. **Icon click/direct lookup** → `index.js::performDictionaryLookup()`
3. **Parallel fetch:**
   - Youdao API (single words only) → updates panel
   - AI definition (auto or manual) → streams to panel
4. **Word saved** → `wordHistory.js` → IndexedDB → optionally added to review queue
5. **Review integration** → `review.js` listens to `GENERATION_STARTED` event → injects review prompt before AI generation
6. **Flashcard progress** → SM-2 algorithm tracks mastery levels → influences deck generation

### SillyTavern Integration Points

This extension integrates deeply with SillyTavern's core:

**Core Dependencies (from `../../../extensions.js`):**
- `extension_settings` - Extension settings storage
- `getContext()` - Access to current chat context

**Core Dependencies (from `../../../../script.js`):**
- `saveSettingsDebounced()` - Persist settings
- `eventSource` - Event system (see below)
- `event_types` - Event type constants
- `generateRaw()` - Generate AI completion
- `setExtensionPrompt()` - Inject prompts into generation
- `extension_prompt_types` - Prompt injection types

**Core Dependencies (from `../../../openai.js`):**
- `oai_settings` - OpenAI/LLM connection settings
- `sendOpenAIRequest()` - Send API requests

**Key Events (from `public/scripts/events.js`):**
- `MESSAGE_RECEIVED` - Character message rendered → highlight confusables
- `MESSAGE_SENT` - User message sent → highlight confusables
- `GENERATION_STARTED` - Before AI generation → inject review prompt, check for review words in last message
- `CHAT_CHANGED` - Chat switched → re-highlight confusables

**Important:** The extension uses `setExtensionPrompt()` to inject review prompts before generation. This happens in the `GENERATION_STARTED` event handler and must not interfere with dry-run checks.

### Storage Architecture

Three-tier storage system:

1. **IndexedDB** (primary) - Stores all persistent data across page refreshes
2. **JSON Backup** (secondary) - Automatic backup to SillyTavern's file system via `getUserData/saveUserData` APIs
3. **LocalStorage** (farm game only) - Used for farm game state

When IndexedDB is empty on load, the extension attempts to restore from JSON backup.

## Coding Conventions

- **Indentation:** 4 spaces
- **Module exports:** Named exports preferred (avoid default exports)
- **File naming:** `lowerCamelCase.js` for modules, PascalCase for classes, UPPER_SNAKE_CASE for constants
- **CSS organization:** Feature-specific styles in `styles/` directory, scoped to avoid global collisions
- **ES6 modules:** Always use `import/export`, never global variables except `window.aiDictionary` and `window.performDictionaryLookup`

## Key Features to Understand

### Immersive Review System

When enabled (`settings.immersiveReview`), the extension:
1. Tracks words pending review in `review.js`
2. On `GENERATION_STARTED`, injects a prompt asking the AI to naturally use review words in responses
3. Checks the last AI message for review word usage
4. Marks used words as "seen" and schedules next review based on spaced repetition

This creates an immersive learning experience where review words appear naturally in conversations.

### Flashcard SM-2 Algorithm

Located in `modules/flashcardProgress.js`:
- **Mastery levels:** 0 (new) to 5 (mastered)
- **Easiness Factor:** 1.3 to 2.5, adjusts based on recall performance
- **Review intervals:** [0, 1, 3, 7, 14, 30] days based on mastery level
- **Deck generation:** 60% new words, 40% review words (configurable via `FLASHCARD_NEW_WORD_RATIO`)

Session state is persisted in IndexedDB so users can continue incomplete flashcard sessions across page refreshes.

### Confusable Words

Users can mark words as "confusable" (易混词). The extension:
1. Stores confusable words in settings
2. Highlights them in chat messages with custom color
3. Provides dedicated lookup for comparing confusable words
4. Uses a dedicated AI prompt to explain differences

## Configuration

**Extension metadata:** `manifest.json`
- `loading_order: 30` - Load after core extensions
- `js: "index.js"` - Entry point
- `css: "style.css"` - Main stylesheet

**Settings location:** Stored in SillyTavern's `extension_settings[EXTENSION_NAME]` object

**CORS Proxy:** If Youdao API is blocked, user must set `enableCorsProxy: true` in SillyTavern's `config.yaml`

## Troubleshooting

**Extension not loading:**
- Check browser console (F12) for errors
- Verify installation path is correct
- Ensure SillyTavern version >= 1.10.0

**Youdao dictionary failing:**
- Usually caused by CORS - enable proxy in `config.yaml`
- Only affects single word lookups (phrases don't use Youdao)
- AI lookup will still work

**IndexedDB issues:**
- Extension automatically falls back to JSON backup
- Backup saved to SillyTavern's user data directory on every load

## Important Notes for Development

- **Never commit API keys** - All API connections use SillyTavern's connection manager
- **Mobile responsive** - Test both desktop (draggable panel) and mobile (slide-out drawer) UIs
- **Event handling** - Be careful with SillyTavern event listeners, avoid breaking dry-run checks
- **Backward compatibility** - Farm game and flashcard data must handle old save formats
- **Module loading** - Farm game uses dynamic `<script type="module">` injection, ensure proper cleanup on panel close

## Commit Conventions

Follow existing style: `feat:`, `fix:`, `refactor:`, `chore:` prefixes with concise descriptions.

Examples from git history:
- `feat: add redemption system with free pet exchange`
- `fix: skip dry-run checks and trim logs`
- `refactor: modularize farm game structure`

## Current Branch

This repository uses feature branches. Current work is on `refactor/modularize` branch. Main branch is typically used for PRs.
