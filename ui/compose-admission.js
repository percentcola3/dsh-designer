// Keep one CAS chain while an owner or native admission still references a project.
// A reopened panel joins this chain instead of racing the previous panel's cleanup.
const projects = new Map();
const empty = () => ({ prompt: "", references: [], attachments: [] });
const compose = (value) => ({ prompt: value.prompt || "", references: value.references || [], attachments: value.attachments || [] });

export function getComposeAdmission(projectId) {
  if (projects.has(projectId)) return projects.get(projectId);
  let queue = Promise.resolve(), version = null, value = empty(), generation = 0, owner, notify, holds = 0;
  const retire = () => {
    const tail = queue;
    tail.catch(() => {}).then(() => {
      if (!holds && queue === tail && projects.get(projectId) === entry) projects.delete(projectId);
    });
  };
  const enqueue = (operation) => {
    queue = queue.catch(() => {}).then(operation);
    return queue;
  };
  const replace = (next) => {
    next = compose(next);
    if (JSON.stringify(next) !== JSON.stringify(value)) {
      value = structuredClone(next);
      generation++;
    }
  };
  const write = async (api) => {
    const result = await api("draft.save", { projectId, resourceId: "ai-compose", draft: structuredClone(value), expectedVersion: version });
    version = result.version ?? null;
    return result;
  };
  const entry = {
    retain() {
      holds++;
      let held = true;
      return () => { if (held) { held = false; holds--; retire(); } };
    },
    attach(token, listener) {
      const release = entry.retain();
      owner = token;
      notify = listener;
      return () => { if (owner === token) { owner = undefined; notify = undefined; } release(); };
    },
    update(token, next) {
      if (owner === token) replace(next);
      return generation;
    },
    capture(token, next) {
      if (owner !== token) return null;
      replace(next);
      return generation;
    },
    load(api, token, restore) {
      return enqueue(async () => {
        const result = await api("draft.get", { projectId, resourceId: "ai-compose" });
        version = result.version ?? null;
        if (owner === token) {
          replace(restore(result.draft || result.value || {}));
          notify?.(structuredClone(value));
        }
        return result;
      });
    },
    addAttachment(api, attachment) {
      return enqueue(async () => {
        replace({ ...value, attachments: [...value.attachments, attachment] });
        notify?.(structuredClone(value));
        return write(api);
      });
    },
    save(api) { return enqueue(() => write(api)); },
    consume(api, submittedGeneration) {
      return enqueue(async () => {
        // A changed compose belongs to the user's next turn, even if its text
        // was edited back to the submitted text. Never clear that generation.
        const consumed = generation === submittedGeneration;
        if (consumed) {
          replace(empty());
          notify?.(structuredClone(value));
        }
        await write(api);
        return consumed;
      });
    }
  };
  projects.set(projectId, entry);
  return entry;
}
