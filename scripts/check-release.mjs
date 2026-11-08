import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const tag=process.argv[2]||process.env.RELEASE_TAG;
assert.match(tag||'',/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,'Expected a version tag such as v0.4.20');
const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url),'utf8'));
assert.equal(tag,'v'+manifest.version,'Tag and package version differ');
assert.equal(lock.version,manifest.version,'Lockfile version differs');
assert.equal(lock.packages[''].version,manifest.version,'Lockfile root version differs');
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git(['rev-parse',tag+'^{commit}']),git(['rev-parse','HEAD']),'Checkout must match the release tag');
git(['merge-base','--is-ancestor','HEAD','refs/remotes/origin/main']);
console.log('Verified release '+tag+' on main ancestry.');
