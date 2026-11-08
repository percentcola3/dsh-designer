// A Canvas edit may contain a frozen draft basis. Never silently rebase it
// onto the newest project/page/Fs version while adapting the UI request.
export function canvasTransaction(change,{project,design,pages=[],documents={}}) {
  const page=pages.find(item=>item.id===change.pageId);
  const has=key=>Object.prototype.hasOwnProperty.call(change,key);
  const fileVersion=has('expectedVersion')?change.expectedVersion:has('expectedFsVersion')?change.expectedFsVersion:documents[change.pageId]?.version;
  return {
    ...change,
    designId:change.designId??page?.designId??design?.id,
    expectedRevision:has('expectedRevision')?change.expectedRevision:project?.revision,
    expectedArtboardRevision:has('expectedArtboardRevision')?change.expectedArtboardRevision:page?.revision,
    expectedVersion:fileVersion,
    expectedFsVersion:has('expectedFsVersion')?change.expectedFsVersion:fileVersion,
  };
}
