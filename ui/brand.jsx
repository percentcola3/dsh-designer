import React from 'react'

export function PlantLogo({ size = 28, className = '', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 1254 1254"
      fill="none"
      className={`plant-logo ${className}`}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect width="1254" height="1254" fill="var(--wb-logo-bg,#FFFFFF)" />
      <path
        transform="translate(-8 21)"
        fill="var(--wb-logo-ink,#1744F4)"
        fillRule="evenodd"
        d="M 891 192
          C 895 188 900 190 900 197
          V 413
          C 900 529 805 622 688 622
          H 562
          C 544 622 520 636 520 655
          C 520 745 503 870 476 951
          C 460 996 442 1029 397 1029
          C 365 1029 337 1010 330 982
          C 329 978 332 977 336 981
          C 354 1003 372 981 380 951
          C 407 870 424 745 424 655
          C 424 598 415 533 415 466
          C 415 340 516 238 642 238
          H 756
          C 811 238 858 220 891 192
          Z
          M 515 559
          H 642
          C 741 559 823 486 823 399
          V 304
          H 680
          C 589 304 515 377 515 468
          Z"
      />
    </svg>
  )
}

const iconShapes = {
  monitor: <><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M12 17v3m-4 0h8"/></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18.5h2"/></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/></>,
  download: <><path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
  pause: <><path d="M8 5v14M16 5v14" strokeWidth="2.5"/></>,
  play: <path d="M8 4.5a1 1 0 0 1 1.5-.86l11 6.5a1 1 0 0 1 0 1.72l-11 6.5A1 1 0 0 1 8 17.5Z"/>,
  pencil: <><path d="m15 4 5 5M4 20l4-1L20 7a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  'eye-off': <><path d="m3 3 18 18M10.5 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.2 6.2A18 18 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.8-1.8M10 10a3 3 0 0 0 4 4"/></>,
  unlock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 7.7-1.5"/></>,
  camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.5"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></>,
  grip: <><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></>,
  'layout-sidebar': <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M15 3v18"/></>,
  'layout-dock': <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 15h18"/></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  cursor: <><path d="m4 3 6.6 17 2.3-7.1L20 10.6 4 3Z"/><path d="m13 13 6 6"/></>,
  hand: <path d="M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v8c0 5-3 8-7 8-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2Z"/>,
  fit: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/></>,
  minus: <path d="M5 12h14"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18h1.2a2.3 2.3 0 0 0 1.6-3.9 1.1 1.1 0 0 1 .8-1.9H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z"/><circle cx="7.5" cy="10" r=".7"/><circle cx="10.5" cy="6.9" r=".7"/><circle cx="15" cy="7.6" r=".7"/><circle cx="6.8" cy="14.3" r=".7"/></>,
  wand: <><path d="m4 20 13-13 3 3L7 23ZM13.5 10.5l3 3M5 3v4M3 5h4M17 1v4M15 3h4M21 15v4M19 17h4"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></>,
  moon: <path d="M20.5 13.1A8.7 8.7 0 0 1 10.9 3.5a8.8 8.8 0 1 0 9.6 9.6Z"/>,
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1V10Z" /></>,
  'message-square': <path d="M21 15a3 3 0 0 1-3 3H8l-5 4V5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10Z" />,
  'arrow-left': <path d="M20 12H4m7-7-7 7 7 7" />,
  'arrow-up': <path d="M12 20V4m-7 7 7-7 7 7" />,
  'panel-left-close': <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18m7-12-3 3 3 3" /></>,
  'panel-left-open': <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18m4-12 3 3-3 3" /></>,
  x: <path d="m6 6 12 12M6 18 18 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  'folder-open': <><path d="M3 17V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2" /><path d="M3 19l3-9h16l-3 9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  external: <><path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></>,
  refresh: <><path d="M20 10a8 8 0 0 0-14-4L3 9M3 4v5h5M4 14a8 8 0 0 0 14 4l3-3M16 15h5v5" /></>,
  sparkles: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4M18 4h4M4 18v4M2 20h4" /></>,
  layers: <><path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5" /></>,
  book: <><path d="M12 5v16M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1Z" /></>,
  knowledge: <><path d="M6 3h13v18H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM3 18a3 3 0 0 1 3-3h13"/><path d="M8 7h7M8 10h5"/></>,
  skill: <path d="M10 4V3a2 2 0 0 1 4 0v1h6v6h1a2 2 0 0 1 0 4h-1v6h-6v-1a2 2 0 0 0-4 0v1H4v-6h1a2 2 0 0 0 0-4H4V4Z"/>,
  library: <><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="7" y="3" width="5" height="18" rx="1"/><path d="m15 3 4-1 4 18-4 1-4-18ZM3 7h9M3 17h9"/></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
  'file-pen': <><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m18 2 4 4-10 10-5 1 1-5L18 2ZM15 5l4 4"/></>,
  'browser-copy': <><path d="M16 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1"/><rect x="7" y="8" width="15" height="13" rx="2"/><path d="M7 12h15"/></>,
  git: <><circle cx="7" cy="5" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7 7v10m2-3h3a6 6 0 0 0 6-6"/></>,
  settings: <><path d="m9 3-.7 2.6-2 .9L3.8 6l-2 3.5 1.8 1.9v2.2l-1.8 1.9 2 3.5 2.5-.5 2 .9L9 22h6l.7-2.6 2-.9 2.5.5 2-3.5-1.8-1.9v-2.2l1.8-1.9-2-3.5-2.5.5-2-.9L15 3H9Z" /><circle cx="12" cy="12.5" r="3" /></>,
  'arrow-right': <path d="M4 12h16m-7-7 7 7-7 7" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  'chevron-down': <path d="m5 9 7 7 7-7" />,
  'chevron-up': <path d="m5 15 7-7 7 7" />,
  archive: <><rect x="3" y="3" width="18" height="5" rx="1" /><path d="M5 8v13h14V8M10 12h4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  leaf: <><path d="M20 3c-6 0-13 1-15 7-2 6 3 10 8 8 6-2 7-9 7-15Z" /><path d="M3 21 15 9" /></>,
}

export function Icon({ name, size = 16, className = '', ...props }) {
  const shape = Object.prototype.hasOwnProperty.call(iconShapes, name) ? iconShapes[name] : null
  if (!shape) return null

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {shape}
    </svg>
  )
}
