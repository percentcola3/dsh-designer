import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { getDocument, OPS, PasswordResponses } from 'pdfjs-dist/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs';
import {
  normalizePDFViewState, createPDFLayout, currentPDFPage, visiblePDFPages,
  pdfScrollState, pdfScrollTarget, buildPDFText, findPDFMatches,
  pdfMatchSegments, nextPDFSearchIndex, createPDFTaskQueue,
} from './pdf-state.js';

test('PDF state clamps stale references, malformed state and legacy iframe zoom', () => {
  assert.deepEqual(normalizePDFViewState({ page: 999, zoom: 20, pageOffset: -5, scrollLeft: -1, search: 'term', searchIndex: -2 }, 4), {
    page: 4, zoom: 4, pageOffset: -1, scrollLeft: 0, search: 'term', searchIndex: 0,
  });
  assert.equal(normalizePDFViewState({ pdfZoom: '125' }).zoom, 1.25);
  assert.equal(normalizePDFViewState({ pdfZoom: 'page-fit', page: NaN }).zoom, 1);
  assert.equal(normalizePDFViewState({ zoom: 'broken', page: -1 }).page, 1);
  assert.equal(normalizePDFViewState({ search: 'x'.repeat(900) }).search.length, 500);
});

test('actual mixed page dimensions determine scroll page, including partial-page boundaries', () => {
  const layout = createPDFLayout(3, { 1: { width: 600, height: 600 }, 2: { width: 900, height: 300 } }, 1);
  assert.equal(layout.pages[0].height, 800);
  assert.equal(layout.pages[1].height, 400);
  assert.equal(layout.pages[1].width, 1200);
  assert.equal(currentPDFPage(layout, 0, 600), 1);
  assert.equal(currentPDFPage(layout, 800, 500), 2); // twenty pixels of p1 do not win.
  assert.equal(currentPDFPage(layout, 1225, 500), 3);
  assert.equal(currentPDFPage(layout, 100000, 500), 3);
});

test('page-relative anchors survive zoom and corrected estimates before the current page', () => {
  const before = createPDFLayout(10, { 1: { width: 600, height: 750 } }, 1);
  const top = before.pages[5].top + 300;
  const state = pdfScrollState(before, top, 400, 82);
  assert.equal(state.page, 6); assert.equal(state.pageOffset, 0.3);
  const after = createPDFLayout(10, { 1: { width: 600, height: 750 }, 2: { width: 600, height: 1500 } }, 2);
  const target = pdfScrollTarget(after, state);
  assert.equal(target.top, after.pages[5].top + 600);
  assert.equal(target.left, 82);
  assert.equal(pdfScrollState(after, target.top, 400, target.left).page, 6);
});

test('a long document mounts a strict bounded window containing the actual scroll page', () => {
  const layout = createPDFLayout(10000);
  for (const page of [1, 6, 5000, 9999, 10000]) {
    const mounted = visiblePDFPages(layout, layout.pages[page - 1].top, 600);
    assert.ok(mounted.length <= 7);
    assert.ok(mounted.some((box) => box.page === page));
  }
  assert.deepEqual(visiblePDFPages(createPDFLayout(0), 0, 600), []);
});

test('search uses literal Unicode text, line whitespace and original selection offsets', () => {
  const content = buildPDFText([{ str: 'Of\ufb01ce ', hasEOL: false }, { str: 'HELLO', hasEOL: true }, { str: 'world [x].', hasEOL: false }]);
  assert.equal(content.text, 'Of\ufb01ce HELLO\nworld [x].');
  assert.deepEqual(findPDFMatches(content.text, 'office'), [{ start: 0, end: 5 }]);
  assert.deepEqual(findPDFMatches(content.text, 'hello world'), [{ start: 6, end: 17 }]);
  assert.deepEqual(findPDFMatches(content.text, '[x].'), [{ start: 18, end: 22 }]);
  assert.deepEqual(findPDFMatches('a  \n b', 'a b'), [{ start: 0, end: 6 }]);
  assert.deepEqual(findPDFMatches('😀x 😀x', '😀X'), [{ start: 0, end: 3 }, { start: 4, end: 7 }]);
  assert.deepEqual(findPDFMatches('anything', '  \n '), []);
});

test('a match split across text items highlights every selected fragment without altering text', () => {
  const content = buildPDFText([{ str: 'some fi' }, { str: 'nding' }, { str: ' here' }]);
  const matches = findPDFMatches(content.text, 'finding');
  assert.deepEqual(matches, [{ start: 5, end: 12 }]);
  assert.deepEqual(pdfMatchSegments(content.spans[0].start, content.spans[0].end, matches), [{ start: 5, end: 7, index: 0 }]);
  assert.deepEqual(pdfMatchSegments(content.spans[1].start, content.spans[1].end, matches), [{ start: 0, end: 5, index: 0 }]);
  assert.deepEqual(pdfMatchSegments(content.spans[2].start, content.spans[2].end, matches), []);
});

test('search result caps and previous/next wrap are deterministic', () => {
  assert.equal(findPDFMatches('x '.repeat(20000), 'x', 10000).length, 10000);
  assert.deepEqual(findPDFMatches('aaaa', 'aa'), [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  assert.equal(nextPDFSearchIndex(0, -1, 3), 2);
  assert.equal(nextPDFSearchIndex(2, 1, 3), 0);
  assert.equal(nextPDFSearchIndex(0, 1, 0), 0);
});

test('render queue bounds concurrency and aborts a stale queued page before it allocates', async () => {
  const queue = createPDFTaskQueue(2), releases = [];
  let active = 0, maximum = 0, staleRan = false;
  const work = () => queue(async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => releases.push(resolve)); active--;
  });
  const a = work(), b = work();
  await Promise.resolve();
  const controller = new AbortController();
  const stale = queue(() => { staleRan = true; }, controller.signal);
  const cancelled = assert.rejects(stale, { name: 'AbortError' });
  controller.abort(); await cancelled;
  releases.splice(0).forEach((release) => release());
  await Promise.all([a, b]);
  await queue(() => { assert.equal(active, 0); });
  assert.equal(maximum, 2); assert.equal(staleRan, false);
  await assert.rejects(queue(() => assert.fail('already aborted task ran'), controller.signal), { name: 'AbortError' });
});

// Genuine in-memory PDF fixtures: correct xrefs, Flate streams and standard
// security encryption. No browser, native canvas dependency or library data.
function assemblePDF(objects, trailer = '') {
  let pdf = '%PDF-1.7\n', offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}
function stream(content, compress = false) {
  const bytes = compress ? deflateSync(Buffer.from(content, 'latin1')) : Buffer.from(content, 'latin1');
  return `<< /Length ${bytes.length}${compress ? ' /Filter /FlateDecode' : ''} >>\nstream\n${bytes.toString('latin1')}\nendstream`;
}
function textPDF() {
  return assemblePDF([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    stream('BT /F1 18 Tf 72 700 Td (Actual PDF parser hello world) Tj ET', true),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 300] /Rotate 90 /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
    stream('BT /F1 16 Tf 20 220 Td (Second page searchable hello) Tj ET', true),
  ]);
}
const pdfRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
class LocalFonts {
  async fetch({ filename }) { return new Uint8Array(await readFile(join(pdfRoot, 'standard_fonts', filename))); }
}
function loadPDF(data) {
  globalThis.pdfjsWorker = { WorkerMessageHandler };
  return getDocument({ data, isEvalSupported: false, stopAtErrors: true, disableFontFace: true, useSystemFonts: false, useWorkerFetch: false, StandardFontDataFactory: LocalFonts });
}

test('actual locally packaged PDF.js parses compressed pages, dimensions, text and canvas operators', async () => {
  const task = loadPDF(textPDF());
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 2);
    const first = await pdf.getPage(1), second = await pdf.getPage(2);
    assert.equal(first.getViewport({ scale: 1 }).width, 612);
    assert.equal(first.getViewport({ scale: 1 }).height, 792);
    assert.equal(second.getViewport({ scale: 1 }).width, 300);
    assert.equal(second.getViewport({ scale: 1 }).height, 420);
    const firstText = buildPDFText((await first.getTextContent()).items).text;
    const secondText = buildPDFText((await second.getTextContent()).items).text;
    assert.match(firstText, /Actual PDF parser hello world/);
    assert.equal(findPDFMatches(secondText, 'searchable hello').length, 1);
    const operators = await first.getOperatorList();
    assert.ok(operators.fnArray.includes(OPS.showText));
    assert.ok(operators.fnArray.includes(OPS.setFont));
    assert.ok(operators.argsArray.some((args) => Array.isArray(args?.[0]) && args[0].some((glyph) => glyph?.unicode === 'h')));
    first.cleanup(); second.cleanup();
  } finally { await task.destroy(); }
});

test('actual parser rejects corrupt data and cancels an unresolved password load', async () => {
  const invalid = loadPDF(new TextEncoder().encode('not a PDF'));
  await assert.rejects(invalid.promise, { name: 'InvalidPDFException' });
  await invalid.destroy();
  const encrypted = loadPDF(passwordPDF('secret'));
  let requested;
  const prompt = new Promise((resolve) => { requested = resolve; });
  encrypted.onPassword = (_, reason) => requested(reason);
  const outcome = encrypted.promise.catch((error) => error);
  assert.equal(await prompt, PasswordResponses.NEED_PASSWORD);
  await encrypted.destroy();
  assert.ok((await outcome) instanceof Error);
});

const passwordPadding = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex');
function paddedPassword(value) { return Buffer.concat([Buffer.from(value, 'latin1'), passwordPadding]).subarray(0, 32); }
function md5(value) { return createHash('md5').update(value).digest(); }
function rc4(key, bytes) {
  const state = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + state[i] + key[i % key.length]) & 255; [state[i], state[j]] = [state[j], state[i]]; }
  const result = Buffer.alloc(bytes.length); let i = 0; j = 0;
  for (let n = 0; n < bytes.length; n++) {
    i = (i + 1) & 255; j = (j + state[i]) & 255;
    [state[i], state[j]] = [state[j], state[i]];
    result[n] = bytes[n] ^ state[(state[i] + state[j]) & 255];
  }
  return result;
}
function passwordPDF(password) {
  const ownerKey = md5(paddedPassword('owner')).subarray(0, 5);
  const owner = rc4(ownerKey, paddedPassword(password));
  const permissions = Buffer.alloc(4); permissions.writeInt32LE(-4);
  const id = Buffer.from('aabbccddeeff00112233445566778899', 'hex');
  const key = md5(Buffer.concat([paddedPassword(password), owner, permissions, id])).subarray(0, 5);
  const user = rc4(key, passwordPadding);
  const objectKey = md5(Buffer.concat([key, Buffer.from([5, 0, 0, 0, 0])])).subarray(0, 10);
  const encryptedText = rc4(objectKey, Buffer.from('BT /F1 12 Tf 40 700 Td (Unlocked searchable text) Tj ET', 'latin1'));
  return assemblePDF([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${encryptedText.length} >>\nstream\n${encryptedText.toString('latin1')}\nendstream`,
    `<< /Filter /Standard /V 1 /R 2 /O <${owner.toString('hex')}> /U <${user.toString('hex')}> /P -4 >>`,
  ], `/Encrypt 6 0 R /ID [<${id.toString('hex')}> <${id.toString('hex')}>]`);
}

test('actual encrypted PDF distinguishes required and incorrect passwords, then extracts real decrypted text', async () => {
  const task = loadPDF(passwordPDF('secret')), prompts = [];
  task.onPassword = (update, reason) => { prompts.push(reason); update(prompts.length === 1 ? 'wrong' : 'secret'); };
  try {
    const pdf = await task.promise;
    assert.deepEqual(prompts, [PasswordResponses.NEED_PASSWORD, PasswordResponses.INCORRECT_PASSWORD]);
    assert.equal(pdf.numPages, 1);
    const page = await pdf.getPage(1);
    assert.match(buildPDFText((await page.getTextContent()).items).text, /Unlocked searchable text/);
  } finally { await task.destroy(); }
});
