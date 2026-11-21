import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePageSchema} from './page-schema.js';

test('focus resolves a declared heading, control or form field and rejects invalid targets before saving', () => {
  const source = {schemaVersion:1,id:'booking',root:'root',nodes:{
    root:{kind:'layout',children:['heading','form']},
    heading:{kind:'text',tag:'h2',text:'确认预约'},
    form:{kind:'component',use:'form',props:{model:'draft',fields:[{id:'phone',label:'手机号码'}]}},
  },state:{draft:{phone:''}}};
  const check = action => validatePageSchema({...source,actions:{next:action}}).valid;
  assert.equal(check({type:'focus',target:'heading'}),true);
  assert.equal(check({type:'focus',target:'form',field:'phone',scroll:false}),true);
  assert.equal(check({type:'focus',target:'missing'}),false);
  assert.equal(check({type:'focus',target:'form',field:'missing'}),false);
  assert.equal(check({type:'focus',target:'heading',field:'phone'}),false);
  assert.equal(check({type:'focus',target:'heading',scroll:'smooth'}),false);
});
