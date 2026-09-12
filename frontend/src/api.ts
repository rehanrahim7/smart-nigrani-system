/**
 * Typed API client.
 *
 * One place that knows about tokens, query strings and error shapes, so no
 * component ever touches fetch directly.
 */

import type {
  Charts,
  DemoAccount,
  Highlights,
  PublicMap,
  FilterOptions,
  Kpis,
  MapPoint,
  Meta,
  Paged,
  ProjectDetail,
  ProjectQuery,
  ProjectSummary,
  QueueItem,
  User,
  WorkLog,
  WorkLogCreated,
} from './types'

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ??
  'http://127.0.0.1:8000'

const TOKEN_KEY = 'sns.token'

/** Carries the HTTP status so callers can tell "signed out" from "broken". */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      // Private browsing can throw on storage access. Staying signed out is
      // a better failure than a white screen.
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

/** Called when the server rejects our token, so the app can sign out. */
let onUnauthorised: (() => void) | null = null
export function setUnauthorisedHandler(handler: () => void) {
  onUnauthorised = handler
}

function buildQuery(params: Record<string, unknown> = {}): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === 'all') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
  /** Skip the automatic sign-out on 401, used by the login call itself. */
  anonymous?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, anonymous = false } = options

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const token = tokenStore.get()
  if (token && !anonymous) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    // An aborted request is a normal part of switching pages, not a failure.
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiError(
      `Cannot reach the API at ${API_BASE}. Is the backend running?`,
      0,
    )
  }

  if (response.status === 401 && !anonymous) {
    tokenStore.clear()
    onUnauthorised?.()
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** FastAPI returns `detail` as a string, or as a list for validation errors. */
async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    const detail = data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length) {
      return detail
        .map((item: { loc?: unknown[]; msg?: string }) => {
          const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null
          const message = item.msg ?? 'Invalid value'
          // "Value error, Use a YYYY-MM-DD date" -> "Use a YYYY-MM-DD date"
          const cleaned = message.replace(/^Value error,\s*/, '')
          return field ? `${String(field)}: ${cleaned}` : cleaned
        })
        .join('. ')
    }
  } catch {
    /* fall through to the generic message */
  }
  return `Request failed (${response.status})`
}

/**
 * MPLADS work ids contain slashes, WS/MP681/2024-2025/143652, and the API
 * matches them with a :path converter. Encoding each segment separately keeps
 * the slashes as real path separators while escaping anything else.
 */
function encodeProjectId(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/')
}

export const api = {
  health: () => request<{ ok: boolean; projects: number; snapshot: string }>('/api/health'),
  meta: () => request<Meta>('/api/meta'),

  /** Public, no sign-in required. Used by the landing page. */
  highlights: (limit = 3) => request<Highlights>(`/api/public/highlights?limit=${limit}`),

  /** Public, no sign-in required. Every work as a dot for the landing page. */
  publicMap: () => request<PublicMap>('/api/public/map'),

  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      anonymous: true,
    }),

  me: (signal?: AbortSignal) => request<User>('/api/auth/me', { signal }),

  demoAccounts: () => request<{ accounts: DemoAccount[] }>('/api/auth/demo-accounts'),

  /** Sign in as one of the advertised sample accounts. The shared demo
   *  password is never sent to the browser, so it cannot be shown on screen
   *  or read out of the page source. */
  demoLogin: (username: string) =>
    request<{ token: string; user: User }>('/api/auth/demo-login', {
      method: 'POST',
      body: { username },
      anonymous: true,
    }),

  projects: (query: ProjectQuery = {}, signal?: AbortSignal) =>
    request<Paged<ProjectSummary>>(`/api/projects${buildQuery(query)}`, { signal }),

  mapPoints: (query: ProjectQuery = {}, signal?: AbortSignal) =>
    request<{ points: MapPoint[]; total: number; shown: number; truncated: boolean }>(
      `/api/projects/map${buildQuery(query)}`,
      { signal },
    ),

  filters: (signal?: AbortSignal) =>
    request<FilterOptions>('/api/projects/filters', { signal }),

  project: (id: string, signal?: AbortSignal) =>
    request<ProjectDetail>(`/api/projects/${encodeProjectId(id)}`, { signal }),

  works: (id: string, signal?: AbortSignal) =>
    request<WorkLog[]>(`/api/projects/${encodeProjectId(id)}/works`, { signal }),

  addWork: (
    id: string,
    payload: { work: string; cost: number; date: string; note?: string | null },
  ) =>
    request<WorkLogCreated>(`/api/projects/${encodeProjectId(id)}/works`, {
      method: 'POST',
      body: payload,
    }),

  deleteWork: (projectId: string, workId: string) =>
    request<{ deleted: string }>(
      `/api/projects/${encodeProjectId(projectId)}/works/${encodeURIComponent(workId)}`,
      { method: 'DELETE' },
    ),

  kpis: (signal?: AbortSignal) => request<Kpis>('/api/stats', { signal }),

  charts: (signal?: AbortSignal) => request<Charts>('/api/stats/charts', { signal }),

  reviewQueue: (limit = 10, signal?: AbortSignal) =>
    request<{ items: QueueItem[] }>(`/api/stats/review-queue?limit=${limit}`, { signal }),
}
