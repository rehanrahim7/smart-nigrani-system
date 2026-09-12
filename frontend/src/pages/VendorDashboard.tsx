/**
 * Contractor / Vendor dashboard.
 *
 * Sketch 2: a plain list of the projects assigned to this contractor. Click
 * one, get its work table with an Add Work button. Deliberately simpler than
 * the MP view, a contractor on a site does not need a risk analysis screen,
 * they need to find their project and record what they did.
 *
 * Scope comes from the account: a vendor only ever receives works in their own
 * district, enforced server-side, not by hiding rows in the browser.
 */

import { useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useAsync, useDebounced } from '../hooks'
import { Empty, Stat } from '../components/Charts'
import { RiskBadge } from '../components/Signal'
import { count, date as fmtDate, inr, percent } from '../format'
import type { ProjectQuery } from '../types'

export function VendorDashboard({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounced(search)

  const query: ProjectQuery = useMemo(
    () => ({ search: debouncedSearch, status, sort: 'recent' }),
    [debouncedSearch, status],
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
          Your work
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
            <Stat
              label="Being checked"
              value={count(kpis.data.flaggedProjects)}
              sub="flagged for someone to look at"
              tone={kpis.data.flaggedProjects > 0 ? 'var(--high)' : undefined}
              delay={150}
            />
          </>
        )}
      </section>

      {/* ---------------- filters ---------------- */}
      <section className="row wrap" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ maxWidth: 300 }}
          placeholder="Search your projects"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          aria-label="Search works"
        />
        <select
          className="select"
          style={{ maxWidth: 200 }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          aria-label="Stage"
        >
          <option value="all">Any stage</option>
          {filters.data?.statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {(search || status !== 'all') && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('')
              setStatus('all')
              setPage(1)
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
                  <span className="mono">{project.id}</span>
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
                {project.riskLabel !== 'Routine' && <RiskBadge label={project.riskLabel} />}
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
        You can add work to any project on this list. What you enter is visible to the
        Member of Parliament who watches this area.
      </footer>
    </div>
  )
}
