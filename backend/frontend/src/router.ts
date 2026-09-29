/**
 * Routing, using the part of the address after the # symbol.
 *
 *   #/                         the public front page
 *   #/works?sector=…&page=2    the public register of works, with its filters
 *   #/work/<id>?tab=peers      one work, on the chosen tab
 *   #/how-it-works             the explainer
 *   #/signin                   sign in
 *   #/dashboard?tab=…          the signed-in workspace for the account's role
 *
 * Filters, the open tab and the selected work all live in the address. That
 * is what makes refresh, the back button and a shared link land on exactly
 * the same screen, instead of each page quietly resetting.
 *
 * The # is used rather than real paths because this site is served as a
 * single file. With real paths, refreshing on /dashboard would ask the server
 * for a file that does not exist. Everything after the # stays in the browser.
 */

import { useEffect, useState } from 'react'

export interface Route {
  /** "/work/WS%2FMP681%2F…", undecoded, without the query. */
  path: string
  /** Decoded path pieces: ["work", "WS/MP681/2024-2025/143652"]. */
  segments: string[]
  params: URLSearchParams
}

export function parseHash(hash: string = window.location.hash): Route {
  const raw = hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?', 2)
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((piece) => {
      try {
        return decodeURIComponent(piece)
      } catch {
        return piece
      }
    })
  return { path: path || '/', segments, params: new URLSearchParams(query) }
}

type Params = Record<string, string | number | null | undefined>

/** Build "#/path?x=1". Empty values, and "all", are left out to keep links short. */
export function href(path: string, params: Params = {}): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '' || value === 'all') continue
    query.set(key, String(value))
  }
  const text = query.toString()
  return `#${path}${text ? `?${text}` : ''}`
}

/** The address of one work. Its id contains slashes, so it is encoded as one piece. */
export function workHref(id: string, params: Params = {}): string {
  return href(`/work/${encodeURIComponent(id)}`, params)
}

export function navigate(target: string, { replace = false } = {}) {
  const next = target.startsWith('#') ? target : `#${target}`
  if (window.location.hash === next) return
  if (replace) {
    replacing = true
    history.replaceState(history.state, '', next)
    // replaceState does not announce itself; tell the app the address moved.
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = next
  }
}

/**
 * Change some query values of the current address, keeping the rest. Filters
 * use replace so typing in a search box does not fill the back button with
 * one entry per letter.
 */
export function setParams(update: Params, { replace = true } = {}) {
  const current = parseHash()
  const merged: Params = Object.fromEntries(current.params.entries())
  Object.assign(merged, update)
  navigate(href(current.path, merged), { replace })
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash())
  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

/*
 * How many history entries this page load has added. "Back" uses the
 * browser's own history when there is some, and a sensible parent page when
 * the visitor arrived by a direct link and there is nothing to go back to.
 */
let moves = 0
let replacing = false
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    if (replacing) replacing = false
    else moves += 1
  })
}

export function goBack(fallback: string) {
  if (moves > 0) {
    moves -= 2 // the back step itself fires one more hashchange
    history.back()
    return
  }
  navigate(fallback)
}
