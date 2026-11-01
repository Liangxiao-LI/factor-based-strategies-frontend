import type { DownloadRequest, TableSchema } from './api'

type FilterValue = DownloadRequest['filters'][string]

// What the user typed for one filterable column: text for most columns, a
// start and end date for date columns
export type FilterDraft = { text: string; from: string; to: string }

export const emptyDraft: FilterDraft = { text: '', from: '', to: '' }

// Date columns have unittype "date (YYYY-MM-DD)" in INDICATORS. The ?. keeps
// the form usable (text inputs only) against a backend without types
export function isDateColumn(schema: TableSchema, column: string): boolean {
  return schema.types?.[column]?.startsWith('date') ?? false
}

// Turn a draft into a request filter, undefined when left empty:
// dates -> {gte, lte} with the filled ends; "SPY, QQQ" -> ["SPY", "QQQ"]; "SPY" -> "SPY"
export function toFilterValue(draft: FilterDraft, isDate: boolean): FilterValue | undefined {
  if (isDate) {
    const range: Record<string, string> = {}
    if (draft.from) range.gte = draft.from
    if (draft.to) range.lte = draft.to
    return Object.keys(range).length ? range : undefined
  }

  const values = draft.text.split(',').map((v) => v.trim()).filter(Boolean)
  if (values.length === 0) return undefined
  return values.length === 1 ? values[0] : values
}
