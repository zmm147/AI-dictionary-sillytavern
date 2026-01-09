# Repository Guidelines

## Project Structure & Module Organization
- `index.js` is the main entry point and wires extension modules together.
- `modules/` holds feature-focused JavaScript modules (lookup, panel, selection, stats, storage, farm/*).
- `index.html` is the settings UI template loaded by SillyTavern.
- `style.css` and `styles/` contain base and feature-specific CSS (mobile, statistics, confusables, farm-game).
- `manifest.json` defines extension metadata for SillyTavern; `farm-game.js` and `flashcard.js` are standalone feature scripts.
- `modules/farm/` contains farm game submodules organized by feature (state, config, render, pet, crop, shop, inventory).

## SillyTavern Core Context (Upstream)
- Core app files live in `SillyTavern/public/`: main runtime is `public/script.js`, and supporting modules are in `public/scripts/`.
- Event definitions are in `public/scripts/events.js` (`event_types`, `eventSource`); extensions should listen to these instead of polling.
- Message state is stored in the global `chat` array in `public/script.js`; message rendering triggers `MESSAGE_SENT`, `MESSAGE_RECEIVED`, `USER_MESSAGE_RENDERED`, and `CHARACTER_MESSAGE_RENDERED`.
- User message insertion is handled by `sendMessageAsUser(...)` in `public/script.js`, which also emits message events and updates the DOM.
- Chat utilities (attachments, message transforms, rendering helpers) live in `public/scripts/chats.js`.
- Extension settings are managed via `extension_settings` global object from `extensions.js`.

## Build, Test, and Development Commands
- **No build system or bundler is used**; files are loaded directly by SillyTavern.
- Local development: edit files in this folder and refresh the SillyTavern page, or restart the app to reload the extension.
- Install path example: `SillyTavern/public/scripts/extensions/third-party/AI-dictionary-sillytavern`.
- **Testing**: No automated test framework is present. Manual checks should cover: text selection lookup, panel open/close, audio playback, mobile panel behavior, farm game mechanics, and floating pet interactions.
- If you add new settings or UI, verify the settings page renders and persists values correctly.

## Coding Style & Naming Conventions
- **Imports**: Use ES module syntax (`import/export`). Prefer named exports for functions to keep imports explicit and readable.
- **Indentation**: 4 spaces (match existing files).
- **Semicolons**: Required (use semicolons after every statement).
- **File naming**: Use `lowerCamelCase` for module files (e.g., `aiLookup.js`, `farm-pet.js`), `PascalCase` for classes (rarely used), and `UPPER_SNAKE_CASE` for constants.
- **Function naming**: Use `camelCase` for functions (e.g., `getPetDetails`, `saveFloatingPet`). Use descriptive verb-noun patterns.
- **Variable naming**: Use `camelCase` for variables. Constants use `UPPER_SNAKE_CASE`.
- **Module organization**: Keep modules single-responsibility. Split large modules into submodules in feature-specific subdirectories (e.g., `modules/farm/`).
- **JSDoc types**: Use JSDoc comments for type annotations (e.g., `/** @type {Object} */`, `/** @type {string} */`, `/** @returns {Promise<void>} */`). This is especially important for function parameters and return values.
- **Comments**: Use clear, concise comments. Function-level comments should describe what the function does and its parameters/returns.
- **Error handling**: Use `try/catch` for async operations and localStorage/IndexedDB access. Log warnings with `console.warn('[ModuleName] message:', error)` and errors with `console.error()`.

## State Management
- Use separate state objects for game/logic data vs UI state (e.g., `gameState` and `uiState` in farm modules).
- State should be exported from dedicated state modules (e.g., `farm-state.js`).
- Import state in modules that need to read or modify it.
- For complex features, use dedicated state management modules with initialization/reset functions.

## CSS Guidelines
- CSS is organized by feature in `styles/` directory (base.css, mobile.css, farm-game.css, statistics.css, etc.).
- Keep selectors scoped to extension UI to avoid global collisions (use `.ai-dict-*`, `.farm-*`, `.flashcard-*` prefixes).
- Use media queries for responsive design: `@media screen and (max-width: 768px)` for tablets, `@media screen and (max-width: 450px)` for mobile phones.
- SillyTavern uses `.menu_button` class; ensure compatibility by not overriding essential styles without !important when necessary.

## Persistence
- **localStorage**: Use for simple settings and small data. Wrap in `try/catch` to handle quota exceeded or privacy mode errors.
- **IndexedDB**: Use for large datasets (word history, review data, flashcard progress). All DB operations should be async.
- Import database utilities from `database.js` (`initDatabase`, `dbGet`, `dbPut`, `dbGetAll`, `dbDelete`).
- Always initialize database before operations (`await initDatabase()`).
- Handle DB version upgrades in the `onupgradeneeded` callback.

## Mobile-Specific Considerations
- Touch events: Use `touchstart`, `touchend`, `touchcancel` for mobile interaction (vs `mousedown`, `mouseup`, `click` for desktop).
- Set `{ passive: true }` for performance when not preventing default behavior.
- Use `passive: false` when you need to call `preventDefault()` (e.g., for drag operations).
- Screen size detection: Use `window.innerWidth` and media queries. Mobile threshold: ~768px; small phone: ~450px.
- Viewport units: Prefer `dvh` (dynamic viewport height) over `vh` for better mobile browser support.
- Disable context menu on mobile for custom interactions: add class `ai-dict-disable-context-menu` to body.

## Event Handling
- Subscribe to SillyTavern events via `eventSource.on(event_types.EVENT_NAME, callback)`.
- Common events: `MESSAGE_RECEIVED`, `MESSAGE_SENT`, `GENERATION_STARTED`, `CHAT_CHANGED`.
- Always clean up event listeners if needed (though typically not required for extension lifecycle).
- Use `setTimeout()` with small delays when waiting for DOM updates after SillyTavern events.

## Commit & Pull Request Guidelines
- Follow the existing commit style: short conventional prefixes like `feat:` or `refactor:` with a brief description.
- PRs should include: a concise summary, testing notes, and screenshots or recordings for UI changes.
- Link related issues or feature requests when applicable.
- Test both desktop and mobile views for any UI changes.

## Security & Configuration Tips
- Do not commit API keys or connection profiles; configure them in SillyTavern settings.
- If Youdao requests are blocked, set `enableCorsProxy: true` in SillyTavern `config.yaml`.
- Be careful with HTML injection: Always use `escapeHtml()` or similar sanitization when displaying user-generated content.
- Validate and sanitize all inputs before storage or display.

## Common Patterns
- **Async/await**: Use for all async operations. Avoid raw Promise chains when possible.
- **Debouncing**: Import `debounce` from `utils.js` for performance-critical handlers (e.g., text selection, input changes).
- **DOM manipulation**: Use vanilla JavaScript. SillyTavern exposes jQuery as `$` but prefer `document.querySelector` for consistency.
- **Extension URL detection**: Use `new URL(import.meta.url).pathname` to get the current script's directory for resource loading.
