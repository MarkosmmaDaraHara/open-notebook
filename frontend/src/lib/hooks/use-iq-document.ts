'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { documentsApi } from '@/lib/api/documents'
import type {
  DocumentSaveStatus,
  IQDocument,
  IQEditProposal,
} from '@/lib/types/documents'


const DEMO_HTML = `
<h1>Project proposal</h1>
<p class="subtitle">A practical plan for the next release</p>
<h2>1. Executive summary</h2>
<p>This proposal outlines the plan, resources, and timeline for delivering the next release. The focus is on solving the most important customer problems while improving reliability and performance. We will ship valuable features, reduce risk, and establish a strong foundation for future iterations.</p>
<blockquote>Our approach balances short-term impact with long-term sustainability. We will prioritize high-value work, collaborate closely across teams, and maintain a clear feedback loop with users. Success will be measured by adoption, performance improvements, and customer satisfaction.</blockquote>
<h2>2. Objectives</h2>
<p>These objectives guide our decisions and help us measure progress throughout the release cycle.</p>
<table><thead><tr><th>Objective</th><th>Description</th><th>Metric</th></tr></thead><tbody><tr><td>Deliver value</td><td>Ship features that solve key user problems</td><td>Adoption rate</td></tr><tr><td>Improve quality</td><td>Enhance reliability and performance</td><td>Error rate, uptime</td></tr><tr><td>Increase efficiency</td><td>Streamline workflows and reduce cycle time</td><td>Cycle time, throughput</td></tr></tbody></table>
<p>By focusing on these objectives, we will create meaningful outcomes for users and the business.</p>
`.trim()

const DEMO_DOCUMENT: IQDocument = {
  id: 'local-preview-document',
  title: 'Project proposal',
  file_type: 'docx',
  html: DEMO_HTML,
  version: 1,
  created_at: new Date(0).toISOString(),
  updated_at: new Date().toISOString(),
  word_count: 144,
}

const DEFAULT_ORIGINAL = 'Our approach balances short-term impact with long-term sustainability. We will prioritize high-value work, collaborate closely across teams, and maintain a clear feedback loop with users. Success will be measured by adoption, performance improvements, and customer satisfaction.'
const DEFAULT_REPLACEMENT = 'We balance short-term impact with long-term sustainability by prioritizing high-value work, collaborating across teams, and using clear user feedback. We will measure success through adoption, performance, and customer satisfaction.'

function localPreviewProposal(instruction: string, selectedText: string): IQEditProposal {
  const original = selectedText.trim() || DEFAULT_ORIGINAL
  let replacement = DEFAULT_REPLACEMENT
  const normalizedInstruction = instruction.toLowerCase()

  if (selectedText.trim()) {
    if (normalizedInstruction.includes('summar')) {
      replacement = selectedText.split(/[.!?]\s/).slice(0, 1).join(' ').trim()
    } else if (normalizedInstruction.includes('uppercase')) {
      replacement = selectedText.toUpperCase()
    } else {
      replacement = selectedText
        .replace(/\bvery\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    }
  }

  return {
    original,
    replacement,
    summary: 'Clearer, more concise wording',
    rationale: 'Removes repetition while preserving the original meaning and measurable outcomes.',
    confidence: 0.78,
    provider: 'local-preview',
  }
}

export function useIQDocument() {
  const [document, setDocument] = useState<IQDocument>(DEMO_DOCUMENT)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<DocumentSaveStatus>('offline')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDocument = useRef<IQDocument>(DEMO_DOCUMENT)
  const connected = useRef(false)
  const saving = useRef(false)
  const pendingSave = useRef(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const records = await documentsApi.list()
        const next = records[0] ?? await documentsApi.create({
          title: DEMO_DOCUMENT.title,
          initial_html: DEMO_DOCUMENT.html,
        })
        if (!cancelled) {
          latestDocument.current = next
          connected.current = true
          setDocument(next)
          setIsConnected(true)
          setSaveStatus('saved')
        }
      } catch {
        if (!cancelled) {
          const stored = window.localStorage.getItem('chat-iq-document-preview')
          if (stored) {
            try {
              const localDocument = { ...DEMO_DOCUMENT, ...JSON.parse(stored) }
              latestDocument.current = localDocument
              setDocument(localDocument)
            } catch {
              latestDocument.current = DEMO_DOCUMENT
              setDocument(DEMO_DOCUMENT)
            }
          }
          setSaveStatus('offline')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const persist = useCallback(async () => {
    const current = latestDocument.current
    if (!connected.current || current.id === DEMO_DOCUMENT.id) {
      window.localStorage.setItem('chat-iq-document-preview', JSON.stringify(current))
      setSaveStatus('offline')
      return
    }

    if (saving.current) {
      pendingSave.current = true
      return
    }

    saving.current = true
    try {
      do {
        pendingSave.current = false
        const snapshot = latestDocument.current
        setSaveStatus('saving')
        const saved = await documentsApi.update(snapshot.id, {
          title: snapshot.title,
          html: snapshot.html,
          expected_version: snapshot.version,
        })

        const newest = latestDocument.current
        if (newest.title === snapshot.title && newest.html === snapshot.html) {
          latestDocument.current = saved
          setDocument(saved)
        } else {
          const rebased = { ...newest, version: saved.version }
          latestDocument.current = rebased
          setDocument(rebased)
          pendingSave.current = true
        }
      } while (pendingSave.current)
      setSaveStatus('saved')
    } catch {
      pendingSave.current = false
      setSaveStatus('error')
    } finally {
      saving.current = false
      if (pendingSave.current) {
        window.setTimeout(() => void persist(), 0)
      }
    }
  }, [])

  const updateDocument = useCallback((patch: Partial<Pick<IQDocument, 'title' | 'html'>>) => {
    setDocument((current) => {
      const next = { ...current, ...patch, updated_at: new Date().toISOString() }
      latestDocument.current = next
      setSaveStatus(connected.current ? 'unsaved' : 'offline')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void persist(), 900)
      return next
    })
  }, [persist])

  const proposeEdit = useCallback(async (
    instruction: string,
    selectedText: string,
    documentText: string,
  ): Promise<IQEditProposal> => {
    if (isConnected && document.id !== DEMO_DOCUMENT.id) {
      try {
        return await documentsApi.proposeEdit(document.id, {
          instruction,
          selected_text: selectedText,
          document_text: documentText,
        })
      } catch {
        return localPreviewProposal(instruction, selectedText)
      }
    }
    return localPreviewProposal(instruction, selectedText)
  }, [document.id, isConnected])

  return {
    document,
    isConnected,
    isLoading,
    saveStatus,
    updateDocument,
    proposeEdit,
    initialProposal: localPreviewProposal('Make this section clearer and more concise', ''),
  }
}
