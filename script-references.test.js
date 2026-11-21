import test from 'node:test';
import assert from 'node:assert/strict';
import {scriptTargetDiagnostics} from './script-references.js';

test('literal ID lookups and their simple helpers identify missing HTML IDs on known editable nodes', () => {
  const diagnostics = scriptTargetDiagnostics('<span data-dsh-node="assignee">林晓</span><section data-dsh-node="panel" id="actual-panel"></section><script>var byId = function(id) {return document.getElementById(id)}; byId("assignee").textContent="陈然"; document.getElementById("panel").hidden=false; byId("assignee");</script>');
  assert.deepEqual(diagnostics.map(item => item.nodeId), ['assignee', 'panel']);
  assert.ok(diagnostics.every(item => item.code === 'SCRIPT_TARGET_ID_MISSING'));
});

test('valid, dynamic, optional unknown and shadowed lookups keep their original semantics', () => {
  const html = '<span id="assignee" data-dsh-node="assignee">林晓</span><div data-dsh-node="panel"></div><script>document.getElementById("assignee");document.getElementById(id);document.getElementById("dynamic-widget")?.focus();function local(document){document.getElementById("panel")}function byId(id){return {value:id}}byId("panel");</script>';
  assert.deepEqual(scriptTargetDiagnostics(html), []);
});

test('arrow helpers are checked in their actual lexical scope and JSON data stays inert', () => {
  const html = '<span data-dsh-node="label"></span><script type="application/json">{"text":"getElementById"}</script><script>const node=id=>document.getElementById(id);node("label");{const node=id=>({id});node("label")}</script>';
  assert.equal(scriptTargetDiagnostics(html).length, 1);
  assert.deepEqual(scriptTargetDiagnostics('<span data-dsh-node="label"></span><script>function setup(document){const node=id=>document.getElementById(id);node("label")}</script>'), []);
  assert.equal(scriptTargetDiagnostics('<span data-dsh-node="label"></span><script>const node=id=>document.getElementById(id);function setup(document){node("label")}</script>').length, 1);
});
