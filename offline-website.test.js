import test from 'node:test';
import assert from 'node:assert/strict';
import {localClickActions,offlineWebsiteHTML} from './offline-website.js';

test('offline buttons keep verified local operations and omit incomplete handlers',()=>{
  assert.deepEqual(localClickActions("()=>document.getElementById('status').textContent='已保存'"),[{target:{id:'status'},op:'set',property:'textContent',value:'已保存'}]);
  assert.deepEqual(localClickActions("function onclick(){document.querySelector('dialog').showModal()}"),[{target:{selector:'dialog'},op:'showModal'}]);
  for(const handler of ["()=>fetch('/save')","()=>{document.querySelector('dialog').close();send();}","()=>router.push('/details')"])
    assert.deepEqual(localClickActions(handler),[]);
});

test('an offline page removes outbound navigation and keeps same-page anchors',()=>{
  const html=offlineWebsiteHTML('<a href="https://original.test/details" target="_blank">更多</a><a href="#section">本页</a>');
  assert.doesNotMatch(html,/original\.test|target="_blank"/);
  assert.match(html,/href="#section"/);
  assert.match(html,/connect-src 'none'/);
});
