/**
 * Updates and alerts for a member of parliament or the agency: what the
 * delivery team recorded, newest first, and registered works past their
 * completion target.
 *
 * The list asks the server again every 30 seconds while the tab is visible.
 * That is polling, and the page says so; nothing is pushed, emailed or sent.
 */

import { api } from '../api'
import { useAsync, usePolling } from '../hooks'
import { dateTime, inr } from '../format'
import { workHref } from '../router'
import type { UpdateItem } from '../types'

const KIND: Record<UpdateItem['kind'], { label: string; tab: string }> = {
  worklog: { label: 'Work log entry', tab: 'log' },
  evidence: { label: 'Field photograph', tab: 'evidence' },
  review: { label: 'Action taken', tab: 'reviews' },
}

export function UpdatesFeed() {
  const feed = useAsync((signal) => api.updates(signal), [])
  usePolling(feed.reload, 30)

  return (
    <section className="col" style={{ gap: 12 }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <span className="label grow">
          {feed.data ? `Checked ${dateTime(feed.data.checkedAt)} · checks again every 30 seconds while this tab is open` : 'Loading'}
        </span>
        <button className="btn btn-sm" onClick={feed.reload} disabled={feed.loading}>
          {feed.loading ? 'Checking…' : 'Check now'}
        </button>
      </div>

      {feed.error && (
        <p className="notice notice-error">
          {feed.error}{' '}
          <button className="link" onClick={feed.reload}>
            Try again
          </button>
        </p>
      )}

      {feed.data && feed.data.overdue.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <span className="label">Past the completion target</span>
            <span className="label mono">{feed.data.overdue.length}</span>
          </div>
          <ul className="feed">
            {feed.data.overdue.map((item) => (
              <li key={item.projectId}>
                <a href={workHref(item.projectId, { tab: 'timeline' })}>
                  <span className="feed-kind warn">Overdue</span>
                  <span className="grow">
                    <strong>{item.projectName}</strong>
                    <small>
                      Target {item.deadline}, {item.days} days ago. Reported progress{' '}
                      {item.progress != null ? `${item.progress}%` : 'none yet'}.
                    </small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <span className="label">Recorded by the team</span>
          <span className="label mono">{feed.data?.items.length ?? ''}</span>
        </div>
        {feed.data && feed.data.items.length === 0 && (
          <p className="faint card-pad">
            Nothing recorded yet. When the contractor adds a work log entry or the field officer submits a photograph,
            it appears here.
          </p>
        )}
        {!feed.data && feed.loading && (
          <div className="col card-pad" style={{ gap: 8 }}>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: 54 }} />
            ))}
          </div>
        )}
        <ul className="feed">
          {feed.data?.items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <a href={workHref(item.projectId, { tab: KIND[item.kind].tab })}>
                <span className={`feed-kind ${item.flags.length ? 'warn' : ''}`}>{KIND[item.kind].label}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <strong>
                    {item.title}
                    {item.amount != null ? ` · ${inr(item.amount)}` : ''}
                  </strong>
                  <small>
                    {item.projectRef} · {item.projectName}
                  </small>
                  <small>
                    {item.by} · {dateTime(item.at)}
                    {item.itemCount ? ` · ${item.itemCount} material lines` : ''}
                  </small>
                  {item.note && <small className="dim">{item.note}</small>}
                  {item.flags.length > 0 && (
                    <ul className="flag-list">
                      {item.flags.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                </span>
                <span aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
