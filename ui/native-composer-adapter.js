/**
 * Public DSH service bridge for the Designer composer.
 *
 * Required client services: sessions, uiSession. Optional: modelDirectories.
 * Pass the renderer's root `useSessionAccess` standard prop to
 * useNativeComposerAccess; do not substitute the current Chat's useAccess hook.
 *
 * This runtime does NOT export reusable model/permission/voice/InputBar React
 * components. Its conversation.input.* slots have unique declaration ownership;
 * another entry/Factory cannot declare or render them. No hidden Chat, native
 * sendSession, renderer internals, or fabricated Session is used here.
 *
 * Lead owns prepareSession, reference lifetime, uploading receipts and ai.run.
 * In particular, permission presets never change Designer FrozenTarget/CAS scope.
 */
export const NATIVE_COMPOSER_CAPABILITIES = Object.freeze({
  nativeControls: false,
  nativeModelPicker: false,
  nativePermissionPicker: false,
  nativeVoiceControl: false,
  nativeAttachmentControl: false,
  nativeSendControl: false,
  sessionModelDirectory: true,
  sessionAccessHooks: true,
  reason: 'The installed DSH runtime owns conversation.input.* slots and exports no reusable composer-control Factory or React component.',
});

export const NATIVE_COMPOSER_ACTIONS = Object.freeze({
  prompt: 'session/prompt',
  cancel: 'session/cancel',
  upload: 'fileUploads/upload',
});

function requireSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new TypeError('A real prepared Designer Session id is required');
  }
  return sessionId;
}

/**
 * Construct once in client apply after ctx injection. Construction performs no
 * RPC, creates no project/Session, and does not register or replace any slot.
 *
 * retainSession only acquires Client history ownership for an existing Session;
 * prepareSession must create/resolve the actual project AI Session beforehand.
 */
export function makeNativeComposerAdapter(ctx) {
  if (!ctx?.sessions?.binding || !ctx.sessions.retain) {
    throw new TypeError('Native composer adapter requires ctx.sessions');
  }
  if (!ctx?.uiSession?.whenAccess) {
    throw new TypeError('Native composer adapter requires ctx.uiSession');
  }

  function bindingFor(sessionId) {
    requireSessionId(sessionId);
    const binding = ctx.sessions.binding(sessionId);
    if (!binding) throw new Error(`Designer Session ${sessionId} is not retained`);
    return binding;
  }

  return Object.freeze({
    capabilities: Object.freeze({
      ...NATIVE_COMPOSER_CAPABILITIES,
      sessionModelDirectory: typeof ctx.modelDirectories?.directoryFor === 'function',
    }),

    /** Caller releases this exact reference on Session change/unmount. */
    retainSession(sessionId, {signal} = {}) {
      return ctx.sessions.retain(requireSessionId(sessionId), {
        source: 'designer-composer',
        ...(signal ? {signal} : {}),
      });
    },

    /**
     * SessionReference.ready can resolve with openState:error. Check both that
     * result and exact generation ownership before exposing controls.
     */
    async readySession(reference) {
      if (!reference || typeof reference.release !== 'function') {
        throw new TypeError('An owned DSH SessionReference is required');
      }
      const binding = await reference.ready;
      // `ready` stays resolved after release; the public binding getter is the
      // reference's live-ownership check even if another consumer retains it.
      if (!binding || reference.binding !== binding ||
          binding !== ctx.sessions.binding(reference.sessionId)) {
        throw new Error('Designer Session reference belongs to an expired generation');
      }
      const snapshot = binding.session.getSnapshot();
      if (snapshot.openState === 'error') {
        const error = new Error(snapshot.openError?.message || 'Designer Session history could not open');
        error.cause = snapshot.openError;
        throw error;
      }
      return binding;
    },

    /** Borrowed official observable; do not dispose Controller-owned sources. */
    sessionFor(sessionId) {
      return bindingFor(sessionId).session;
    },

    /**
     * Exact native model directory: {store, load(), select(selection)}.
     * store snapshot: {current, groups, failures, status, pending, error, ...}.
     * selection: {provider, model, reasoningEffort?}; select returns RemoteResult.
     * No prompt is sent; successful selection is recorded on this Session.
     * Native catalog/pending/reconnect behavior remains service-owned.
     */
    modelDirectoryFor(sessionId) {
      const binding = bindingFor(sessionId);
      if (ctx.sessions.subagentAddress?.(sessionId) !== undefined ||
          binding.session.getSnapshot().subagent != null) {
        throw new Error('Designer model selection requires an ordinary Session');
      }
      if (typeof ctx.modelDirectories?.directoryFor !== 'function') {
        throw new Error('DSH modelDirectories service is unavailable in this composition');
      }
      return ctx.modelDirectories.directoryFor(sessionId);
    },

    /** Snapshot is {currentValue,...} or undefined when capability is absent. */
    permissionProjectionFor(sessionId) {
      return bindingFor(sessionId).session.projections.faceOf('permissions');
    },

    /** Same official Session resource answer as useSessionAccess/useAccess. */
    whenAccess(sessionId, action, callback) {
      requireSessionId(sessionId);
      return ctx.uiSession.whenAccess(sessionId, action, callback);
    },
  });
}

const absentAccess = () => undefined;

/**
 * React Hook using the standard root Hook supplied to a renderer-created entry.
 * Always executes three Hook calls, including the no-Session state. A missing
 * Session answers undefined and cannot inherit an unrelated selected Chat.
 * These are endpoint answers, separate from the Agent's permission preset.
 */
export function useNativeComposerAccess({sessionId, useSessionAccess}) {
  if (typeof useSessionAccess !== 'function') {
    throw new TypeError('Pass the renderer-provided useSessionAccess standard prop');
  }
  const hasSession = typeof sessionId === 'string' && sessionId.trim() !== '';
  const prompt = useSessionAccess(hasSession ? sessionId : absentAccess,
    hasSession ? NATIVE_COMPOSER_ACTIONS.prompt : undefined);
  const cancel = useSessionAccess(hasSession ? sessionId : absentAccess,
    hasSession ? NATIVE_COMPOSER_ACTIONS.cancel : undefined);
  const upload = useSessionAccess(hasSession ? sessionId : absentAccess,
    hasSession ? NATIVE_COMPOSER_ACTIONS.upload : undefined);
  return {
    prompt, cancel, upload,
    canPrompt: hasSession && prompt === true,
    canCancel: hasSession && cancel === true,
    canUpload: hasSession && upload === true,
  };
}

/**
 * Narrow InputActions insertion contract for a Designer-owned plain textarea.
 * Reserved for a future public voice Factory; this does not mount native voice.
 *
 * read() returns {text, revision, sessionId, start, end, locked?, composing?}.
 * `revision` must increase synchronously for EVERY draft edit, including undo
 * and resets; text equality alone cannot detect ABA changes. read must return
 * current refs, not a stale React render closure.
 * replace({text,start,end,draftRev,sessionId}) must apply one undoable edit with
 * its own synchronous CAS and return true only on success. No DOM mutation or
 * synthetic events are used. Foreign, reused, changed and expired spans fail.
 */
export function createDesignerInputActions({read, replace}) {
  if (typeof read !== 'function' || typeof replace !== 'function') {
    throw new TypeError('Input insertion requires read and atomic replace functions');
  }
  const spans = new WeakMap();
  let active = true;
  const valid = state => active && state && typeof state.text === 'string' &&
    Number.isSafeInteger(state.revision) && state.revision >= 0 &&
    typeof state.sessionId === 'string' && state.sessionId.length > 0 &&
    !state.locked && !state.composing;
  const inputActions = Object.freeze({
    captureInsertion() {
      const state = read();
      if (!valid(state)) return undefined;
      const start = state.start ?? state.text.length;
      const end = state.end ?? start;
      if (!Number.isInteger(start) || !Number.isInteger(end) ||
          start < 0 || end < start || end > state.text.length) return undefined;
      const span = Object.freeze({start, end, draftRev: state.revision});
      spans.set(span, {sessionId: state.sessionId, text: state.text});
      return span;
    },
    insertText(text, span) {
      if (!span || typeof span !== 'object' || typeof text !== 'string') return false;
      const captured = spans.get(span);
      const state = read();
      if (!captured || !valid(state) || captured.sessionId !== state.sessionId ||
          span.draftRev !== state.revision || captured.text !== state.text) return false;
      const applied = replace({text, start: span.start, end: span.end,
        draftRev: span.draftRev, sessionId: captured.sessionId}) === true;
      if (applied) spans.delete(span);
      return applied;
    },
  });
  return Object.freeze({inputActions, dispose() { active = false; }});
}
