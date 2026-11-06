export const LANGUAGES = [
  { code: 'ja', label: '日本語', english: 'Japanese' },
  { code: 'en', label: '英語', english: 'English' },
  { code: 'zh-hans', label: '中国語（簡体字）', english: 'Simplified Chinese' },
  { code: 'zh-hant', label: '中国語（繁体字）', english: 'Traditional Chinese' },
  { code: 'ko', label: '韓国語', english: 'Korean' },
  { code: 'fr', label: 'フランス語', english: 'French' },
  { code: 'de', label: 'ドイツ語', english: 'German' },
  { code: 'es', label: 'スペイン語', english: 'Spanish' },
];

function languageName(code) {
  return LANGUAGES.find((l) => l.code === code)?.english ?? code;
}

const PROMPT_STYLES = {
  plamo: {
    body: (text, lang) => ({
      messages: [{ role: 'user', content: text }],
      chat_template_kwargs: { target_lang: lang },
    }),
  },
  generic: {
    body: (text, lang) => ({
      messages: [
        {
          role: 'system',
          content:
            `You are a translation engine. Translate the user's text into ${languageName(lang)}. ` +
            'Reply with the translation only, without explanations or quotes. ' +
            'Keep tags of the form <g id="0">...</g> exactly as they are, around the corresponding translated words.',
        },
        { role: 'user', content: text },
      ],
    }),
  },
};

export function resolvePromptStyle({ promptStyle, model }) {
  if (promptStyle in PROMPT_STYLES) return promptStyle;
  return /plamo/i.test(model) ? 'plamo' : 'generic';
}

function headers(settings) {
  const h = { 'Content-Type': 'application/json' };
  if (settings.apiKey) h.Authorization = `Bearer ${settings.apiKey}`;
  return h;
}

async function request(url, init) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });
  } catch (e) {
    const reason = e.name === 'TimeoutError' ? '応答がありません（60 秒）' : e.message;
    throw new Error(`${url} に接続できません: ${reason}`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

export async function translate(settings, text, { signal } = {}) {
  const style = PROMPT_STYLES[resolvePromptStyle(settings)];
  const body = {
    ...(settings.model ? { model: settings.model } : {}),
    temperature: 0,
    ...style.body(text, settings.targetLang),
  };
  const data = await request(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: headers(settings),
    body: JSON.stringify(body),
    signal,
  });
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('応答に訳文が含まれていません');
  return content.trim();
}

export async function listModels(settings) {
  const data = await request(`${settings.baseUrl}/models`, { headers: headers(settings) });
  return (data?.data ?? []).map((m) => m.id).filter(Boolean);
}
