/**
 * The dashboard a Member of Parliament sees.
 *
 * Map on the left, project list on the right, click a project to open it.
 *
 * The map and the list share one set of filters, so narrowing one narrows the
 * other. Two panes showing different slices of the same search is the quickest
 * way to confuse somebody watching a demo.
 *
 * The whole screen is sized to the window. The panels end where the window
 * ends and scroll inside themselves, instead of running off the bottom edge.
 */

import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useAsync, useDebounced } from '../hooks'
import { MapLegend, MapPanel } from '../components/MapPanel'
import { RiskBadge, SignalLegend, SignalMeter } from '../components/Signal'
import {
  BarList,
  DistrictTable,
  Empty,
  RiskStrip,
  SignalBars,
  Stat,
  UtilisationMeter,
} from '../components/Charts'
import { UpdatesFeed } from '../components/UpdatesFeed'
import { TeamList } from '../components/TeamList'
import { count, date as fmtDate, inr, percent, properName } from '../format'
import { navigate, setParams, useRoute, workHref } from '../router'
import type { ProjectQuery } from '../types'

type Tab = 'map' | 'attention' | 'updates' | 'charts' | 'team'

const TABS: Tab[] = ['map', 'attention', 'updates', 'charts', 'team']

export function MpDashboard() {
  const { user } = useAuth()
  const route = useRoute()
  const onOpenProject = (id: string) => navigate(workHref(id))

  // Tab, filters and page live in the address, so opening a work and coming
  // back, or refreshing, returns to exactly this view.
  const tabParam = route.params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'map'
  const setTab = (next: Tab) => setParams({ tab: next === 'map' ? null : next }, { replace: false })

  const district = route.params.get('district') ?? 'all'
  const sector = route.params.get('sector') ?? 'all'
  const status = route.params.get('status') ?? 'all'
  const risk = route.params.get('risk') ?? 'all'
  const page = Math.max(1, Number(route.params.get('page')) || 1)
  const setPage = (next: number | ((p: number) => number)) =>
    setParams({ page: typeof next === 'function' ? next(page) : next })
  const setDistrict = (value: string) => setParams({ district: value, page: null })
  const setSector = (value: string) => setParams({ sector: value, page: null })
  const setStatus = (value: string) => setParams({ status: value, page: null })
  const setRisk = (value: string) => setParams({ risk: value, page: null })

  // The search box updates on every keystroke; the address follows once
  // typing pauses, so the back button is not filled with single letters.
  const [search, setSearch] = useState(route.params.get('search') ?? '')
  const debouncedSearch = useDebounced(search)
  useEffect(() => {
    if ((route.params.get('search') ?? '') !== debouncedSearch) setParams({ search: debouncedSearch, page: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])
  const [focused, setFocused] = useState<string | null>(null)

  const query: ProjectQuery = useMemo(
    () => ({ search: debouncedSearch, district, sector, status, risk }),
    [debouncedSearch, district, sector, status, risk],
  )

  const kpis = useAsync((signal) => api.kpis(signal), [])
  const filters = useAsync((signal) => api.filters(signal), [])
  const charts = useAsync((signal) => api.charts(signal), [])
  // The tab is labelled with the number of flagged works, so the list has to
  // hold all of them or the label is a lie. The busiest constituency in this
  // data has 47, and the endpoint allows 100, so one request covers everyone.
  const queue = useAsync((signal) => api.reviewQueue(100, signal), [])

  const mapData = useAsync((signal) => api.mapPoints(query, signal), [query])
  const list = useAsync(
    (signal) => api.projects({ ...query, page, limit: 20 }, signal),
    [query, page],
  )

  // Changing a filter always returns to page 1 (each setter clears the page).
  // Otherwise you can be left on page 7 of a result that now has 2 pages.
  function updateFilter(apply: () => void) {
    apply()
  }

  const activeFilters =
    (debouncedSearch ? 1 : 0) +
    (district !== 'all' ? 1 : 0) +
    (sector !== 'all' ? 1 : 0) +
    (status !== 'all' ? 1 : 0) +
    (risk !== 'all' ? 1 : 0)

  function clearFilters() {
    setSearch('')
    setParams({ search: null, district: null, sector: null, status: null, risk: null, page: null })
  }

  return (
    <div
      className={`dash${tab === 'map' ? ' dash-locked' : ''}`}
      style={{ gap: 12, padding: '12px clamp(12px, 2vw, 22px) 16px' }}
    >
      {/* ---------------- headline numbers ---------------- */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(142px, 1fr))',
          gap: 10,
          flex: 'none',
        }}
      >
        {kpis.loading &&
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 74 }} />
          ))}

        {kpis.data && (
          <>
            <Stat
              label="Projects"
              value={count(kpis.data.totalProjects)}
              sub={`${count(kpis.data.sanctioned)} approved`}
              delay={0}
            />
            <Stat
              label="Need a look"
              value={count(kpis.data.flaggedProjects ?? 0)}
              sub={`${count(kpis.data.highRiskProjects ?? 0)} of them serious`}
              tone={(kpis.data.flaggedProjects ?? 0) > 0 ? 'var(--high)' : undefined}
              delay={40}
            />
            <Stat
              label="Running late"
              value={count(kpis.data.delayedProjects ?? 0)}
              sub="no completion on record"
              delay={80}
            />
            <Stat
              label="Finished"
              value={count(kpis.data.completedProjects)}
              sub={`${count(kpis.data.activeProjects)} still going`}
              delay={120}
            />
            <Stat
              label="Money approved"
              value={inr(kpis.data.totalBudget)}
              sub={`across ${count(kpis.data.districts)} districts`}
              delay={160}
            />
            <Stat
              label="Money paid out"
              value={percent(kpis.data.utilisation, 1)}
              sub={`${inr(kpis.data.totalSpent)} so far`}
              delay={200}
            />
          </>
        )}
      </section>

      {/* ---------------- tabs ---------------- */}
      <nav className="tabs" style={{ flex: 'none' }}>
        {(
          [
            ['map', 'Map and list'],
            ['attention', `Needs attention${kpis.data ? ` (${kpis.data.flaggedProjects ?? 0})` : ''}`],
            ['updates', 'Updates and alerts'],
            ['charts', 'Charts'],
            ['team', 'Team'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            style={{
              padding: '9px 14px',
              fontSize: 13.5,
              fontWeight: tab === key ? 600 : 500,
              color: tab === key ? 'var(--text)' : 'var(--text-faint)',
              borderBottom: `2px solid ${tab === key ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ================= MAP AND LIST ================= */}
      {tab === 'map' && (
        <>
          <section className="row wrap" style={{ gap: 8, flex: 'none' }}>
            <input
              className="input"
              style={{ maxWidth: 270 }}
              placeholder="Search by name, place or ID"
              value={search}
              onChange={(e) => updateFilter(() => setSearch(e.target.value))}
              aria-label="Search projects"
            />
            <select
              className="select"
              style={{ maxWidth: 165 }}
              value={district}
              onChange={(e) => updateFilter(() => setDistrict(e.target.value))}
              aria-label="District"
            >
              <option value="all">All districts</option>
              {filters.data?.districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className="select"
              style={{ maxWidth: 185 }}
              value={sector}
              onChange={(e) => updateFilter(() => setSector(e.target.value))}
              aria-label="Kind of work"
            >
              <option value="all">Any kind of work</option>
              {filters.data?.sectors.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <select
              className="select"
              style={{ maxWidth: 180 }}
              value={status}
              onChange={(e) => updateFilter(() => setStatus(e.target.value))}
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
              style={{ maxWidth: 170 }}
              value={risk}
              onChange={(e) => updateFilter(() => setRisk(e.target.value))}
              aria-label="Attention level"
            >
              <option value="all">Any attention level</option>
              <option value="flagged">Flagged only</option>
              {filters.data?.riskLabels.map((r) => (
                <option key={r} value={r}>
                  {r.replace(' Review', '')}
                </option>
              ))}
            </select>
            {activeFilters > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                Clear {activeFilters}
              </button>
            )}
          </section>

          <div className="monitor-fill">
            <section className="monitor-grid">
              {/* ---- map ---- */}
              <div className="panel col">
                <div className="panel-head">
                  <span className="label">Map</span>
                  <span className="label mono">
                    {mapData.data ? `${count(mapData.data.shown)} shown` : ''}
                  </span>
                </div>
                <div className="grow map-pane" style={{ position: 'relative', minHeight: 260 }}>
                  <MapPanel
                    points={mapData.data?.points ?? []}
                    loading={mapData.loading}
                    selectedId={focused}
                    onSelect={(id) => {
                      setFocused(id)
                      onOpenProject(id)
                    }}
                  />
                </div>
                <div
                  style={{
                    padding: '9px 15px',
                    borderTop: '1px solid var(--rule)',
                    flex: 'none',
                  }}
                >
                  <MapLegend shown={mapData.data?.shown ?? 0} total={mapData.data?.total ?? 0} />
                </div>
              </div>

              {/* ---- list ---- */}
              <div className="panel col">
                <div className="panel-head">
                  <span className="label">Projects</span>
                  <span className="label mono">{list.data ? count(list.data.total) : ''}</span>
                </div>

                <div className="scroll-fill">
                  {list.loading && (
                    <div className="col" style={{ gap: 8, padding: 12 }}>
                      {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="skeleton" style={{ height: 54 }} />
                      ))}
                    </div>
                  )}

                  {list.error && (
                    <div style={{ padding: 16, fontSize: 13, color: 'var(--critical)' }}>
                      {list.error}
                    </div>
                  )}

                  {list.data && list.data.items.length === 0 && (
                    <div className="col" style={{ alignItems: 'center', padding: '28px 16px', gap: 10 }}>
                      <Empty>Nothing matches these filters.</Empty>
                      {activeFilters > 0 && (
                        <button className="btn btn-sm" onClick={clearFilters}>
                          Clear filters
                        </button>
                      )}
                    </div>
                  )}

                  {list.data?.items.map((project, index) => (
                    <button
                      key={project.id}
                      type="button"
                      className="rise"
                      onClick={() => {
                        setFocused(project.id)
                        onOpenProject(project.id)
                      }}
                      onMouseEnter={() => setFocused(project.id)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '11px 14px',
                        textAlign: 'left',
                        borderBottom: '1px solid var(--rule)',
                        background: focused === project.id ? 'var(--hover)' : 'transparent',
                        animationDelay: `${Math.min(index, 10) * 22}ms`,
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <div className="row" style={{ gap: 9, marginBottom: 6 }}>
                        {project.source === 'registered' ? (
                          <span className="tag">Registered</span>
                        ) : (
                          project.riskLabel && (
                            <RiskBadge
                              label={project.riskLabel}
                              score={project.riskLabel === 'Not checked' ? undefined : project.riskScore}
                            />
                          )
                        )}
                        <span className="label grow truncate" style={{ textAlign: 'right' }}>
                          {project.district ?? ''}
                        </span>
                      </div>

                      <div
                        className="clamp-2"
                        style={{ fontSize: 13.5, lineHeight: 1.45, marginBottom: 7 }}
                      >
                        {project.name}
                      </div>

                      <div className="row" style={{ gap: 10 }}>
                        {project.scores && <SignalMeter scores={project.scores} width={54} />}
                        <span className="mono faint" style={{ fontSize: 11.5 }}>
                          {inr(project.budget)}
                        </span>
                        <span className="grow" />
                        <span className="faint truncate" style={{ fontSize: 11.5 }}>
                          {project.primaryReason}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {list.data && list.data.pages > 1 && (
                  <div
                    className="row"
                    style={{ padding: '9px 14px', borderTop: '1px solid var(--rule)', gap: 9, flex: 'none' }}
                  >
                    <button
                      className="btn btn-sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      Back
                    </button>
                    <span className="label grow" style={{ textAlign: 'center' }}>
                      Page {list.data.page} of {list.data.pages}
                    </span>
                    <button
                      className="btn btn-sm"
                      disabled={page >= list.data.pages}
                      onClick={() => setPage((p) => p + 1)}
                      aria-label="Next page"
                    >
                      Next
                    </button>
                  </div>
                )}

                <div
                  style={{ padding: '9px 14px', borderTop: '1px solid var(--rule)', flex: 'none' }}
                >
                  <SignalLegend compact />
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {/* ================= NEEDS ATTENTION ================= */}
      {tab === 'attention' && (
        <section className="panel" style={{ flex: 'none' }}>
          <div className="panel-head">
            <span className="label">Most urgent first</span>
            <span className="label mono">{queue.data?.items.length ?? 0}</span>
          </div>

          {queue.loading && (
            <div className="col" style={{ gap: 8, padding: 14 }}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="skeleton" style={{ height: 76 }} />
              ))}
            </div>
          )}

          {queue.data && queue.data.items.length === 0 && (
            <Empty>Nothing here needs attention right now.</Empty>
          )}

          <div className="col">
            {queue.data?.items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenProject(item.id)}
                className="col rise"
                style={{
                  gap: 9,
                  width: '100%',
                  padding: '14px 16px',
                  textAlign: 'left',
                  borderBottom: '1px solid var(--rule)',
                  animationDelay: `${index * 30}ms`,
                }}
              >
                <div className="row wrap" style={{ gap: 9 }}>
                  <RiskBadge label={item.riskLabel} score={item.riskScore} />
                  <span className="grow" style={{ fontSize: 14, fontWeight: 500 }}>
                    {item.name}
                  </span>
                  <span className="mono faint" style={{ fontSize: 11.5 }}>
                    {item.district} · {inr(item.budget)}
                  </span>
                </div>

                {/* The reasons, in plain sentences. This is the whole point of
                    the system, so it gets the room. */}
                <ul className="col" style={{ gap: 5, margin: 0, paddingLeft: 16 }}>
                  {item.reasons.map((reason) => (
                    <li key={reason.label} className="dim" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                      <strong style={{ color: 'var(--text)' }}>{reason.label}:</strong>{' '}
                      {reason.explanation}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ================= UPDATES ================= */}
      {tab === 'updates' && <UpdatesFeed />}

      {/* ================= TEAM ================= */}
      {tab === 'team' && <TeamList />}

      {/* ================= CHARTS ================= */}
      {tab === 'charts' && (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
            gap: 12,
            flex: 'none',
          }}
        >
          <Card title="How much needs attention">
            {charts.data ? <RiskStrip data={charts.data.byRisk} /> : <Loading />}
          </Card>

          <Card title="Money paid out">
            {kpis.data ? (
              <UtilisationMeter spent={kpis.data.totalSpent} budget={kpis.data.totalBudget} />
            ) : (
              <Loading />
            )}
          </Card>

          <Card title="Which check raised the flag">
            {charts.data ? (
              <SignalBars data={charts.data.bySignal} total={kpis.data?.totalProjects ?? 0} />
            ) : (
              <Loading />
            )}
          </Card>

          <Card title="Stage of work">
            {charts.data ? <BarList data={charts.data.byStatus} colour="var(--accent)" /> : <Loading />}
          </Card>

          <Card title="Money by district" wide>
            {charts.data ? <DistrictTable data={charts.data.byDistrict} /> : <Loading />}
          </Card>

          <Card title="Kind of work" wide>
            {charts.data ? (
              <>
                <BarList data={charts.data.bySector} colour="var(--accent)" />
                <p className="faint" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 12 }}>
                  Worked out from each description, because the category column in the
                  source files puts almost everything under "Normal/Others".
                </p>
              </>
            ) : (
              <Loading />
            )}
          </Card>
        </section>
      )}

      <footer className="faint" style={{ fontSize: 11.5, flex: 'none', paddingTop: 2 }}>
        You are seeing works for {properName(user?.constituency ?? user?.name ?? '')}. Data snapshot{' '}
        {kpis.data ? fmtDate(kpis.data.snapshot) : ''}. A flag means someone should check, not that
        anything is wrong.
      </footer>
    </div>
  )
}

function Card({
  title,
  children,
  wide,
}: {
  title: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="panel" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div className="panel-head">
        <span className="label">{title}</span>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  )
}

function Loading() {
  return <div className="skeleton" style={{ height: 96 }} />
}
