import React from 'react';
import {MergeView} from '@codemirror/merge';
import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {basicSetup} from 'codemirror';
import {html} from '@codemirror/lang-html';
export default function DiffPanel({before,after}){
  const host=React.useRef(null);
  React.useEffect(()=>{const extensions=[basicSetup,html(),EditorState.readOnly.of(true),EditorView.editable.of(false),EditorView.theme({'&':{height:'100%',backgroundColor:'var(--ec-panel)',color:'var(--ec-text)'},'.cm-scroller':{fontFamily:'ui-monospace,SFMono-Regular,monospace',overflow:'auto',fontSize:'11px'},'.cm-gutters':{backgroundColor:'var(--ec-soft)',color:'var(--ec-muted)',borderRight:'1px solid var(--ec-border)'},'.cm-activeLine,.cm-activeLineGutter':{backgroundColor:'transparent'}})];const view=new MergeView({parent:host.current,a:{doc:before,extensions},b:{doc:after,extensions},collapseUnchanged:{margin:3,minSize:6},highlightChanges:true,gutter:true});return()=>view.destroy()},[before,after]);
  return <div className="ec-code-diff" ref={host}/>;
}
