import test from 'node:test';
import assert from 'node:assert/strict';
import {modelSafe,modelResult} from './model-output.js';

test('optional object values and sparse array slots become explicit JSON data without mutation',()=>{
  const sparse=new Array(3);sparse[1]=undefined;sparse[2]={optional:undefined,keep:null};
  const original={optional:undefined,nested:{optional:undefined},sparse,negativeZero:-0};
  assert.deepEqual(modelSafe(original),{nested:{},sparse:[null,null,{keep:null}],negativeZero:0});
  assert.equal(Object.hasOwn(original,'optional'),true);assert.equal(0 in sparse,false);
  assert.equal(modelSafe(undefined),null);
});

test('all existing private fields, nested binary data and owner capability links stay redacted',()=>{
  const privateKeys=['capability','previewTicket','assetBase','assetRoot','savedHTML','bytesBase64','imageBase64','accessToken','refreshToken','authorization','password','privateKey','passphrase','httpsToken'];
  const privateValues=Object.fromEntries(privateKeys.map(key=>[key,'SECRET']));
  // Filtering occurs before inspection, so even private cyclic/invalid values never escape.
  privateValues.capability=privateValues;privateValues.password=NaN;
  const value=modelSafe({node:{id:'n',slot:'title',instanceId:'card'},tokens:{color:'#123'},nested:[privateValues],image:'data:image/png;base64,SECRET',url:'http://local/api/designer/source-resource/SECRET/project/x',links:['/api/designer/knowledge-resource/SECRET/x','https://local/api/designer/download/SECRET/x']});
  assert.deepEqual(value.nested,[{}]);assert.deepEqual(value.node,{id:'n',slot:'title',instanceId:'card'});assert.deepEqual(value.tokens,{color:'#123'});
  assert.ok(!JSON.stringify(value).includes('SECRET'));assert.equal(value.image,'[binary attachment omitted]');
});

test('invalid non-JSON data fails explicitly without echoing values or invoking serialization hooks',()=>{
  const circular={};circular.self=circular;
  for(const value of [NaN,Infinity,-Infinity,1n,Symbol('SECRET'),()=>{},new Date(),new Map(),Buffer.from('SECRET'),circular]){
    assert.throws(()=>modelSafe({value}),error=>error.code==='INVALID_MODEL_OUTPUT'&&!error.message.includes('SECRET'));
  }
  let calls=0;const accessor={get body(){calls++;throw Error('SECRET');}};
  assert.throws(()=>modelSafe(accessor),{code:'INVALID_MODEL_OUTPUT'});assert.equal(calls,0);
  const privateAccessor={get password(){calls++;throw Error('SECRET');}};
  assert.deepEqual(modelSafe(privateAccessor),{});assert.equal(calls,0);
  assert.throws(()=>modelSafe({toJSON(){calls++;return 'SECRET';}}),{code:'INVALID_MODEL_OUTPUT'});assert.equal(calls,0);
  const array=[];array.extra='SECRET';assert.throws(()=>modelSafe(array),{code:'INVALID_MODEL_OUTPUT'});
  const symbolObject={[Symbol('SECRET')]:'SECRET'};assert.throws(()=>modelSafe(symbolObject),{code:'INVALID_MODEL_OUTPUT'});
});

test('shared values detach independently and special JSON keys do not modify prototypes',()=>{
  const shared={id:'n'};const output=modelSafe({a:shared,b:shared});assert.notEqual(output.a,output.b);assert.notEqual(output.a,shared);
  const special=JSON.parse('{"__proto__":{"safe":true},"constructor":"data"}'),safe=modelSafe(special);
  assert.equal(Object.getPrototypeOf(safe),Object.prototype);assert.deepEqual(safe,special);assert.equal({}.safe,undefined);
});

test('bounded edit/commit receipts retain the committed artboard, versions and save warnings',()=>{
  const page={id:'page-1',revision:4},warning={code:'VERSION_CONFLICT',message:'Receipt metadata changed'};
  const input={action:'artboard.commit',nodeOffset:1,nodeLimit:1};
  const original={projectRevision:12,page,file:{id:'file-1'},version:'fs-4',saved:true,previewStatus:'pending',receiptWarning:warning,document:{html:'PRIVATE LARGE HTML',nodes:{a:{id:'a'},b:{id:'b',text:'x'.repeat(200)},c:{id:'c'}},diagnostics:[]}};
  const result=modelResult(original,input);
  assert.deepEqual(result.artboard,page);assert.deepEqual(result.page,page);assert.equal(result.projectRevision,12);assert.deepEqual(result.receiptWarning,warning);assert.equal(result.version,'fs-4');assert.equal(result.saved,true);
  assert.equal(result.nodes.length,1);assert.equal(result.nodes[0].text.length,160);assert.equal(result.nodes[0].textTruncated,true);assert.equal(result.nodeTotal,3);assert.equal(result.nextNodeOffset,2);assert.equal(result.more.fileId,'file-1');assert.equal(result.document,undefined);
  assert.ok(!JSON.stringify(result).includes('PRIVATE LARGE HTML'));assert.equal(original.document.nodes.b.text.length,200);
  assert.deepEqual(modelResult({ok:true,optional:undefined},{action:'task.get'}),{ok:true});
});
