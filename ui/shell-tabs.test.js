import test from 'node:test'
import assert from 'node:assert/strict'
import { keepShellTabVisible, revealShellTab, shellTabIndexForKey } from './shell-tabs.js'

function fixture() {
  const calls = [], observers = []
  const tab = { scrollIntoView: options => calls.push(options) }
  const button = { closest: selector => { assert.equal(selector, '.wb-shell-tab'); return tab } }
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this) }
    observe(target) { this.target = target }
    disconnect() { this.disconnected = true }
  }
  const tablist = { ownerDocument: { defaultView: { ResizeObserver } } }
  return { calls, observers, tab, button, tablist }
}

test('selection reveals the whole tab including the close control without smooth scrolling', () => {
  const f = fixture()
  revealShellTab(f.button)
  assert.deepEqual(f.calls, [{ block: 'nearest', inline: 'nearest', behavior: 'instant' }])
  // An unmounted ref is harmless, including on a delayed keyboard event.
  revealShellTab(null)
})

test('shrinking the tab rail reveals the selected tab again and disconnects on cleanup', () => {
  const f = fixture()
  const cleanup = keepShellTabVisible(f.tablist, f.button)
  assert.equal(f.calls.length, 1)
  const observer = f.observers[0]
  assert.equal(observer.target, f.tablist)
  observer.callback()
  assert.equal(f.calls.length, 2)
  cleanup()
  assert.equal(observer.disconnected, true)
  observer.callback()
  assert.equal(f.calls.length, 2, 'a queued resize must not scroll an obsolete selection')
})

test('switching selection stops the old tab observer before revealing the new tab', () => {
  const f = fixture(), other = fixture()
  const cleanupOld = keepShellTabVisible(f.tablist, f.button)
  cleanupOld()
  const cleanupNew = keepShellTabVisible(f.tablist, other.button)
  f.observers[0].callback()
  assert.equal(f.calls.length, 1)
  assert.equal(other.calls.length, 1)
  f.observers[1].callback()
  assert.equal(other.calls.length, 2)
  cleanupNew()
})

test('window resize fallback is removed with the same handler and suppresses queued callbacks', () => {
  const f = fixture(), listeners = new Map()
  f.tablist.ownerDocument.defaultView = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type, handler) => { assert.equal(listeners.get(type), handler); listeners.delete(type) },
  }
  const cleanup = keepShellTabVisible(f.tablist, f.button)
  const resize = listeners.get('resize')
  resize()
  assert.equal(f.calls.length, 2)
  cleanup()
  assert.equal(listeners.size, 0)
  resize()
  assert.equal(f.calls.length, 2)
})

test('missing refs during mounting do not install an observer', () => {
  const f = fixture()
  keepShellTabVisible(null, f.button)()
  keepShellTabVisible(f.tablist, null)()
  assert.equal(f.calls.length, 0)
  assert.equal(f.observers.length, 0)
})

test('keyboard tab navigation wraps at each end and supports Home and End', () => {
  assert.equal(shellTabIndexForKey('ArrowRight', 0, 4), 1)
  assert.equal(shellTabIndexForKey('ArrowRight', 3, 4), 0)
  assert.equal(shellTabIndexForKey('ArrowLeft', 0, 4), 3)
  assert.equal(shellTabIndexForKey('ArrowLeft', 2, 4), 1)
  assert.equal(shellTabIndexForKey('Home', 3, 4), 0)
  assert.equal(shellTabIndexForKey('End', 0, 4), 3)
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    assert.equal(shellTabIndexForKey(key, 0, 1), 0)
    assert.equal(shellTabIndexForKey(key, 0, 0), null)
  }
  for (const key of ['Delete', 'Tab', 'Enter', 'Escape']) assert.equal(shellTabIndexForKey(key, 1, 4), null)
})
