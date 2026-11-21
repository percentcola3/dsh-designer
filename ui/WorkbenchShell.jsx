import React from 'react'
import { Icon, PlantLogo } from './brand.jsx'
import shellStyles from './shell-styles.js'
import { keepShellTabVisible, revealShellTab, shellTabIndexForKey } from './shell-tabs.js'

const homeTab = { id: 'home', label: '首页', icon: 'home', closable: false }

function ShellIcon({ icon, fallback = 'grid', size = 18 }) {
  if (React.isValidElement(icon)) return icon
  return <Icon name={typeof icon === 'string' ? icon : fallback} size={size} />
}

/** Presentation only: the caller owns navigation, tab lifetime, and save guards. */
export default function WorkbenchShell({
  pluginVersion,
  navigation = [],
  activeNavigationId,
  onNavigate,
  sidebarVisible = true,
  onToggleSidebar,
  openItems = [],
  tabs = [],
  activeTabId,
  onSelectTab,
  onCloseTab,
  onExit,
  theme = 'light',
  onToggleTheme,
  children,
}) {
  const instanceId = React.useId()
  const panelId = `${instanceId}-stage`
  const tabRefs = React.useRef(new Map())
  const tablistRef = React.useRef(null)
  const headerRef = React.useRef(null)
  const openButtonRef = React.useRef(null)
  const menuRef = React.useRef(null)
  const menuInitialFocus = React.useRef('first')
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [menuLeft, setMenuLeft] = React.useState(8)
  const menuId = `${instanceId}-open-menu`

  function closeMenu(restoreFocus = true) {
    setMenuOpen(false)
    if (restoreFocus) openButtonRef.current?.focus()
  }

  function openMenu(initialFocus = 'first') {
    menuInitialFocus.current = initialFocus
    setMenuOpen(true)
  }

  React.useLayoutEffect(() => {
    if (!menuOpen) return
    const header = headerRef.current
    const trigger = openButtonRef.current
    const menu = menuRef.current
    if (!header || !trigger || !menu) return
    function updatePosition() {
      const headerRect = header.getBoundingClientRect()
      const triggerRect = trigger.getBoundingClientRect()
      setMenuLeft(Math.max(8, Math.min(triggerRect.left - headerRect.left, headerRect.width - menu.offsetWidth - 8)))
    }
    updatePosition()
    const items = menu.querySelectorAll('[role="menuitem"]:not(:disabled)')
    const target = (menuInitialFocus.current === 'last' ? items[items.length - 1] : items[0]) || menu
    target.focus()
    window.addEventListener('resize', updatePosition)
    document.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      document.removeEventListener('scroll', updatePosition, true)
    }
  }, [menuOpen])

  React.useEffect(() => {
    if (!menuOpen) return
    function handleOutsidePointer(event) {
      if (!menuRef.current?.contains(event.target) && !openButtonRef.current?.contains(event.target)) {
        setMenuOpen(false)
        // Let the clicked control receive focus after dismissing the menu.
        openButtonRef.current?.focus({ preventScroll: true })
      }
    }
    function handleEscape(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setMenuOpen(false)
      openButtonRef.current?.focus()
    }
    document.addEventListener('pointerdown', handleOutsidePointer, true)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer, true)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  function handleMenuKeyDown(event) {
    if (event.key === 'Tab') {
      closeMenu()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])
    if (!items.length) return
    const currentIndex = items.indexOf(document.activeElement)
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length
    items[nextIndex].focus()
  }

  function selectMenuItem(callback) {
    closeMenu()
    callback?.()
  }

  // Normalize presentation without changing the caller's tab state.
  const seen = new Set(['home'])
  const displayedTabs = [{ ...homeTab, ...tabs.find(tab => tab.id === 'home'), closable: false }]
  for (const tab of tabs) {
    if (seen.has(tab.id)) continue
    seen.add(tab.id)
    displayedTabs.push(tab)
  }
  const selectedId = displayedTabs.some(tab => tab.id === activeTabId) ? activeTabId : 'home'
  const selectedIndex = displayedTabs.findIndex(tab => tab.id === selectedId)
  const tabId = index => `${instanceId}-tab-${index}`

  const tabLayoutKey = JSON.stringify(displayedTabs.map(tab => [tab.id, tab.label, Boolean(tab.running), tab.closable !== false && Boolean(onCloseTab)]))
  React.useLayoutEffect(() => keepShellTabVisible(tablistRef.current, tabRefs.current.get(selectedId)), [selectedId, tabLayoutKey])

  function handleTabKeyDown(event, tab, index) {
    if (event.key === 'Delete' && tab.closable !== false && onCloseTab) {
      event.preventDefault()
      onCloseTab(tab.id)
      return
    }
    const nextIndex = shellTabIndexForKey(event.key, index, displayedTabs.length)
    if (nextIndex === null) return
    event.preventDefault()
    const nextTab = displayedTabs[nextIndex]
    onSelectTab?.(nextTab.id)
    const button = tabRefs.current.get(nextTab.id)
    button?.focus({ preventScroll: true })
    revealShellTab(button)
  }

  function renderNavigation(item) {
    const active = item.id === activeNavigationId
    return <button key={item.id} type="button" className="wb-shell-nav-item"
      aria-current={active ? 'page' : undefined} aria-label={item.label} title={item.label}
      onClick={() => onNavigate?.(item.id)}><ShellIcon icon={item.icon} size={20}/></button>
  }

  return (
    <div className="wb-shell" data-sidebar-visible={sidebarVisible}>
      <style>{shellStyles}</style>
      <header ref={headerRef} className="wb-shell-topbar" data-window-drag>
        <div className="wb-shell-brand"><button type="button" className="wb-shell-logo" title="首页" aria-label="首页" onClick={() => onNavigate?.('home')}><PlantLogo size={28}/></button></div>
        <div className="wb-shell-tab-rail">
        <div ref={tablistRef} className="wb-shell-tabs" role="tablist" aria-label="工作台标签" aria-orientation="horizontal">
          {displayedTabs.map((tab, index) => {
            const selected = tab.id === selectedId
            const closable = tab.closable !== false && Boolean(onCloseTab)
            return (
              <div key={tab.id} className="wb-shell-tab" data-active={selected} data-closable={closable} data-running={Boolean(tab.running)} role="presentation">
                <button
                  ref={element => { if (element) tabRefs.current.set(tab.id, element); else tabRefs.current.delete(tab.id) }}
                  type="button"
                  id={tabId(index)}
                  className="wb-shell-tab-select"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId}
                  aria-label={tab.running ? `${tab.label}，进行中` : tab.label}
                  title={tab.label}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onSelectTab?.(tab.id)}
                  onKeyDown={event => handleTabKeyDown(event, tab, index)}
                >
                  <ShellIcon icon={tab.icon} fallback={tab.id === 'home' ? 'home' : 'folder'} size={14} />
                  <span className="wb-shell-tab-label">{tab.label}</span>
                  {tab.running && <span className="wb-shell-running" aria-hidden="true" />}
                </button>
                {closable && <button type="button" className="wb-shell-tab-close" tabIndex={selected ? 0 : -1} title={`关闭${tab.label}`} aria-label={`关闭${tab.label}`} onClick={() => onCloseTab(tab.id)}><Icon name="x" size={13} /></button>}
              </div>
            )
          })}
        </div>
        <button ref={openButtonRef} type="button" className="wb-shell-open wb-shell-icon-button"
          title="打开导航或项目资源" aria-label="打开导航或项目资源" aria-haspopup="menu"
          aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined}
          onClick={() => { if (menuOpen) closeMenu(); else openMenu() }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              openMenu(event.key === 'ArrowUp' ? 'last' : 'first')
            }
          }}><Icon name="plus" size={18} /></button>
        </div>
        {menuOpen && <div ref={menuRef} id={menuId} className="wb-shell-open-menu" role="menu"
          aria-label="打开导航或项目资源" tabIndex={-1} style={{ left: menuLeft }} onKeyDown={handleMenuKeyDown}>
          {(onToggleSidebar || navigation.length > 0) && <div role="group" aria-labelledby={`${menuId}-navigation`}>
            <div id={`${menuId}-navigation`} className="wb-shell-menu-label">导航</div>
            {onToggleSidebar && <button type="button" role="menuitem" tabIndex={-1} className="wb-shell-menu-item"
              onClick={() => selectMenuItem(onToggleSidebar)}><Icon name={sidebarVisible ? 'panel-left-close' : 'panel-left-open'} size={17} /><span>{sidebarVisible ? '隐藏导航' : '显示导航'}</span></button>}
            {navigation.map(item => <button key={item.id} type="button" role="menuitem" tabIndex={-1}
              className="wb-shell-menu-item" aria-current={item.id === activeNavigationId ? 'page' : undefined}
              onClick={() => selectMenuItem(() => onNavigate?.(item.id))}>
              <ShellIcon icon={item.icon} size={17} /><span>{item.label}</span>
            </button>)}
          </div>}
          {openItems.length > 0 && <div role="group" aria-labelledby={`${menuId}-project`}>
            <div id={`${menuId}-project`} className="wb-shell-menu-label">项目</div>
            {openItems.map(item => <button key={item.id} type="button" role="menuitem" tabIndex={-1}
              className="wb-shell-menu-item" disabled={item.disabled}
              onClick={() => selectMenuItem(item.onSelect)}>
              <ShellIcon icon={item.icon} fallback="folder" size={17} /><span>{item.label}</span>
            </button>)}
          </div>}
          {!onToggleSidebar && !navigation.length && !openItems.length && <div className="wb-shell-menu-empty">暂无可打开的项目</div>}
        </div>}
        <div className="wb-shell-actions"><button type="button" className="wb-shell-theme wb-shell-icon-button" title={theme==='dark'?'切换为浅色模式':'切换为深色模式'} aria-label={theme==='dark'?'切换为浅色模式':'切换为深色模式'} aria-pressed={theme==='dark'} onClick={onToggleTheme} disabled={!onToggleTheme}><Icon name={theme==='dark'?'sun':'moon'} size={18}/></button><button type="button" className="wb-shell-exit wb-shell-icon-button" title="关闭设计师模式" aria-label="关闭设计师模式" onClick={onExit} disabled={!onExit}><Icon name="x" size={18} /></button></div>
      </header>
      <aside className="wb-shell-sidebar" aria-label="工作台侧栏" hidden={!sidebarVisible}>
        <div className="wb-shell-sidebar-scroll">
          <nav className="wb-shell-navigation" aria-label="主要导航">
            {navigation.filter(item => !item.bottom).map(renderNavigation)}
          </nav>
        </div>
        <footer className="wb-shell-sidebar-footer">
          {pluginVersion && <span className="wb-shell-version" title={`设计插件版本 v${pluginVersion}`}>v{pluginVersion}</span>}
          <nav className="wb-shell-navigation" aria-label="更多导航">
            {navigation.filter(item => item.bottom).map(renderNavigation)}
          </nav>
        </footer>
      </aside>
      <div className="wb-shell-main">
        <div className="wb-shell-workspace">
          <main className="wb-shell-stage" id={panelId} role="tabpanel" aria-labelledby={tabId(selectedIndex)} tabIndex={0}>
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
