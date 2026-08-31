// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { Tooltip } from 'radix-ui'
import { AnnotationToolbar } from './annotation-toolbar'

const toolbarSettingsKey = 'mimir:annotation-toolbar-position'
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')
const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')

function mockToolbarLayout() {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.dataset.slot !== 'annotation-toolbar') return new DOMRect()

    const vertical = this.dataset.orientation === 'vertical'
    const width = vertical ? 80 : 500
    const height = vertical ? 500 : 66
    const offsetX = Number.parseFloat(this.style.getPropertyValue('--toolbar-offset-x')) || 0
    const offsetY = Number.parseFloat(this.style.getPropertyValue('--toolbar-offset-y')) || 0
    const left = (window.innerWidth - width) / 2 + offsetX
    const top = 100 + offsetY
    return { left, top, right: left + width, bottom: top + height, width, height } as DOMRect
  }
}

describe('annotation toolbar', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      } satisfies Pick<Storage, 'clear' | 'getItem' | 'removeItem' | 'setItem'>,
    })
    window.localStorage.setItem(toolbarSettingsKey, JSON.stringify({ x: 472, y: 100, orientation: 'vertical' }))
    mockToolbarLayout()
  })

  afterEach(() => {
    cleanup()
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
    if (originalLocalStorage) Object.defineProperty(window, 'localStorage', originalLocalStorage)
    if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth)
    if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight)
  })

  it('restores a vertical toolbar at the right edge without horizontal clamping first', async () => {
    render(
      <Tooltip.Provider>
        <AnnotationToolbar />
      </Tooltip.Provider>,
    )

    const tray = await screen.findByRole('toolbar')
    await waitFor(() => expect(tray.dataset.orientation).toBe('vertical'))
    expect(tray.style.getPropertyValue('--toolbar-offset-x')).toBe('472px')
    expect(tray.parentElement?.classList.contains('z-40')).toBe(true)
  })

  it('moves by the matching width when either desktop sidebar opens', () => {
    const { rerender } = render(
      <Tooltip.Provider>
        <AnnotationToolbar />
      </Tooltip.Provider>,
    )

    const viewport = screen.getByRole('toolbar').parentElement
    expect(viewport).not.toBeNull()
    expect(viewport?.hasAttribute('data-sidebar-open')).toBe(false)
    expect(viewport?.hasAttribute('data-chat-open')).toBe(false)

    rerender(
      <Tooltip.Provider>
        <AnnotationToolbar sidebarOpen chatOpen />
      </Tooltip.Provider>,
    )

    expect(viewport?.dataset.sidebarOpen).toBe('true')
    expect(viewport?.dataset.chatOpen).toBe('true')
    expect(viewport?.classList.contains('[--toolbar-sidebar-shift:228px]')).toBe(true)
    expect(viewport?.classList.contains('[--toolbar-chat-shift:352px]')).toBe(true)
    expect(viewport?.classList.contains('max-[1100px]:[--toolbar-sidebar-shift:196px]')).toBe(true)
    expect(viewport?.classList.contains('max-[1100px]:[--toolbar-chat-shift:312px]')).toBe(true)
    expect(viewport?.classList.contains('max-[820px]:hidden')).toBe(true)
  })
})
