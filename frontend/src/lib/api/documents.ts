import { apiClient } from '@/lib/api/client'
import type {
  IQDocument,
  IQEditProposal,
  OnlyOfficeEditorConfig,
} from '@/lib/types/documents'

export const documentsApi = {
  list: async (query?: string): Promise<IQDocument[]> => {
    const response = await apiClient.get('/documents', { params: query ? { query } : undefined })
    return response.data
  },

  get: async (documentId: string): Promise<IQDocument> => {
    const response = await apiClient.get(`/documents/${documentId}`)
    return response.data
  },

  create: async (payload: {
    title: string
    initial_html?: string
    initial_text?: string
  }): Promise<IQDocument> => {
    const response = await apiClient.post('/documents', payload)
    return response.data
  },

  update: async (
    documentId: string,
    payload: { title?: string; html?: string; expected_version?: number }
  ): Promise<IQDocument> => {
    const response = await apiClient.patch(`/documents/${documentId}`, payload)
    return response.data
  },

  delete: async (documentId: string): Promise<void> => {
    await apiClient.delete(`/documents/${documentId}`)
  },

  proposeEdit: async (
    documentId: string,
    payload: { instruction: string; selected_text: string; document_text: string }
  ): Promise<IQEditProposal> => {
    const response = await apiClient.post(`/documents/${documentId}/iq/propose`, payload)
    return { ...response.data.proposal, provider: response.data.provider }
  },

  applyEdit: async (
    documentId: string,
    payload: { original: string; replacement: string; expected_version: number }
  ): Promise<IQDocument> => {
    const response = await apiClient.post(`/documents/${documentId}/iq/apply`, payload)
    return response.data.document
  },

  editorConfig: async (documentId: string): Promise<OnlyOfficeEditorConfig> => {
    const response = await apiClient.get(`/documents/${documentId}/editor-config`)
    return response.data
  },

  exportDocx: async (documentId: string): Promise<Blob> => {
    const response = await apiClient.get(`/documents/${documentId}/export`, {
      responseType: 'blob',
    })
    return response.data
  },
}
