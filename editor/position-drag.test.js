import {test} from 'node:test';
import assert from 'node:assert/strict';
import {translated,snappedMovement} from './position-drag.js';
import {gridPlacementSwap,flowDropEdge} from './geometry.js';

test('a snapped position persists exactly two CSS lengths, retaining percentage anchors',()=>{
  const bounds={x:52,y:0,width:68,height:32},guides={vertical:[180],horizontal:[0]};
  const movement=snappedMovement(bounds,[57.5,1],guides,.8,.8);
  assert.deepEqual(movement,{delta:[60,0],lines:[180,0]});
  assert.equal(translated('none',[...movement.delta,0,0]),'60px 0px');
  assert.equal(translated('50% -10px',[3,-4]),'calc(50% + 3px) -14px');
});

test('grid placement swaps cell declarations and ordinary flex insertion respects direction',()=>{
  const item={id:'a',styles:{'grid-row-start':'2'}},peer={nodeId:'b',styles:{'grid-row-start':'4'}};
  const result=gridPlacementSwap(item,peer);
  assert.equal(result[0].styles['grid-row-start'],'4');
  assert.equal(result[1].styles['grid-row-start'],'2');
  assert.equal(gridPlacementSwap(item,{nodeId:'b',styles:{}}),null);
  const bounds={x:100,y:0,width:100,height:60};
  assert.deepEqual(flowDropEdge({display:'flex','flex-direction':'row-reverse'},{x:105,y:5},bounds),{after:true,line:{x:100,y:0,width:2,height:60}});
});
