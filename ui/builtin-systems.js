import {desktopPresets} from '../desktop-presets.js';
import {uploadFile} from './upload.js';
import {desktopSystemFiles, DESKTOP_SYSTEM_NAME} from '../desktop-theme.js';
import {mobileSystemFiles, MOBILE_SYSTEM_NAME} from '../mobile-theme.js';
import {isAvailable} from './composer-mentions.js';

export const builtinSystems = [
  {id: 'builtin-desktop-antd', name: DESKTOP_SYSTEM_NAME, revision: 1, platforms: ['web'], builtin: true, createFiles: desktopSystemFiles},
  ...Object.entries(desktopPresets).map(([preset,theme])=>({id:'builtin-desktop-'+preset,name:theme.name+' · Web Components',revision:1,platforms:['web'],builtin:true,createFiles:()=>desktopSystemFiles({preset})})),
  {id: 'builtin-mobile-vant', name: MOBILE_SYSTEM_NAME, revision: 1, platforms: ['mobile'], builtin: true, createFiles: mobileSystemFiles},
];

export function selectableSystems(systems) {
  const saved = systems.filter(isAvailable);
  return [...builtinSystems.filter(builtin => !saved.some(system => system.name === builtin.name)), ...saved];
}

export async function ensureSavedSystem(api,system,isCurrent=()=>true) {
  if (!system?.builtin) return system;
  const {systems} = await api('system.list',{});
  if (!isCurrent()) return null;
  const existing = systems.find(item=>isAvailable(item)&&item.name===system.name);
  if (existing) return existing;
  const body = {name:system.name,platforms:system.platforms,format:'directory',resources:system.createFiles()};
  const saved = await uploadFile(api,new Blob([JSON.stringify(body)],{type:'application/json'}),{
    purpose:'system-package',name:system.name+'.design-system.json',mediaType:'application/json',
  });
  if (!saved?.id) throw new Error('规范保存失败，请重试。');
  return saved;
}
