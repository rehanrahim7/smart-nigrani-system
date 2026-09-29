/**
 * The people working on one member's works, and for the agency, the form to
 * add a contractor or a field officer.
 *
 * An agency can add only those two roles, only to its own team. There is no
 * way to create a member, agency or analyst account from here; the server
 * refuses it too.
 */

import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { ROLE_NAME, dateTime } from '../format'

export function TeamList() {
  const team = useAsync((signal) => api.team(signal), [])

  return (
    <div className="team-layout">
      <section className="panel">
        <div className="panel-head">
          <span className="label">Team and access</span>
          <span className="label mono">{team.data?.members.length ?? ''}</span>
        </div>
        {team.error && <p className="field-error card-pad">{team.error}</p>}
        <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Sign-in name</th>
            </tr>
          </thead>
          <tbody>
            {team.data?.members.map((m) => (
              <tr key={m.username}>
                <td>{m.name}</td>
                <td>{ROLE_NAME[m.role]}</td>
                <td className="mono small">{m.username}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="faint small card-pad">
          Everyone here sees the same works. Contractors and field officers see a registered project only when it is
          assigned to them. There are no invitation emails: share the sign-in name and password with the person directly.
        </p>
      </section>
      {team.data?.canManage && <AddMember onAdded={team.reload} />}
    </div>
  )
}

function AddMember({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState({ name: '', username: '', role: 'vendor' as 'vendor' | 'officer', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setDone(null)
    if (form.password.length < 8) return setError('Use a password of at least 8 characters')
    setBusy(true)
    try {
      const added = await api.addTeamMember({ ...form, username: form.username.trim().toLowerCase() })
      setDone(`${added.name} can now sign in as ${added.username}. Added ${dateTime(new Date().toISOString())}.`)
      setForm({ name: '', username: '', role: form.role, password: '' })
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel card-pad col" style={{ gap: 10 }} onSubmit={submit}>
      <span className="kicker">Add to the team</span>
      <h3 className="serif card-title">A contractor or field officer</h3>
      <label className="field">
        <span className="label">Full name</span>
        <input className="input" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label className="field">
        <span className="label">Role</span>
        <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'vendor' | 'officer' })}>
          <option value="vendor">Contractor</option>
          <option value="officer">Field officer</option>
        </select>
      </label>
      <label className="field">
        <span className="label">Sign-in name</span>
        <input
          className="input mono"
          required
          minLength={3}
          maxLength={60}
          pattern="[a-z0-9][a-z0-9._\-]*"
          title="Lower-case letters, numbers, dots, dashes and underscores"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          placeholder="team.contractor2"
        />
      </label>
      <label className="field">
        <span className="label">Password (8 or more characters)</span>
        <input className="input" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      {done && <p className="notice notice-ok" role="status">{done}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Adding' : 'Add to team'}
      </button>
    </form>
  )
}
