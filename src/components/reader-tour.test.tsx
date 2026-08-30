// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReaderTour } from './reader-tour'
import { readerTourStorageKey, readerTourSteps } from '#/lib/reader-tour'

const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')
const appear = { timeout: 2500 }

describe('reader tour', () => {
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
  })

  afterEach(() => {
    cleanup()
    if (originalLocalStorage) Object.defineProperty(window, 'localStorage', originalLocalStorage)
  })

  it('stays away once the tour has been taken', async () => {
    window.localStorage.setItem(readerTourStorageKey, new Date().toISOString())
    render(<ReaderTour ready chatOpen={false} />)

    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('waits for the first page before opening', async () => {
    const view = render(<ReaderTour ready={false} chatOpen={false} />)

    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(screen.queryByRole('dialog')).toBeNull()

    view.rerender(<ReaderTour ready chatOpen={false} />)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy(), appear)
  })

  it('records the tour as seen when it is skipped', async () => {
    const user = userEvent.setup()
    render(<ReaderTour ready chatOpen={false} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy(), appear)
    await user.click(screen.getByRole('button', { name: /skip/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.localStorage.getItem(readerTourStorageKey)).not.toBeNull()
  })

  it('walks every step and records the tour on the last one', async () => {
    const user = userEvent.setup()
    render(<ReaderTour ready chatOpen={false} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy(), appear)
    expect(screen.getByText(readerTourSteps[0].title)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Show me' }))
    for (let step = 1; step < readerTourSteps.length - 1; step += 1) {
      expect(screen.getByText(readerTourSteps[step].title)).toBeTruthy()
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }

    expect(screen.getByText(readerTourSteps.at(-1)!.title)).toBeTruthy()
    expect(window.localStorage.getItem(readerTourStorageKey)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Start reading' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.localStorage.getItem(readerTourStorageKey)).not.toBeNull()
  })

  it('advances itself once the reader opens chat', async () => {
    const user = userEvent.setup()
    const chatStep = readerTourSteps.findIndex((step) => step.id === 'chat')
    const view = render(<ReaderTour ready chatOpen={false} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy(), appear)
    await user.click(screen.getByRole('button', { name: 'Show me' }))
    for (let step = 1; step < chatStep; step += 1) await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText(readerTourSteps[chatStep].title)).toBeTruthy()
    expect(screen.getByText('Open it and say hello')).toBeTruthy()

    view.rerender(<ReaderTour ready chatOpen />)
    expect(screen.getByText(/Nice/)).toBeTruthy()
    await waitFor(() => expect(screen.getByText(readerTourSteps[chatStep + 1].title)).toBeTruthy(), appear)
  })
})
