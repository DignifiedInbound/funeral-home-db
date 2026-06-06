export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || ''

// ─── Google helpers ───────────────────────────────────────────────────────────

interface PlaceResult {
  place_id: string
  name: string
  formatted_address?: string
  vicinity?: string
  geometry?: { location: { lat: number; lng: number } }
  rating?: number
  user_ratings_total?: number
}

interface AddressComponent { types: string[]; long_name: string; short_name: string }

async function textSearch(query: string): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ query, key: GOOGLE_API_KEY })
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`)
  const data = await res.json()
  return data.status === 'OK' ? (data.results || []) : []
}

async function placeDetails(placeId: string) {
  const fields = 'name,formatted_address,geometry,formatted_phone_number,website,rating,user_ratings_total,address_components'
  const params = new URLSearchParams({ place_id: placeId, fields, key: GOOGLE_API_KEY })
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`)
  const data = await res.json()
  return data.status === 'OK' ? data.result : null
}

function extractZip(components: AddressComponent[]): string | null {
  return components?.find((c) => c.types.includes('postal_code'))?.long_name ?? null
}

function extractStateAbbr(components: AddressComponent[]): string | null {
  return components?.find((c) => c.types.includes('administrative_area_level_1'))?.short_name ?? null
}

function extractCity(components: AddressComponent[]): string | null {
  return (
    components?.find((c) => c.types.includes('locality'))?.long_name ??
    components?.find((c) => c.types.includes('sublocality'))?.long_name ??
    null
  )
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ─── Website scraping for /locations pages ───────────────────────────────────

async function scrapeWebsiteLocations(websiteUrl: string): Promise<string[]> {
  const base = websiteUrl.replace(/\/$/, '')
  const candidates = [
    `${base}/locations`,
    `${base}/our-locations`,
    `${base}/funeral-homes`,
    `${base}/chapels`,
    `${base}/about/locations`,
    `${base}/find-us`,
  ]

  const addresses: string[] = []

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const html = await res.text()

      // Extract addresses: look for patterns like "123 Main St, City, ST 12345"
      const addrRegex = /\d+\s+[A-Za-z][A-Za-z0-9\s\.]+(?:St|Ave|Rd|Blvd|Dr|Ln|Way|Pkwy|Ct|Pl|Hwy|Route|Rt)\b[^<]{0,60}\d{5}/gi
      const found = html.match(addrRegex) || []
      addresses.push(...found.map(a => a.trim()))

      if (found.length > 0) break  // stop at first page that has addresses
    } catch {
      // page doesn't exist or timed out
    }
  }

  // Deduplicate
  return [...new Set(addresses)]
}

// ─── Normalize business name for matching ────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(funeral|home|homes|cremation|crematory|mortuary|chapel|chapels|services|service|and|the|of|&)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameSimilar(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return false
  // Either one contains the other, or they share 2+ words
  if (na.includes(nb) || nb.includes(na)) return true
  const wordsA = new Set(na.split(' ').filter(w => w.length > 2))
  const wordsB = nb.split(' ').filter(w => w.length > 2)
  const shared = wordsB.filter(w => wordsA.has(w))
  return shared.length >= 2
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not set' }, { status: 500 })

  const { limit = 10 } = await req.json().catch(() => ({}))

  // Fetch recently enriched records that haven't had location detection run yet
  // We use location_count IS NULL as the "not yet processed" signal
  const { data: records, error } = await supabaseAdmin
    .from('funeral_homes')
    .select('id,name,city,state,state_abbr,website,phone,lat,lng,maps_place_id,parent_company,obits_count')
    .not('maps_place_id', 'is', null)   // must be enriched
    .is('location_count', null)          // not yet location-checked
    .order('obits_count', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!records?.length) return NextResponse.json({ processed: 0, new_locations: 0, message: 'No records need location detection' })

  let totalNewLocations = 0
  let processed = 0

  for (const rec of records) {
    const brandName = rec.parent_company || rec.name
    const state = rec.state_abbr || rec.state || ''
    console.log(`[locations] ${rec.name} | ${rec.city}, ${state}`)

    const siblingsFound: Array<{
      name: string; address: string; lat: number; lng: number
      phone: string | null; website: string | null
      google_reviews: number | null; google_rating: number | null
      maps_place_id: string; zip: string | null
      city: string | null; state_abbr: string | null
    }> = []

    // ── 1. Google Text Search for brand across the state ──────────────────
    const query = `${brandName} ${state}`
    const results = await textSearch(query)
    await sleep(300)

    for (const r of results) {
      if (r.place_id === rec.maps_place_id) continue   // skip self
      if (!nameSimilar(r.name, brandName)) continue    // must match brand

      const details = await placeDetails(r.place_id)
      await sleep(200)
      if (!details) continue

      const comps: AddressComponent[] = details.address_components || []
      siblingsFound.push({
        name:          details.name || r.name,
        address:       details.formatted_address || r.formatted_address || '',
        lat:           details.geometry?.location?.lat ?? r.geometry?.location?.lat ?? 0,
        lng:           details.geometry?.location?.lng ?? r.geometry?.location?.lng ?? 0,
        phone:         details.formatted_phone_number || null,
        website:       details.website || rec.website || null,
        google_reviews: details.user_ratings_total ?? null,
        google_rating:  details.rating ?? null,
        maps_place_id:  r.place_id,
        zip:           extractZip(comps),
        city:          extractCity(comps),
        state_abbr:    extractStateAbbr(comps),
      })
    }

    // ── 2. Scrape website /locations page ─────────────────────────────────
    const websiteAddresses: string[] = []
    if (rec.website) {
      try {
        const scraped = await scrapeWebsiteLocations(rec.website)
        websiteAddresses.push(...scraped)
      } catch { /* ignore */ }
    }

    // For each scraped address, search Google to resolve it into a place
    for (const addr of websiteAddresses.slice(0, 10)) {
      const query2 = `${brandName} ${addr}`
      const results2 = await textSearch(query2)
      await sleep(300)

      if (results2.length && nameSimilar(results2[0].name, brandName)) {
        const r = results2[0]
        if (r.place_id === rec.maps_place_id) continue
        if (siblingsFound.find(s => s.maps_place_id === r.place_id)) continue

        const details = await placeDetails(r.place_id)
        await sleep(200)
        if (!details) continue

        const comps: AddressComponent[] = details.address_components || []
        siblingsFound.push({
          name:          details.name || r.name,
          address:       details.formatted_address || '',
          lat:           details.geometry?.location?.lat ?? 0,
          lng:           details.geometry?.location?.lng ?? 0,
          phone:         details.formatted_phone_number || null,
          website:       details.website || rec.website || null,
          google_reviews: details.user_ratings_total ?? null,
          google_rating:  details.rating ?? null,
          maps_place_id:  r.place_id,
          zip:           extractZip(comps),
          city:          extractCity(comps),
          state_abbr:    extractStateAbbr(comps),
        })
      }
    }

    const totalLocations = 1 + siblingsFound.length  // self + siblings
    const parentName = brandName

    // ── 3. Update self with location_count ────────────────────────────────
    await supabaseAdmin.from('funeral_homes').update({
      location_count: totalLocations,
      parent_company: parentName,
    }).eq('id', rec.id)

    // ── 4. Insert or update sibling locations ─────────────────────────────
    for (const sib of siblingsFound) {
      // Check if this place_id already exists
      const { data: existing } = await supabaseAdmin
        .from('funeral_homes')
        .select('id')
        .eq('maps_place_id', sib.maps_place_id)
        .single()

      if (existing) {
        // Update existing record with location group info
        await supabaseAdmin.from('funeral_homes').update({
          location_count: totalLocations,
          parent_company: parentName,
        }).eq('id', existing.id)
      } else {
        // Insert new sibling location
        await supabaseAdmin.from('funeral_homes').insert({
          name:            sib.name,
          city:            sib.city,
          state_abbr:      sib.state_abbr,
          address:         sib.address,
          lat:             sib.lat,
          lng:             sib.lng,
          phone:           sib.phone,
          website:         sib.website,
          google_reviews:  sib.google_reviews,
          google_rating:   sib.google_rating,
          maps_place_id:   sib.maps_place_id,
          google_place_id: sib.maps_place_id,
          zip:             sib.zip,
          source:          'google_locations',
          lead_status:     'prospect',
          location_count:  totalLocations,
          parent_company:  parentName,
          last_enriched_at: new Date().toISOString(),
        })
        totalNewLocations++
      }
    }

    console.log(`  → ${siblingsFound.length} sibling locations found (total: ${totalLocations})`)
    processed++
    await sleep(200)
  }

  return NextResponse.json({ processed, new_locations: totalNewLocations, total: records.length })
}
