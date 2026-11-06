import { loadSettings } from './shared/settings.js';
import { translate } from './llm.js';

const CONTENT_SCRIPTS = [
  'src/content/markup.js',
  'src/content/page-translator.js',
  'src/content/selection-popup.js',
  'src/content/main.js',
];

const BADGES = {
  idle: { text: '' },
  translating: { text: '…', color: '#6b7280' },
  translated: { text: '訳', color: '#2563eb' },
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'translate-page',
      title: 'このページを翻訳／原文に戻す',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'translate-selection',
      title: '選択した文章を翻訳',
      contexts: ['selection'],
    });
  });
});

// Tabs opened before the extension was installed or reloaded have no content script yet.
async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPTS });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

const COMMANDS = {
  'translate-page': (tab) => sendToTab(tab.id, { type: 'toggle-page' }),
  'translate-selection': (tab, info) =>
    sendToTab(tab.id, { type: 'translate-selection', text: info?.selectionText }),
};

function runCommand(command, tab, info) {
  if (!tab?.id || !COMMANDS[command]) return;
  COMMANDS[command](tab, info).catch((e) => console.warn(`${command}: ${e.message}`));
}

chrome.contextMenus.onClicked.addListener((info, tab) => runCommand(info.menuItemId, tab, info));
chrome.commands.onCommand.addListener((command, tab) => runCommand(command, tab));

const HANDLERS = {
  async translate({ text }) {
    return { ok: true, text: await translate(await loadSettings(), text) };
  },
  async 'get-settings'() {
    return { ok: true, settings: await loadSettings() };
  },
  async state({ state }, sender) {
    const badge = BADGES[state] ?? BADGES.idle;
    const tabId = sender.tab?.id;
    if (tabId != null) {
      await chrome.action.setBadgeText({ tabId, text: badge.text });
      if (badge.color) await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
    }
    return { ok: true };
  },
  async 'open-options'() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = HANDLERS[message?.type];
  if (!handler) return false;
  handler(message, sender)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: e.message }));
  return true;
});
