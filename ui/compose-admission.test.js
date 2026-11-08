import test from "node:test";
import assert from "node:assert/strict";
import { getComposeAdmission } from "./compose-admission.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const sent = () => ({ prompt: "Send once", references: [{ resourceId: "ref-A" }], attachments: [{ receiptId: "receipt-A" }] });
const blank = () => ({ prompt: "", references: [], attachments: [] });
let serial = 0;
function fixture(initial = sent()) {
  const projectId = `compose-test-${++serial}`, entry = getComposeAdmission(projectId), writes = [];
  let disk = structuredClone(initial), version = 1, gate;
  const api = async (action, input) => {
    assert.equal(input.projectId, projectId);
    assert.equal(input.resourceId, "ai-compose");
    if (action === "draft.get") return { draft: structuredClone(disk), version: `v${version}` };
    assert.equal(action, "draft.save");
    writes.push(structuredClone(input));
    const pending = gate;
    gate = undefined;
    if (pending) { pending.started.resolve(); await pending.done.promise; }
    assert.equal(input.expectedVersion, `v${version}`);
    disk = structuredClone(input.draft);
    return { version: `v${++version}` };
  };
  return {
    projectId, entry, api, writes,
    get disk() { return disk; },
    blockWrite() {
      const pending = { started: deferred(), done: deferred() };
      gate = pending;
      return pending;
    },
    async mount(listener = () => {}) {
      const owner = {}, detach = entry.attach(owner, listener);
      await entry.load(api, owner, value => value);
      return { owner, detach, generation: entry.update(owner, disk) };
    }
  };
}

test("late acceptance follows unmount cleanup's CAS version and cannot notify project B", async () => {
  const a = fixture(), b = fixture({ ...sent(), prompt: "Keep B" });
  let aNotifications = 0, bNotifications = 0;
  const panelA = await a.mount(() => aNotifications++), panelB = await b.mount(() => bNotifications++);
  const releaseAdmission = a.entry.retain(), blocked = a.blockWrite();
  const cleanup = a.entry.save(a.api);
  panelA.detach();
  await blocked.started.promise;
  const consumed = a.entry.consume(a.api, panelA.generation);
  blocked.done.resolve();
  await cleanup;
  assert.equal(await consumed, true);
  assert.deepEqual(a.disk, blank());
  assert.deepEqual(a.writes.map(write => write.expectedVersion), ["v1", "v2"]);
  assert.equal(aNotifications, 1);
  assert.equal(bNotifications, 1);
  assert.equal(b.disk.prompt, "Keep B");
  releaseAdmission(); panelB.detach();
});

test("an edit and edit-back during admission keeps the new generation and its attachments", async () => {
  const f = fixture(), panel = await f.mount(), releaseAdmission = f.entry.retain();
  f.entry.update(panel.owner, { ...sent(), prompt: "Next turn" });
  const newGeneration = f.entry.update(panel.owner, sent());
  assert.notEqual(newGeneration, panel.generation);
  const blocked = f.blockWrite(), cleanup = f.entry.save(f.api);
  panel.detach();
  await blocked.started.promise;
  const consumed = f.entry.consume(f.api, panel.generation);
  blocked.done.resolve();
  await cleanup;
  assert.equal(await consumed, false);
  assert.deepEqual(f.disk, sent());
  releaseAdmission();
});

test("a reopened A shares pending cleanup and receives consumption through its own live listener", async () => {
  const f = fixture();
  let oldCalls = 0, newValue;
  const oldPanel = await f.mount(() => oldCalls++), releaseAdmission = f.entry.retain();
  const blocked = f.blockWrite(), cleanup = f.entry.save(f.api);
  oldPanel.detach();
  await blocked.started.promise;
  assert.equal(getComposeAdmission(f.projectId), f.entry);
  const newOwner = {}, detach = f.entry.attach(newOwner, value => { newValue = value; });
  const restored = f.entry.load(f.api, newOwner, value => value);
  const consumed = f.entry.consume(f.api, oldPanel.generation);
  blocked.done.resolve();
  await cleanup; await restored;
  assert.equal(await consumed, true);
  assert.deepEqual(newValue, blank());
  assert.deepEqual(f.disk, blank());
  assert.equal(oldCalls, 1);
  releaseAdmission(); detach();
});

test("reopened A's edits survive the old instance's late acceptance", async () => {
  const f = fixture(), oldPanel = await f.mount(), releaseAdmission = f.entry.retain();
  await f.entry.save(f.api);
  oldPanel.detach();
  const nextPanel = await f.mount(), next = { ...sent(), prompt: "New request", references: [{ resourceId: "new" }] };
  f.entry.update(nextPanel.owner, next);
  // A detached owner's stale cleanup snapshot cannot replace the new owner.
  f.entry.update(oldPanel.owner, sent());
  assert.equal(await f.entry.consume(f.api, oldPanel.generation), false);
  assert.deepEqual(f.disk, next);
  releaseAdmission(); nextPanel.detach();
});

test("no acceptance leaves cleanup intact; a later upload receipt remains durable after detach", async () => {
  const f = fixture(), panel = await f.mount(), releaseUpload = f.entry.retain();
  await f.entry.save(f.api);
  panel.detach();
  assert.deepEqual(f.disk, sent());
  await f.entry.addAttachment(f.api, { receiptId: "late-upload" });
  assert.deepEqual(f.disk, { ...sent(), attachments: [...sent().attachments, { receiptId: "late-upload" }] });
  releaseUpload();
});

test("a failed accepted-consumption CAS is exposed once without retrying", async () => {
  const f = fixture(), panel = await f.mount();
  let calls = 0;
  const conflict = Object.assign(new Error("Draft changed"), { code: "VERSION_CONFLICT" });
  await assert.rejects(f.entry.consume(async (action, input) => {
    calls++;
    assert.equal(action, "draft.save");
    assert.equal(input.expectedVersion, "v1");
    throw conflict;
  }, panel.generation), error => error === conflict);
  assert.equal(calls, 1);
  assert.deepEqual(f.disk, sent());
  panel.detach();
});
