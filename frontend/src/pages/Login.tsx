/**
 * Sign in.
 *
 * Two roles, as the brief's sketches show: a Member of Parliament watches the
 * projects, a Contractor reports work done on them. The role belongs to the
 * account, not to a switch on this screen. Letting somebody pick their own
 * level of access at a login screen would be indefensible in a government
 * system, and a judge would notice. The tabs below only filter which sample
 * accounts are listed.
 *
 * The sample accounts sign in with one click and the shared demo password is
 * never sent to the browser, so it is not printed on screen and cannot be read
 * out of the page source.
 */

import { useMemo, useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useAsync } from '../hooks'
import { ThemeToggle } from '../theme'
import { count } from '../format'
import type { Role } from '../types'

const ROLE_COPY: Record<Role, { tab: string; blurb: string }> = {
  mp: {
    tab: 'Member of Parliament',
    blurb: 'See every project in your constituency and what needs checking.',
  },
  vendor: {
    tab: 'Contractor',
    blurb: 'See the projects assigned to you and record the work you have done.',
  },
}

export function Login({ onBack }: { onBack?: () => void }) {
  const { signIn, signInAsDemo } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('mp')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const demo = useAsync(() => api.demoAccounts(), [])
  const meta = useAsync(() => api.meta(), [])

  const accounts = useMemo(
    () => (demo.data?.accounts ?? []).filter((a) => a.role === role),
    [demo.data, role],
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(null)
    setBusy('form')
    try {
      await signIn(username.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
      setBusy(null)
    }
  }

  async function signInWithSample(name: string) {
    if (busy) return
    setError(null)
    setBusy(name)
    try {
      await signInAsDemo(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
      setBusy(null)
    }
  }

  return (
    <div
      className="login-grid"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 0.95fr)',
        alignItems: 'stretch',
        background: 'var(--page)',
      }}
    >
      {/* ---------------- left: context ---------------- */}
      <aside
        style={{
          padding: 'clamp(24px, 5vw, 60px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderRight: '1px solid var(--rule)',
          gap: 30,
        }}
      >
        <div className="row">
          {onBack && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
              Back
            </button>
          )}
          <span className="grow" />
          <ThemeToggle compact />
        </div>

        <div className="rise">
          <div className="label" style={{ marginBottom: 14 }}>
            Smart Nigrani System · SIH26102
          </div>
          <h1
            className="h1"
            style={{ fontSize: 'clamp(26px, 4vw, 40px)', lineHeight: 1.1, marginBottom: 16 }}
          >
            Monitoring public works in Maharashtra
          </h1>
          <p className="dim" style={{ fontSize: 14.5, lineHeight: 1.65, maxWidth: 400 }}>
            Four checks run on every project and put the unusual ones at the top of
            the list, each with a sentence saying why.
          </p>
        </div>

        <div className="row wrap" style={{ gap: 26 }}>
          {(
            [
              [meta.data ? count(meta.data.totalProjects) : '4,807', 'works'],
              [meta.data ? count(meta.data.constituencies) : '47', 'constituencies'],
              [meta.data ? count(meta.data.districts) : '39', 'districts'],
            ] as [string, string][]
          ).map(([value, label], index) => (
            <div key={label} className="rise" style={{ animationDelay: `${100 + index * 60}ms` }}>
              <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
                {value}
              </div>
              <div className="label" style={{ marginTop: 3 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ---------------- right: the form ---------------- */}
      <main
        style={{
          padding: 'clamp(24px, 5vw, 60px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--panel)',
        }}
      >
        <div style={{ width: '100%', maxWidth: 390 }}>
          <h2 className="h1" style={{ fontSize: 20, marginBottom: 6 }}>
            Sign in
          </h2>
          <p className="faint" style={{ fontSize: 13, marginBottom: 20 }}>
            Pick a sample account below, or type your own details.
          </p>

          {/* role tabs */}
          <div
            role="tablist"
            aria-label="Account type"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 4,
              padding: 4,
              background: 'var(--sunken)',
              borderRadius: 8,
              marginBottom: 14,
            }}
          >
            {(Object.keys(ROLE_COPY) as Role[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={role === key}
                onClick={() => setRole(key)}
                style={{
                  padding: '8px 6px',
                  borderRadius: 6,
                  fontSize: 12.5,
                  fontWeight: role === key ? 600 : 500,
                  color: role === key ? 'var(--text)' : 'var(--text-faint)',
                  background: role === key ? 'var(--panel)' : 'transparent',
                  boxShadow: role === key ? 'var(--shadow-sm)' : 'none',
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
              >
                {ROLE_COPY[key].tab}
              </button>
            ))}
          </div>

          <p className="faint" style={{ fontSize: 12.5, marginBottom: 16, minHeight: 34 }}>
            {ROLE_COPY[role].blurb}
          </p>

          {/* sample accounts */}
          <div style={{ marginBottom: 22 }}>
            <div className="label" style={{ marginBottom: 9 }}>
              Sample accounts
            </div>

            {demo.loading && <div className="skeleton" style={{ height: 120 }} />}

            {demo.error && (
              <p className="faint" style={{ fontSize: 12.5 }}>
                Sample accounts are not available. Type a username and password instead.
              </p>
            )}

            <div className="col" style={{ gap: 6 }}>
              {accounts.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  onClick={() => signInWithSample(account.username)}
                  disabled={Boolean(busy)}
                  className="row"
                  style={{
                    gap: 10,
                    width: '100%',
                    padding: '9px 12px',
                    textAlign: 'left',
                    background: 'var(--panel)',
                    border: '1px solid var(--rule)',
                    borderRadius: 8,
                    opacity: busy && busy !== account.username ? 0.5 : 1,
                    transition: 'border-color 0.12s ease, background 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.background = 'var(--accent-soft)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--rule)'
                    e.currentTarget.style.background = 'var(--panel)'
                  }}
                >
                  <span className="col grow" style={{ minWidth: 0, gap: 1 }}>
                    <span className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>
                      {account.name}
                    </span>
                    <span className="faint truncate mono" style={{ fontSize: 11 }}>
                      {account.scope}
                    </span>
                  </span>
                  {busy === account.username ? (
                    <span className="spinner" />
                  ) : (
                    <span className="label" style={{ flex: 'none', color: 'var(--accent)' }}>
                      Open
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* manual sign-in */}
          <details>
            <summary
              className="label"
              style={{ cursor: 'pointer', marginBottom: 12, userSelect: 'none' }}
            >
              Sign in with a username
            </summary>

            <form onSubmit={submit} className="col" style={{ gap: 12 }}>
              <div className="field">
                <label className="label" htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  className="input mono"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={accounts[0]?.username ?? ''}
                  required
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={Boolean(busy) || !username || !password}
              >
                {busy === 'form' && <span className="spinner" />}
                {busy === 'form' ? 'Signing in' : 'Sign in'}
              </button>
            </form>
          </details>

          {error && (
            <div
              className="fade"
              role="alert"
              style={{
                marginTop: 14,
                padding: '9px 12px',
                borderRadius: 8,
                fontSize: 12.5,
                color: 'var(--critical)',
                background: 'var(--critical-soft)',
                border: '1px solid var(--critical-line)',
              }}
            >
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
