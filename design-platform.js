export function designPlatform(platforms, fallback = 'web') {
  if (platforms?.length === 1) return platforms[0];
  return fallback;
}

export function requireHtml(kind = 'html') {
  if (kind !== 'html') {
    throw Object.assign(new Error('新设计稿仅支持 HTML。'), {code: 'INVALID_ARTIFACT_KIND'});
  }
}
