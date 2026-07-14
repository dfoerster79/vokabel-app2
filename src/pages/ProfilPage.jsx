import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from '../store/authStore.js'
import { useRole } from '../hooks/useRole.js'
import KlassenVerwaltung from '../components/KlassenVerwaltung.jsx'

const BUNDESLAENDER = [
  { kuerzel: 'BB', name: 'Brandenburg' },
  { kuerzel: 'BE', name: 'Berlin' },
  { kuerzel: 'BW', name: 'Baden-Württemberg' },
  { kuerzel: 'BY', name: 'Bayern' },
  { kuerzel: 'HB', name: 'Bremen' },
  { kuerzel: 'HE', name: 'Hessen' },
  { kuerzel: 'HH', name: 'Hamburg' },
  { kuerzel: 'MV', name: 'Mecklenburg-Vorpommern' },
  { kuerzel: 'NI', name: 'Niedersachsen' },
  { kuerzel: 'NW', name: 'Nordrhein-Westfalen' },
  { kuerzel: 'RP', name: 'Rheinland-Pfalz' },
  { kuerzel: 'SH', name: 'Schleswig-Holstein' },
  { kuerzel: 'SL', name: 'Saarland' },
  { kuerzel: 'SN', name: 'Sachsen' },
  { kuerzel: 'ST', name: 'Sachsen-Anhalt' },
  { kuerzel: 'TH', name: 'Thüringen' },
]

export default function ProfilPage() {
  const { user } = useAuthStore()
  const { profile, loading: roleLoading } = useRole()

  const [profileInitialized, setProfileInitialized] = useState(false)

  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameMsg, setNameMsg] = useState(null)

  const [pwNeu, setPwNeu] = useState('')
  const [pwWdh, setPwWdh] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  const [savedBundesland, setSavedBundesland] = useState('')
  const [savedOrt, setSavedOrt] = useState('')
  const [savedSchuleId, setSavedSchuleId] = useState('')

  const [bundesland, setBundesland] = useState('')
  const [ortInput, setOrtInput] = useState('')
  const [ortGewaehlt, setOrtGewaehlt] = useState('')

  const [ortSuggestions, setOrtSuggestions] = useState([])
  const [loadingOrte, setLoadingOrte] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [ortSaving, setOrtSaving] = useState(false)
  const [ortMsg, setOrtMsg] = useState(null)

  const [schulen, setSchulen] = useState([])
  const [loadingSchulen, setLoadingSchulen] = useState(false)
  const [schulTypFilter, setSchulTypFilter] = useState('')
  const [schuleId, setSchuleId] = useState('')
  const [schuleSaving, setSchuleSaving] = useState(false)
  const [schuleMsg, setSchuleMsg] = useState(null)
  const [gespeicherteSchule, setGespeicherteSchule] = useState(null)
  const [loadingGespeicherteSchule, setLoadingGespeicherteSchule] = useState(false)

  const [editOrt, setEditOrt] = useState(false)
  const [editSchule, setEditSchule] = useState(false)

  const ortRef = useRef(null)

  useEffect(() => {
    if (roleLoading) return
    if (!profile) return

    setVorname(profile.vorname || '')
    setNachname(profile.nachname || '')

    const bl = profile.bundesland || ''
    const ort = profile.ort || ''
    const sid = profile.schule_id || ''

    setSavedBundesland(bl)
    setSavedOrt(ort)
    setSavedSchuleId(sid)

    setBundesland(bl)
    setOrtInput(ort)
    setOrtGewaehlt(ort)
    setSchuleId(sid)

    setEditOrt(!bl || !ort)
    setEditSchule(false)

    setProfileInitialized(true)
  }, [profile, roleLoading])

  useEffect(() => {
    if (!savedSchuleId) {
      setGespeicherteSchule(null)
      return
    }

    setLoadingGespeicherteSchule(true)
    supabase
      .from('schulen')
      .select('id, name, schulart, ort')
      .eq('id', savedSchuleId)
      .single()
      .then(({ data }) => {
        setGespeicherteSchule(data || null)
        setLoadingGespeicherteSchule(false)
      })
  }, [savedSchuleId])

  useEffect(() => {
    if (!bundesland || ortInput.trim().length < 1 || ortGewaehlt === ortInput) {
      if (ortInput.trim().length < 1) setOrtSuggestions([])
      return
    }

    const timeout = setTimeout(async () => {
      setLoadingOrte(true)

      const { data, error } = await supabase
        .from('schulen')
        .select('ort')
        .eq('bundesland', bundesland)
        .ilike('ort', `%${ortInput}%`)
        .not('ort', 'is', null)
        .order('ort')
        .limit(200)

      if (!error && data) {
        const unique = [...new Set(data.map(r => r.ort).filter(Boolean))].sort()
        setOrtSuggestions(unique)
        setShowSuggestions(true)
      } else {
        setOrtSuggestions([])
      }

      setLoadingOrte(false)
    }, 220)

    return () => clearTimeout(timeout)
  }, [ortInput, bundesland, ortGewaehlt])

  useEffect(() => {
    const aktiverOrt = editOrt ? ortGewaehlt : savedOrt
    const aktivesBundesland = editOrt ? bundesland : savedBundesland

    if (!aktivesBundesland || !aktiverOrt) {
      setSchulen([])
      setSchulTypFilter('')
      return
    }

    setLoadingSchulen(true)
    setSchulTypFilter('')

    supabase
      .from('schulen')
      .select('id, name, schulart')
      .eq('bundesland', aktivesBundesland)
      .eq('ort', aktiverOrt)
      .order('name')
      .then(({ data }) => {
        setSchulen(data || [])
        setLoadingSchulen(false)
      })
  }, [editOrt, bundesland, ortGewaehlt, savedBundesland, savedOrt])

  useEffect(() => {
    const handler = (e) => {
      if (ortRef.current && !ortRef.current.contains(e.target)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const schultypen = [...new Set(schulen.map(s => s.schulart).filter(Boolean))].sort()
  const gefilterteSchulen = schulTypFilter ? schulen.filter(s => s.schulart === schulTypFilter) : schulen

  const hasSavedOrt = !!savedBundesland && !!savedOrt
  const hasSavedSchule = !!savedSchuleId
  const showOrtEditor = editOrt || !hasSavedOrt
  const showSchuleCard = !!(showOrtEditor 
