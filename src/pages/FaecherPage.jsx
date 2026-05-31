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

  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formKuerzel, setFormKuerzel] = useState('')
  const [formSymbol, setFormSymbol] = useState('')
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editKuerzel, setEditKuerzel] = useState('')
  const [editSymbol, setEditSymbol] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const [deleteId, setDeleteId] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const username = user?.user_metadata?.username || user?.email?.split('@')[0]
  const isAllowed = rolle === 'admin' || username === 'dfoerster'

  const loadFaecher = async () => {
    setDataLoading(true)
    const { data, error } = await supabase.from('faecher').select('*').order('name')
    if (error) setError(error.message)
    else setFaecher(data || [])
    setDataLoading(false)
  }

  useEffect(() => { loadFaecher() }, [])

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
    if (error) { setFormError(error.message) }
    else {
      setFormName(''); setFormKuerzel(''); setFormSymbol('')
      setShowForm(false)
      await loadFaecher()
    }
    setFormLoading(false)
  }

  const startEdit = (f) => {
    setEditId(f.id); setEditName(f.name); setEditKuerzel(f.kuerzel); setEditSymbol(f.symbol)
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    if (!editName.trim() || !editKuerzel.trim() || !editSymbol.trim()) return
    setEditLoading(true)
    const { error } = await supabase.from('faecher').update({
      name: editName.trim(),
      kuerzel: editKuerzel.trim().toUpperCase(),
      symbol: editSymbol.trim(),
    }).eq('id', editId)
    if (!error) { setEditId(null); await loadFaecher() }
    setEditLoading(false)
  }

  const handleDelete = async (id) => {
    setDeleteLoading(true)
    await supabase.from('faecher').delete().eq('id', id)
    setDeleteId(null); setDeleteLoading(false)
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
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700 }}>Neues Fach anlegen</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Symbol (Emoji/Flag)</label>
                <input className="input" type="text" placeholder="z.B. 🇬🇧 oder 🏛️"
                  value={formSymbol} onChange={e => setFormSymbol(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={labelStyle}>Name</label>
                <input className="input" type="text" placeholder="z.B. Englisch"
                  value={formName} onChange={e => setFormName(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={labelStyle}>Kürzel</label>
                <input className="input" type="text" placeholder="z.B. EN"
                  value={formKuerzel} onChange={e => setFormKuerzel(e.target.value)}
                  maxLength={5} style={{ width: '100%' }} />
              </div>
              {formError && <p style={{ color: 'var(--error,#a12c7b)', fontSize: 13 }}>{formError}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                  {formLoading ? 'Speichern…' : '✓ Speichern'}
                </button>
                <button type="button" className="btn"
                  onClick={() => { setShowForm(false); setFormError(''); setFormName(''); setFormKuerzel(''); setFormSymbol('') }}>
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        )}

        {error && (
          <div style={{ background: 'oklch(from var(--error,#a12c7b) l c h / 0.08)', border: '1px solid oklch(from var(--error,#a12c7b) l c h / 0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--error,#a12c7b)', fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Fächer-Liste */}
        {dataLoading ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
            <p>Lade Fächer…</p>
          </div>
        ) : faecher.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📚</div>
            <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Noch keine Fächer vorhanden</p>
            <p style={{ fontSize: 13 }}>Lege das erste Fach über den Button oben an.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {faecher.map(f => (
              <div key={f.id} className="card" style={{ padding: '14px 16px' }}>

                {/* Bearbeitungsformular */}
                {editId === f.id ? (
                  <form onSubmit={handleEdit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 60px', gap: 8, marginBottom: 10 }}>
                      <div>
                        <label style={labelStyle}>Symbol</label>
                        <input className="input" value={editSymbol}
                          onChange={e => setEditSymbol(e.target.value)} style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={labelStyle}>Name</label>
                        <input className="input" value={editName}
                          onChange={e => setEditName(e.target.value)} style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={labelStyle}>Kürzel</label>
                        <input className="input" value={editKuerzel}
                          onChange={e => setEditKuerzel(e.target.value)}
                          maxLength={5} style={{ width: '100%' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn btn-primary"
                        disabled={editLoading} style={{ flex: 1 }}>
                        {editLoading ? '…' : '✓ Speichern'}
                      </button>
                      <button type="button" className="btn"
                        onClick={() => setEditId(null)} style={{ flex: 1 }}>
                        Abbrechen
                      </button>
                    </div>
                  </form>

                /* Lösch-Bestätigung */
                ) : deleteId === f.id ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 28 }}>{f.symbol}</span>
                      <div>
                        <strong style={{ display: 'block' }}>{f.name}</strong>
                        <span style={{ color: 'var(--error,#a12c7b)', fontSize: 13 }}>Wirklich löschen?</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" disabled={deleteLoading} onClick={() => handleDelete(f.id)}
                        style={{ flex: 1, background: 'oklch(from var(--error,#a12c7b) l c h / 0.12)', color: 'var(--error,#a12c7b)', border: '1px solid oklch(from var(--error,#a12c7b) l c h / 0.3)' }}>
                        {deleteLoading ? '…' : '🗑 Ja, löschen'}
                      </button>
                      <button className="btn" onClick={() => setDeleteId(null)} style={{ flex: 1 }}>
                        Abbrechen
                      </button>
                    </div>
                  </div>

                /* Normale Ansicht */
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>{f.symbol}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ fontSize: 16, display: 'block' }}>{f.name}</strong>
                      <span style={{
                        display: 'inline-block', marginTop: 3,
                        background: 'oklch(from var(--primary,#01696f) l c h / 0.10)',
                        color: 'var(--primary,#01696f)',
                        borderRadius: 4, padding: '1px 7px',
                        fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
                      }}>{f.kuerzel}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button className="btn" onClick={() => startEdit(f)}
                        style={{ padding: '6px 12px', fontSize: 13 }} title="Bearbeiten">
                        ✏️
                      </button>
                      <button className="btn" onClick={() => setDeleteId(f.id)}
                        style={{ padding: '6px 12px', fontSize: 13, color: 'var(--error,#a12c7b)' }} title="Löschen">
                        🗑
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

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
