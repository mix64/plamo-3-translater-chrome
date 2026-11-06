import { loadSettings, saveSettings, normalizeSettings } from '../shared/settings.js';
import { LANGUAGES, listModels, translate } from '../llm.js';

const form = document.getElementById('form');
const message = document.getElementById('message');
const fields = form.elements;

for (const { code, label } of LANGUAGES) {
  fields.targetLang.append(new Option(`${label}（${code}）`, code));
}

function show(text, kind = '') {
  message.textContent = text;
  message.className = kind;
}

function readForm() {
  return normalizeSettings({
    baseUrl: fields.baseUrl.value,
    apiKey: fields.apiKey.value,
    model: fields.model.value,
    targetLang: fields.targetLang.value,
    concurrency: fields.concurrency.value,
    showSelectionButton: fields.showSelectionButton.checked,
  });
}

function fillForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const field = fields[key];
    if (field?.type === 'checkbox') field.checked = value;
    else if (field) field.value = value;
  }
}

fillForm(await loadSettings());

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  fillForm(await saveSettings(readForm()));
  show('保存しました。', 'ok');
});

document.getElementById('fetch-models').addEventListener('click', async () => {
  show('モデル一覧を取得中…');
  try {
    const models = await listModels(readForm());
    document.getElementById('models').replaceChildren(...models.map((id) => new Option(id, id)));
    if (models.length === 1 && !fields.model.value) fields.model.value = models[0];
    show(models.length ? `${models.length} 件: ${models.join(', ')}` : 'モデルが見つかりませんでした。', 'ok');
  } catch (e) {
    show(`取得できませんでした。\n${e.message}`, 'error');
  }
});

document.getElementById('test').addEventListener('click', async () => {
  const settings = readForm();
  const sample = 'The quick brown fox jumps over the lazy dog.';
  show('接続テスト中…');
  const started = performance.now();
  try {
    const result = await translate(settings, sample);
    const seconds = ((performance.now() - started) / 1000).toFixed(2);
    show(`成功（${seconds} 秒）\n${sample}\n→ ${result}`, 'ok');
  } catch (e) {
    show(`失敗しました。\n${e.message}`, 'error');
  }
});
