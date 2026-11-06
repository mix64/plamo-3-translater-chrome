const statusEl = document.getElementById('status');
const toggle = document.getElementById('toggle');

const CONTENT_SCRIPTS = chrome.runtime.getManifest().content_scripts[0].js;

const LABELS = {
  idle: ['未翻訳', 'このページを翻訳'],
  translating: ['翻訳中', '原文に戻す'],
  translated: ['翻訳済み', '原文に戻す'],
};

function render(status) {
  const [label, action] = LABELS[status.state] ?? LABELS.idle;
  statusEl.textContent = status.failed ? `${label}（${status.failed} 件失敗）` : label;
  toggle.textContent = action;
  toggle.disabled = false;
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

try {
  render(await chrome.tabs.sendMessage(tab.id, { type: 'get-state' }));
} catch {
  if (/^(https?|file):/.test(tab?.url ?? '')) render({ state: 'idle' });
  else statusEl.textContent = 'このページでは使えません。';
}

toggle.addEventListener('click', async () => {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle-page' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_SCRIPTS });
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle-page' });
  }
  window.close();
});

document.getElementById('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
