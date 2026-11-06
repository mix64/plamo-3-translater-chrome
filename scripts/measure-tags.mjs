// Sends 20 sentences with inline elements to the LLM the way page translation does. Counts the
// sentences whose tags came back exactly, and the tags markup.js's lenient parse keeps.
import '../src/content/markup.js';
import { translate } from '../src/llm.js';

const { serialize, parse } = globalThis.PlamoMarkup;
const BASE_URL = process.env.LLM_BASE_URL ?? 'http://100.64.114.83:8891/v1';

// A nested array is one inline element around its contents.
const SENTENCES = [
  ['Read the ', ['documentation'], ' for ', ['more details'], ' about the API.'],
  ['The ', ['React'], ' team announced ', ['a new version'], ' with ', ['better performance'], ' today.'],
  ['Visit ', ['our ', ['official'], ' website'], ' for updates.'],
  ['Please ', ['sign in'], ' or ', ['create an account'], ' to continue.'],
  ['The function returns ', ['null'], ' if the ', ['key'], ' is not found in the ', ['map'], '.'],
  ['According to ', ['a recent study'], ' published in ', ['Nature'], ', global temperatures are rising.'],
  [['Note:'], ' this feature is ', ['experimental'], ' and may change.'],
  ['Copyright 2024 ', ['Example Inc.'], ' All rights reserved.'],
  ['He said that ', ['the results were ', ['surprisingly good']], ' despite the delays.'],
  ['Download the ', ['latest release'], ' from ', ['GitHub'], ', then follow the ', ['installation guide'], '.'],
  ['If you have questions, ', ['open an issue'], '.'],
  ['Our ', ['privacy policy'], ' explains how we use ', ['cookies'], ' and ', ['personal data'], ' on this site.'],
  ['Tokyo is the ', ['capital'], ' of Japan and one of the ', ['largest cities'], ' in the world.'],
  ['The update fixes ', ['a bug'], ' that caused ', ['crashes on startup'], '.'],
  ['Thanks to ', ['Alice'], ', ', ['Bob'], ', and ', ['Carol'], ' for their contributions.'],
  ['Press ', ['Ctrl+C'], ' to copy and ', ['Ctrl+V'], ' to paste.'],
  ['This article was ', ['last updated'], ' on ', ['June 5'], '.'],
  ['Machine learning models require ', ['large amounts of data'], ' to ', ['generalize well'], '.'],
  ['You can ', ['change your settings'], ' at any time.'],
  ['In ', ['1969'], ', ', ['Apollo 11'], ' landed on the Moon.'],
];

const toNode = (part) =>
  typeof part === 'string'
    ? { nodeType: 3, nodeValue: part }
    : { nodeType: 1, localName: 'span', getAttribute: () => null, childNodes: part.map(toNode) };

const settings = { baseUrl: BASE_URL, model: '', targetLang: 'ja' };
let intact = 0;
let kept = 0;
let total = 0;
for (const sentence of SENTENCES) {
  const { source, tags } = serialize(sentence.map(toNode));
  const output = await translate(settings, source);
  const { dropped, ignored } = parse(output, tags.length);
  kept += tags.length - dropped;
  total += tags.length;
  if (!dropped && !ignored) intact++;
  else console.log(`BROKEN dropped ${dropped}, ignored ${ignored}\n  in:  ${source}\n  out: ${output}`);
}
console.log(`intact sentences ${intact}/${SENTENCES.length}, tags kept ${kept}/${total}`);
