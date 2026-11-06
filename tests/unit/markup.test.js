import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/content/markup.js';

const { serialize, parse, build, isInline } = globalThis.PlamoMarkup;

class FakeText {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
  }
  get textContent() {
    return this.nodeValue;
  }
  cloneNode() {
    return new FakeText(this.nodeValue);
  }
}

class FakeElement {
  constructor(localName, attrs = {}, children = []) {
    this.nodeType = 1;
    this.localName = localName;
    this.attrs = { ...attrs };
    this.childNodes = [];
    children.forEach((c) => this.appendChild(typeof c === 'string' ? new FakeText(c) : c));
  }
  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  get classList() {
    return { contains: (name) => (this.attrs.class ?? '').split(/\s+/).includes(name) };
  }
  getAttribute(name) {
    return this.attrs[name] ?? null;
  }
  appendChild(child) {
    this.childNodes.push(child);
    return child;
  }
  cloneNode(deep) {
    return new FakeElement(this.localName, this.attrs, deep ? this.childNodes.map((c) => c.cloneNode(true)) : []);
  }
}

const h = (name, attrs, ...children) => new FakeElement(name, attrs, children);
const t = (value) => new FakeText(value);
const doc = { createTextNode: (value) => new FakeText(value) };

function html(nodes) {
  return nodes
    .map((n) => {
      if (n.nodeType === 3) return n.nodeValue;
      const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${v}"`).join('');
      return `<${n.localName}${attrs}>${html(n.childNodes)}</${n.localName}>`;
    })
    .join('');
}

function sentence() {
  return [
    t('\n  Read the '),
    h('a', { href: '/docs' }, 'documentation'),
    t(' for '),
    h('b', {}, 'more ', h('em', {}, 'details')),
    t(' about the API.\n'),
  ];
}

test('serialize numbers inline elements in document order and collapses whitespace', () => {
  const s = serialize(sentence());
  assert.equal(s.source, 'Read the <g id="0">documentation</g> for <g id="1">more <g id="2">details</g></g> about the API.');
  assert.deepEqual(s.tags.map((el) => el.localName), ['a', 'b', 'em']);
  assert.equal(s.text, 'Read the documentation for more details about the API.');
  assert.equal(s.lead, true);
  assert.equal(s.trail, true);
});

const translatedHtml = (output, s) => html(build(parse(output, s.tags.length).tree, s.tags, doc));

test('parse and build restore attributes around the translated text', () => {
  const s = serialize(sentence());
  const output = 'APIの<g id="1">さらに<g id="2">詳しい</g>情報</g>は<g id="0">ドキュメント</g>を参照してください。';
  assert.equal(parse(output, 3).dropped, 0);
  assert.equal(
    translatedHtml(output, s),
    'APIの<b>さらに<em>詳しい</em>情報</b>は<a href="/docs">ドキュメント</a>を参照してください。',
  );
});

test('parse returns text without tags as it is', () => {
  assert.deepEqual(parse('こんにちは、世界。', 0), { tree: ['こんにちは、世界。'], dropped: 0, ignored: 0 });
});

test('parse closes the innermost open tag', () => {
  assert.deepEqual(parse('<g id="0">a<g id="1">b</g>c</g>', 2).tree, [
    { id: 0, children: ['a', { id: 1, children: ['b'] }, 'c'] },
  ]);
});

test('a nested tag the model dropped loses only that tag and its stray closing tag', () => {
  const s = serialize([t('Visit '), h('a', { href: '/site' }, 'our ', h('b', {}, 'official'), ' website'), t(' for updates.')]);
  const output = '最新情報は<g id="0">公式</g>ウェブサイト</g>をご覧ください。';
  const { dropped, ignored } = parse(output, 2);
  assert.deepEqual({ dropped, ignored }, { dropped: 1, ignored: 1 });
  assert.equal(translatedHtml(output, s), '最新情報は<a href="/site">公式</a>ウェブサイトをご覧ください。');
});

test('a tag left open is unwrapped and the closed tags inside it are kept', () => {
  const s = serialize(sentence());
  const output = 'APIの詳細については、<g id="1">の<g id="0">ドキュメント</g>を参照してください。';
  assert.equal(parse(output, 3).dropped, 2);
  assert.equal(translatedHtml(output, s), 'APIの詳細については、の<a href="/docs">ドキュメント</a>を参照してください。');
});

test('unknown and repeated ids and malformed tag marks never reach the text', () => {
  const s = serialize([h('a', { href: '/a' }, 'a'), t(' and '), h('b', {}, 'b')]);
  const output = '<g id="0">エー</g>と<g id="0">エー</g><g id="7">ビー</g></g><g>と</g ><g id=1>ビー</g>';
  assert.equal(translatedHtml(output, s), '<a href="/a">エー</a>とエービーと<b>ビー</b>');
  const { dropped, ignored } = parse(output, 2);
  assert.deepEqual({ dropped, ignored }, { dropped: 0, ignored: 7 });
});

test('code, kbd and translate="no" keep their original content', () => {
  const nodes = [
    t('Run '),
    h('code', {}, 'npm ', h('span', {}, 'install')),
    t(' then press '),
    h('kbd', {}, 'Enter'),
    t(' in '),
    h('span', { translate: 'no' }, 'Acme Shell'),
    t('.'),
  ];
  const s = serialize(nodes);
  assert.equal(
    s.source,
    'Run <g id="0">npm install</g> then press <g id="1">Enter</g> in <g id="2">Acme Shell</g>.',
  );
  assert.equal(s.tags.length, 3, 'descendants of kept elements are not numbered');
  assert.equal(s.text, 'Run then press in .');

  assert.equal(
    translatedHtml('<g id="2">アクメシェル</g>で<g id="0">npm インストール</g>を実行し、<g id="1">入力</g>を押します。', s),
    '<span translate="no">Acme Shell</span>で<code>npm <span>install</span></code>を実行し、<kbd>Enter</kbd>を押します。',
  );
});

test('isInline accepts nested inline text and rejects blocks and empty elements', () => {
  assert.equal(isInline(h('a', { href: '#' }, 'link ', h('strong', {}, 'bold'))), true);
  assert.equal(isInline(h('a', { href: '#' }, h('div', {}, 'card'))), false);
  assert.equal(isInline(h('div', {}, 'block')), false);
  assert.equal(isInline(h('i', { class: 'icon' })), false);
  assert.equal(isInline(h('code', {}, h('div', {}, 'x'))), true);
});
