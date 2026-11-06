(() => {
  // A second injection (from the background after an extension reload) must not double the listeners.
  if (globalThis.__plamoTranslatorStarted) return;
  globalThis.__plamoTranslatorStarted = true;

  const { createPageTranslator, createStatusView } = globalThis.PlamoPageTranslator;
  const { createSelectionPopup } = globalThis.PlamoSelectionPopup;

  const TOKENS = `
    :host {
      all: initial;
      position: absolute; top: 0; left: 0; width: 0; height: 0;
      z-index: 2147483647;
      --font: system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif;
      --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --border: #d1d9e0; --subtle: #f6f8fa;
      --accent: #2563eb; --on-accent: #ffffff; --danger: #cf222e;
      --shadow: 0 6px 24px rgba(0, 0, 0, 0.16), 0 1px 3px rgba(0, 0, 0, 0.12);
      color-scheme: light dark;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --bg: #1f2329; --fg: #e6edf3; --muted: #9198a1; --border: #3d444d; --subtle: #2a3038;
        --accent: #4c8dff; --on-accent: #0d1117; --danger: #ff7b72;
        --shadow: 0 6px 24px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4);
      }
    }
    [hidden] { display: none !important; }
  `;

  const host = document.createElement('plamo-translator-ui');
  const shadow = host.attachShadow({ mode: 'open' });
  const tokens = document.createElement('style');
  tokens.textContent = TOKENS;
  shadow.append(tokens);

  function ensureHost() {
    if (!host.isConnected) document.documentElement.append(host);
  }
  ensureHost();

  let settings = { targetLang: 'ja', concurrency: 4, showSelectionButton: true };
  chrome.runtime
    .sendMessage({ type: 'get-settings' })
    .then((r) => r?.ok && (settings = r.settings))
    .catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) settings = { ...settings, [key]: newValue };
  });

  async function translate(text) {
    const response = await chrome.runtime.sendMessage({ type: 'translate', text });
    if (!response?.ok) throw new Error(response?.error ?? '拡張機能から応答がありません');
    return response.text;
  }

  const openOptions = () => chrome.runtime.sendMessage({ type: 'open-options' }).catch(() => {});

  let lastState = 'idle';
  let page;
  const renderStatus = createStatusView(shadow, { onRestore: () => page.restore() });
  page = createPageTranslator({
    translate,
    getSettings: () => settings,
    isOwnUi: (node) => node === host,
    onUpdate(status) {
      renderStatus(status);
      if (status.state !== lastState) {
        lastState = status.state;
        chrome.runtime.sendMessage({ type: 'state', state: status.state }).catch(() => {});
      }
    },
  });

  const selection = createSelectionPopup(shadow, {
    host,
    translate,
    buttonEnabled: () => settings.showSelectionButton !== false,
    openOptions,
  });

  const HANDLERS = {
    'toggle-page': () => {
      ensureHost();
      page.toggle();
      return page.status();
    },
    'get-state': () => page.status(),
    'translate-selection': ({ text }) => {
      ensureHost();
      selection.translateSelection(text);
      return { ok: true };
    },
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handler = HANDLERS[message?.type];
    if (!handler) return false;
    sendResponse(handler(message));
    return false;
  });
})();
