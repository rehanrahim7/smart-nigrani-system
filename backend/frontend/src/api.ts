/**
 * Typed API client.
 *
 * One place that knows about tokens, query strings and error shapes, so no
 * component ever touches fetch directly.
 */

import type {
  Charts,
  DatasetEntry,
  DatasetSummary,
  DemoAccount,
  Evidence,
  ExpenseItem,
  NetworkData,
  ResearchOverview,
  Review,
  TeamMember,
  Updates,
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

/**
 * Where the backend lives.
 *
 * VITE_API_BASE is read when the site is BUILT, not when it is opened. So a
 * site built without it keeps calling 127.0.0.1 forever, and 127.0.0.1 on a
 * visitor's machine is their own computer, not the server. That is the single
 * most common reason a deployed copy of this shows no data: the address has to
 * be set in the hosting dashboard and the site rebuilt.
 */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ??
  'http://127.0.0.1:8000'

/** True when the page itself is being served from this machine. */
export function runningLocally(): boolean {
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === ''
}

/**
 * Why the API could not be reached, in words, aimed at whoever is looking at
 * the screen. Running it on a laptop and running it on the internet fail for
 * completely different reasons, so they get completely different advice.
 */
export function offlineHelp(): { title: string; steps: string[] } {
  if (runningLocally() && API_BASE.includes('127.0.0.1')) {
    return {
      title: 'Cannot reach the data server.',
      steps: [
        'Open the backend folder and run: uvicorn app.main:app --port 8000',
        'Then reload this page.',
      ],
    }
  }

  return {
    title: `Cannot reach the data server at ${API_BASE}.`,
    steps: [
      `Open ${API_BASE}/api/health in a new tab. If that does not load, the backend itself is down or still waking up. A free Render server sleeps after 15 minutes and takes about a minute to start, so wait and reload.`,
      'If it does load, the backend is running but is not letting this website read it. On the backend host, set CORS_ORIGINS to this site\'s address and restart.',
      'If the address above looks wrong, set VITE_API_BASE on the frontend host and build again. It is read at build time, so a rebuild is required.',
    ],
  }
}

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
    // Status 0 means the request never got an answer: the server is down, the
    // address is wrong, or the browser blocked the reply because the server
    // did not say this website is allowed to read it. The browser deliberately
    // does not tell us which, so the message has to cover all three.
    throw new ApiError(
      `Cannot reach the data server at ${API_BASE}. It may be asleep, the address may be wrong, or it may not be allowing this website to read it.`,
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
export function encodeProjectId(id: string): string {
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

  filters: (signal?: AbortSignal, dataset?: string) =>
    request<FilterOptions>(`/api/projects/filters${buildQuery({ dataset })}`, { signal }),

  project: (id: string, signal?: AbortSignal, dataset?: string) =>
    request<ProjectDetail>(`/api/projects/${encodeProjectId(id)}${buildQuery({ dataset })}`, { signal }),

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

  kpis: (signal?: AbortSignal, dataset?: string) => request<Kpis>(`/api/stats${buildQuery({ dataset })}`, { signal }),

  charts: (signal?: AbortSignal, dataset?: string) =>
    request<Charts>(`/api/stats/charts${buildQuery({ dataset })}`, { signal }),

  reviewQueue: (limit = 10, signal?: AbortSignal, dataset?: string) =>
    request<{ items: QueueItem[] }>(`/api/stats/review-queue${buildQuery({ limit, dataset })}`, { signal }),

  /* ---- public, no sign-in ---- */

  publicWorks: (query: ProjectQuery = {}, signal?: AbortSignal) =>
    request<Paged<ProjectSummary>>(`/api/public/works${buildQuery(query)}`, { signal }),

  publicWork: (id: string, signal?: AbortSignal) =>
    request<ProjectDetail>(`/api/public/works/${encodeProjectId(id)}`, { signal }),

  publicFilters: (signal?: AbortSignal) =>
    request<FilterOptions>('/api/public/filters', { signal }),

  network: (query: ProjectQuery = {}, signal?: AbortSignal) =>
    request<NetworkData>(`/api/public/network${buildQuery(query)}`, { signal }),

  /* ---- delivery ---- */

  addWorkItems: (
    id: string,
    payload: {
      work: string
      date: string
      note?: string | null
      cost?: number
      items?: ExpenseItem[]
      stage?: string
      progress?: number
      clientId: string
    },
  ) =>
    request<WorkLogCreated>(`/api/projects/${encodeProjectId(id)}/works`, { method: 'POST', body: payload }),

  addEvidence: (
    id: string,
    payload: {
      clientId: string
      photo: string
      note: string
      stage?: string
      progress?: number
      lat?: number
      lng?: number
      accuracy?: number
    },
  ) => request<Evidence>(`/api/projects/${encodeProjectId(id)}/evidence`, { method: 'POST', body: payload }),

  /** The photograph as a blob URL. Photos are private, so they cannot be a plain <img src>. */
  evidencePhoto: async (evidenceId: string): Promise<string> => {
    const token = tokenStore.get()
    let response: Response
    try {
      response = await fetch(`${API_BASE}/api/evidence/${encodeURIComponent(evidenceId)}/photo`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch {
      throw new ApiError(`Cannot reach the data server at ${API_BASE}.`, 0)
    }
    if (!response.ok) throw new ApiError(await readError(response), response.status)
    return URL.createObjectURL(await response.blob())
  },

  describePhoto: (evidenceId: string, consent: boolean) =>
    request<{ text: string; model: string; createdAt: string }>(
      `/api/evidence/${encodeURIComponent(evidenceId)}/vision`,
      { method: 'POST', body: { consent } },
    ),

  addReview: (
    id: string,
    payload: {
      clientId: string
      targetKind: 'work' | 'worklog' | 'evidence'
      targetId?: string
      decision: string
      note: string
      dataset?: string
    },
  ) => request<Review>(`/api/projects/${encodeProjectId(id)}/reviews`, { method: 'POST', body: payload }),

  team: (signal?: AbortSignal) =>
    request<{ members: TeamMember[]; canManage: boolean }>('/api/team', { signal }),

  addTeamMember: (payload: { username: string; name: string; role: 'vendor' | 'officer'; password: string }) =>
    request<TeamMember>('/api/team', { method: 'POST', body: payload }),

  registerProject: (payload: {
    clientId: string
    title: string
    description: string
    sector: string
    district: string
    budget: number
    sanctioned: string
    deadline: string
    contractor: string
    officer: string
  }) => request<ProjectDetail>('/api/registered', { method: 'POST', body: payload }),

  updates: (signal?: AbortSignal) => request<Updates>('/api/updates', { signal }),

  /* ---- research workspace ---- */

  datasets: (signal?: AbortSignal) =>
    request<{ active: string; datasets: DatasetEntry[] }>('/api/research/datasets', { signal }),

  chooseDataset: (id: string) =>
    request<{ active: string }>('/api/research/datasets/active', { method: 'POST', body: { id } }),

  importDataset: (payload: { asOf: string; name?: string; files: { name: string; text: string }[] }) =>
    request<{ id: string; name: string; summary: DatasetSummary; meta: Meta }>('/api/research/import', {
      method: 'POST',
      body: payload,
    }),

  researchOverview: (dataset?: string, signal?: AbortSignal) =>
    request<ResearchOverview>(`/api/research/overview${buildQuery({ dataset })}`, { signal }),

  researchNetwork: (query: ProjectQuery = {}, signal?: AbortSignal) =>
    request<NetworkData>(`/api/research/network${buildQuery(query)}`, { signal }),

  myReviews: (dataset?: string, signal?: AbortSignal) =>
    request<{ datasetId: string; items: Review[] }>(`/api/research/reviews${buildQuery({ dataset })}`, { signal }),
}
