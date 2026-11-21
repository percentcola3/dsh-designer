export const SYSTEM_DIRECTORY_FORMAT = 'directory';
export const SYSTEM_RULE_PATH = 'rule.md';
export const SYSTEM_METADATA_FILES = {
  'tokens.json': {field: 'tokens', fallback: {}},
  'examples.json': {field: 'examples', fallback: []},
  'skeletons.json': {field: 'skeletons', fallback: []},
  'variables.json': {field: 'variables', fallback: {}},
};

export const systemFilePath = file => file.logicalPath || file.path;

export function systemDirectoryFiles(version = {}) {
  const files = structuredClone(version.resources || []);
  const has = path => files.some(file => systemFilePath(file) === path);
  if (!has(SYSTEM_RULE_PATH)) files.unshift({logicalPath: SYSTEM_RULE_PATH, name: SYSTEM_RULE_PATH,
    mimeType: 'text/markdown', content: version.guidelines || '# 设计规范\n\n在这里说明配色、排版、间距、组件和交互要求。\n'});
  for (const [path, {field, fallback}] of Object.entries(SYSTEM_METADATA_FILES)) {
    const value = version[field] ?? fallback;
    if (!has(path) && Object.keys(value).length) files.push({logicalPath: path, name: path,
      mimeType: 'application/json', content: JSON.stringify(value, null, 2)});
  }
  return files;
}
