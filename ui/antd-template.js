import rule from '../templates/antd/rule.md';
import tokens from '../templates/antd/tokens.json';
import seed from '../templates/antd/seed.json';
import provenance from '../templates/antd/provenance.json';
import reset from '../templates/antd/css/reset.css';
import variables from '../templates/antd/css/tokens.css';
import components from '../templates/antd/css/antd.css';
import example from '../templates/antd/examples/components.html';
import license from '../templates/antd/assets/LICENSE.txt';

export function antDesignFiles() {
  return Object.entries({
    'rule.md': rule,
    'tokens.json': JSON.stringify(tokens, null, 2),
    'seed.json': JSON.stringify(seed, null, 2),
    'provenance.json': JSON.stringify(provenance, null, 2),
    'css/reset.css': reset,
    'css/tokens.css': variables,
    'css/antd.css': components,
    'examples/components.html': example,
    'assets/LICENSE.txt': license,
  }).map(([logicalPath, content]) => ({logicalPath, name: logicalPath.split('/').at(-1), content,
    mimeType: logicalPath.endsWith('.json') ? 'application/json' : logicalPath.endsWith('.css') ? 'text/css' : logicalPath.endsWith('.html') ? 'text/html' : logicalPath.endsWith('.md') ? 'text/markdown' : 'text/plain'}));
}
