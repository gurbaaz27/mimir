// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from 'radix-ui'
import { chatPersistence, db } from '#/lib/db.client'
import { ChatSidebar } from './chat-sidebar'

describe('PDF chat history', () => {
  beforeEach(async () => {
    await db.chatHistories.clear()
  })

  afterEach(cleanup)

  it('restores the PDF conversation and confirms before deleting it', async () => {
    await chatPersistence.setItem('document-1', {
      messages: [
        {
          id: 'message-1',
          role: 'user',
          parts: [{ type: 'text', content: 'What is the main argument?' }],
          createdAt: new Date('2026-08-30T00:00:00.000Z'),
        },
      ],
    })
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ChatSidebar documentId="document-1" open onClose={() => {}} />
      </Tooltip.Provider>,
    )

    expect(await screen.findByText('What is the main argument?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/permanently removed from this browser/i)).toBeTruthy()
    expect(await db.chatHistories.get('document-1')).toBeDefined()

    await user.click(screen.getByRole('button', { name: /delete chat/i }))

    await waitFor(async () => expect(await db.chatHistories.get('document-1')).toBeUndefined())
    expect(screen.queryByText('What is the main argument?')).toBeNull()
  })
})
