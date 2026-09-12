/** Small hooks shared across screens. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Run an async loader, cancelling the previous run when dependencies change.
 *
 * The abort signal matters for the project list: typing in the search box
 * fires a request per keystroke, and without cancellation a slow early
 * response can land after a fast later one and overwrite it.
 */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  })
  const [nonce, setNonce] = useState(0)

  // Hold the loader in a ref so callers can pass an inline arrow function
  // without it retriggering the effect on every render.
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    const controller = new AbortController()
    let live = true

    setState((previous) => ({ ...previous, loading: true, error: null }))

    loaderRef
      .current(controller.signal)
      .then((data) => {
        if (live) setState({ data, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (!live) return
        if ((error as Error)?.name === 'AbortError') return
        // A 401 is handled globally by signing the user out; showing an error
        // panel as well would be noise on top of a redirect.
        if (error instanceof ApiError && error.status === 401) return
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Something went wrong',
        })
      })

    return () => {
      live = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { ...state, reload }
}

/** Delay a fast-changing value, used so search does not fire per keystroke. */
export function useDebounced<T>(value: T, delay = 260): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

/** Escape key, for closing the project drawer. */
export function useEscape(handler: () => void, active = true) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handlerRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}
