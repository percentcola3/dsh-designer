import {parse} from 'parse5';
import {fail} from './store.js';
import {desktopComponentUsage, DESKTOP_COMPONENT_VERSION} from './desktop-components.js';

/** A read-only projection of the admitted version's public component contracts. */
export function systemUsage({manifest, tokens, examples, components = [], indexOnly = false, brief = false, includeTokens = !brief}) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.components) || manifest.components.some(component => !component || typeof component.tag !== 'string')) {
    fail('INVALID_SYSTEM_CONTRACT', 'components.json needs a component array with element tags');
  }
  if (!Array.isArray(components) || components.length > 30 || components.some(tag => typeof tag !== 'string' || !/^[a-z][a-z0-9.-]*$/.test(tag))) {
    fail('INVALID_INPUT', 'components must contain at most 30 element tag names');
  }
  if (typeof includeTokens !== 'boolean') fail('INVALID_INPUT', 'includeTokens must be a boolean');
  const catalog = Array.isArray(manifest.components) ? manifest.components : [];
  const desktop = manifest.name === 'DSH Desktop Components' && ['1.2.0', '1.2.1', DESKTOP_COMPONENT_VERSION].includes(manifest.version) && manifest.dom === 'light';
  if (indexOnly) return {
    name:manifest.name, version:manifest.version, platform:manifest.platform, dom:manifest.dom,
    components:catalog.map(({tag,native,structure}) => ({tag, ...(native ? {native} : {}), ...(structure ? {structure} : {})})),
    guidance:'Read system.usage with the component tags needed for the current implementation stage. It returns their contracts and exact examples. Keep the returned tokens for later stages and use includeTokens:false on subsequent usage reads. Read implementation source only to resolve a specific API or runtime failure.',
  };
  const requested = new Set(components);
  if (brief) {
    if (!requested.size) fail('INVALID_INPUT','Supply the component tags needed for this page, or use system.index to list tags');
    return {
      name:manifest.name, ...(includeTokens ? {tokens} : {}),
      components:catalog.filter(row => requested.has(row.tag)).map(row => {
        const integration = row.integration || (desktop ? desktopComponentUsage.components[row.tag] : undefined);
        // Include the runtime behavior next to its markup, without duplicating
        // the gallery example or adding optional editor scenes to an HTML task.
        const {example,scene,...behavior} = integration && typeof integration === 'object' ? integration : {};
        return {...row, ...(integration ? {integration:typeof integration === 'object' ? behavior : integration} : {}),
          ...(example && !row.example ? {example} : {})};
      }),
      missingComponents:[...requested].filter(tag => !catalog.some(row => row.tag === tag)),
      ...(desktop ? {startup:desktopComponentUsage.startup} : {}),
    };
  }
  const snippets = new Map();
  if (examples && requested.size) {
    const visit = node => {
      const location = node.sourceCodeLocation;
      if (requested.has(node.tagName) && location?.endTag) {
        const snippet = {path:'examples/components.html', offset:location.startOffset, length:location.endOffset - location.startOffset};
        if (!snippets.has(node.tagName) || snippets.get(node.tagName).length > snippet.length) snippets.set(node.tagName, snippet);
      }
      for (const child of node.childNodes || []) visit(child);
      if (node.content) visit(node.content);
    };
    visit(parse(examples, {sourceCodeLocationInfo:true}));
  }
  const selected = catalog.filter(component => !requested.size || requested.has(component.tag)).map(component => {
    const sample = snippets.get(component.tag);
    return {
      ...component,
      ...(desktop && desktopComponentUsage.components[component.tag] ? {integration:component.integration || desktopComponentUsage.components[component.tag]} : {}),
      ...(sample ? {sample:{...sample, ...(sample.length <= 4000 ? {html:examples.slice(sample.offset, sample.offset + sample.length)} : {})}} : {}),
    };
  });
  return {
    name:manifest.name, version:manifest.version, platform:manifest.platform, dom:manifest.dom,
    ...(includeTokens ? {tokens} : {}),
    componentIndex:catalog.map(({tag}) => tag).filter(Boolean),
    components:selected,
    ...(desktop ? {startup:desktopComponentUsage.startup, integrationDocumentation:{name:manifest.name,version:manifest.version,source:'host public runtime API recipes'}} : {}),
    missingComponents:[...requested].filter(tag => !catalog.some(component => component.tag === tag)),
    ...(manifest.dom === 'light' ? {nativeControls:'Read form values from the declared native child through host.querySelector("input"), host.querySelector("select") or host.querySelector("textarea") and standard native value/checked APIs. Host attributes follow the listed contract. Standard input/change events remain available. Use native HTML form and pagination controls when the component index has no matching component.'} : {}),
    guidance:'Use these pinned contracts and the rule.md integration rules. Choose a declared component or native HTML control for each missingComponents entry. New bound HTML receives the theme and component runtime on save. Query source when a concrete integration issue remains. A sample includes its original source range when more context is needed.',
  };
}

/** Literal search keeps troubleshooting reads focused while retaining source locations. */
export function systemTextMatches(text, query, contextLines = 3) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200 || !Number.isInteger(contextLines) || contextLines < 0 || contextLines > 10) {
    fail('INVALID_INPUT', 'Use a literal query of 1–200 characters and contextLines from 0 to 10');
  }
  const lines = text.split('\n'), needle = query.toLowerCase(), groups = [];
  let matchCount = 0, omittedMatchCount = 0, offset = 0;
  const offsets = lines.map(line => { const start = offset; offset += line.length + 1; return start; });
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].toLowerCase().includes(needle)) continue;
    matchCount++;
    const first = Math.max(0, index - contextLines), last = Math.min(lines.length - 1, index + contextLines);
    const previous = groups.at(-1);
    if (previous && first <= previous.last + 1) previous.last = Math.max(previous.last, last);
    else if (groups.length < 50) groups.push({first, last});
    else omittedMatchCount++;
  }
  return {query, matchCount, omittedMatchCount, matches:groups.map(({first,last}) => ({startLine:first + 1, endLine:last + 1, offset:offsets[first], text:lines.slice(first,last + 1).join('\n')}))};
}
