import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'
import { supabase } from '../lib/supabase.js'

export default function FaecherPage() {
  const { user } = useAuthStore()
  const { rolle, loading: roleLoading } = useRole()

  const [faecher, setFaecher] = useState([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState('')

  // Formular: neues Fach
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formKuerzel, setFormKuerzel] = useState('')
  const [formSymbol, setFormSymbol] = useState('')
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  // Bearbeiten
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editKuerzel, setEditKuerzel] = useState('')
  const [editSymbol, setEditSymbol] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Löschen
  const [deleteId, setDeleteId] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const username = user?.user_metadata?.username || user?.email?.split('@')[0]
  const isAllowed = rolle === 'admin' || username === 'dfoerster'

  const loadFaecher = async () => {
    setDataLoading(true)
    const { data, error } = await supabase
      .from('faecher')
      .select('*')
      .order('name')
    if (error) setError(error.message)
    else setFaecher(data || [])
    setDataLoading(false)
  }

  useEffect(() => { loadFaecher() }, [])

  // Neues Fach speichern
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!formName.trim() || !formKuerzel.trim() || !formSymbol.trim()) {
      setFormError('Alle Felder ausfüllen.')
      return
    }
    setFormLoading(true)
    setFormError('')
    const { error } = await supabase.from('faecher').insert({
      name: formName.trim(),
      kuerzel: formKuerzel.trim().toUpperCase(),
      symbol: formSymbol.trim(),
    })
    if (error) {
      setFormError(error.message)
    } else {
      setFormName('')
      setFormKuerzel('')
      setFormSymbol('')
      setShowForm(false)
      await loadFaecher()
    }
    setFormLoading(false)
  }

  // Bearbeiten starten
  const startEdit = (f) => {
    setEditId(f.id)
    setEditName(f.name)
    setEditKuerzel(f.kuerzel)
    setEditSymbol(f.symbol)
  }

  // Bearbeiten speichern
  const handleEdit = async (e) => {
    e.preventDefault()
    if (!editName.trim() || !editKuerzel.trim() || !editSymbol.trim()) return
    setEditLoading(true)
    const { error } = await supabase.from('faecher').update({
      name: editName.trim(),
      kuerzel: editKuerzel.trim().toUpperCase(),
      symbol: editSymbol.trim(),
    }).eq('id', editId)
    if (!error) {
      setEditId(null)
      await loadFaecher()
    }
    setEditLoading(false)
  }

  // Löschen bestätigen
  const handleDelete = async (id) => {
    setDeleteLoading(true)
    await supabase.from('faecher').delete().eq('id', id)
    setDeleteId(null)
    setDeleteLoading(false)
    await loadFaecher()
  }

  if (roleLoading) return (
    <div className="page-center">
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <p>Lade...</p>
      </div>
    </div>
  )

  if (!isAllowed) return <Navigate to="/dashboard" />

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <nav className="nav">
        <Link to="/dashboard" className="nav-logo">
          <div className="nav-logo-icon">📚</div>
          VokabelApp
        </Link>
        <div className="nav-actions">
          <span className="badge badge-admin">Admin</span>
          <Link to="/admin" className="nav-btn">← Admin</Link>
        </div>
      </nav>

      <div className="main-content">
        <div className="welcome-banner">
          <h2>📚 Schulfächer</h2>
          <p>Fächer verwalten — anlegen, bearbeiten und löschen.</p>
        </div>

        {/* Neues Fach Button */}
        {!showForm && (
          <div style={{ marginBottom: 20 }}>
            <button
              className="btn btn-primary"
              onClick={() => setShowForm(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Neues Fach anlegen
            </button>
          </div>
        )}

        {/* Formular: neues Fach */}
        {showForm && (
          <div className="card" style={{ marginBottom: 20, maxWidth: 500 }}>
            <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700 }}>Neues Fach anlegen</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Symbol (Emoji/Flag)</label>
                <input
                  className="input"
                  type="text"
                  placeholder="z.B. 🇬🇧 oder 🏛️"
                  value={formSymbol}
                  onChange={e => setFormSymbol(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  className="input"
                  type="text"
                  placeholder="z.B. Englisch"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Kürzel</label>
                <input
                  className="input"
                  type="text"
                  placeholder="z.B. EN"
                  value={formKuerzel}
                  onChange={e => setFormKuerzel(e.target.value)}
                  maxLength={5}
                  style={{ width: '100%' }}
                />
              </div>
              {formError && (
                <p style={{ color: 'var(--error, #a12c7b)', fontSize: 13 }}>{formError}</p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                  {formLoading ? 'Speichern…' : '✓ Speichern'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => { setShowForm(false); setFormError(''); setFormName(''); setFormKuerzel(''); setFormSymbol('') }}
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Fehlermeldung */}
        {error && (
          <div style={{ background: 'oklch(from var(--error,#a12c7b) l c h / 0.08)', border: '1px solid oklch(from var(--error,#a12c7b) l c h / 0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--error,#a12c7b)', fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Tabelle */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {dataLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
              <p>Lade Fächer…</p>
            </div>
          ) : faecher.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📚</div>
              <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Noch keine Fächer vorhanden</p>
              <p style={{ fontSize: 13 }}>Lege das erste Fach über den Button oben an.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                  <th style={thStyle}>Symbol</th>
                  <th style={thStyle}>Fach</th>
                  <th style={thStyle}>Kürzel</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {faecher.map((f, i) => (
                  <tr
                    key={f.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: i % 2 === 0 ? 'transparent' : 'var(--bg)',
                    }}
                  >
                    {editId === f.id ? (
                      // ── Inline-Bearbeitungszeile ──
                      <td colSpan={4} style={{ padding: '10px 14px' }}>
                        <form onSubmit={handleEdit} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            className="input"
                            value={editSymbol}
                            onChange={e => setEditSymbol(e.target.value)}
                            placeholder="Symbol"
                            style={{ width: 80 }}
                          />
                          <input
                            className="input"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder="Name"
                            style={{ flex: 1, minWidth: 120 }}
                          />
                          <input
                            className="input"
                            value={editKuerzel}
                            onChange={e => setEditKuerzel(e.target.value)}
                            placeholder="Kürzel"
                            maxLength={5}
                            style={{ width: 70 }}
                          />
                          <button type="submit" className="btn btn-primary" disabled={editLoading} style={{ padding: '6px 14px', fontSize: 13 }}>
                            {editLoading ? '…' : '✓ OK'}
                          </button>
                          <button type="button" className="btn" onClick={() => setEditId(null)} style={{ padding: '6px 12px', fontSize: 13 }}>
                            Abbrechen
                          </button>
                        </form>
                      </td>
                    ) : deleteId === f.id ? (
                      // ── Lösch-Bestätigungszeile ──
                      <td colSpan={4} style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 20 }}>{f.symbol}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{f.name}</span>
                          <span style={{ color: 'var(--error,#a12c7b)', fontSize: 13 }}>wirklich löschen?</span>
                          <button
                            className="btn"
                            style={{ background: 'oklch(from var(--error,#a12c7b) l c h / 0.12)', color: 'var(--error,#a12c7b)', border: '1px solid oklch(from var(--error,#a12c7b) l c h / 0.3)', padding: '5px 12px', fontSize: 13 }}
                            disabled={deleteLoading}
                            onClick={() => handleDelete(f.id)}
                          >
                            {deleteLoading ? '…' : '🗑 Ja, löschen'}
                          </button>
                          <button className="btn" onClick={() => setDeleteId(null)} style={{ padding: '5px 12px', fontSize: 13 }}>
                            Abbrechen
                          </button>
                        </div>
                      </td>
                    ) : (
                      // ── Normale Zeile ──
                      <>
                        <td style={{ ...tdStyle, fontSize: 24, lineHeight: 1 }}>{f.symbol}</td>
                        <td style={tdStyle}><strong>{f.name}</strong></td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block',
                            background: 'oklch(from var(--primary,#01696f) l c h / 0.10)',
                            color: 'var(--primary,#01696f)',
                            borderRadius: 4,
                            padding: '2px 8px',
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                          }}>{f.kuerzel}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              className="btn"
                              onClick={() => startEdit(f)}
                              style={{ padding: '4px 12px', fontSize: 13 }}
                              title="Bearbeiten"
                            >
                              ✏️ Bearbeiten
                            </button>
                            <button
                              className="btn"
                              onClick={() => setDeleteId(f.id)}
                              style={{ padding: '4px 12px', fontSize: 13, color: 'var(--error,#a12c7b)' }}
                              title="Löschen"
                            >
                              🗑 Löschen
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          {faecher.length} {faecher.length === 1 ? 'Fach' : 'Fächer'} gesamt
        </p>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  color: 'var(--text-muted)',
  marginBottom: 4,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '10px 14px',
  verticalAlign: 'middle',
}
