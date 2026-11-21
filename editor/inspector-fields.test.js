import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectorFields,fieldValue,inspectorStyles} from './inspector-fields.js';

test('only text-bearing selections offer text controls',()=>{
  const fields=tag=>inspectorFields([{tag}]).map(([key])=>key);
  assert.deepEqual(fields('img'),['width','height','x','y','background-color']);
  assert.deepEqual(fields('button'),['width','height','x','y','font-size','color','background-color']);
});
test('position moves a group relative to the page, retaining each original offset',()=>{
  const objects=[{documentBounds:{x:30,y:65},styles:{translate:'10px 4px'}},{documentBounds:{x:50,y:90},styles:{translate:'none'}}];
  const origin={x:fieldValue(objects,'x').value,y:fieldValue(objects,'y').value};
  assert.deepEqual(objects.map(o=>inspectorStyles(o,{x:'45'},origin).translate),['25px 4px','15px 0px']);
});
test('width includes the visible padding and border, and inline text can be sized',()=>{
  assert.deepEqual(inspectorStyles({tag:'span',styles:{display:'inline'},inspectorInsets:{width:20}}, {width:'100'}, {}),{width:'80px',display:'inline-block'});
});
