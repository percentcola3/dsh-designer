import test from 'node:test';
import assert from 'node:assert/strict';
import styles from './shell-styles.js';

test('workspace sidebar and content exclude overlapping native host drag regions', () => {
  const exclusion = styles.match(/\.wb-shell \.wb-shell-sidebar, \.wb-shell \.wb-shell-main\s*\{([^}]+)\}/)?.[1];
  assert.ok(exclusion, 'both workspace regions need explicit native hit-test exclusions');
  assert.match(exclusion, /-webkit-app-region:\s*no-drag\s*;/);
  assert.match(exclusion, /(?:^|[;\s])app-region:\s*no-drag\s*;/);
});

test('window dragging stays scoped to the toolbar with clickable toolbar controls', () => {
  const toolbar = styles.match(/\.wb-shell-topbar\[data-window-drag\]\s*\{([^}]+)\}/)?.[1];
  const controls = styles.match(/\.wb-shell-topbar button, \.wb-shell-topbar \[role="menu"\]\s*\{([^}]+)\}/)?.[1];
  assert.match(toolbar || '', /-webkit-app-region:\s*drag\s*;/);
  assert.match(controls || '', /-webkit-app-region:\s*no-drag\s*;/);
});
