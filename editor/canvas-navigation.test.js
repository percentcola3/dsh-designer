import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelNavigation,pinchNavigation,cameraGrid} from './canvas-navigation.js';
const rect={left:100,top:50,width:1200,height:800};
const event=patch=>({clientX:700,clientY:450,deltaX:0,deltaY:100,deltaMode:0,...patch});
const world=(camera,point)=>({x:(point.x-camera.x)/camera.zoom,y:(point.y-camera.y)/camera.zoom});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('mouse wheel zooms around pointer without moving its world coordinate',()=>{
  const camera={x:30,y:-40,zoom:.5},point={x:600,y:400};
  const next=wheelNavigation(camera,event({}),rect);
  assert.ok(next.zoom<camera.zoom);near(world(next,point).x,world(camera,point).x);near(world(next,point).y,world(camera,point).y);
});
test('trackpad pans both axes, including fractional deltas',()=>{
  assert.deepEqual(wheelNavigation({x:10,y:20,zoom:1},event({deltaX:12.5,deltaY:8.2}),rect),{x:-2.5,y:11.8,zoom:1});
});
test('pinch always zooms even for fine trackpad deltas; zoom is bounded',()=>{
  const camera={x:0,y:0,zoom:4};
  assert.equal(wheelNavigation(camera,event({deltaY:-2.5,ctrlKey:true}),rect).zoom,4);
  assert.ok(wheelNavigation(camera,event({deltaY:2.5,ctrlKey:true}),rect).zoom<4);
  assert.equal(wheelNavigation({x:0,y:0,zoom:.05},event({deltaY:10000}),rect).zoom,.05);
});
test('shift wheel moves horizontally; line and page wheel units are normalized',()=>{
  assert.deepEqual(wheelNavigation({x:0,y:0,zoom:1},event({shiftKey:true,deltaMode:1,deltaY:3}),rect),{x:-48,y:0,zoom:1});
  assert.deepEqual(wheelNavigation({x:0,y:0,zoom:1},event({shiftKey:true,deltaMode:2,deltaY:1}),rect),{x:-800,y:0,zoom:1});
});
test('two touch points combine midpoint translation with anchored zoom',()=>{
  const next=pinchNavigation({x:0,y:0,zoom:1},[{x:100,y:100},{x:200,y:100}],[{x:100,y:150},{x:300,y:150}]);
  assert.deepEqual(next,{x:-100,y:-50,zoom:2});
  const point=world(next,{x:200,y:150});assert.deepEqual(point,{x:150,y:100});
});
test('grid translates and scales in the same coordinate system as artboards',()=>{
  assert.deepEqual(cameraGrid({x:31,y:-12,zoom:.5}),{backgroundPosition:'31px -12px',backgroundSize:'24px 24px'});
});
