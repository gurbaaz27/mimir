// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sidebarOpenStorageKey = 'mimir:sidebar-open'
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
})
