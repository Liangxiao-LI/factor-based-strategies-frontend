import { useEffect, useState } from 'react'
import { ApiError, getDownload, getTables, listDownloads, type DownloadJob } from './api'
import DownloadForm from './components/DownloadForm'
import FileList from './components/FileList'
import JobList, { type JobRow } from './components/JobList'

const POLL_MS = 2000

function isActive(job: JobRow): boolean {
  return !job.lost && (job.status === 'pending' || job.status === 'running')
}

export default function App() {
  const [tables, setTables] = useState<Record<string, string[]> | null>(null)
  const [jobs, setJobs] = useState<JobRow[]>([])
  // Shown at the top of the page when the backend cannot be reached
  const [backendError, setBackendError] = useState<string | null>(null)
  // Bumped to reload tables and jobs (loadKey) or the file list (filesKey)
  const [loadKey, setLoadKey] = useState(0)
  const [filesKey, setFilesKey] = useState(0)

  useEffect(() => {
    let ignore = false
    Promise.all([getTables(), listDownloads()])
      .then(([t, j]) => {
        if (ignore) return
        setTables(t)
        setJobs(j)
      })
      .catch((err: Error) => { if (!ignore) setBackendError(err.message) })
    return () => { ignore = true }
  }, [loadKey])

  function retry() {
    setBackendError(null)
    setLoadKey((k) => k + 1)
    setFilesKey((k) => k + 1)
  }

  // New jobs go first; the backend may return a job already in the list
  function handleCreated(job: DownloadJob) {
    setJobs((prev) => [job, ...prev.filter((j) => j.job_id !== job.job_id)])
  }

  // Poll every pending or running job until all have finished. activeIds is a
  // string so the effect restarts only when the set of active jobs changes,
  // not on every poll result
  const activeIds = jobs.filter(isActive).map((j) => j.job_id).join(',')

  useEffect(() => {
    if (!activeIds) return

    const timer = setInterval(() => {
      for (const id of activeIds.split(',')) {
        getDownload(id)
          .then((job) => {
            setJobs((prev) => prev.map((j) => (j.job_id === id ? job : j)))
            if (job.status === 'done') setFilesKey((k) => k + 1)
          })
          .catch((err) => {
            if (!(err instanceof ApiError)) return
            // 404: the backend restarted and forgot the job, so stop polling it
            if (err.status === 404) {
              setJobs((prev) => prev.map((j) => (j.job_id === id ? { ...j, lost: true } : j)))
            } else if (err.unreachable) {
              setBackendError(err.message)
            }
          })
      }
    }, POLL_MS)

    return () => clearInterval(timer)
  }, [activeIds])

  return (
    <main>
      <h1>Sharadar 数据下载</h1>

      {backendError && (
        <div className="banner">
          <span>{backendError}</span>
          <button type="button" onClick={retry}>重试</button>
        </div>
      )}

      {tables
        ? <DownloadForm tables={tables} onCreated={handleCreated} />
        : !backendError && <p className="muted">加载中…</p>}

      <JobList jobs={jobs} />
      <FileList refreshKey={filesKey} />
    </main>
  )
}
