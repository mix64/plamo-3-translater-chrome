(() => {
  const CHUNK_LIMIT = 1500;

  const CSS = `
    .trigger {
      position: absolute; width: 28px; height: 28px; padding: 0; margin: 0;
      border: none; border-radius: 50%; cursor: pointer;
      background: var(--accent); color: var(--on-accent); box-shadow: var(--shadow);
      font: bold 14px/28px var(--font); text-align: center;
    }
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
    trigger.textContent = '訳';
    trigger.title = '選択した文章を翻訳';
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
