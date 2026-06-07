'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { FuneralHome, FuneralHomeFilters } from '@/types/funeral-home'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search, Phone, Globe, MapPin, Star,
  BookOpen, ChevronLeft, ChevronRight, Download,
  RefreshCw, Upload, Building2, Users, TrendingUp, Loader2, Mail, X,
  ExternalLink, FlaskConical
} from 'lucide-react'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC']

const STATUS_COLORS: Record<string, string> = {
  prospect:          'bg-blue-100 text-blue-800',
  contacted:         'bg-yellow-100 text-yellow-800',
  qualified:         'bg-purple-100 text-purple-800',
  existing_customer: 'bg-green-100 text-green-800',
  churned:           'bg-red-100 text-red-800',
  not_a_fit:         'bg-gray-100 text-gray-600',
}

const SOFTWARE_COLORS: Record<string, string> = {
  parting_pro:   'bg-violet-100 text-violet-800',
  efuneral:      'bg-orange-100 text-orange-800',
  tukios:        'bg-teal-100 text-teal-800',
  frontrunner:   'bg-sky-100 text-sky-800',
  funeralone:    'bg-pink-100 text-pink-800',
  tribute_tech:  'bg-lime-100 text-lime-800',
  osiris:        'bg-amber-100 text-amber-800',
  batesville:    'bg-rose-100 text-rose-800',
  frazer:        'bg-cyan-100 text-cyan-800',
  domani:        'bg-fuchsia-100 text-fuchsia-800',
  legacy_embed:  'bg-indigo-100 text-indigo-800',
  wordpress:     'bg-blue-100 text-blue-800',
  wix:           'bg-yellow-100 text-yellow-800',
  squarespace:   'bg-gray-100 text-gray-700',
}

const SOFTWARE_LABELS: Record<string, string> = {
  parting_pro:   'Parting Pro',
  efuneral:      'eFuneral',
  tukios:        'Tukios',
  frontrunner:   'FrontRunner',
  funeralone:    'FuneralOne',
  tribute_tech:  'Tribute Tech',
  osiris:        'Osiris',
  batesville:    'Batesville',
  frazer:        'Frazer',
  domani:        'Domani',
  legacy_embed:  'Legacy',
  wordpress:     'WordPress',
  wix:           'Wix',
  squarespace:   'Squarespace',
}

interface Stats {
  total: number; with_phone: number; with_email: number; with_obits: number
  by_status: Record<string, number>; by_software: Record<string, number>
}

type ResearchStep = '' | 'enrich' | 'locations' | 'scrape' | 'done'

export default function Home() {
  const [homes, setHomes]           = useState<FuneralHome[]>([])
  const [total, setTotal]           = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [stats, setStats]           = useState<Stats | null>(null)
  const [loading, setLoading]       = useState(false)
  const [importing, setImporting]   = useState(false)
  const [importMsg, setImportMsg]   = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filters, setFilters]       = useState<FuneralHomeFilters>({
    page: 1, per_page: 50, sort_by: 'obits_count', sort_dir: 'desc'
  })

  // Research pipeline state
  const [researching, setResearching]   = useState(false)
  const [researchStep, setResearchStep] = useState<ResearchStep>('')
  const [researchMsg, setResearchMsg]   = useState('')

  // Detail panel
  const [selectedHome, setSelectedHome] = useState<FuneralHome | null>(null)

  const fetchHomes = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)) })
    const res = await fetch(`/api/funeral-homes?${params}`)
    const json = await res.json()
    setHomes(json.data || [])
    setTotal(json.total || 0)
    setTotalPages(json.total_pages || 1)
    setLoading(false)
  }, [filters])

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/stats')
    setStats(await res.json())
  }, [])

  useEffect(() => { fetchHomes() }, [fetchHomes])
  useEffect(() => { fetchStats() }, [fetchStats])

  // Close panel on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedHome(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const parseCSV = (text: string): Record<string, string>[] => {
    const rows: Record<string, string>[] = []
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    if (!lines.length) return rows
    const parseLine = (line: string): string[] => {
      const fields: string[] = []
      let field = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { field += '"'; i++ }
          else inQuotes = !inQuotes
        } else if (ch === ',' && !inQuotes) {
          fields.push(field.trim()); field = ''
        } else {
          field += ch
        }
      }
      fields.push(field.trim())
      return fields
    }
    const headers = parseLine(lines[0])
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      const vals = parseLine(lines[i])
      rows.push(Object.fromEntries(headers.map((h, j) => [h.trim(), vals[j]?.trim() || ''])))
    }
    return rows
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMsg('Parsing CSV…')
    const text = await file.text()
    const rows = parseCSV(text)
    if (!rows.length) { setImportMsg('❌ Could not parse CSV — check the file format.'); setImporting(false); return }
    setImportMsg(`Importing ${rows.length.toLocaleString()} rows…`)
    const BATCH = 500
    let done = 0; let errors = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH)
      const res = await fetch('/api/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: chunk })
      })
      const json = await res.json()
      if (json.error) { errors++; console.error('Import error:', json.error) }
      done += json.inserted || 0
      setImportMsg(`Imported ${done.toLocaleString()} / ${rows.length.toLocaleString()}…${errors ? ` (${errors} errors)` : ''}`)
    }
    setImportMsg(`✅ Done! ${done.toLocaleString()} records imported.${errors ? ` ⚠️ ${errors} batch errors — check console.` : ''}`)
    setImporting(false)
    fetchStats(); fetchHomes()
    e.target.value = ''
  }

  const handleExport = async () => {
    const params = new URLSearchParams()
    Object.entries({ ...filters, per_page: 50000, page: 1 }).forEach(([k, v]) => {
      if (v !== undefined && v !== '') params.set(k, String(v))
    })
    const res = await fetch(`/api/funeral-homes?${params}`)
    const json = await res.json()
    const rows = json.data as FuneralHome[]
    const headers = ['name','city','state','state_abbr','obits_count','phone','email',
      'website','owner_name','source','software_detected','lead_status','google_reviews','google_rating']
    const csv = [headers.join(','),
      ...rows.map(r => headers.map(h => JSON.stringify((r as unknown as Record<string,unknown>)[h] ?? '')).join(','))
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `funeral-homes-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const selCount = selectedIds.size

  const handleResearch = async () => {
    const ids = [...selectedIds]
    setResearching(true)

    // Step 1: Enrich
    setResearchStep('enrich')
    setResearchMsg('Step 1/3: Enriching with Google…')
    try {
      await fetch('/api/enrich', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids.length > 0 ? { ids } : { limit: 50 }),
      })
    } catch { /* continue */ }

    // Step 2: Find Locations
    setResearchStep('locations')
    setResearchMsg('Step 2/3: Finding locations…')
    try {
      await fetch('/api/locations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids.length > 0 ? { ids } : { limit: 10 }),
      })
    } catch { /* continue */ }

    // Step 3: Scrape
    setResearchStep('scrape')
    setResearchMsg('Step 3/3: Scraping websites…')
    try {
      await fetch('/api/scrape', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids.length > 0 ? { ids } : { limit: 10 }),
      })
    } catch { /* continue */ }

    setResearchStep('done')
    setResearchMsg('✅ Done')
    setResearching(false)
    setSelectedIds(new Set())
    fetchStats(); fetchHomes()
  }

  const updateStatus = async (id: string, lead_status: string) => {
    await fetch(`/api/funeral-homes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_status })
    })
    setHomes(prev => prev.map(h => h.id === id ? { ...h, lead_status: lead_status as FuneralHome['lead_status'] } : h))
    if (selectedHome?.id === id) {
      setSelectedHome(prev => prev ? { ...prev, lead_status: lead_status as FuneralHome['lead_status'] } : null)
    }
  }

  const setFilter = (key: keyof FuneralHomeFilters, value: string | null | undefined) =>
    setFilters(prev => ({ ...prev, [key]: value ?? undefined, page: 1 }))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header + filter bar */}
      <div className="sticky top-0 z-40">
        {/* Header */}
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-gray-700" />
            <h1 className="text-xl font-semibold text-gray-900">Funeral Home Database</h1>
            {stats && <span className="text-sm text-gray-500 ml-2">{stats.total.toLocaleString()} records</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selCount > 0 && (
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {selCount} selected
              </span>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <Button variant="outline" size="sm" disabled={importing} onClick={() => document.getElementById('csv-import')?.click()}>
                <Upload className="w-4 h-4 mr-1" />Import CSV
              </Button>
              <input id="csv-import" type="file" accept=".csv" onChange={handleImport} className="hidden" />
            </label>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1" />Export
            </Button>

            {/* Research button */}
            <Button
              size="sm"
              disabled={researching}
              onClick={handleResearch}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
            >
              {researching
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FlaskConical className="w-3.5 h-3.5" />}
              {selCount > 0 ? `Research ${selCount}` : 'Research'}
            </Button>

            <Button variant="outline" size="sm" onClick={() => { setSelectedIds(new Set()); fetchStats(); fetchHomes() }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Progress status bar */}
        {researchStep && (
          <div className={`border-b px-6 py-2 text-sm flex items-center gap-2 ${researchStep === 'done' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-violet-50 border-violet-200 text-violet-700'}`}>
            {researching && <Loader2 className="w-4 h-4 animate-spin" />}
            {researchMsg}
          </div>
        )}
        {importMsg && (
          <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 text-sm text-blue-700 flex items-center gap-2">
            {importing && <Loader2 className="w-4 h-4 animate-spin" />}
            {importMsg}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border-b px-6 py-3 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <Input placeholder="Search funeral homes…" className="pl-9 h-9"
              onChange={e => setFilter('search', e.target.value || undefined)} />
          </div>
          <Select onValueChange={(v: string | null) => setFilter('state', (!v || v === 'all') ? undefined : v)}>
            <SelectTrigger className="w-28 h-9"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select onValueChange={(v: string | null) => setFilter('source', (!v || v === 'all') ? undefined : v)}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {['echovita','legacy_com','parting_pro','efuneral','tukios'].map(s =>
                <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select onValueChange={(v: string | null) => setFilter('lead_status', (!v || v === 'all') ? undefined : v)}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {['prospect','contacted','qualified','existing_customer','not_a_fit','churned'].map(s =>
                <SelectItem key={s} value={s}>{s.replace(/_/g,' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select onValueChange={(v: string | null) => setFilter('software', (!v || v === 'all') ? undefined : v)}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Software" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Software</SelectItem>
              <SelectItem value="parting_pro">Parting Pro</SelectItem>
              <SelectItem value="efuneral">eFuneral</SelectItem>
              <SelectItem value="tukios">Tukios</SelectItem>
              <SelectItem value="none">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <Select onValueChange={(v: string | null) => setFilter('sort_by', v || undefined)}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Sort by" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="obits_count">Obit Volume</SelectItem>
              <SelectItem value="google_reviews">Reviews</SelectItem>
              <SelectItem value="name">Name A-Z</SelectItem>
              <SelectItem value="created_at">Date Added</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-gray-500 ml-auto">{total.toLocaleString()} results</span>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="bg-white border-b px-6 py-4 flex gap-8">
          <StatChip icon={<Building2 className="w-4 h-4" />} label="Total"      value={stats.total.toLocaleString()} />
          <div className="w-px bg-gray-100" />
          <StatChip icon={<BookOpen className="w-4 h-4" />}  label="With Obits" value={stats.with_obits.toLocaleString()} color="text-blue-600" />
          <StatChip icon={<Phone className="w-4 h-4" />}     label="With Phone" value={stats.with_phone.toLocaleString()} color="text-green-600" />
          <StatChip icon={<Mail className="w-4 h-4" />}      label="With Email" value={stats.with_email.toLocaleString()} color="text-green-600" />
          <div className="w-px bg-gray-100" />
          <StatChip icon={<Users className="w-4 h-4" />}        label="Prospects"  value={(stats.by_status?.prospect || 0).toLocaleString()}          color="text-blue-600" />
          <StatChip icon={<TrendingUp className="w-4 h-4" />}   label="Contacted"  value={(stats.by_status?.contacted || 0).toLocaleString()}          color="text-yellow-600" />
          <StatChip icon={<TrendingUp className="w-4 h-4" />}   label="Qualified"  value={(stats.by_status?.qualified || 0).toLocaleString()}          color="text-purple-600" />
          <StatChip icon={<TrendingUp className="w-4 h-4" />}   label="Customers"  value={(stats.by_status?.existing_customer || 0).toLocaleString()}  color="text-green-600" />
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="pl-4 pr-2 py-3 w-8">
                <input type="checkbox"
                  className="rounded border-gray-300 cursor-pointer"
                  checked={homes.length > 0 && homes.every(h => selectedIds.has(h.id))}
                  onChange={e => {
                    if (e.target.checked) setSelectedIds(prev => new Set([...prev, ...homes.map(h => h.id)]))
                    else setSelectedIds(prev => { const n = new Set(prev); homes.forEach(h => n.delete(h.id)); return n })
                  }}
                />
              </th>
              {['Name','Address','Obits','Reviews','Phone','Software','Status','Website'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading…
              </td></tr>
            ) : homes.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                No funeral homes found.<br />
                <span className="text-xs">Import funeral_homes_master.csv to get started.</span>
              </td></tr>
            ) : homes.map(home => (
              <tr
                key={home.id}
                className={`hover:bg-gray-50 transition-colors cursor-pointer ${selectedIds.has(home.id) ? 'bg-violet-50' : ''}`}
                onClick={() => setSelectedHome(home)}
              >
                <td className="pl-4 pr-2 py-3 w-8">
                  <input type="checkbox"
                    className="rounded border-gray-300 cursor-pointer"
                    checked={selectedIds.has(home.id)}
                    onClick={e => e.stopPropagation()}
                    onChange={e => {
                      e.stopPropagation()
                      setSelectedIds(prev => {
                        const n = new Set(prev)
                        e.target.checked ? n.add(home.id) : n.delete(home.id)
                        return n
                      })
                    }}
                  />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                  <div className="min-w-0">
                    <div className="truncate">{home.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {home.source && <span className="text-xs text-gray-400">{home.source}</span>}
                      {home.location_count != null && home.location_count > 1 && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                          {home.location_count} locations
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                  {home.address && home.maps_place_id
                    ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(home.name)}&query_place_id=${home.maps_place_id}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-start gap-1 text-xs text-blue-600 hover:underline leading-tight group">
                        <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5 group-hover:text-blue-700" />
                        <span className="truncate" title={home.address}>{home.address}</span>
                      </a>
                    : home.address
                      ? <div className="text-xs leading-tight truncate text-gray-500" title={home.address}>{home.address}</div>
                      : <div className="flex items-center gap-1 text-xs text-gray-400">
                          <MapPin className="w-3 h-3" />
                          {[home.city, home.state_abbr].filter(Boolean).join(', ') || '—'}
                        </div>
                  }
                </td>
                <td className="px-4 py-3 text-right">
                  {home.obits_count
                    ? <span className="font-semibold text-blue-700 font-mono">{home.obits_count.toLocaleString()}</span>
                    : (home as unknown as Record<string,unknown>)['website_obit_count']
                      ? <span className="text-gray-500 font-mono text-xs" title="From website scrape">
                          ~{((home as unknown as Record<string,unknown>)['website_obit_count'] as number).toLocaleString()}
                        </span>
                      : '—'}
                </td>
                <td className="px-4 py-3">
                  {home.google_reviews && home.maps_place_id ? (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(home.name)}&query_place_id=${home.maps_place_id}`}
                       target="_blank" rel="noopener noreferrer"
                       onClick={e => e.stopPropagation()}
                       className="flex items-center gap-1 text-xs hover:underline">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      <span className="font-medium text-gray-700">{home.google_rating?.toFixed(1)}</span>
                      <span className="text-gray-400">({home.google_reviews.toLocaleString()})</span>
                    </a>
                  ) : home.google_reviews ? (
                    <div className="flex items-center gap-1 text-xs">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      <span>{home.google_rating?.toFixed(1)}</span>
                      <span className="text-gray-400">({home.google_reviews.toLocaleString()})</span>
                    </div>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">
                  {home.phone
                    ? <a href={`tel:${home.phone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-xs text-green-700 hover:underline">
                        <Phone className="w-3 h-3" />{home.phone}
                      </a>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-3">
                  <SoftwareTags home={home} />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={home.lead_status}
                    onClick={e => e.stopPropagation()}
                    onChange={e => { e.stopPropagation(); updateStatus(home.id, e.target.value) }}
                    className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${STATUS_COLORS[home.lead_status] || 'bg-gray-100'}`}
                  >
                    {Object.keys(STATUS_COLORS).map(s => (
                      <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 max-w-[160px]">
                  {home.website
                    ? <div className="space-y-0.5">
                        <a href={home.website} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline truncate">
                          <Globe className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{home.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                        </a>
                        {home.echovita_url && (
                          <a href={home.echovita_url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-gray-400 hover:text-gray-600 block">Echovita ↗</a>
                        )}
                        {home.legacy_url && (
                          <a href={home.legacy_url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-gray-400 hover:text-gray-600 block">Legacy ↗</a>
                        )}
                      </div>
                    : home.echovita_url
                      ? <a href={home.echovita_url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-xs text-gray-400 hover:text-gray-600">Echovita ↗</a>
                      : home.legacy_url
                        ? <a href={home.legacy_url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-gray-400 hover:text-gray-600">Legacy ↗</a>
                        : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white border-t px-6 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Page {filters.page} of {totalPages} · {total.toLocaleString()} total
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={filters.page === 1}
            onClick={() => setFilters(p => ({ ...p, page: (p.page || 1) - 1 }))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={filters.page === totalPages}
            onClick={() => setFilters(p => ({ ...p, page: (p.page || 1) + 1 }))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Detail panel backdrop */}
      {selectedHome && (
        <div
          className="fixed inset-0 bg-black/20 z-50"
          onClick={() => setSelectedHome(null)}
        />
      )}

      {/* Detail panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${selectedHome ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {selectedHome && <DetailPanel home={selectedHome} onClose={() => setSelectedHome(null)} onStatusChange={updateStatus} />}
      </div>
    </div>
  )
}

// ── Detail Panel ───────────────────────────────────────────────────────────────
function DetailPanel({ home, onClose, onStatusChange }: {
  home: FuneralHome
  onClose: () => void
  onStatusChange: (id: string, status: string) => void
}) {
  const mapsUrl = home.maps_place_id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(home.name)}&query_place_id=${home.maps_place_id}`
    : null

  const addressForEmbed = home.address || [home.city, home.state_abbr].filter(Boolean).join(', ')

  let websiteLocations: Array<{ name: string; address: string }> = []
  try {
    const raw = (home as unknown as Record<string, unknown>)['website_locations']
    if (typeof raw === 'string' && raw) websiteLocations = JSON.parse(raw)
    else if (Array.isArray(raw)) websiteLocations = raw as Array<{ name: string; address: string }>
  } catch { /* ignore */ }

  const parentCompany = (home as unknown as Record<string, unknown>)['parent_company'] as string | undefined
  const obitsCount = home.obits_count
  const websiteObitCount = (home as unknown as Record<string, unknown>)['website_obit_count'] as number | undefined
  const lastEnrichedAt = (home as unknown as Record<string, unknown>)['last_enriched_at'] as string | undefined
  const lastScrapedAt = (home as unknown as Record<string, unknown>)['last_scraped_at'] as string | undefined
  const websiteScrapeStatus = (home as unknown as Record<string, unknown>)['website_scrape_status'] as string | undefined

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-start justify-between px-6 py-4 border-b flex-shrink-0">
        <div className="flex-1 min-w-0 pr-4">
          <h2 className="text-lg font-semibold text-gray-900 leading-snug">{home.name}</h2>
          <div className="mt-2">
            <select
              value={home.lead_status}
              onChange={e => onStatusChange(home.id, e.target.value)}
              className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${STATUS_COLORS[home.lead_status] || 'bg-gray-100'}`}
            >
              {Object.keys(STATUS_COLORS).map(s => (
                <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

        {/* Google Business */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Google Business</h3>
          <div className="space-y-1.5 text-sm">
            {home.address && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                {mapsUrl
                  ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline leading-snug">
                      {home.address}
                    </a>
                  : <span className="text-gray-700 leading-snug">{home.address}</span>
                }
              </div>
            )}
            {home.google_reviews != null && (
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                {mapsUrl
                  ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {home.google_rating?.toFixed(1)} · {home.google_reviews.toLocaleString()} reviews
                    </a>
                  : <span className="text-gray-700">{home.google_rating?.toFixed(1)} · {home.google_reviews.toLocaleString()} reviews</span>
                }
              </div>
            )}
            {home.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <a href={`tel:${home.phone}`} className="text-green-700 hover:underline">{home.phone}</a>
              </div>
            )}
            {home.website && (
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <a href={home.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate flex items-center gap-1">
                  {home.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Map embed */}
        {addressForEmbed && (
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <iframe
              title="map"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(addressForEmbed)}&output=embed`}
              width="100%"
              height="180"
              style={{ border: 0 }}
              loading="lazy"
            />
          </div>
        )}

        {/* Software */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Software</h3>
          <SoftwareTags home={home} />
        </section>

        {/* Obituaries */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Obituaries</h3>
          <div className="space-y-1 text-sm">
            {obitsCount != null && (
              <div className="flex items-center gap-2 text-gray-700">
                <span className="font-semibold text-blue-700">{obitsCount.toLocaleString()}</span>
                <span className="text-gray-400 text-xs">from Echovita</span>
              </div>
            )}
            {websiteObitCount != null && (
              <div className="flex items-center gap-2 text-gray-700">
                <span className="font-semibold text-gray-600">~{websiteObitCount.toLocaleString()}</span>
                <span className="text-gray-400 text-xs">from website scrape</span>
              </div>
            )}
            {home.echovita_url && (
              <a href={home.echovita_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                Echovita profile <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {home.legacy_url && (
              <a href={home.legacy_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                Legacy profile <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {!obitsCount && !websiteObitCount && !home.echovita_url && !home.legacy_url && (
              <span className="text-xs text-gray-400">No obituary data</span>
            )}
          </div>
        </section>

        {/* Locations */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Locations</h3>
          <div className="space-y-1 text-sm text-gray-700">
            {parentCompany && (
              <div><span className="text-gray-400 text-xs">Parent company: </span>{parentCompany}</div>
            )}
            {home.location_count != null && home.location_count > 1 && (
              <div><span className="text-gray-400 text-xs">Total locations: </span>
                <span className="font-semibold">{home.location_count}</span>
              </div>
            )}
            {websiteLocations.length > 0 && (
              <div className="mt-2 space-y-1">
                {websiteLocations.map((loc, i) => (
                  <div key={i} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                    <div className="font-medium">{loc.name}</div>
                    {loc.address && <div className="text-gray-400">{loc.address}</div>}
                  </div>
                ))}
              </div>
            )}
            {!parentCompany && (home.location_count == null || home.location_count <= 1) && websiteLocations.length === 0 && (
              <span className="text-xs text-gray-400">Single location</span>
            )}
          </div>
        </section>

        {/* Source data */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Source Data</h3>
          <div className="space-y-1 text-xs text-gray-600">
            {home.source && <div><span className="text-gray-400">Source: </span>{home.source}</div>}
            {lastEnrichedAt && <div><span className="text-gray-400">Enriched: </span>{new Date(lastEnrichedAt).toLocaleString()}</div>}
            {lastScrapedAt && <div><span className="text-gray-400">Scraped: </span>{new Date(lastScrapedAt).toLocaleString()}</div>}
            {websiteScrapeStatus && <div><span className="text-gray-400">Scrape status: </span>{websiteScrapeStatus}</div>}
            {home.created_at && <div><span className="text-gray-400">Created: </span>{new Date(home.created_at).toLocaleString()}</div>}
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Software tags ──────────────────────────────────────────────────────────────
function SoftwareTags({ home }: { home: FuneralHome }) {
  const tags: Array<{ key: string; fromScrape: boolean }> = []

  if (home.uses_parting_pro) tags.push({ key: 'parting_pro', fromScrape: false })
  if (home.uses_efuneral)    tags.push({ key: 'efuneral',    fromScrape: false })
  if (home.uses_tukios)      tags.push({ key: 'tukios',      fromScrape: false })

  if (home.software_detected && !tags.find(t => t.key === home.software_detected)) {
    tags.push({ key: home.software_detected, fromScrape: false })
  }

  if (home.website_software && !tags.find(t => t.key === home.website_software)) {
    tags.push({ key: home.website_software, fromScrape: true })
  }

  if (tags.length === 0) {
    return home.last_scraped_at
      ? <span className="text-xs text-gray-300">none detected</span>
      : <span className="text-gray-300 text-xs">—</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(({ key, fromScrape }) => (
        <Badge key={key}
          className={`text-xs px-1.5 py-0 leading-5 ${SOFTWARE_COLORS[key] || 'bg-gray-100 text-gray-600'} ${fromScrape ? 'opacity-60' : ''}`}
          title={fromScrape ? `${key} — detected by website scrape` : `${key} — confirmed from source data`}>
          {SOFTWARE_LABELS[key] || key}
        </Badge>
      ))}
    </div>
  )
}

function StatChip({ icon, label, value, color = 'text-gray-700' }: {
  icon: React.ReactNode; label: string; value: string; color?: string
}) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className={`${color} flex items-center gap-1`}>{icon}</span>
      <div>
        <div className={`text-sm font-semibold ${color}`}>{value}</div>
        <div className="text-xs text-gray-400">{label}</div>
      </div>
    </div>
  )
}
