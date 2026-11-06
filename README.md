# PLaMo Translator (Chrome extension)

A Chrome extension that translates web pages in place with any LLM that exposes an OpenAI-compatible API. It is built for PLaMo translation models (such as `plamo-3-translate`) served by llama.cpp, and works with other OpenAI-compatible models too.

- **Page translation.** Replaces the text of the current page with its translation. Links and bold text stay in place, and one click restores the original.
- **Selection translation.** Select some text and a small 訳 button appears. Click it to open a card with the translation below the selection.

The extension's UI is in Japanese, so the labels below are quoted as they appear on screen, with an English gloss.

## Install

No build step is needed.

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this repository's folder (the one containing `manifest.json`).
4. Pin **PLaMo 翻訳** from the puzzle icon in the toolbar for quick access.

Tabs that were already open before installing also work from the popup, the context menu, and the keyboard shortcuts. The extension injects itself into the tab at that moment.

## Settings

Click the toolbar icon and choose **設定を開く** (Open settings), or open **Extension options** from **Details** on `chrome://extensions`.

| Setting | Description |
| --- | --- |
| API URL | Everything before `/chat/completions`, e.g. `http://localhost:8080/v1` |
| API key | Sent as `Authorization: Bearer` when not empty |
| Model | Omitted from requests when empty. **モデル一覧を取得** (Fetch models) lists the models from `GET /models` |
| Prompt style | **自動** (Auto) uses the PLaMo style when the model name contains `plamo`, and the generic style otherwise |
| Target language | Japanese by default |
| Concurrent requests | Maximum number of requests page translation sends at once (1 to 16, default 4) |
| Show translate button | When off, selecting text shows no button. The context menu and the shortcut still work |

The two prompt styles differ as follows.

- **PLaMo translation model.** Sends only the text to translate as the user message, and passes the target language as `chat_template_kwargs: { target_lang }`.
- **Generic chat model.** A system message asks for the target language, a reply containing only the translation, and tags of the form `<g id="0">…</g>` kept in place.

If you run PLaMo on llama.cpp and leave the model name empty, set the prompt style to **PLaMo 翻訳モデル** (PLaMo translation model). With **自動** (Auto) the extension cannot tell from an empty model name and falls back to the generic style.

When you have filled in the form, click **接続テスト** (Test connection) to translate a short English sentence, then click **保存** (Save).

## Usage

### Page translation

Start it in any of these ways. Doing the same again restores the original.

- Click the toolbar icon, then **このページを翻訳** (Translate this page)
- Choose **このページを翻訳／原文に戻す** (Translate this page / Restore original) from the page's context menu
- Press `Alt+Shift+T`

Only text near the screen is translated, starting with the paragraphs currently in view. As you scroll, the text further down gets translated too. Text the page adds after translation starts is translated as well. A small panel at the bottom right shows progress and a **原文に戻す** (Restore original) button.

The following is never translated.

- `pre`, `script`, `style`, `textarea`, form fields, and editable regions
- Elements with `translate="no"` or the `notranslate` class
- Text that contains kana when the target language is Japanese (it is already Japanese)
- The contents of inline `code`, `kbd`, `samp`, and `var` (the surrounding sentence is translated and these parts stay as written)

### Selection translation

Select some text and a round 訳 button appears at the bottom right of the selection. Click it to open a card with the translation below the selection. **コピー** (Copy) on the card copies the translation.

You can also open the card with **選択した文章を翻訳** (Translate selected text) in the context menu or with `Alt+Shift+S`. The card closes on `Escape`, on a click outside it, or on a new selection.

Change the shortcuts at `chrome://extensions/shortcuts`.

## Tests

```sh
npm install
npx playwright install chromium
npm test
npm run e2e
```

- `npm test` runs the unit tests for `src/content/markup.js` (conversion between inline elements and tag strings).
- `npm run e2e` loads the extension into Playwright's Chromium, opens `tests/e2e/fixture.html`, and runs these against a real LLM: the connection test on the options page, page translation, restoring the original, and selection translation. Page translation covers sentences whose tags the model tends to break, a paragraph inside a closed `details`, and scrolling to the end of a long page. Pass the LLM URL in `LLM_BASE_URL` (default `http://100.64.114.83:8891/v1`). Screenshots of the translated page and the selection card are saved to `tests/e2e/out/`. Set `HEADED=1` to watch the browser.

```sh
LLM_BASE_URL=http://localhost:8080/v1 npm run e2e
```

`npm run measure-tags` sends 20 sentences containing inline elements to the LLM. It prints how many sentences came back with their tags intact and how many tags could be read from the translations, as `intact sentences N/20, tags kept K/M`. It also prints the broken translations.

`npm run smoke` translates real pages in Chromium with the extension loaded. It reports the elapsed seconds and the visible paragraphs left untranslated, once at the top of the page and once after scrolling to the end. By default it opens one Wikipedia page and one MDN page. Pass other URLs as arguments. Screenshots are saved to `tests/e2e/out/`.

```sh
npm run smoke -- https://example.com/article
```

`LLM_BASE_URL` also sets the LLM URL for `npm run measure-tags` and `npm run smoke`. `LLM_MODEL` sets the model name for `npm run smoke` (default `plamo-3-translate-0.8b`).

Regenerate the icons with `python scripts/make_icons.py` (requires Pillow and a Japanese font).

## Files

The design is described in [docs/design.md](docs/design.md).

| File | Role |
| --- | --- |
| `manifest.json` | Permissions, content scripts, commands |
| `src/background.js` | Service worker: LLM calls, context menu, shortcuts, badge |
| `src/llm.js` | Builds requests to the OpenAI-compatible API and reads the responses |
| `src/shared/settings.js` | Setting defaults, reading and writing |
| `src/content/markup.js` | Conversion between inline elements and tag strings |
| `src/content/page-translator.js` | Page translation and the progress panel at the bottom right |
| `src/content/selection-popup.js` | Selection translation UI |
| `src/content/main.js` | Content script entry point and message handlers |
| `src/popup/` | Toolbar popup |
| `src/options/` | Options page |
