export const DEFAULTS = Object.freeze({
  baseUrl: 'http://localhost:8080/v1',
  apiKey: '',
  model: '',
  targetLang: 'ja',
  concurrency: 4,
  showSelectionButton: true,
});

export function normalizeSettings(raw) {
  const s = { ...DEFAULTS, ...raw };
  return {
    baseUrl: String(s.baseUrl).trim().replace(/\/+$/, '') || DEFAULTS.baseUrl,
    apiKey: String(s.apiKey).trim(),
    model: String(s.model).trim(),
    targetLang: String(s.targetLang).trim().toLowerCase() || DEFAULTS.targetLang,
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
