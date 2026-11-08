export const THEME_KEY='dsh-designer:appearance:1';
export function readTheme(storage){
  try{return storage?.getItem(THEME_KEY)==='dark'?'dark':'light';}catch{return 'light';}
}
export function saveTheme(storage,theme){
  try{storage?.setItem(THEME_KEY,theme==='dark'?'dark':'light');}catch{}
}
