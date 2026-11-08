import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedDesignPages,reorderPageBefore} from './page-order.js';

test('navigation follows saved Design order without changing the workspace page array',()=>{
  const pages=[{id:'a',designId:'d'},{id:'b',designId:'other'},{id:'c',designId:'d'},{id:'legacy'},{id:'removed',designId:'d',deletedAt:'now'},{id:'tail',designId:'d'}];
  const design={id:'d',pageIds:['c','legacy','a','c','b','removed','missing']};
  const shown=orderedDesignPages(pages,design);
  assert.deepEqual(shown.map(p=>p.id),['c','legacy','a','tail']);
  assert.deepEqual(pages.map(p=>p.id),['a','b','c','legacy','removed','tail']);
  assert.deepEqual(reorderPageBefore(shown,'tail','legacy'),['c','tail','legacy','a']);
  assert.equal(reorderPageBefore(shown,'b','a'),null);
  assert.equal(reorderPageBefore(shown,'a','a'),null);
});
