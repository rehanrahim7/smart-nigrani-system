/**
 * The public register: every work in the snapshot, searchable and filterable,
 * ten to a page.
 *
 * The filters are a draft until Apply is pressed, and the applied values live
 * in the address, so refresh, back and a shared link all show the same page.
 * Members appear as aliases only.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { RiskBadge } from '../components/Signal'
import { count, date as fmtDate, inr } from '../format'
import { href, navigate, useRoute, workHref } from '../router'

const PAGE_SIZE = 10

export function Works() {
  const route = useRoute()
  const applied = {
    search: route.params.get('search') ?? '',
    district: route.params.get('district') ?? 'all',
    sector: route.params.get('sector') ?? 'all',
    risk: route.params.get('risk') ?? 'all',
    member: route.params.get('member') ?? 'all',
    sort: route.params.get('sort') ?? 'risk',
  }
  const page = Math.max(1, Number(route.params.get('page')) || 1)

  // The draft follows the address whenever the address changes (back button,
  // a link from another page), and otherwise waits for Apply.
  const [draft, setDraft] = useState(applied)
  const key = route.params.toString()
  useEffect(() => setDraft(applied), [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const filters = useAsync((signal) => api.publicFilters(signal), [])
  const list = useAsync(
    (signal) => api.publicWorks({ ...applied, page, limit: PAGE_SIZE }, signal),
    [key],
  )
  const top = useAsync((signal) => api.publicWorks({ sort: 'risk', limit: 10, risk: 'flagged' }, signal), [])

  const dirty = JSON.stringify(draft) !== JSON.stringify(applied)
  const activeCount = ['search', 'district', 'sector', 'risk', 'member'].filter(
    (k) => applied[k as keyof typeof applied] && applied[k as keyof typeof applied] !== 'all',
  ).length

  function apply(event?: FormEvent) {
    event?.preventDefault()
    navigate(href('/works', { ...draft, search: draft.search.trim(), page: 1 }))
  }

  function reset() {
    navigate(href('/works'))
  }

  function goPage(next: number) {
    navigate(href('/works', { ...applied, page: next }))
  }

  const set = (field: keyof typeof draft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }))

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="kicker">Public works register</span>
          <h1 className="page-title">
            Every work. <em>A closer look.</em>
          </h1>
          <p className="dim">
            Every work in the published MPLADS reports for Maharashtra, with the reasons behind every flag. Members of
            parliament appear as MP 01 to MP 47.
          </p>
        </div>
        <button className="btn" onClick={() => navigate(href('/works', { risk: 'flagged' }))}>
          Show flagged works
        </button>
      </div>

      <form className="panel toolbar" onSubmit={apply}>
        <label className="field grow-2">
          <span className="label">Search</span>
          <input
            className="input"
            value={draft.search}
            onChange={(e) => set('search')(e.target.value)}
            placeholder="Village, kind of work, SNS reference or work ID"
          />
        </label>
        <label className="field">
          <span className="label">District</span>
          <select className="select" value={draft.district} onChange={(e) => set('district')(e.target.value)}>
            <option value="all">All districts</option>
            {filters.data?.districts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Kind of work</span>
          <select className="select" value={draft.sector} onChange={(e) => set('sector')(e.target.value)}>
            <option value="all">All kinds</option>
            {filters.data?.sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Review status</span>
          <select className="select" value={draft.risk} onChange={(e) => set('risk')(e.target.value)}>
            <option value="all">All works</option>
            <option value="flagged">Needs a look</option>
            {filters.data?.riskLabels.map((r) => (
              <option key={r} value={r}>
                {r.replace(' Review', '')}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Member (alias)</span>
          <select className="select" value={draft.member} onChange={(e) => set('member')(e.target.value)}>
            <option value="all">All members</option>
            {filters.data?.members.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Order</span>
          <select className="select" value={draft.sort} onChange={(e) => set('sort')(e.target.value)}>
            <option value="risk">Review priority</option>
            <option value="model">Model unusualness</option>
            <option value="amount">Largest amount</option>
            <option value="recent">Most recently sanctioned</option>
            <option value="name">Name A to Z</option>
          </select>
        </label>
        <div className="toolbar-actions">
          <button type="submit" className="btn btn-primary" disabled={!dirty}>
            Apply
          </button>
          <button type="button" className="btn btn-ghost" onClick={reset} disabled={activeCount === 0 && applied.sort === 'risk'}>
            Reset
          </button>
        </div>
        {dirty && <p className="toolbar-note">Changes not applied yet. Press Apply to update the list.</p>}
      </form>

      <section className="panel">
        <div className="panel-head">
          <span className="label">
            {list.data ? `${count(list.data.total)} works${activeCount ? ` · ${activeCount} filter${activeCount > 1 ? 's' : ''}` : ''}` : 'Loading'}
          </span>
          {list.loading && <span className="spinner" />}
        </div>

        {list.error && (
          <div className="empty-state">
            <p className="field-error">{list.error}</p>
            <button className="btn btn-sm" onClick={list.reload}>
              Try again
            </button>
          </div>
        )}

        {list.data && list.data.items.length === 0 && (
          <div className="empty-state">
            <h3>No matching works</h3>
            <p className="dim">Try a shorter search, or reset the filters.</p>
            <button className="btn btn-sm" onClick={reset}>
              Reset filters
            </button>
          </div>
        )}

        {list.data && list.data.items.length > 0 && (
          <div className="table-scroll">
            <table className="table works-table">
              <thead>
                <tr>
                  <th>Work · district</th>
                  <th>Kind of work</th>
                  <th className="num">Amount</th>
                  <th>Sanctioned</th>
                  <th>Review</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((item) => (
                  <tr key={item.id} className="clickable" onClick={() => navigate(workHref(item.id))}>
                    <td>
                      <a href={workHref(item.id)} className="table-work" onClick={(e) => e.stopPropagation()}>
                        <b className="clamp-2">{item.name}</b>
                        <small>
                          {item.anonId} · {item.district ?? 'District unknown'} · {item.mpAlias}
                        </small>
                      </a>
                    </td>
                    <td>{item.sector}</td>
                    <td className="num">{inr(item.budget)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {fmtDate(item.sanctionDate)}
                    </td>
                    <td>{item.riskLabel && <RiskBadge label={item.riskLabel} score={item.fourChecks ? item.riskScore : undefined} />}</td>
                    <td className="dim" style={{ fontSize: 12.5, maxWidth: 240 }}>
                      {item.fourChecks && item.primaryReason !== 'Nothing flagged'
                        ? item.primaryReason
                        : item.checks?.[0] ?? (item.fourChecks ? 'No threshold crossed' : 'Not run through the four checks')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {list.data && list.data.pages > 1 && (
          <div className="pager">
            <span className="label">
              {count((page - 1) * PAGE_SIZE + 1)}–{count(Math.min(list.data.total, page * PAGE_SIZE))} of {count(list.data.total)}
            </span>
            <span className="grow" />
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>
              Previous
            </button>
            <span className="label">
              Page {page} of {list.data.pages}
            </span>
            <button className="btn btn-sm" disabled={page >= list.data.pages} onClick={() => goPage(page + 1)}>
              Next
            </button>
          </div>
        )}
      </section>

      <div className="page-head sub">
        <h2 className="serif">Ten highest-priority works</h2>
        <small className="faint">Four-check review priority · a reason to look, never a verdict</small>
      </div>
      <div className="ranked-grid">
        {top.data?.items.map((item, index) => (
          <a key={item.id} className="ranked-work" href={workHref(item.id)}>
            <span className="ranked-number mono">{String(index + 1).padStart(2, '0')}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <b className="clamp-2">{item.name}</b>
              <small>
                {item.anonId} · {item.district} · {item.primaryReason}
              </small>
            </span>
            <strong className="mono">{Math.round(item.riskScore ?? 0)}</strong>
          </a>
        ))}
        {top.loading && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}
      </div>
    </div>
  )
}
