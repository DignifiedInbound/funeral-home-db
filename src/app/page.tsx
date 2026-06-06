'use client'

import { useEffect, useState, useCallback } from 'react'
import { FuneralHome, FuneralHomeFilters } from '@/types/funeral-home'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search, Phone, Globe, MapPin, Star,
  BookOpen, ChevronLeft, ChevronRight, Download,
  RefreshCw, Upload, Building2, Users, TrendingUp, Loader2, Mail, Sparkles
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
  parting_pro: 'bg-violet-100 text-violet-800',
  efuneral:    'bg-orange-100 text-orange-800',
  tukios:      'bg-teal-100 text-teal-800',
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
  const [enriching, setEnriching]   = useState(false)
  const [enrichMsg, setEnrichMsg]   = useState('')
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

  const handleEnrich = async (batchSize = 50) => {
    setEnriching(true)
    setEnrichMsg(`Enriching next ${batchSize} records with Google data…`)
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: batchSize }),
      })
      const json = await res.json()
      if (json.error) setEnrichMsg(`❌ ${json.error}`)
      else setEnrichMsg(`✅ Enriched ${json.enriched}/${json.total} records. ${json.groups} multi-location groups found.`)
    } catch (e) {
      setEnrichMsg(`❌ Network error`)
    }
    setEnriching(false)
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
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <Button variant="outline" size="sm" disabled={importing} onClick={() => document.getElementById('csv-import')?.click()}>
              <Upload className="w-4 h-4 mr-1" />Import CSV
            </Button>
            <input id="csv-import" type="file" accept=".csv" onChange={handleImport} className="hidden" />
          </label>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" />Export
          </Button>
          <Button variant="outline" size="sm" disabled={enriching} onClick={() => handleEnrich(50)}
            className="text-violet-700 border-violet-200 hover:bg-violet-50">
            {enriching ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
            Enrich 50
          </Button>
          <Button variant="outline" size="sm" onClick={() => { fetchStats(); fetchHomes() }}>
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
              {['Name','Address','Obits','Reviews','Phone','Software','Status','Website'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading…
              </td></tr>
            ) : homes.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400">
                No funeral homes found.<br />
                <span className="text-xs">Import funeral_homes_master.csv to get started.</span>
              </td></tr>
            ) : homes.map(home => (
              <tr key={home.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                  <div className="truncate">{home.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {home.source && <span className="text-xs text-gray-400">{home.source}</span>}
                    {home.location_count != null && home.location_count > 1 && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                        {home.location_count} locations
                      </span>
                    )}
                    {home.maps_place_id && (
                      <a href={`https://maps.google.com/?q=place_id:${home.maps_place_id}`}
                        target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-600">📍</a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                  {home.address
                    ? <div className="text-xs leading-tight truncate" title={home.address}>{home.address}</div>
                    : <div className="flex items-center gap-1 text-xs text-gray-400">
                        <MapPin className="w-3 h-3" />
                        {[home.city, home.state_abbr].filter(Boolean).join(', ') || '—'}
                      </div>
                  }
                </td>
                <td className="px-4 py-3 text-right">
                  {home.obits_count
                    ? <span className="font-semibold text-blue-700 font-mono">{home.obits_count.toLocaleString()}</span>
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {home.google_reviews ? (
                    <div className="flex items-center gap-1 text-xs">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      <span>{home.google_rating?.toFixed(1)}</span>
                      <span className="text-gray-400">({home.google_reviews})</span>
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
                  {home.software_detected
                    ? <Badge className={`text-xs ${SOFTWARE_COLORS[home.software_detected] || 'bg-gray-100 text-gray-600'}`}>
                        {home.software_detected}
                      </Badge>
                    : '—'}
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
                <td className="px-4 py-3">
                  {home.website
                    ? <a href={home.website} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline max-w-32 truncate">
                        <Globe className="w-3 h-3 flex-shrink-0" />
                        {home.website.replace(/^https?:\/\/(www\.)?/, '')}
                      </a>
                    : home.echovita_url
                      ? <a href={home.echovita_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-gray-400 hover:text-gray-600">Echovita ↗</a>
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
