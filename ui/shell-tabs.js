// Scroll the whole tab so its close button remains reachable as well.
export function revealShellTab(button) {
  const tab = button?.closest?.('.wb-shell-tab') || button
  tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
}

// Selection can change outside the tab strip, and flex shrinking can hide the
// selected tab after a resize. This observer belongs to the current selection.
export function keepShellTabVisible(tablist, button) {
  if (!tablist || !button) return () => {}
  let active = true
  const reveal = () => { if (active) revealShellTab(button) }
  reveal()
  const view = tablist.ownerDocument?.defaultView || globalThis
  const Observer = view.ResizeObserver
  let observer
  if (typeof Observer === 'function') {
    observer = new Observer(reveal)
    observer.observe(tablist)
  } else {
    view.addEventListener?.('resize', reveal)
  }
  return () => {
    active = false
    observer?.disconnect()
    if (!observer) view.removeEventListener?.('resize', reveal)
  }
}

export function shellTabIndexForKey(key, index, count) {
  if (count < 1) return null
  if (key === 'ArrowRight') return (index + 1) % count
  if (key === 'ArrowLeft') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}
