import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeSpeechRecording, encodeNativeWave, nativeAudioBase64, observeNativeSpeech, remoteValue, speechAvailability} from './native-speech.js';

const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const browser = {navigator: {mediaDevices: {getUserMedia() {throw new Error('must not acquire during readiness');}}}, MediaRecorder: class {}, AudioContext: class {}, OfflineAudioContext: class {}};
const catalog = {maxAudioBytes: 64044, maxDurationSeconds: 2, providers: [{id: 'configured', name: 'Configured service', languages: ['auto', 'zh'], preparation: {phase: 'ready'}}], selection: {providerId: 'configured', language: 'zh'}};

test('speech readiness uses configured provider, exact languages, limits and strict endpoint access', () => {
  const ready = {catalog, connected: true};
  assert.equal(speechAvailability(ready, true, browser).provider.id, 'configured');
  assert.equal(speechAvailability(ready, true, browser).ready, true);
  assert.equal(speechAvailability(ready, undefined, browser).ready, undefined);
  assert.match(speechAvailability(ready, false, browser).reason, /权限/);
  assert.match(speechAvailability({...ready, connected: false, error: new Error('disconnected')}, true, browser).reason, /disconnected/);
  assert.match(speechAvailability({connected: true, catalog: {...catalog, selection: {providerId: 'withdrawn', language: 'zh'}}}, true, browser).reason, /未选择/);
  assert.match(speechAvailability({connected: true, catalog: {...catalog, selection: {providerId: 'configured', language: 'unsupported'}}}, true, browser).reason, /语言/);
  assert.match(speechAvailability({connected: true, catalog: {...catalog, maxAudioBytes: 0}}, true, browser).reason, /限制/);
  assert.match(speechAvailability(ready, true, {}).reason, /浏览器/);
});

test('unprepared/failed providers report actual readiness without preparation or download', () => {
  const failed = {...catalog.providers[0], preparation: {phase: 'failed', message: 'provider unavailable'}};
  assert.match(speechAvailability({connected: true, catalog: {...catalog, providers: [failed]}}, true, browser).reason, /provider unavailable/);
  const unprepared = {...failed, preparation: {phase: 'unprepared'}};
  assert.match(speechAvailability({connected: true, catalog: {...catalog, providers: [unprepared]}}, true, browser).reason, /尚未准备/);
});

test('WAV encoder writes canonical mono 16kHz PCM and clips signed samples', () => {
  const wave = encodeNativeWave(Float32Array.from([-2, -1, 0, 1, 2, NaN]));
  const view = new DataView(wave.buffer);
  assert.equal(new TextDecoder().decode(wave.subarray(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(wave.subarray(8, 12)), 'WAVE');
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(28, true), 32000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 12);
  assert.deepEqual(Array.from({length: 6}, (_, i) => view.getInt16(44 + i * 2, true)), [-32768, -32768, 0, 32767, 32767, 0]);
  assert.equal(nativeAudioBase64(wave), Buffer.from(wave).toString('base64'));
});

test('RemoteResult failures preserve code and reject malformed outcomes', () => {
  assert.deepEqual(remoteValue({ok: true, value: {text: 'draft'}}), {text: 'draft'});
  assert.throws(() => remoteValue({ok: false, error: {code: 'denied', message: 'not permitted'}}), error => error.code === 'denied' && error.message.includes('not permitted'));
  assert.throws(() => remoteValue(undefined), /RemoteResult/);
});

test('official stream consumes item.value, accepts snapshots and disposes its carrier', async () => {
  const emitted = deferred(), finished = deferred();
  let accepted = 0, disposed = 0, opened = 0, options;
  class CarrierError extends Error {}
  const ctx = {streamEndedError:message=>new CarrierError(message),remote: {speech: {follow(signal) {opened++; assert.ok(signal instanceof AbortSignal); return 'official-follow';}},
    $stream(input) {options = input; assert.equal(input.open(new AbortController().signal), 'official-follow'); return {
      async *[Symbol.asyncIterator]() {yield {value: catalog, accept() {accepted++; emitted.resolve();}}; await finished.promise;},
      async dispose() {disposed++; finished.resolve();},
    };},
  }};
  const values = [];
  const observation = observeNativeSpeech(ctx, value => values.push(value));
  await emitted.promise;
  assert.equal(opened, 1); assert.equal(accepted, 1); assert.equal(values[0].catalog, catalog); assert.equal(values[0].connected, true);
  assert.ok(options.ended() instanceof CarrierError);
  options.carrierFailed(new Error('carrier lost'));
  assert.equal(values.at(-1).connected, false); assert.match(values.at(-1).error.message, /carrier lost/);
  await observation.dispose();
  options.carrierFailed(new Error('late failure'));
  assert.equal(disposed, 1); assert.equal(values.length, 2);
});

test('missing speech service is an explicit retryable readiness failure', async () => {
  const values = [];
  const observer = observeNativeSpeech({}, value => values.push(value));
  await observer.dispose();
  assert.equal(values.length, 1); assert.match(values[0].error.message, /unavailable/);
});

function recordingEnvironment({grant, decode, rendered, duration = 0.5} = {}) {
  const calls = {trackStops: 0, contexts: 0, closes: 0, dimensions: null, source: null, recorderStarts: 0};
  const stream = {getTracks: () => [{stop() {calls.trackStops++;}, addEventListener() {}}]};
  class AudioContext {
    constructor() {calls.contexts++; this.state = 'running';}
    decodeAudioData() {return decode?.promise || Promise.resolve({duration, numberOfChannels: 2});}
    async close() {calls.closes++; this.state = 'closed';}
  }
  class MediaRecorder {
    constructor() {this.state = 'inactive'; this.mimeType = 'audio/webm';}
    start() {this.state = 'recording'; calls.recorderStarts++;}
    stop() {this.state = 'inactive'; queueMicrotask(() => {this.ondataavailable?.({data: new Blob(['final recording chunk'])}); this.onstop?.();});}
  }
  class OfflineAudioContext {
    constructor(...dimensions) {calls.dimensions = dimensions; this.destination = {};}
    createBufferSource() {calls.source = {connect() {}, start() {}}; return calls.source;}
    startRendering() {return rendered?.promise || Promise.resolve({getChannelData: () => Float32Array.from([0.5, -0.5])});}
  }
  const environment = {navigator: {mediaDevices: {getUserMedia: () => grant?.promise || Promise.resolve(stream)}}, AudioContext, MediaRecorder, OfflineAudioContext};
  return {calls, stream, environment};
}

test('cancel before a late microphone grant stops every track without creating a recorder/context', async () => {
  const grant = deferred(), f = recordingEnvironment({grant});
  const recording = new NativeSpeechRecording({environment: f.environment, maxAudioBytes: 64044});
  const started = recording.start();
  const rejected = assert.rejects(started, /取消/);
  await recording.dispose();
  grant.resolve(f.stream);
  await rejected;
  assert.equal(f.calls.trackStops, 1); assert.equal(f.calls.contexts, 0); assert.equal(f.calls.recorderStarts, 0);
});

test('stop flushes final recorder data, resamples/downmixes and releases AudioContext once', async () => {
  const f = recordingEnvironment({duration: 5});
  const recording = new NativeSpeechRecording({environment: f.environment, maxAudioBytes: 64044});
  await recording.start();
  const wave = await recording.stop(2);
  assert.deepEqual(f.calls.dimensions, [1, 32000, 16000]);
  assert.equal(f.calls.source.buffer.duration, 5);
  assert.equal(new DataView(wave.buffer).getInt16(44, true), 16384);
  assert.equal(f.calls.closes, 1); assert.ok(f.calls.trackStops >= 1);
  await recording.dispose(); assert.equal(f.calls.closes, 1);
});

test('canonical PCM is clipped to an independent Host byte limit before allocation', async () => {
  const f = recordingEnvironment({duration: 5});
  const recording = new NativeSpeechRecording({environment: f.environment, maxAudioBytes: 1000});
  await recording.start();
  const wave=await recording.stop(5);
  assert.deepEqual(f.calls.dimensions,[1,478,16000]);assert.ok(wave.byteLength<=1000);assert.equal(f.calls.closes,1);
});

test('cancellation during decode rejects late audio and closes context', async () => {
  const decode = deferred(), f = recordingEnvironment({decode});
  const recording = new NativeSpeechRecording({environment: f.environment, maxAudioBytes: 64044});
  await recording.start();
  const stopped = recording.stop(2), rejected = assert.rejects(stopped, /取消/);
  await Promise.resolve(); await Promise.resolve();
  await recording.dispose();
  decode.resolve({duration: 0.5});
  await rejected;
  assert.equal(f.calls.dimensions, null); assert.equal(f.calls.closes, 1);
});
