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
  RefreshCw, Upload, Building2, Users, TrendingUp, Loader2, Mail, Sparkles, GitBranch,
  ChevronDown, ChevronRight as ChevronRightIcon, ExternalLink, ScanSearch
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

export default function Home() {
  const [homes, setHomes]           = useState<FuneralHome[]>([])
  const [total, setTotal]           = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [stats, setStats]           = useState<Stats | null>(null)
  const [loading, setLoading]       = useState(false)
  const [importing, setImporting]   = useState(false)
  const [importMsg, setImportMsg]   = useState('')
  const [enriching, setEnriching]     = useState(false)
  const [enrichMsg, setEnrichMsg]     = useState('')
  const [detecting, setDetecting]     = useState(false)
  const [detectMsg, setDetectMsg]     = useState('')
  const [scraping, setScraping]       = useState(false)
  const [scrapeMsg, setScrapeMsg]     = useState('')
  const [expanded, setExpanded]       = useState<Record<string, boolean>>({})
  const [siblings, setSiblings]       = useState<Record<string, FuneralHome[]>>({})
  const [loadingSiblings, setLoadingSiblings] = useState<Record<string, boolean>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filters, setFilters]       = useState<FuneralHomeFilters>({
    page: 1, per_page: 50, sort_by: 'obits_count', sort_dir: 'desc'
  })

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

  const parseCSV = (text: string): Record<string, string>[] => {
    const rows: Record<string, string>[] = []
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    if (!lines.length) return rows

    // Proper CSV parser that handles quoted fields
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
    let done = 0
    let errors = 0
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

  const handleDetectLocations = async () => {
    const ids = [...selectedIds]
    const label = ids.length > 0 ? `${ids.length} selected` : '10'
    setDetecting(true)
    setDetectMsg(`Finding all Google Maps locations for ${label} businesses…`)
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids.length > 0 ? { ids } : { limit: 10 }),
      })
      const json = await res.json()
      if (json.error) setDetectMsg(`❌ ${json.error}`)
      else if (json.message) setDetectMsg(`ℹ️ ${json.message}`)
      else setDetectMsg(`✅ Processed ${json.processed} records — ${json.new_locations} new sibling locations added.`)
    } catch { setDetectMsg(`❌ Network error`) }
    setDetecting(false)
    setSelectedIds(new Set())
    fetchStats(); fetchHomes()
  }

  const toggleLocations = async (home: FuneralHome) => {
    const id = home.id
    const isOpen = expanded[id]
    setExpanded(prev => ({ ...prev, [id]: !isOpen }))
    if (isOpen || siblings[id]) return  // already loaded or closing

    setLoadingSiblings(prev => ({ ...prev, [id]: true }))
    const brand = (home as unknown as Record<string,unknown>)['parent_company'] as string || home.name
    const encoded = encodeURIComponent(brand)
    const res = await fetch(`/api/funeral-homes?parent_company=${encoded}&per_page=50&sort_by=google_reviews&sort_dir=desc`)
    const json = await res.json()
    // Exclude self
    const sibs = (json.data as FuneralHome[]).filter(r => r.id !== id)
    setSiblings(prev => ({ ...prev, [id]: sibs }))
    setLoadingSiblings(prev => ({ ...prev, [id]: false }))
  }

  const handleScrape = async () => {
    const ids = [...selectedIds]
    const label = ids.length > 0 ? `${ids.length} selected` : '10'
    setScraping(true)
    setScrapeMsg(`Scraping ${label} websites — detecting software platform, obituary count, locations…`)
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids.length > 0 ? { ids } : { limit: 10 }),
      })
      const json = await res.json()
      if (json.error) setScrapeMsg(`❌ ${json.error}`)
      else if (json.message) setScrapeMsg(`ℹ️ ${json.message}`)
      else {
        const summary = (json.results as Array<{name:string;software:string|null;obits:number;locations:number}>)
          .map(r => `${r.name}: ${r.software || '?'}, ${r.obits} obits`).join(' · ')
        setScrapeMsg(`✅ Scraped ${json.scraped}/${json.total} — ${summary}`)
      }
    } catch { setScrapeMsg(`❌ Network error`) }
    setScraping(false)
    setSelectedIds(new Set())
    fetchHomes()
  }

  const handleEnrich = async () => {
    const ids = [...selectedIds]
    const label = ids.length > 0 ? `${ids.length} selected` : '50'
    setEnriching(true)
    setEnrichMsg(`Looking up ${label} records on Google Business — address, phone, reviews, rating…`)
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids.length > 0 ? { ids } : { limit: 50 }),
      })
      const json = await res.json()
      if (json.error) setEnrichMsg(`❌ ${json.error}`)
      else setEnrichMsg(`✅ Enriched ${json.enriched}/${json.total} records. ${json.groups} multi-location groups found.`)
    } catch { setEnrichMsg(`❌ Network error`) }
    setEnriching(false)
    setSelectedIds(new Set())
    fetchStats(); fetchHomes()
  }

  const updateStatus = async (id: string, lead_status: string) => {
    await fetch(`/api/funeral-homes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_status })
    })
    setHomes(prev => prev.map(h => h.id === id ? { ...h, lead_status: lead_status as FuneralHome['lead_status'] } : h))
  }

  const setFilter = (key: keyof FuneralHomeFilters, value: string | null | undefined) =>
    setFilters(prev => ({ ...prev, [key]: value ?? undefined, page: 1 }))

  return (
    <div className="min-h-screen bg-gray-50">
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

          {/* ── Enrichment actions ── */}
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1 bg-gray-50">
            <ActionButton
              icon={<Sparkles className="w-3.5 h-3.5" />}
              label={selCount > 0 ? `Enrich ${selCount}` : 'Enrich 50'}
              tooltip="Look up each funeral home on Google Business Profile to get verified address, phone number, star rating and review count."
              color="violet"
              loading={enriching}
              onClick={handleEnrich}
            />
            <ActionButton
              icon={<GitBranch className="w-3.5 h-3.5" />}
              label={selCount > 0 ? `Locations ${selCount}` : 'Find Locations'}
              tooltip="Search Google Maps for all branches of the same business. Discovers sibling locations (e.g. a chain with 8 chapels) and links them together with a shared location count."
              color="indigo"
              loading={detecting}
              onClick={handleDetectLocations}
            />
            <ActionButton
              icon={<ScanSearch className="w-3.5 h-3.5" />}
              label={selCount > 0 ? `Scrape ${selCount}` : 'Scrape 10'}
              tooltip="Visit each funeral home's own website to detect which software platform they use (Tukios, Parting Pro, FuneralOne, etc.), count obituaries, and extract location pages."
              color="emerald"
              loading={scraping}
              onClick={handleScrape}
            />
          </div>

          <Button variant="outline" size="sm" onClick={() => { setSelectedIds(new Set()); fetchStats(); fetchHomes() }}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {importMsg && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 text-sm text-blue-700 flex items-center gap-2">
          {importing && <Loader2 className="w-4 h-4 animate-spin" />}
          {importMsg}
        </div>
      )}
      {enrichMsg && (
        <div className="bg-violet-50 border-b border-violet-200 px-6 py-2 text-sm text-violet-700 flex items-center gap-2">
          {enriching && <Loader2 className="w-4 h-4 animate-spin" />}
          {enrichMsg}
        </div>
      )}
      {detectMsg && (
        <div className="bg-indigo-50 border-b border-indigo-200 px-6 py-2 text-sm text-indigo-700 flex items-center gap-2">
          {detecting && <Loader2 className="w-4 h-4 animate-spin" />}
          {detectMsg}
        </div>
      )}
      {scrapeMsg && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-sm text-emerald-700 flex items-center gap-2 flex-wrap">
          {scraping && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
          {scrapeMsg}
        </div>
      )}

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
              <React.Fragment key={home.id}>
              <tr className={`hover:bg-gray-50 transition-colors ${selectedIds.has(home.id) ? 'bg-violet-50' : expanded[home.id] ? 'bg-indigo-50/40' : ''}`}>
                <td className="pl-4 pr-2 py-3 w-8">
                  <input type="checkbox"
                    className="rounded border-gray-300 cursor-pointer"
                    checked={selectedIds.has(home.id)}
                    onChange={e => setSelectedIds(prev => {
                      const n = new Set(prev)
                      e.target.checked ? n.add(home.id) : n.delete(home.id)
                      return n
                    })}
                  />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                  <div className="flex items-start gap-1.5">
                    {home.location_count != null && home.location_count > 1 ? (
                      <button onClick={() => toggleLocations(home)}
                        className="mt-0.5 flex-shrink-0 text-indigo-500 hover:text-indigo-700 transition-colors">
                        {expanded[home.id]
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRightIcon className="w-4 h-4" />}
                      </button>
                    ) : (
                      <span className="w-4 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate">{home.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {home.source && <span className="text-xs text-gray-400">{home.source}</span>}
                        {home.location_count != null && home.location_count > 1 && (
                          <button onClick={() => toggleLocations(home)}
                            className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium hover:bg-indigo-200 transition-colors">
                            {home.location_count} locations
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                  {home.address && home.maps_place_id
                    ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(home.name)}&query_place_id=${home.maps_place_id}`}
                        target="_blank" rel="noopener noreferrer"
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
                    ? <a href={`tel:${home.phone}`} className="flex items-center gap-1 text-xs text-green-700 hover:underline">
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
                    onChange={e => updateStatus(home.id, e.target.value)}
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
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline truncate">
                          <Globe className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{home.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                        </a>
                        {home.echovita_url && (
                          <a href={home.echovita_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-gray-600 block">Echovita ↗</a>
                        )}
                        {home.legacy_url && (
                          <a href={home.legacy_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-gray-600 block">Legacy ↗</a>
                        )}
                      </div>
                    : home.echovita_url
                      ? <a href={home.echovita_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-gray-400 hover:text-gray-600">Echovita ↗</a>
                      : home.legacy_url
                        ? <a href={home.legacy_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-gray-600">Legacy ↗</a>
                        : '—'}
                </td>
              </tr>

              {/* ── Collapsible sibling locations ── */}
              {expanded[home.id] && (
                <tr key={`${home.id}-locations`}>
                  <td colSpan={9} className="px-0 py-0 bg-indigo-50/60 border-b border-indigo-100">
                    {loadingSiblings[home.id] ? (
                      <div className="flex items-center gap-2 px-10 py-3 text-xs text-indigo-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading locations…
                      </div>
                    ) : (
                      <div className="px-6 py-3">
                        <div className="text-xs font-semibold text-indigo-600 mb-2 flex items-center gap-1.5">
                          <GitBranch className="w-3.5 h-3.5" />
                          {(home as unknown as Record<string,unknown>)['parent_company'] as string || home.name}
                          <span className="font-normal text-indigo-400">· {(siblings[home.id]?.length ?? 0) + 1} locations total</span>
                        </div>
                        <div className="grid gap-1">
                          {/* Self row */}
                          <LocationRow home={home} isSelf />
                          {/* Siblings */}
                          {(siblings[home.id] || []).map(sib => (
                            <LocationRow key={sib.id} home={sib} />
                          ))}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )}
              </React.Fragment>
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
    </div>
  )
}

// ── Software tags: shows all detected platforms, source-known + scrape-detected ──
function SoftwareTags({ home }: { home: FuneralHome }) {
  const tags: Array<{ key: string; fromScrape: boolean }> = []

  // Collect from boolean flags (source-known)
  if (home.uses_parting_pro) tags.push({ key: 'parting_pro', fromScrape: false })
  if (home.uses_efuneral)    tags.push({ key: 'efuneral',    fromScrape: false })
  if (home.uses_tukios)      tags.push({ key: 'tukios',      fromScrape: false })

  // From software_detected field (could be source or scrape)
  if (home.software_detected && !tags.find(t => t.key === home.software_detected)) {
    tags.push({ key: home.software_detected, fromScrape: false })
  }

  // From website scrape — add if different from above
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

// ── Action button with tooltip ─────────────────────────────────────────────────
function ActionButton({ icon, label, tooltip, color, loading, onClick }: {
  icon: React.ReactNode; label: string; tooltip: string
  color: 'violet' | 'indigo' | 'emerald'; loading: boolean; onClick: () => void
}) {
  const colors = {
    violet:  'text-violet-700 hover:bg-violet-100',
    indigo:  'text-indigo-700 hover:bg-indigo-100',
    emerald: 'text-emerald-700 hover:bg-emerald-100',
  }
  return (
    <div className="relative group">
      <button
        disabled={loading}
        onClick={onClick}
        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50 ${colors[color]}`}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
        {label}
      </button>
      {/* Tooltip */}
      <div className="absolute right-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg
                      opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed">
        {tooltip}
        <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 rotate-45" />
      </div>
    </div>
  )
}

function LocationRow({ home, isSelf = false }: { home: FuneralHome; isSelf?: boolean }) {
  const mapsUrl = home.maps_place_id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(home.name)}&query_place_id=${home.maps_place_id}`
    : null

  return (
    <div className={`flex items-center gap-3 py-1.5 px-3 rounded-md text-xs ${isSelf ? 'bg-indigo-100/60 font-medium' : 'bg-white/70 hover:bg-white'}`}>
      {/* Name + self badge */}
      <div className="w-52 flex-shrink-0 flex items-center gap-1.5 min-w-0">
        {isSelf && <span className="text-[10px] bg-indigo-500 text-white px-1 py-0.5 rounded flex-shrink-0">this</span>}
        <span className="truncate text-gray-800">{home.name}</span>
      </div>

      {/* Address → Google Business Profile */}
      <div className="flex-1 min-w-0">
        {home.address && mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:underline truncate group">
            <MapPin className="w-3 h-3 flex-shrink-0 text-blue-400" />
            <span className="truncate">{home.address}</span>
            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ) : (
          <span className="text-gray-400">{home.address || [home.city, home.state_abbr].filter(Boolean).join(', ') || '—'}</span>
        )}
      </div>

      {/* Reviews */}
      <div className="w-24 flex-shrink-0">
        {home.google_reviews && mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 hover:underline">
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
            <span className="text-gray-700">{home.google_rating?.toFixed(1)}</span>
            <span className="text-gray-400">({home.google_reviews.toLocaleString()})</span>
          </a>
        ) : <span className="text-gray-300">—</span>}
      </div>

      {/* Phone */}
      <div className="w-32 flex-shrink-0">
        {home.phone
          ? <a href={`tel:${home.phone}`} className="flex items-center gap-1 text-green-700 hover:underline">
              <Phone className="w-3 h-3" />{home.phone}
            </a>
          : <span className="text-gray-300">—</span>}
      </div>

      {/* Website */}
      <div className="w-36 flex-shrink-0 min-w-0">
        {home.website
          ? <a href={home.website} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:underline truncate">
              <Globe className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{home.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
            </a>
          : <span className="text-gray-300">—</span>}
      </div>

      {/* Source badge */}
      <div className="w-24 flex-shrink-0">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          home.source === 'google_locations' ? 'bg-green-100 text-green-700' :
          home.source === 'echovita' ? 'bg-blue-100 text-blue-700' :
          home.source === 'parting_pro' ? 'bg-violet-100 text-violet-700' :
          'bg-gray-100 text-gray-500'
        }`}>{home.source}</span>
      </div>
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
