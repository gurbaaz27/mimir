// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { editorStore } from '#/lib/editor-store.client'
import { SearchPanel } from './search-panel'

describe('search panel', () => {
  beforeEach(() => {
    editorStore.setState({ activeDocument: null, searchOpen: true })
  })

  afterEach(() => {
    cleanup()
    editorStore.setState({ searchOpen: false })
  })

  it('closes when the user clicks outside the panel', () => {
    render(<SearchPanel />)

    fireEvent.pointerDown(document.body)

    expect(editorStore.getState().searchOpen).toBe(false)
  })

  it('sits close to the header search control', () => {
    render(<SearchPanel />)

    expect(screen.getByRole('search').className).toContain('top-[62px]')
  })
})
