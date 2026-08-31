// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sidebarOpenStorageKey = 'mimir:sidebar-open'
const chatOpenStorageKey = 'mimir:chat-open'
const storage = new Map<string, string>()
const localStorageMock = {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}

describe('sidebar preference', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorageMock })
    localStorageMock.clear()
  })

  it('restores a saved closed state when the editor store is created', async () => {
    window.localStorage.setItem(sidebarOpenStorageKey, 'false')

    const { editorStore } = await import('./editor-store.client')

    expect(editorStore.getState().sidebarOpen).toBe(false)
  })

  it('persists changes to the sidebar state', async () => {
    const { editorStore } = await import('./editor-store.client')

    editorStore.getState().setSidebarOpen(false)
    expect(window.localStorage.getItem(sidebarOpenStorageKey)).toBe('false')

    editorStore.getState().setSidebarOpen(true)
    expect(window.localStorage.getItem(sidebarOpenStorageKey)).toBe('true')
  })

  it('restores a saved closed state for the chat sidebar', async () => {
    window.localStorage.setItem(chatOpenStorageKey, 'false')

    const { editorStore } = await import('./editor-store.client')

    expect(editorStore.getState().chatOpen).toBe(false)
  })

  it('defaults panels open on desktop and closed on mobile', async () => {
    let mobile = false
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: mobile && query === '(max-width: 820px)' }),
    })

    const desktopStore = await import('./editor-store.client')
    expect(desktopStore.editorStore.getState().chatOpen).toBe(true)
    expect(desktopStore.editorStore.getState().sidebarOpen).toBe(true)

    vi.resetModules()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorageMock })
    localStorageMock.clear()
    mobile = true

    const mobileStore = await import('./editor-store.client')
    expect(mobileStore.editorStore.getState().chatOpen).toBe(false)
    expect(mobileStore.editorStore.getState().sidebarOpen).toBe(false)
  })

  it('persists changes to the chat sidebar state', async () => {
    const { editorStore } = await import('./editor-store.client')

    editorStore.getState().setChatOpen(true)
    expect(window.localStorage.getItem(chatOpenStorageKey)).toBe('true')

    editorStore.getState().setChatOpen(false)
    expect(window.localStorage.getItem(chatOpenStorageKey)).toBe('false')
  })
})
