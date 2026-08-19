import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { IQPanel } from './IQPanel'


describe('IQPanel', () => {
  const proposal = {
    original: 'A long sentence that can be improved.',
    replacement: 'A clearer sentence.',
    summary: 'Clearer wording',
    rationale: 'The replacement is shorter without changing the meaning.',
    confidence: 0.91,
  }

  it('keeps an IQ edit reviewable until the user applies it', () => {
    const onApply = vi.fn()
    const onDiscard = vi.fn()
    render(
      <IQPanel
        proposal={proposal}
        selectedText={proposal.original}
        isThinking={false}
        onAsk={vi.fn()}
        onApply={onApply}
        onDiscard={onDiscard}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(proposal.original)).toBeInTheDocument()
    expect(screen.getByText(proposal.replacement)).toBeInTheDocument()
    expect(screen.getByText('91%')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledOnce()
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('sends quick actions and custom English instructions to IQ', () => {
    const onAsk = vi.fn().mockResolvedValue(undefined)
    render(
      <IQPanel
        proposal={null}
        selectedText=""
        isThinking={false}
        onAsk={onAsk}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
        onClose={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite' }))
    expect(onAsk).toHaveBeenCalledWith('Rewrite this to be clearer and more concise')

    fireEvent.change(screen.getByLabelText('Ask IQ'), {
      target: { value: 'Make this sound more confident' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send to IQ' }))
    expect(onAsk).toHaveBeenLastCalledWith('Make this sound more confident')
  })
})
