export function editorPosition(document, location) {
  const requestedLine=Number(location?.line),requestedColumn=Number(location?.column);
  const number=Math.max(1,Math.min(document.lines,Number.isFinite(requestedLine)?Math.trunc(requestedLine):1));
  const line=document.line(number);
  return line.from+Math.max(0,Math.min(line.length,Number.isFinite(requestedColumn)?Math.trunc(requestedColumn):0));
}
