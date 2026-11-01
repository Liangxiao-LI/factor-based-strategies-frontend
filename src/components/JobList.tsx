import type { DownloadJob } from '../api'
import { formatTime } from '../format'

// A job as shown on the page; lost means the backend no longer knows it
// (it restarted and jobs only live in its memory)
export type JobRow = DownloadJob & { lost?: boolean }

const STATUS_TEXT: Record<DownloadJob['status'], string> = {
  pending: '排队中',
  running: '下载中',
  done: '完成',
  failed: '失败',
}

// "ticker=SPY date=2024-01-01~2024-01-31 · 3 列 · limit 10"
function describe(request: DownloadJob['request']): string {
  const parts = Object.entries(request.filters).map(([column, value]) => {
    if (Array.isArray(value)) return `${column}=${value.join(',')}`
    if (typeof value === 'object') {
      const from = value.gte ?? value.gt ?? ''
      const to = value.lte ?? value.lt ?? ''
      return `${column}=${from}~${to}`
    }
    return `${column}=${value}`
  })
  if (parts.length === 0) parts.push('整表')
  if (request.columns) parts.push(`· ${request.columns.length} 列`)
  if (request.limit) parts.push(`· limit ${request.limit}`)
  if (request.overwrite) parts.push('· overwrite')
  return parts.join(' ')
}

export default function JobList({ jobs }: { jobs: JobRow[] }) {
  return (
    <section className="card">
      <h2>下载任务</h2>
      {jobs.length === 0 ? (
        <p className="muted">后端启动以来还没有任务</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>创建时间</th>
              <th>表</th>
              <th>参数</th>
              <th>状态</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.job_id}>
                <td>{formatTime(job.created_at)}</td>
                <td>{job.request.product} / {job.request.table}</td>
                <td>{describe(job.request)}</td>
                <td>
                  {job.lost
                    ? <span className="status lost">已丢失</span>
                    : <span className={`status ${job.status}`}>{STATUS_TEXT[job.status]}</span>}
                </td>
                <td className="result">
                  {job.lost && <span className="muted">后端重启过，任务记录已不存在</span>}
                  {job.path && <code>{job.path}</code>}
                  {job.error && <span className="error">{job.error}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
