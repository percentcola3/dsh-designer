/** Public speech service and browser capture helpers. No microphone is acquired on import. */
export const NATIVE_VOICE_BUNDLE = '@deepseek-ai/dsh-experimental-voice-input-bundle';

export function remoteValue(result, operation = 'DSH') {
  if (result?.ok === true) return result.value;
  const failure = result?.error;
  const error = new Error(failure ? `${failure.code}: ${failure.message}` : `${operation} returned no RemoteResult`);
  if (failure) Object.assign(error, failure);
  throw error;
}

/** Uses the official reconnecting Remote carrier and acknowledges complete snapshots. */
export function observeNativeSpeech(ctx, publish) {
  let disposed = false, stream;
  const fail = error => {
    if (!disposed) publish({catalog: null, connected: false, error: error instanceof Error ? error : new Error(String(error))});
  };
  const observing = (async () => {
    try {
      if (!ctx?.remote?.$stream || !ctx.remote.speech?.follow) throw new Error('DSH speech service is unavailable');
      stream = ctx.remote.$stream({
        name: 'Designer speech readiness',
        open: signal => ctx.remote.speech.follow(signal),
        ended: () => ctx.streamEndedError ? ctx.streamEndedError('Speech readiness stream ended') : new Error('Speech readiness stream ended'),
        carrierFailed: fail,
      });
      for await (const item of stream) {
        if (disposed) break;
        publish({catalog: item.value, connected: true, error: null});
        item.accept();
      }
    } catch (error) { fail(error); }
  })();
  return {
    async dispose() {
      if (disposed) return;
      disposed = true;
      try { await stream?.dispose(); } finally { await observing; }
    },
  };
}

export function speechAvailability(readiness, access, environment = globalThis) {
  if (access !== true) return {reason: access === false ? '当前连接没有语音转写权限。' : '正在确认语音转写权限。'};
  if (!readiness?.connected) return {reason: readiness?.error?.message || 'DSH 语音服务尚未连接。'};
  const catalog = readiness.catalog;
  const provider = catalog?.providers?.find(item => item.id === catalog.selection?.providerId);
  if (!provider) return {reason: 'DSH 尚未选择可用的语音识别服务。'};
  const phase = provider.preparation?.phase;
  if (!['ready', 'standby', 'waking'].includes(phase)) {
    const detail = provider.preparation?.message || provider.preparation?.error?.message;
    const phases = {unprepared: '尚未准备', checking: '正在检查', downloading: '正在下载', loading: '正在加载', cancelling: '正在取消', cancelled: '准备已取消', failed: '准备失败'};
    return {provider, reason: `${provider.name}：${detail || phases[phase] || phase || '尚未准备好'}。请在原生语音设置中查看。`};
  }
  if (!provider.languages?.includes(catalog.selection.language)) return {provider, reason: 'DSH 当前语音语言不在服务广告的选项中，请检查语音设置。'};
  if (!(Number.isFinite(catalog.maxDurationSeconds) && catalog.maxDurationSeconds > 0 &&
      Number.isFinite(catalog.maxAudioBytes) && catalog.maxAudioBytes >= 46)) return {provider, reason: 'DSH 未提供有效的录音时长或大小限制。'};
  if (!environment.navigator?.mediaDevices?.getUserMedia || !environment.MediaRecorder || !environment.AudioContext || !environment.OfflineAudioContext) {
    return {provider, reason: '当前浏览器无法录音，需要可用的麦克风、MediaRecorder 和 Web Audio（HTTPS 或本机地址）。'};
  }
  return {provider, catalog, ready: true};
}

/** Canonical 16-bit, 16kHz, mono PCM WAV. */
export function encodeNativeWave(samples) {
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer);
  const text = (offset, value) => {for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);};
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0));
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

export function nativeAudioBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

/** One cancellable recording; late permission grants are always released. */
export class NativeSpeechRecording {
  constructor({environment = globalThis, maxAudioBytes, onError} = {}) {
    this.environment = environment;
    this.maxAudioBytes = maxAudioBytes;
    this.onError = onError;
    this.lifetime = new AbortController();
    this.chunks = [];
    this.byteLength = 0;
  }
  async start() {
    const env = this.environment;
    if (!env.navigator?.mediaDevices?.getUserMedia || !env.MediaRecorder) throw new Error('当前浏览器无法使用麦克风录音。');
    try {
      const stream = await env.navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}, video: false});
      if (this.lifetime.signal.aborted) {
        stream.getTracks().forEach(track => track.stop());
        this.lifetime.signal.throwIfAborted();
      }
      this.stream = stream;
      this.context = new env.AudioContext();
      this.recorder = new env.MediaRecorder(stream);
      const interrupted = error => {
        if (this.lifetime.signal.aborted || this.finishing) return;
        this.dispose().catch(() => {});
        this.onError?.(error instanceof Error ? error : new Error('麦克风录音已中断，请重新开始。'));
      };
      for (const track of stream.getTracks()) track.addEventListener?.('ended', interrupted, {signal: this.lifetime.signal});
      this.recorder.ondataavailable = event => {
        if (this.lifetime.signal.aborted || !event.data.size) return;
        this.byteLength += event.data.size;
        if (this.byteLength > this.maxAudioBytes) { interrupted(new Error('录音已超过 DSH 允许的音频大小。')); return; }
        this.chunks.push(event.data);
      };
      this.recorder.onerror = interrupted;
      this.recorder.start(250);
    } catch (error) { await this.dispose(); throw error; }
  }
  async stop(maxDurationSeconds) {
    const recorder = this.recorder, context = this.context;
    if (this.finishing || !recorder || recorder.state !== 'recording' || !context) throw new Error('没有可转写的录音。');
    this.finishing = true;
    try {
      await new Promise((resolve, reject) => {
        this.stopReject = reject;
        recorder.onstop = resolve;
        recorder.onerror = () => reject(new Error('录音未能完成。'));
        recorder.stop();
      });
      this.stopReject = undefined;
      this.lifetime.signal.throwIfAborted();
      this.stream?.getTracks().forEach(track => track.stop());
      const blob = new Blob(this.chunks, {type: recorder.mimeType});
      if (!blob.size || this.byteLength > this.maxAudioBytes) throw new Error(blob.size ? '录音已超过 DSH 允许的音频大小。' : '没有录到音频。');
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      this.lifetime.signal.throwIfAborted();
      const length = Math.min(Math.floor(Math.min(decoded.duration, maxDurationSeconds) * 16000), Math.floor((this.maxAudioBytes - 44) / 2));
      if (!Number.isFinite(length) || length < 1) throw new Error('没有录到音频。');
      // Check canonical PCM size before allocating or resampling.
      if (44 + length * 2 > this.maxAudioBytes) throw new Error('录音已超过 DSH 允许的音频大小。');
      const offline = new this.environment.OfflineAudioContext(1, length, 16000);
      const source = offline.createBufferSource();
      source.buffer = decoded; // Web Audio's speaker downmix produces mono.
      source.connect(offline.destination); source.start();
      const resampled = await offline.startRendering();
      this.lifetime.signal.throwIfAborted();
      return encodeNativeWave(resampled.getChannelData(0));
    } finally { await this.dispose(); }
  }
  dispose() {
    if (this.disposal) return this.disposal;
    this.lifetime.abort(new Error('录音已取消。'));
    this.stopReject?.(this.lifetime.signal.reason);
    this.stopReject = undefined;
    const context = this.context;
    this.context = undefined;
    if (this.recorder) {
      this.recorder.ondataavailable = null; this.recorder.onerror = null;
      if (this.recorder.state === 'recording') {try {this.recorder.stop();} catch { /* already stopped */ }}
    }
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined; this.chunks = [];
    this.disposal = Promise.resolve().then(() => context && context.state !== 'closed' ? context.close() : undefined);
    return this.disposal;
  }
}
