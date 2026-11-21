export function canPositionDrag(object){
  return object&&object.bounds?.width>0&&object.bounds?.height>0&&!object.hidden&&(!object.referenceOnly||!!object.runtimeSelector)&&!object.locked&&!object.transformed&&
    !['html','body'].includes(object.tag)&&!['contents','none'].includes(object.styles?.display)&&(object.styles?.display!=='inline'||['img','svg','video','canvas','input'].includes(object.tag))&&
    /^(none|-?[\d.]+(?:px|%)(?: -?[\d.]+(?:px|%))?)$/.test(object.styles.translate||'none');
}

// Keep the original anchors (including percentages and opposing insets).
// Independent translate composes with the authored layout at other widths.
export function translated(initial,delta){
  const values=initial&&initial!=='none'?initial.split(/\s+/):[];
  return [delta[0],delta[1]].map((offset,index)=>{
    const value=values[index]||'0px',px=Math.round(offset*1000)/1000;
    if(!px)return value;
    if(value.endsWith('%'))return `calc(${value} ${px<0?'-':'+'} ${Math.abs(px)}px)`;
    return (parseFloat(value)+px)+'px';
  }).join(' ');
}


export function snappedMovement(bounds,raw,guides,scaleX,scaleY){
  const lines=[null,null];
  const delta=raw.map((distance,i)=>{
    const origin=i?bounds.y:bounds.x,size=i?bounds.height:bounds.width;
    let best=5/(i?scaleY:scaleX),adjust=0;
    for(const line of (i?guides?.horizontal:guides?.vertical)||[])for(const edge of [0,size/2,size]){
      const d=line-(origin+edge+distance);
      if(Math.abs(d)<best){best=Math.abs(d);adjust=d;lines[i]=line;}
    }
    return distance+adjust;
  });
  return {delta,lines};
}
