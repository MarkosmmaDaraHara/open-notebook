export interface IQDocument {
  id: string
  title: string
  file_type: string
  html: string
  version: number
  created_at: string
  updated_at: string
  word_count: number
}

export interface IQEditProposal {
  original: string
  replacement: string
  summary: string
  rationale: string
  confidence: number
  provider?: 'configured-model' | 'local-preview'
}

export interface OnlyOfficeEditorConfig {
  document_server_url: string
  config: Record<string, unknown>
}

export type DocumentSaveStatus = 'saved' | 'saving' | 'unsaved' | 'offline' | 'error'
