export const DEFAULTS = Object.freeze({
  baseUrl: 'http://localhost:8080/v1',
  apiKey: '',
  model: '',
  targetLang: 'ja',
  promptStyle: 'auto',
  concurrency: 4,
  showSelectionButton: true,
});

export const PROMPT_STYLE_CHOICES = ['auto', 'plamo', 'generic'];

export function normalizeSettings(raw) {
  const s = { ...DEFAULTS, ...raw };
  return {
    baseUrl: String(s.baseUrl).trim().replace(/\/+$/, '') || DEFAULTS.baseUrl,
    apiKey: String(s.apiKey).trim(),
    model: String(s.model).trim(),
    targetLang: String(s.targetLang).trim().toLowerCase() || DEFAULTS.targetLang,
    promptStyle: PROMPT_STYLE_CHOICES.includes(s.promptStyle) ? s.promptStyle : DEFAULTS.promptStyle,
    concurrency: Math.min(16, Math.max(1, Math.round(Number(s.concurrency)) || DEFAULTS.concurrency)),
    showSelectionButton: s.showSelectionButton !== false,
  };
}

export async function loadSettings() {
  return normalizeSettings(await chrome.storage.sync.get(DEFAULTS));
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await chrome.storage.sync.set(normalized);
  return normalized;
}
