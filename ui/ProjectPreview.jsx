import React from 'react';
import {fitProjectPreview, loadProjectPreview, projectPreviewKey} from './project-preview.js';

const fill = {position:'absolute', inset:0};

// The enclosing card owns its size, appearance and open-project button.
export default function ProjectPreview({project, api, fallback = null}) {
  const root = React.useRef(null);
  const mounted = React.useRef(false);
  const key = projectPreviewKey(project);
  const owner = React.useMemo(() => ({api, key}), [api, key]);
  const currentOwner = React.useRef(owner);
  currentOwner.current = owner;
  const [visible, setVisible] = React.useState(false);
  const [size, setSize] = React.useState({width:0, height:0});
  const [state, setState] = React.useState(null);

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  React.useEffect(() => {
    const element = root.current;
    if (!element) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const rect = element.getBoundingClientRect();
      setSize(previous => previous.width === rect.width && previous.height === rect.height
        ? previous : {width:rect.width, height:rect.height});
    };
    measure();
    if (typeof globalThis.ResizeObserver === 'function') {
      const observer = new globalThis.ResizeObserver(measure);
      observer.observe(element);
      return () => { active = false; observer.disconnect(); };
    }
    globalThis.addEventListener?.('resize', measure);
    return () => { active = false; globalThis.removeEventListener?.('resize', measure); };
  }, []);

  React.useEffect(() => {
    const element = root.current;
    if (!element) return;
    if (typeof globalThis.IntersectionObserver !== 'function') { setVisible(true); return; }
    let active = true;
    const observer = new globalThis.IntersectionObserver(entries => {
      if (active && entries.some(entry => entry.target === element && entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, []);

  React.useEffect(() => {
    if (!visible) return;
    let active = true;
    const owns = () => active && mounted.current && currentOwner.current === owner;
    setState({owner, status:'loading', preview:null, loaded:false});
    loadProjectPreview(api, project).then(preview => {
      if (owns()) setState({owner, status:preview ? 'loading' : 'fallback', preview, loaded:false});
    }, () => {
      if (owns()) setState({owner, status:'fallback', preview:null, loaded:false});
    });
    return () => { active = false; };
    // Ownership is deliberately based on identity/revision/time, not summary object allocation.
  }, [owner, visible]);

  const current = state?.owner === owner ? state : null;
  const preview = current?.preview;
  const fit = preview && fitProjectPreview(size, preview.viewport);
  const ready = !!(preview && current.loaded && fit);
  const status = ready ? 'ready' : current?.status || (visible ? 'loading' : 'idle');
  const ownsFrame = () => mounted.current && currentOwner.current === owner;

  return <div ref={root} className="wb-project-preview" data-state={status}
    aria-hidden="true" style={{...fill, overflow:'hidden', pointerEvents:'none'}}>
    {!ready && <div className="wb-project-preview__fallback" style={fill}>{fallback}</div>}
    {preview && <div className="wb-project-preview__fit" style={{...fill, overflow:'hidden',
      visibility:ready ? 'visible' : 'hidden'}}>
      <iframe key={`${key}:${preview.pageId}:${preview.url||'document'}`} className="wb-project-preview__iframe"
        src={preview.html?undefined:preview.url} srcDoc={preview.html} sandbox="" aria-hidden="true" tabIndex={-1}
        title={`${project?.name || '项目'}设计稿预览`}
        width={preview.viewport.width} height={preview.viewport.height}
        referrerPolicy="no-referrer"
        style={{position:'absolute', border:0, display:'block', maxWidth:'none', background:'#fff',
          width:preview.viewport.width, height:preview.viewport.height,
          left:fit ? (size.width - fit.width) / 2 : 0,
          top:0,
          transform:`scale(${fit?.scale || 0})`, transformOrigin:'top left', pointerEvents:'none'}}
        onLoad={() => {
          if (ownsFrame()) setState(previous => previous?.owner === owner && previous.preview === preview
            ? {...previous, loaded:true} : previous);
        }}
        onError={() => {
          if (ownsFrame()) setState(previous => previous?.owner === owner && previous.preview === preview
            ? {owner, status:'fallback', preview:null, loaded:false} : previous);
        }}/>
    </div>}
  </div>;
}
