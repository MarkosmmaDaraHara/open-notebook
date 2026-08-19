'use client'

import { useState } from 'react'
import {
  ArrowRight,
  Check,
  Languages,
  RotateCcw,
  Send,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'

import type { IQEditProposal } from '@/lib/types/documents'

interface IQPanelProps {
  proposal: IQEditProposal | null
  selectedText: string
  isThinking: boolean
  onAsk: (instruction: string) => Promise<void>
  onApply: () => void
  onDiscard: () => void
  onClose: () => void
}

const QUICK_ACTIONS = [
  { label: 'Rewrite', prompt: 'Rewrite this to be clearer and more concise', icon: WandSparkles },
  { label: 'Summarize', prompt: 'Summarize this in one strong sentence', icon: RotateCcw },
  { label: 'Translate', prompt: 'Translate this into natural English', icon: Languages },
]

export function IQPanel({
  proposal,
  selectedText,
  isThinking,
  onAsk,
  onApply,
  onDiscard,
  onClose,
}: IQPanelProps) {
  const [instruction, setInstruction] = useState('')

  const submit = async () => {
    const value = instruction.trim()
    if (!value || isThinking) return
    setInstruction('')
    await onAsk(value)
  }

  return (
    <aside className="iq-assistant-panel" aria-label="IQ assistant">
      <header className="iq-assistant-header">
        <div className="iq-assistant-title">
          <span className="iq-assistant-mark"><Sparkles /></span>
          <div>
            <strong>IQ</strong>
            <span>Writing partner</span>
          </div>
        </div>
        <button type="button" className="iq-icon-button iq-panel-close" onClick={onClose} aria-label="Close IQ panel">
          <X />
        </button>
      </header>

      <div className="iq-assistant-scroll">
        <section className="iq-selection-context">
          <span className="iq-section-kicker">Working with</span>
          <p>{selectedText ? `Selected text · ${selectedText.split(/\s+/).length} words` : 'Current document'}</p>
        </section>

        {proposal ? (
          <section className="iq-suggestion-card" aria-live="polite">
            <div className="iq-suggestion-heading">
              <span><Sparkles /> IQ suggestion</span>
              <span className="iq-confidence">{Math.round(proposal.confidence * 100)}%</span>
            </div>
            <p className="iq-suggestion-summary">{proposal.summary}</p>
            <div className="iq-diff-block iq-diff-before">
              <span>Before</span>
              <p>{proposal.original}</p>
            </div>
            <div className="iq-diff-arrow" aria-hidden="true"><ArrowRight /></div>
            <div className="iq-diff-block iq-diff-after">
              <span>After</span>
              <p>{proposal.replacement}</p>
            </div>
            <p className="iq-rationale">{proposal.rationale}</p>
            <div className="iq-proposal-actions">
              <button type="button" className="iq-apply-button" onClick={onApply}>
                <Check /> Apply
              </button>
              <button type="button" className="iq-discard-button" onClick={onDiscard}>
                Discard
              </button>
            </div>
          </section>
        ) : (
          <section className="iq-empty-suggestion">
            <span><Sparkles /></span>
            <h2>What should we improve?</h2>
            <p>Select text for a precise edit, or ask IQ to work with the full document.</p>
          </section>
        )}

        <section className="iq-quick-actions" aria-label="Quick IQ actions">
          {QUICK_ACTIONS.map(({ label, prompt, icon: Icon }) => (
            <button key={label} type="button" disabled={isThinking} onClick={() => onAsk(prompt)}>
              <Icon /> {label}
            </button>
          ))}
        </section>
      </div>

      <form className="iq-prompt-box" onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}>
        <textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Ask IQ to write or edit…"
          aria-label="Ask IQ"
          rows={2}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <div>
          <span>{isThinking ? 'IQ is thinking…' : 'Enter to send · Shift+Enter for a new line'}</span>
          <button type="submit" disabled={isThinking || !instruction.trim()} aria-label="Send to IQ">
            <Send />
          </button>
        </div>
      </form>
    </aside>
  )
}
