/**
 * App shell and routing.
 *
 * Routing is a small piece of state rather than a router library: there are
 * four destinations and the signed-in role decides which dashboard you get.
 * A router would add a dependency and more code for no behaviour we need.
 */

import { useCallback, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './auth'
import { ThemeProvider, ThemeToggle } from './theme'
import { Landing, Wordmark } from './pages/Landing'
import { Login } from './pages/Login'
import { HowItWorks } from './pages/HowItWorks'
import { MpDashboard } from './pages/MpDashboard'
import { VendorDashboard } from './pages/VendorDashboard'
import { ProjectDetail } from './pages/ProjectDetail'
import { properName } from './format'

type View = 'landing' | 'login' | 'how' | 'dashboard'

/**
 * Routing, using the part of the address after the # symbol.
 *
 * Three addresses:
 *   #/           the public page
 *   #/signin     the sign-in screen
 *   #/dashboard  the dashboard, which needs an account
 *
 * The # is used rather than real paths because this site is served as a
 * single file. With real paths, refreshing the page on /dashboard would ask
 * the server for a file that does not exist and return 404. Everything after
 * the # is handled by the browser and never sent to the server, so refreshing
 * and sharing a link both work with no server configuration.
 */
const ROUTES: Record<string, View> = {
  '#/': 'landing',
  '': 'landing',
  '#/signin': 'login',
  '#/how-it-works': 'how',
  '#/dashboard': 'dashboard',
}

function viewFromHash(): View {
  return ROUTES[window.location.hash] ?? 'landing'
}

function goTo(view: View) {
  const hash =
    view === 'landing'
      ? '#/'
      : view === 'login'
        ? '#/signin'
        : view === 'how'
          ? '#/how-it-works'
          : '#/dashboard'
  if (window.location.hash !== hash) window.location.hash = hash
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ThemeProvider>
  )
}

function Shell() {
  const { user, checking, signOut } = useAuth()
  const [view, setView] = useState<View>(viewFromHash)
  const [openProject, setOpenProject] = useState<string | null>(null)

  // Follow the address bar, including the back and forward buttons.
  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Keep the address honest about what is on screen. Somebody signed out
  // cannot sit on #/dashboard, and somebody signed in has no use for the
  // sign-in form. Everything else stays where the address bar says, so a
  // signed-in person can still read #/how-it-works.
  useEffect(() => {
    if (checking) return
    if (user && (view === 'login' || view === 'landing')) goTo('dashboard')
    else if (!user && view === 'dashboard') goTo('landing')
  }, [user, checking, view])

  // Close the project panel when the session ends, so it cannot be left
  // hanging over the sign-in screen.
  useEffect(() => {
    if (!user) setOpenProject(null)
  }, [user])

  const open = useCallback((id: string) => setOpenProject(id), [])
  const close = useCallback(() => setOpenProject(null), [])

  if (checking) {
    return (
      <div
        className="col"
        style={{ minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', gap: 12 }}
      >
        <span className="spinner" style={{ width: 18, height: 18 }} />
        <span className="label">Loading</span>
      </div>
    )
  }

  if (!user) {
    if (view === 'login') return <Login onBack={() => goTo('landing')} />
    if (view === 'how') {
      return <HowItWorks onSignIn={() => goTo('login')} onHome={() => goTo('landing')} />
    }
    return <Landing onSignIn={() => goTo('login')} onHowItWorks={() => goTo('how')} />
  }

  // Signed in, but reading the explainer rather than the dashboard.
  if (view === 'how') {
    return (
      <HowItWorks
        signedIn
        onSignIn={() => goTo('dashboard')}
        onHome={() => goTo('dashboard')}
      />
    )
  }

  const isVendor = user.role === 'vendor'

  return (
    <div className="app-shell">
      <TopBar onSignOut={signOut} onHowItWorks={() => goTo('how')} />

      <main className="app-body">
        {isVendor ? (
          <VendorDashboard onOpenProject={open} />
        ) : (
          <MpDashboard onOpenProject={open} />
        )}
      </main>

      {openProject && (
        <ProjectDetail
          key={openProject}
          projectId={openProject}
          onClose={close}
          onOpenProject={open}
        />
      )}
    </div>
  )
}

function TopBar({
  onSignOut,
  onHowItWorks,
}: {
  onSignOut: () => void
  onHowItWorks: () => void
}) {
  const { user } = useAuth()
  if (!user) return null

  const roleLabel = user.role === 'mp' ? 'Member of Parliament' : 'Contractor'
  const scope =
    user.role === 'mp' ? properName(user.constituency) : properName(user.districtKey)

  return (
    <header
      className="row topbar"
      style={{
        borderBottom: '1px solid var(--rule)',
        background: 'var(--panel)',
        flex: 'none',
      }}
    >
      <Wordmark />

      <span
        className="label topbar-role"
        style={{
          padding: '3px 9px',
          border: '1px solid var(--rule)',
          borderRadius: 999,
          whiteSpace: 'nowrap',
        }}
      >
        {roleLabel}
      </span>

      <span className="grow" />

      <span className="col topbar-identity" style={{ alignItems: 'flex-end', gap: 1, minWidth: 0 }}>
        <span className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>
          {user.name}
        </span>
        <span className="label" style={{ letterSpacing: '0.07em' }}>
          {scope}
        </span>
      </span>

      <button className="btn btn-sm topbar-how" onClick={onHowItWorks}>
        How it works
      </button>

      {/* Same link, shrunk to a single character, for a phone-width bar. */}
      <button
        className="btn btn-sm btn-icon topbar-how-compact"
        onClick={onHowItWorks}
        aria-label="How it works"
        title="How it works"
      >
        ?
      </button>

      <ThemeToggle compact />

      <button className="btn btn-sm" onClick={onSignOut}>
        Sign out
      </button>
    </header>
  )
}
