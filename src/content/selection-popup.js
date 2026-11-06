(() => {
  const CHUNK_LIMIT = 1500;

  // Same drawing as icons/icon.svg. Inlined so pages cannot load the extension's files.
  const ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" aria-hidden="true">
      <defs>
        <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#3b82f6"/>
          <stop offset="1" stop-color="#7c3aed"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="url(#tile)"/>
      <path d="M22 12h42a12 12 0 0 1 12 12v28a12 12 0 0 1-12 12H36l-18 14v-14a12 12 0 0 1-8-12V24a12 12 0 0 1 12-12z" fill="#fff" fill-opacity=".55"/>
      <path d="M31 52 43 22 55 52M36.5 42h13" fill="none" stroke="#1e3a8a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M62 56h44a12 12 0 0 1 12 12v26a12 12 0 0 1-12 12h-2v14l-18-14H62a12 12 0 0 1-12-12V68a12 12 0 0 1 12-12z" fill="#fff"/>
      <path d="M64 72h40M64 83h32M64 94h22" fill="none" stroke="#6d28d9" stroke-width="7" stroke-linecap="round"/>
    </svg>`;

  const CSS = `
    .trigger {
      position: absolute; width: 28px; height: 28px; padding: 0; margin: 0;
      border: none; border-radius: 7px; cursor: pointer; overflow: hidden;
      background: none; box-shadow: var(--shadow);
    }
    .trigger svg { display: block; width: 100%; height: 100%; }
    .trigger:hover { filter: brightness(1.1); }
    .card {
      position: absolute; width: min(380px, calc(100vw - 32px)); box-sizing: border-box;
      background: var(--bg); color: var(--fg); border: 1px solid var(--border);
      border-radius: 10px; box-shadow: var(--shadow); font: 14px/1.6 var(--font);
      display: flex; flex-direction: column; max-height: 50vh;
    }
    .card header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 10px 6px 14px; border-bottom: 1px solid var(--border);
      font-size: 12px; color: var(--muted);
    }
    .card .body { padding: 10px 14px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
    .card .loading { color: var(--muted); }
    .card .error { color: var(--danger); }
    .card footer { display: flex; gap: 8px; justify-content: flex-end; padding: 0 10px 10px; }
    .card footer:empty { display: none; }
    .card button {
      font: 12px/1.4 var(--font); border: 1px solid var(--border); background: var(--subtle);
      color: var(--fg); border-radius: 6px; padding: 4px 10px; cursor: pointer;
    }
    .card button:hover { border-color: var(--accent); }
    .card .close { border: none; background: none; font-size: 18px; line-height: 1; padding: 0 4px; color: var(--muted); }
  `;

  function splitIntoChunks(text) {
    const chunks = [];
    let current = '';
    for (const paragraph of text.split(/\n\s*\n/)) {
      if (!paragraph.trim()) continue;
      if (current && current.length + paragraph.length > CHUNK_LIMIT) {
        chunks.push(current);
        current = '';
      }
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
    if (current) chunks.push(current);
    return chunks;
  }

  function isEditableTarget(node) {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!el) return false;
    return el.isContentEditable || Boolean(el.closest('input, textarea, select'));
  }

  /**
   * @param {ShadowRoot} shadow
   * @param {{
   *   host: Element,
   *   translate: (text: string) => Promise<string>,
   *   buttonEnabled: () => boolean,
   *   openOptions: () => void,
   * }} deps
   */
  function createSelectionPopup(shadow, { host, translate, buttonEnabled, openOptions }) {
    const style = document.createElement('style');
    style.textContent = CSS;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'trigger';
    trigger.innerHTML = ICON;
    trigger.title = '選択した文章を翻訳';
    trigger.setAttribute('aria-label', '選択した文章を翻訳');
    trigger.hidden = true;
    const card = document.createElement('div');
    card.className = 'card';
    card.hidden = true;
    card.setAttribute('role', 'dialog');
    card.innerHTML = `
      <header><span>翻訳</span><button type="button" class="close" aria-label="閉じる">×</button></header>
      <div class="body" aria-live="polite"></div>
      <footer></footer>`;
    shadow.append(style, trigger, card);
    const body = card.querySelector('.body');
    const footer = card.querySelector('footer');
    let pendingText = '';
    let requestId = 0;

    function selectionInfo() {
      const selection = getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
      const text = selection.toString().trim();
      if (!text) return null;
      const range = selection.getRangeAt(0);
      if (isEditableTarget(range.commonAncestorContainer) || isEditableTarget(document.activeElement)) {
        return null;
      }
      const rects = [...range.getClientRects()].filter((r) => r.width || r.height);
      if (!rects.length) return null;
      return { text, last: rects.at(-1), bounds: range.getBoundingClientRect() };
    }

    function place(el, left, top) {
      const width = el.offsetWidth;
      const maxLeft = scrollX + document.documentElement.clientWidth - width - 8;
      el.style.left = `${Math.max(scrollX + 8, Math.min(left, maxLeft))}px`;
      el.style.top = `${top}px`;
    }

    function hideTrigger() {
      trigger.hidden = true;
    }

    function close() {
      hideTrigger();
      card.hidden = true;
      requestId++;
    }

    function setFooter(buttons) {
      footer.replaceChildren(
        ...buttons.map(([label, onClick]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.addEventListener('click', onClick);
          return b;
        }),
      );
    }

    async function open(text, bounds) {
      hideTrigger();
      const id = ++requestId;
      card.hidden = false;
      body.className = 'body loading';
      body.textContent = '翻訳中…';
      setFooter([]);
      if (bounds) place(card, bounds.left + scrollX, bounds.bottom + scrollY + 8);
      else place(card, scrollX + (document.documentElement.clientWidth - card.offsetWidth) / 2, scrollY + 24);

      const parts = [];
      try {
        for (const chunk of splitIntoChunks(text)) {
          const translated = await translate(chunk);
          if (id !== requestId) return;
          parts.push(translated);
          body.className = 'body';
          body.textContent = parts.join('\n\n');
        }
        const result = parts.join('\n\n');
        setFooter([
          [
            'コピー',
            async (e) => {
              await navigator.clipboard.writeText(result);
              e.target.textContent = 'コピーしました';
            },
          ],
        ]);
      } catch (e) {
        if (id !== requestId) return;
        body.className = 'body error';
        body.textContent = `翻訳できませんでした。\n${e.message}`;
        setFooter([['設定を開く', openOptions]]);
      }
    }

    trigger.addEventListener('mousedown', (e) => e.preventDefault());
    trigger.addEventListener('click', () => {
      const info = selectionInfo();
      open(info?.text ?? pendingText, info?.bounds);
    });
    card.querySelector('.close').addEventListener('click', close);

    document.addEventListener('mousedown', (e) => {
      if (e.composedPath().includes(host)) return;
      close();
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || e.composedPath().includes(host) || !buttonEnabled()) return;
      setTimeout(() => {
        const info = selectionInfo();
        if (!info) return;
        pendingText = info.text;
        trigger.hidden = false;
        place(trigger, info.last.right + scrollX + 4, info.last.bottom + scrollY + 4);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    return {
      /** Opens the card for the current selection, or for `text` given by the context menu. */
      translateSelection(text) {
        const info = selectionInfo();
        const value = text?.trim() || info?.text;
        if (value) open(value, info?.bounds);
      },
    };
  }

  globalThis.PlamoSelectionPopup = { createSelectionPopup };
})();
