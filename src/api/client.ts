// Failed request, with a message ready to show on the page
export class ApiError extends Error {
  status: number
  // True when the backend never answered (network error, or the proxy in
  // front of it answered instead)
  unreachable: boolean

  constructor(status: number, message: string, unreachable: boolean) {
    super(message)
    this.status = status
    this.unreachable = unreachable
  }
}

// Call a backend endpoint under the same-origin /api prefix and return its
// JSON body; Vite (dev) or nginx (EC2) forwards /api to the backend
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError(0, '网络错误，无法访问 /api', true)
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw toApiError(res.status, body)
  }
  return body as T
}

// FastAPI errors carry detail: a string (404, 503) or a list of validation
// errors (422). A 5xx without detail comes from the proxy, because the backend
// is down
function toApiError(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown } | null)?.detail

  if (typeof detail === 'string') {
    return new ApiError(status, detail, false)
  }
  if (Array.isArray(detail)) {
    // Pydantic prefixes errors raised in validators with "Value error, "
    const msgs = detail.map((d: { msg: string }) => d.msg.replace(/^Value error, /, ''))
    return new ApiError(status, msgs.join('；'), false)
  }
  if (status >= 500) {
    return new ApiError(status, `连不上后端（HTTP ${status}），请确认后端已启动`, true)
  }
  return new ApiError(status, `请求失败（HTTP ${status}）`, false)
}
