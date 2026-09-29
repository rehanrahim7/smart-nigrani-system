/**
 * App shell and routing.
 *
 * One header for the whole site, public and signed in, so moving from the
 * front page into a dashboard feels like one application rather than two.
 * The screen comes from the address (see router.ts); the signed-in account
 * decides which workspace #/dashboard shows.
 */

import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './auth'
import { ThemeProvider, ThemeToggle } from './theme'
import { Wordmark } from './components/Brand'
import { Splash } from './components/Splash'
import { Landing } from './pages/Landing'
import { Works } from './pages/Works'
import { WorkPage } from './pages/WorkPage'
import { Login } from './pages/Login'
import { HowItWorks } from './pages/HowItWorks'
import { MpDashboard } from './pages/MpDashboard'
import { VendorDashboard } from './pages/VendorDashboard'
import { AgencyDashboard } from './pages/AgencyDashboard'
import { ResearchWorkspace } from './pages/ResearchWorkspace'
import { ROLE_NAME, properName } from './format'
import { href, navigate, useRoute } from './router'

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
  const { user, checking } = useAuth()
  const route = useRoute()
  const page = route.segments[0] ?? ''

  // Keep the address honest about what is on screen. Somebody signed out
  // cannot sit on the dashboard, and somebody signed in has no use for the
  // sign-in form. Replace, so the back button does not bounce between them.
  useEffect(() => {
    if (checking) return
    if (user && page === 'signin') navigate(route.params.get('next') || '#/dashboard', { replace: true })
    else if (!user && page === 'dashboard') navigate(href('/signin', { next: window.location.hash }), { replace: true })
  }, [user, checking, page, route.params])

  // New page, top of the page. Within a page (a filter, a tab) the scroll
  // position is left alone.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [page, route.segments[1]])

  if (checking) {
    return (
      <div className="col" style={{ minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <span className="spinner" style={{ width: 18, height: 18 }} />
        <span className="label">Loading</span>
      </div>
    )
  }

  if (page === 'signin') return <Login />

  const workspace = page === 'dashboard' && user
  return (
    <div className={workspace ? 'app-shell' : 'site'}>
      {page === '' && <Splash />}
      <SiteHeader page={page} />
      <main className={workspace ? 'app-body' : 'site-body'} id="main">
        {page === '' && <Landing />}
        {page === 'works' && <Works />}
        {page === 'work' && route.segments[1] && <WorkPage id={route.segments[1]} key={route.segments[1]} />}
        {page === 'how-it-works' && <HowItWorks />}
        {workspace && <Dashboard />}
        {!['', 'works', 'work', 'how-it-works', 'dashboard'].includes(page) && <NotFound />}
      </main>
    </div>
  )
}

function Dashboard() {
  const { user } = useAuth()
  if (!user) return null
  switch (user.role) {
    case 'mp':
      return <MpDashboard />
    case 'agency':
      return <AgencyDashboard />
    case 'analyst':
      return <ResearchWorkspace />
    default:
      return <VendorDashboard />
  }
}

const NAV = [
  { page: '', label: 'Explore', to: '#/' },
  { page: 'works', label: 'Public works', to: '#/works' },
  { page: 'how-it-works', label: 'How it works', to: '#/how-it-works' },
]

function SiteHeader({ page }: { page: string }) {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [page])

  return (
    <header className="site-header">
      <a href={user ? '#/dashboard' : '#/'} className="site-brand" aria-label="Smart Nigrani System home">
        <Wordmark />
      </a>

      <nav className={`site-nav${open ? ' open' : ''}`} aria-label="Main">
        {NAV.map((item) => (
          <a key={item.page} href={item.to} className={page === item.page ? 'active' : ''} aria-current={page === item.page ? 'page' : undefined}>
            {item.label}
          </a>
        ))}
        {user && (
          <a href="#/dashboard" className={page === 'dashboard' ? 'active' : ''} aria-current={page === 'dashboard' ? 'page' : undefined}>
            {user.role === 'analyst' ? 'Research workspace' : 'My workspace'}
          </a>
        )}
      </nav>

      <span className="grow" />

      {user && (
        <span className="col site-identity" title={user.name}>
          <span className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>
            {user.name}
          </span>
          <span className="label">
            {ROLE_NAME[user.role]}
            {user.constituency ? ` · ${properName(user.constituency)}` : ''}
          </span>
        </span>
      )}

      <ThemeToggle />

      {user ? (
        <button type="button" className="btn btn-sm" onClick={signOut}>
          Sign out
        </button>
      ) : (
        <a className="btn btn-primary btn-sm" href={href('/signin', { next: window.location.hash })}>
          Sign in
        </a>
      )}

      <button
        type="button"
        className="btn btn-sm btn-icon site-menu"
        aria-expanded={open}
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </header>
  )
}

function NotFound() {
  return (
    <div className="empty-state" style={{ margin: '60px auto' }}>
      <h1 className="h1">That page does not exist</h1>
      <p className="dim">The address may be mistyped, or from an older version of the site.</p>
      <a className="btn btn-primary" href="#/">
        Go to the front page
      </a>
    </div>
  )
}
