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

  afterEach(() => {
    cleanup()
  })

  it('restores the PDF conversation and confirms before deleting it', async () => {
    const createdAt = new Date()
    createdAt.setDate(createdAt.getDate() - 1)
    createdAt.setHours(12, 0, 0, 0)
    const currentMessageAt = new Date()
    await chatPersistence.setItem('document-1', {
      messages: [
        {
          id: 'message-1',
          role: 'user',
          parts: [{ type: 'text', content: 'What is the main argument?' }],
          createdAt,
        },
        {
          id: 'message-2',
          role: 'assistant',
          parts: [{ type: 'text', content: 'Here is the main argument.' }],
          createdAt: currentMessageAt,
        },
      ],
    })
    const user = userEvent.setup()
    const { container } = render(
      <Tooltip.Provider>
        <ChatSidebar documentId="document-1" open onClose={() => {}} />
      </Tooltip.Provider>,
    )

    expect(await screen.findByText('What is the main argument?')).toBeTruthy()
    const messageTimes = [...container.querySelectorAll('time')]
    expect(messageTimes).toHaveLength(2)
    expect(messageTimes[0]?.getAttribute('dateTime')).toBe(createdAt.toISOString())
    expect(messageTimes[0]?.textContent).toBe('1 day ago')
    expect(messageTimes[1]?.getAttribute('dateTime')).toBe(currentMessageAt.toISOString())
    expect(messageTimes[1]?.textContent).toBe(
      new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(currentMessageAt),
    )
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/permanently removed from this browser/i)).toBeTruthy()
    expect(await db.chatHistories.get('document-1')).toBeDefined()

    await user.click(screen.getByRole('button', { name: /delete chat/i }))

    await waitFor(async () => expect(await db.chatHistories.get('document-1')).toBeUndefined())
    expect(screen.queryByText('What is the main argument?')).toBeNull()
  })
})
