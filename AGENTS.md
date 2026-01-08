# Repository Guidelines

## Project Structure & Module Organization
- `index.js` is the main entry point and wires the extension modules together.
- `modules/` holds feature-focused JavaScript modules (lookup, panel, selection, stats, storage).
- `index.html` is the settings UI template loaded by SillyTavern.
- `style.css` and `styles/` contain base and feature-specific CSS (mobile, statistics, confusables).
- `manifest.json` defines extension metadata for SillyTavern; `farm-game.js` and `flashcard.js` are standalone feature scripts.

## SillyTavern Core Context (Upstream)
- Core app files live in `SillyTavern/public/`: the main runtime is `public/script.js`, and supporting modules are in `public/scripts/`.
- Event definitions are in `public/scripts/events.js` (`event_types`, `eventSource`); extensions should listen to these instead of polling.
- Message state is stored in the global `chat` array in `public/script.js`; message rendering triggers `MESSAGE_SENT`, `MESSAGE_RECEIVED`, `USER_MESSAGE_RENDERED`, and `CHARACTER_MESSAGE_RENDERED`.
- User message insertion is handled by `sendMessageAsUser(...)` in `public/script.js`, which also emits message events and updates the DOM.
- Chat utilities (attachments, message transforms, rendering helpers) live in `public/scripts/chats.js`.

## Build, Test, and Development Commands
- No build system or bundler is used; files are loaded directly by SillyTavern.
- Local development: edit files in this folder and refresh the SillyTavern page, or restart the app to reload the extension.
- Install path example: `SillyTavern/public/scripts/extensions/third-party/AI-dictionary-sillytavern`.

## Coding Style & Naming Conventions
- Use ES module syntax, 4-space indentation, and semicolons (match existing files).
- Keep modules single-responsibility and export named functions to keep imports explicit.
- File naming uses lowerCamelCase for module files (for example, `aiLookup.js`), PascalCase for classes, and UPPER_SNAKE_CASE for constants.
- CSS is organized by feature in `styles/`; keep selectors scoped to the extension UI to avoid global collisions.

## Testing Guidelines
- No automated test framework is present in this repository.
- Manual checks should cover: text selection lookup, panel open/close, audio playback, and mobile panel behavior.
- If you add new settings or UI, verify the settings page renders and persists values.

## Commit & Pull Request Guidelines
- Follow the existing commit style: short conventional prefixes like `feat:` or `refactor:` with a brief description.
- PRs should include: a concise summary, testing notes, and screenshots or recordings for UI changes.
- Link related issues or feature requests when applicable.

## Security & Configuration Tips
- Do not commit API keys or connection profiles; configure them in SillyTavern.
- If Youdao requests are blocked, set `enableCorsProxy: true` in SillyTavern `config.yaml`.
