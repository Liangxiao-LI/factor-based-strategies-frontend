import { useEffect, useState, type FormEvent } from 'react'
import {
  createDownload,
  getTableSchema,
  type DownloadJob,
  type DownloadRequest,
  type Product,
  type TableName,
  type TableSchema,
} from '../api'
import { emptyDraft, isDateColumn, toFilterValue, type FilterDraft } from '../filters'
import FilterInput from './FilterInput'

type Props = {
  tables: Record<string, string[]>
  onCreated: (job: DownloadJob) => void
}

// Form that builds a DownloadRequest: product -> table -> filters and columns
// from the table schema -> limit and overwrite
export default function DownloadForm({ tables, onCreated }: Props) {
  const [product, setProduct] = useState('')
  const [table, setTable] = useState('')

  const [schema, setSchema] = useState<TableSchema | null>(null)
  const [schemaError, setSchemaError] = useState<string | null>(null)

  const [drafts, setDrafts] = useState<Record<string, FilterDraft>>({})
  const [columns, setColumns] = useState<string[]>([])
  const [limit, setLimit] = useState('')
  const [overwrite, setOverwrite] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Load the schema of the chosen table. ignore drops a slow response for a
  // table the user already switched away from
  useEffect(() => {
    if (!table) return
    let ignore = false
    getTableSchema(table)
      .then((s) => { if (!ignore) setSchema(s) })
      .catch((e: Error) => { if (!ignore) setSchemaError(e.message) })
    return () => { ignore = true }
  }, [table])

  // Filters and columns belong to one table, so reset them with it
  function chooseTable(next: string) {
    setTable(next)
    setSchema(null)
    setSchemaError(null)
    setDrafts({})
    setColumns([])
    setSubmitError(null)
  }

  function chooseProduct(next: string) {
    setProduct(next)
    chooseTable('')
  }

  function toggleColumn(column: string, checked: boolean) {
    setColumns((prev) => (checked ? [...prev, column] : prev.filter((c) => c !== column)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    // Only filled-in filters go into the request
    const filters: DownloadRequest['filters'] = {}
    for (const column of schema?.filters ?? []) {
      const value = toFilterValue(drafts[column] ?? emptyDraft, isDateColumn(schema!, column))
      if (value !== undefined) filters[column] = value
    }

    const body: DownloadRequest = {
      product: product as Product,
      table: table as TableName,
      filters,
      overwrite,
    }
    // Keep the schema's column order; none chosen means all columns
    if (columns.length > 0) body.columns = schema!.columns.filter((c) => columns.includes(c))
    if (limit) body.limit = Number(limit)

    setSubmitting(true)
    setSubmitError(null)
    try {
      onCreated(await createDownload(body))
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>发起下载</h2>

      <div className="row">
        <label className="field">
          <span>Product</span>
          <select value={product} onChange={(e) => chooseProduct(e.target.value)}>
            <option value="">请选择</option>
            {Object.keys(tables).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Table</span>
          <select value={table} disabled={!product} onChange={(e) => chooseTable(e.target.value)}>
            <option value="">请选择</option>
            {(tables[product] ?? []).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      {table && !schema && !schemaError && <p className="muted">正在读取 {table} 的列信息…</p>}
      {schemaError && <p className="error">{schemaError}</p>}

      {schema && (
        <>
          <fieldset>
            <legend>过滤条件（留空表示不过滤）</legend>
            {schema.filters.length === 0 && <p className="muted">这张表没有可过滤的列</p>}
            {schema.filters.map((column) => (
              <FilterInput
                key={column}
                column={column}
                isDate={isDateColumn(schema, column)}
                draft={drafts[column] ?? emptyDraft}
                onChange={(draft) => setDrafts((prev) => ({ ...prev, [column]: draft }))}
              />
            ))}
          </fieldset>

          <fieldset>
            <legend>
              列（不勾选表示全部 {schema.columns.length} 列，已选 {columns.length}）
              {columns.length > 0 && (
                <button type="button" className="link" onClick={() => setColumns([])}>清空</button>
              )}
            </legend>
            <div className="columns">
              {schema.columns.map((column) => (
                <label key={column} className="check">
                  <input
                    type="checkbox"
                    checked={columns.includes(column)}
                    onChange={(e) => toggleColumn(column, e.target.checked)}
                  />
                  {column}
                  {schema.keys.includes(column) && <small className="muted"> (主键)</small>}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <div className="row">
        <label className="field">
          <span>Limit（留空表示全部行）</span>
          <input type="number" min={1} step={1} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          今天已下载过也重新下载（overwrite）
        </label>
      </div>

      <button type="submit" disabled={!table || submitting}>
        {submitting ? '提交中…' : '开始下载'}
      </button>
      {submitError && <p className="error">{submitError}</p>}
    </form>
  )
}
