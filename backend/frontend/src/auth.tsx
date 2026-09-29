/** Session state: who is signed in, and the sign in / sign out actions. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, setUnauthorisedHandler, tokenStore } from './api'
import type { User } from './types'

interface AuthValue {
  user: User | null
  /** True only while the stored token is being checked on first load. */
  checking: boolean
  signIn: (username: string, password: string) => Promise<User>
  /** One click sign-in for a listed sample account. */
  signInAsDemo: (username: string) => Promise<User>
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)

  const signOut = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  // The API client calls this when any request comes back 401, so an expired
  // token drops the whole app back to the sign-in screen rather than leaving
  // half-loaded panels behind.
  useEffect(() => {
    setUnauthorisedHandler(() => setUser(null))
  }, [])

  // Resume an existing session on load.
  useEffect(() => {
    const token = tokenStore.get()
    if (!token) {
      setChecking(false)
      return
    }

    const controller = new AbortController()
    let live = true

    api
      .me(controller.signal)
      .then((resumed) => {
        if (live) setUser(resumed)
      })
      .catch((error: unknown) => {
        // Only a real rejection from the server means the stored token is no
        // good. A cancelled request does NOT: React StrictMode runs this
        // effect twice in development and aborts the first call, and clearing
        // the token there silently signed the user out on every reload.
        if ((error as Error)?.name === 'AbortError') return
        tokenStore.clear()
      })
      .finally(() => {
        if (live) setChecking(false)
      })

    return () => {
      live = false
      controller.abort()
    }
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password)
    tokenStore.set(result.token)
    setUser(result.user)
    return result.user
  }, [])

  const signInAsDemo = useCallback(async (username: string) => {
    const result = await api.demoLogin(username)
    tokenStore.set(result.token)
    setUser(result.user)
    return result.user
  }, [])

  const value = useMemo(
    () => ({ user, checking, signIn, signInAsDemo, signOut }),
    [user, checking, signIn, signInAsDemo, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
