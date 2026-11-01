import { request } from './client'
import type { components } from './schema'

export { ApiError } from './client'

// Types generated from the backend's /openapi.json (npm run gen:api)
type Schemas = components['schemas']
export type DownloadJob = Schemas['DownloadJob']
export type DownloadRequest = Schemas['DownloadRequest']
export type FileInfo = Schemas['FileInfo']
export type TableSchema = Schemas['TableSchema']
export type Product = DownloadRequest['product']
export type TableName = DownloadRequest['table']

// Tables of each product
export function getTables() {
  return request<Record<string, string[]>>('/tables')
}

// Columns, filterable columns, primary key and column types of a table
export function getTableSchema(table: string) {
  return request<TableSchema>(`/tables/${encodeURIComponent(table)}/schema`)
}

// Start a download; the backend may return an existing running or done job
export function createDownload(body: DownloadRequest) {
  return request<DownloadJob>('/downloads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// All jobs since the backend started, newest first
export function listDownloads() {
  return request<DownloadJob[]>('/downloads')
}

export function getDownload(jobId: string) {
  return request<DownloadJob>(`/downloads/${encodeURIComponent(jobId)}`)
}

// Downloaded files in data/bronze/, newest first
export function listFiles() {
  return request<FileInfo[]>('/files')
}
