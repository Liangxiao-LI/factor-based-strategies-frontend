import { useEffect, useState } from 'react'
import { listFiles, type FileInfo } from '../api'
import { formatBytes, formatTime } from '../format'

// nginx serves data/bronze/ under /files/bronze/ (see deploy/nginx.conf); the
// dev server does not, so these links only work on EC2
function fileUrl(path: string) {
  return '/files/' + path.split('/').map(encodeURIComponent).join('/')
}

// Downloaded files in data/bronze/. The list reloads whenever refreshKey
// changes, which the parent bumps when a download finishes
export default function FileList({ refreshKey }: { refreshKey: number }) {
  const [files, setFiles] = useState<FileInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let ignore = false
    listFiles()
      .then((f) => { if (!ignore) { setFiles(f); setError(null) } })
      .catch((e: Error) => { if (!ignore) setError(e.message) })
    return () => { ignore = true }
  }, [refreshKey, reloads])

  return (
    <section className="card">
      <h2>
        已下载文件
        <button type="button" className="link" onClick={() => setReloads((n) => n + 1)}>刷新</button>
      </h2>
      {error && <p className="error">{error}</p>}
      {!files && !error && <p className="muted">加载中…</p>}
      {files && files.length === 0 && <p className="muted">data/bronze/ 里还没有文件</p>}
      {files && files.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>路径（相对 data/）</th>
              <th className="num">大小</th>
              <th>修改时间</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.path}>
                <td><a href={fileUrl(f.path)} download><code>{f.path}</code></a></td>
                <td className="num">{formatBytes(f.size)}</td>
                <td>{formatTime(f.modified_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
