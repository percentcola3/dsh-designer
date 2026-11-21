import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDocument,applyDocumentOperations} from '../document-model.js';
import {imageTarget,imageFrame,imageOperations} from './image-replacement.js';

const options={url:'../assets/local/r-1/new.svg',mime:'image/svg+xml',fit:'cover',position:{x:100,y:0},frame:{width:80,height:48}};
const page=body=>normalizeDocument('<!doctype html><html><head></head><body>'+body+'</body></html>');
const tagged=(model,tag)=>Object.values(model.nodes).find(node=>node.tag===tag);
const apply=(model,node)=>applyDocumentOperations(model.html,imageOperations(model,node,options),{scopeMode:'page'});

test('picture replaces the effective image across breakpoints and preserves the shared original',()=>{
  const model=page('<picture><source type="image/png" srcset="old.png 2x"><img src="old.png" alt="产品" srcset="old.png 2x"></picture><img id="other" src="old.png">');
  const img=tagged(model,'img'),next=apply(model,img),changed=next.nodes[img.id];
  assert.equal(changed.attributes.src,options.url);
  assert.equal(changed.attributes.alt,'产品');
  assert.equal(changed.attributes.srcset,undefined);
  assert.equal(changed.style['object-position'],'100% 0%');
  assert.equal(changed.style['object-fit'],'cover');
  assert.equal(tagged(next,'source').attributes.srcset,options.url);
  assert.equal(Object.values(next.nodes).find(n=>n.attributes.id==='other').attributes.src,'old.png');
});

test('picking an SVG path replaces the graphic inside the same accessible SVG viewport',()=>{
  const model=page('<svg id="logo" viewBox="-10 5 100 50" class="brand" aria-labelledby="name"><title id="name">Logo</title><path d="M0 0h20"/></svg>');
  const node=imageTarget(tagged(model,'path'),model);
  assert.equal(node.tag,'svg');assert.deepEqual(imageFrame(node),{width:100,height:50});
  const next=apply(model,node),image=tagged(next,'image');
  assert.equal(next.nodes[node.id].attributes.class,'brand');assert.ok(next.html.includes('Logo'));
  assert.equal(image.attributes.href,options.url);assert.equal(image.attributes.x,'-10');
  assert.equal(image.attributes.preserveAspectRatio,'xMaxYMin slice');
  assert.equal(tagged(next,'path'),undefined);
  assert.equal(imageTarget(image,next).id,image.id);
  assert.equal(apply(next,image).nodes[image.id].attributes.href,options.url);
});
