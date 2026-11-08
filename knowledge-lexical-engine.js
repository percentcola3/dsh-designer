// Official Zvec scalar FTS only. Imported exclusively by the fixed native helper.
// No embeddings, vector fields, model inference, network, or global config.
import {zgDigest, zgFail} from './zg-runtime.js';
export const LEXICAL_BACKEND = 'zvec-fts';
export const LEXICAL_MAX_ENTITIES = 50000;
const initialized = new WeakSet();
const METHODS = ['ZVecCollectionSchema', 'ZVecCreateAndOpen', 'ZVecOpen', 'ZVecInitialize'];
export function lexicalAvailable(core) { return METHODS.every(name => typeof core?.[name] === 'function') && core.ZVecDataType?.STRING !== undefined && core.ZVecIndexType?.FTS !== undefined; }
function initialize(core) {
  if (!lexicalAvailable(core)) zgFail('ZG_RUNTIME_UNAVAILABLE', 'The bundled full-text engine is unavailable on this platform');
  if (!initialized.has(core)) { core.ZVecInitialize({logLevel: core.ZVecLogLevel.ERROR, queryThreads: 1, optimizeThreads: 1}); initialized.add(core); }
}
export function lexicalChunks(text, corpusPath) {
  const lines = text.split(/\r?\n/), chunks = []; let first = 0, count = 0, buffer = [];
  function flush() { if (!buffer.length) return; const value = buffer.join('\n'); if (value.trim()) chunks.push({id: zgDigest(corpusPath + '\0' + first + '\0' + chunks.length), corpusPath, startLine: first + 1, endLine: first + count, text: value}); buffer = []; count = 0; }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (buffer.length && (count >= 60 || buffer.join('\n').length + 1 + line.length > 8000)) flush();
    if (line.length > 8000) {
      flush();
      for (let offset = 0; offset < line.length; offset += 8000) if (line.slice(offset, offset + 8000).trim()) chunks.push({id: zgDigest(corpusPath + '\0' + i + '\0' + offset), corpusPath, startLine: i + 1, endLine: i + 1, text: line.slice(offset, offset + 8000)});
    } else { if (!buffer.length) first = i; buffer.push(line); count++; }
  }
  flush(); return chunks;
}
export async function indexLexical(core, {indexPath, files, signal, emit = () => {}}) {
  initialize(core); signal?.throwIfAborted();
  const schema = new core.ZVecCollectionSchema({name: 'designer_knowledge_fts', fields: [
    {name: 'text', dataType: core.ZVecDataType.STRING, nullable: false, indexParams: {indexType: core.ZVecIndexType.FTS, tokenizerName: 'jieba', filters: ['lowercase']}},
    {name: 'corpus_path', dataType: core.ZVecDataType.STRING, nullable: false},
    {name: 'start_line', dataType: core.ZVecDataType.INT32, nullable: false},
    {name: 'end_line', dataType: core.ZVecDataType.INT32, nullable: false}
  ]}); // Deliberately no `vectors` property: this is a real scalar-only collection.
  const collection = core.ZVecCreateAndOpen(indexPath, schema); let entities = 0, filesIndexed = 0;
  try {
    for (const file of files) {
      signal?.throwIfAborted(); const chunks = lexicalChunks(file.text, file.corpusPath); entities += chunks.length;
      if (entities > LEXICAL_MAX_ENTITIES) zgFail('ZG_TOO_LARGE', 'Text projections contain too many searchable passages');
      for (let start = 0; start < chunks.length; start += 128) {
        signal?.throwIfAborted(); const batch = chunks.slice(start, start + 128).map(chunk => ({id: chunk.id, fields: {text: chunk.text, corpus_path: chunk.corpusPath, start_line: chunk.startLine, end_line: chunk.endLine}}));
        const status = collection.insertSync(batch);
        if (!Array.isArray(status) || status.length !== batch.length || status.some(item => item.ok !== true)) zgFail('ZG_INDEX_INCOMPLETE', 'The full-text engine could not store every admitted passage');
      }
      filesIndexed++; emit({phase: 'indexing', filesTotal: files.length, filesIndexed, filesFailed: 0});
      await new Promise(resolve => setImmediate(resolve));
    }
    if (!entities) zgFail('ZG_INDEX_INCOMPLETE', 'The selected documents contain no searchable text');
    signal?.throwIfAborted(); collection.optimizeSync();
    if (collection.stats.docCount !== entities) zgFail('ZG_INDEX_INCOMPLETE', 'The full-text engine stored an incomplete index');
    return {backend: LEXICAL_BACKEND, entities, filesIndexed, filesFailed: 0};
  } finally { collection.closeSync(); }
}
export function searchLexical(core, {indexPath, query, limit, signal}) {
  initialize(core); signal?.throwIfAborted(); if (!/[\p{L}\p{N}]/u.test(query)) return [];
  const collection = core.ZVecOpen(indexPath, {readOnly: true});
  try {
    const hits = collection.querySync({fieldName: 'text', fts: {matchString: query}, topk: limit, includeVector: false, outputFields: ['corpus_path', 'start_line', 'end_line']});
    signal?.throwIfAborted();
    return hits.map(hit => ({corpusPath: hit.fields?.corpus_path, startLine: hit.fields?.start_line, endLine: hit.fields?.end_line, score: hit.score}));
  } finally { collection.closeSync(); }
}
