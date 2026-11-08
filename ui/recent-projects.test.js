import test from 'node:test';
import assert from 'node:assert/strict';
import {readRecentProjectVisits, recordRecentProjectVisit, getRecentProjects} from './recent-projects.js';

function memoryStorage() {
  const values = new Map();
  return {values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
}

const date = day => `2026-11-${String(day).padStart(2, '0')}T08:00:00.000Z`;
const ids = projects => projects.map(project => project.id);

test('recent projects combine real update, creation, and visit time without mutating summaries', () => {
  const projects = Object.freeze([
    Object.freeze({id: 'created', createdAt: date(4), updatedAt: 'broken'}),
    Object.freeze({id: 'visited', updatedAt: date(1)}),
    Object.freeze({id: 'updated', createdAt: date(1), updatedAt: date(5)}),
    Object.freeze({id: 'old-visit', updatedAt: date(6)}),
  ]);
  const visits = Object.freeze({'visited': Date.parse(date(7)), 'old-visit': Date.parse(date(2))});
  const recent = getRecentProjects(projects, visits);
  assert.deepEqual(ids(recent), ['visited', 'old-visit', 'updated', 'created']);
  assert.equal(recent[0], projects[1]);
  assert.equal(projects[0].updatedAt, 'broken');
});

test('filters unavailable, archived, and deleted projects; deduplicates stably and caps at five', () => {
  const projects = [
    {id: 'deleted', deletedAt: date(7)}, {id: 'archived', archived: true},
    {id: 'unavailable', unavailable: true}, null, {name: 'missing id'},
    {id: 'a', name: 'first'}, {id: 'b'}, {id: 'a', name: 'duplicate', updatedAt: date(7)},
    {id: 'c'}, {id: 'd'}, {id: 'e'}, {id: 'f'},
  ];
  const visits = {deleted: Date.parse(date(7)), archived: Date.parse(date(7)), unavailable: Date.parse(date(7))};
  assert.deepEqual(ids(getRecentProjects(projects, visits, 99)), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(getRecentProjects(projects)[0].name, 'first');
  assert.deepEqual(ids(getRecentProjects(projects, visits, 2)), ['a', 'b']);
  assert.deepEqual(getRecentProjects(projects, visits, 0), []);
  assert.deepEqual(getRecentProjects(projects, visits, -2), []);
});

test('invalid dates and timestamps do not disturb valid ordering or stable ties', () => {
  const projects = [
    {id: 'bad', updatedAt: 'not-a-date', createdAt: null},
    {id: 'nan', updatedAt: NaN, createdAt: Infinity},
    {id: 'valid', updatedAt: date(1)},
    {id: 'empty', updatedAt: ''},
  ];
  assert.deepEqual(ids(getRecentProjects(projects, {bad: NaN, nan: Infinity, empty: 'broken'})), ['valid', 'bad', 'nan', 'empty']);
  assert.deepEqual(getRecentProjects(undefined), []);
  assert.deepEqual(ids(getRecentProjects(projects, null)), ['valid', 'bad', 'nan', 'empty']);
});

test('visit history is isolated by library root and retains only the latest 100 entries', () => {
  const storage = memoryStorage();
  recordRecentProjectVisit(storage, '/library/one', 'shared-project', 1000);
  recordRecentProjectVisit(storage, '/library/two', 'shared-project', 2000);
  assert.deepEqual(readRecentProjectVisits(storage, '/library/one'), {'shared-project': 1000});
  assert.deepEqual(readRecentProjectVisits(storage, '/library/two'), {'shared-project': 2000});
  assert.deepEqual(readRecentProjectVisits(storage, '/library/one/other'), {});
  for (let index = 0; index < 105; index++) recordRecentProjectVisit(storage, '/library/capped', `p${index}`, index);
  const visits = readRecentProjectVisits(storage, '/library/capped');
  assert.equal(Object.keys(visits).length, 100);
  assert.equal(visits.p4, undefined);
  assert.equal(visits.p5, 5);
  assert.equal(visits.p104, 104);
  assert.equal(recordRecentProjectVisit(storage, '/library/capped', 'p5', 200).p5, 200);
  assert.deepEqual(recordRecentProjectVisit(storage, '', 'project', 999), {});
  assert.equal(storage.values.size, 3);
});

test('corrupt or blocked browser storage is safe and valid entries are normalized', () => {
  const storage = memoryStorage();
  recordRecentProjectVisit(storage, '/library', 'original', 1);
  const [key] = storage.values.keys();
  for (const corrupt of ['{broken', 'null', '[]', '"string"']) {
    storage.values.set(key, corrupt);
    assert.deepEqual(readRecentProjectVisits(storage, '/library'), {});
    assert.deepEqual(recordRecentProjectVisit(storage, '/library', 'recovered', 10), {recovered: 10});
  }
  storage.values.set(key, '{"valid":123,"negative":-1,"string":"123","null":null,"":5,"__proto__":42}');
  const visits = readRecentProjectVisits(storage, '/library');
  assert.deepEqual(Object.keys(visits), ['valid', '__proto__']);
  assert.equal(visits.__proto__, 42);
  assert.equal(Object.getPrototypeOf(visits), Object.prototype);
  assert.deepEqual(recordRecentProjectVisit(storage, '/library', 'invalid-now', NaN), visits);
  const blocked = {getItem() {throw new Error('denied');}, setItem() {throw new Error('full');}};
  assert.deepEqual(readRecentProjectVisits(blocked, '/library'), {});
  assert.deepEqual(recordRecentProjectVisit(blocked, '/library', 'still-navigate', 55), {'still-navigate': 55});
  assert.deepEqual(recordRecentProjectVisit(undefined, '/library', 'still-navigate', 55), {'still-navigate': 55});
});
