/**
 * Contractor and field officer dashboard.
 *
 * Sketch 2: a plain list of the projects assigned to this person. Click one,
 * get its work table (contractor) or its field reports (officer).
 *
 * This screen is for recording work and nothing else. No score, no flag, no
 * "needs attention" count. The four checks run on what is recorded here, but
 * what they conclude belongs on the member's screen, not in front of the
 * person doing the entering. That is not a matter of hiding it either: the
 * server never sends a contractor any of it.
 *
 * Scope comes from the account. A contractor account is attached to one
 * member and receives exactly that member's works, enforced server-side, so
 * every entry made here lands on a work the member can see.
 */

import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useAsync, useDebounced } from '../hooks'
import { Empty, Stat } from '../components/Charts'
import { TeamList } from '../components/TeamList'
import { ROLE_NAME, count, date as fmtDate, inr, percent } from '../format'
import { navigate, setParams, useRoute, workHref } from '../router'
import type { ProjectQuery } from '../types'

export function VendorDashboard() {
  const { user } = useAuth()
  const route = useRoute()
  const officer = user?.role === 'officer'
  const onOpenProject = (id: string) => navigate(workHref(id, { tab: officer ? 'evidence' : 'log' }))

  const view = route.params.get('tab') === 'team' ? 'team' : 'works'
  const status = route.params.get('status') ?? 'all'
  const source = route.params.get('source') ?? 'all'
  const page = Math.max(1, Number(route.params.get('page')) || 1)
  const setStatus = (value: string) => setParams({ status: value, page: null })
  const setPage = (next: number | ((p: number) => number)) =>
    setParams({ page: typeof next === 'function' ? next(page) : next })

  const [search, setSearch] = useState(route.params.get('search') ?? '')
  const debouncedSearch = useDebounced(search)
  useEffect(() => {
    if ((route.params.get('search') ?? '') !== debouncedSearch) setParams({ search: debouncedSearch, page: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const query: ProjectQuery = useMemo(
    () => ({ search: debouncedSearch, status, source, sort: 'recent' }),
    [debouncedSearch, status, source],
  )

  const kpis = useAsync((signal) => api.kpis(signal), [])
  const filters = useAsync((signal) => api.filters(signal), [])
  const list = useAsync(
    (signal) => api.projects({ ...query, page, limit: 18 }, signal),
    [query, page],
  )

  return (
    <div
      className="col"
      style={{
        gap: 16,
        padding: '18px clamp(12px, 3vw, 30px) 30px',
        maxWidth: 1080,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* ---------------- header ---------------- */}
      <header className="rise">
        <div className="label" style={{ marginBottom: 7 }}>
          {user ? ROLE_NAME[user.role] : ''} · your works
        </div>
        <h1 className="h1">{user?.name}</h1>
        {user?.organisation && (
          <p className="faint" style={{ fontSize: 12.5, marginTop: 5 }}>
            {user.organisation}
          </p>
        )}
      </header>

      {/* ---------------- KPIs ---------------- */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 10,
        }}
      >
        {kpis.loading &&
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 78 }} />
          ))}

        {kpis.data && (
          <>
            <Stat
              label="Projects assigned to you"
              value={count(kpis.data.totalProjects)}
              sub={`${count(kpis.data.activeProjects)} still going`}
              delay={0}
            />
            <Stat
              label="Finished"
              value={count(kpis.data.completedProjects)}
              sub="marked complete in the record"
              delay={50}
            />
            <Stat
              label="Money approved"
              value={inr(kpis.data.totalBudget)}
              sub={`${percent(kpis.data.utilisation, 1)} paid out so far`}
              delay={100}
            />
            {officer ? (
              <Stat
                label="Field reports you have added"
                value={count(kpis.data.myEvidence ?? 0)}
                sub="photographs across all your works"
                delay={150}
              />
            ) : (
              <Stat
                label="Entries you have added"
                value={count(kpis.data.myEntries ?? 0)}
                sub="across all your projects"
                delay={150}
              />
            )}
          </>
        )}
      </section>

      <nav className="tabs" role="tablist" aria-label="Sections">
        {(
          [
            ['works', 'Your works'],
            ['team', 'Team'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={view === key ? 'active' : ''}
            onClick={() => setParams({ tab: key === 'works' ? null : key }, { replace: false })}
          >
            {label}
          </button>
        ))}
      </nav>

      {view === 'team' && <TeamList />}

      {view === 'works' && (<>
      {/* ---------------- filters ---------------- */}
      <section className="row wrap" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ maxWidth: 300 }}
          placeholder="Search your projects"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search works"
        />
        <select
          className="select"
          style={{ maxWidth: 200 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Stage"
        >
          <option value="all">Any stage</option>
          {filters.data?.statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ maxWidth: 220 }}
          value={source}
          onChange={(e) => setParams({ source: e.target.value, page: null })}
          aria-label="Where the work comes from"
        >
          <option value="all">MPLADS and registered works</option>
          <option value="mplads">MPLADS report works</option>
          <option value="registered">Registered in Smart Nigrani</option>
        </select>
        {(search || status !== 'all' || source !== 'all') && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('')
              setParams({ search: null, status: null, source: null, page: null })
            }}
          >
            Clear
          </button>
        )}
      </section>

      {/* ---------------- project list ---------------- */}
      <section className="panel">
        <div className="panel-head">
          <span className="label">Your projects</span>
          <span className="label mono">{list.data ? count(list.data.total) : '-'}</span>
        </div>

        {list.loading && (
          <div className="col" style={{ gap: 9, padding: 14 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: 62 }} />
            ))}
          </div>
        )}

        {list.error && (
          <div style={{ padding: 18, fontSize: 13, color: 'var(--critical)' }}>{list.error}</div>
        )}

        {list.data && list.data.items.length === 0 && (
          <Empty>Nothing matches this search.</Empty>
        )}

        <div className="col">
          {list.data?.items.map((project, index) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="row rise"
              style={{
                gap: 14,
                width: '100%',
                padding: '13px 16px',
                textAlign: 'left',
                borderBottom: '1px solid var(--rule)',
                animationDelay: `${Math.min(index, 10) * 26}ms`,
                transition: 'background 0.1s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {/* Big, obvious project numbering, the sketch shows large
                  "Project 1 … Project 5" text, and a contractor scanning on a
                  phone benefits from a large hit target. */}
              <span
                className="mono"
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--text-faint)',
                  flex: 'none',
                  minWidth: 30,
                }}
              >
                {String((list.data!.page - 1) * list.data!.limit + index + 1).padStart(2, '0')}
              </span>

              <span className="col grow" style={{ gap: 5, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
                  {project.name}
                </span>
                <span className="row wrap faint" style={{ gap: 12, fontSize: 11.5 }}>
                  {project.source === 'registered' && <span className="tag">Registered · assigned to you</span>}
                  <span className="mono">{project.anonId}</span>
                  <span>{project.status}</span>
                  {project.sanctionDate && <span>Sanctioned {fmtDate(project.sanctionDate)}</span>}
                  {(project.workEntries ?? 0) > 0 && (
                    <span style={{ color: 'var(--sig-payment)' }}>
                      {project.workEntries} entries added
                    </span>
                  )}
                </span>
              </span>

              <span className="col" style={{ gap: 6, alignItems: 'flex-end', flex: 'none' }}>
                <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                  {inr(project.budget)}
                </span>
              </span>

              <span className="faint" style={{ fontSize: 15, flex: 'none' }}>
                →
              </span>
            </button>
          ))}
        </div>

        {list.data && list.data.pages > 1 && (
          <div className="row" style={{ padding: '10px 16px', gap: 10 }}>
            <button
              className="btn btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Previous
            </button>
            <span className="label grow" style={{ textAlign: 'center' }}>
              Page {list.data.page} of {list.data.pages}
            </span>
            <button
              className="btn btn-sm"
              disabled={page >= list.data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </section>

      <footer className="faint" style={{ fontSize: 11 }}>
        {officer
          ? 'You can add field reports to any work on this list. Everything you submit shows up on the screen of the Member of Parliament these works belong to.'
          : 'You can add work to any project on this list. Everything you enter shows up on the screen of the Member of Parliament these works belong to.'}
      </footer>
      </>)}
    </div>
  )
}
