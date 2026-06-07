export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || ''

async function googleTextSearch(query: string): Promise<{ place_id: string; name: string } | null> {
  const params = new URLSearchParams({ query, type: 'funeral_home', key: GOOGLE_API_KEY })
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`)
  const data = await res.json()
  if (data.status === 'OK' && data.results?.length) {
    return { place_id: data.results[0].place_id, name: data.results[0].name }
  }
  return null
}

interface AddressComponent { types: string[]; long_name: string }

async function googlePlaceDetails(placeId: string) {
  const fields = 'name,formatted_address,geometry,formatted_phone_number,website,rating,user_ratings_total,address_components'
  const params = new URLSearchParams({ place_id: placeId, fields, key: GOOGLE_API_KEY })
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`)
  const data = await res.json()
  if (data.status === 'OK') return data.result
  return null
}

function extractZip(components: AddressComponent[]): string | null {
  return components?.find((c) => c.types.includes('postal_code'))?.long_name ?? null
}

function normalizeDomain(url: string | null): string | null {
  if (!url) return null
  return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase()
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(req: NextRequest) {
  if (!GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not set' }, { status: 500 })

  const { limit = 50, ids } = await req.json().catch(() => ({}))

  // Fetch records — either specific IDs or next unenriched batch
  let query = supabaseAdmin
    .from('funeral_homes')
    .select('id,name,city,state,state_abbr,phone,website,obits_count')
  if (ids?.length) {
    query = query.in('id', ids)
  } else {
    query = query.is('maps_place_id', null)
      .order('obits_count', { ascending: false, nullsFirst: false })
      .limit(limit)
  }
  const { data: records, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!records?.length) return NextResponse.json({ enriched: 0, total: 0, groups: 0, message: 'All records already enriched' })

  let enriched = 0

  for (const rec of records) {
    const query = `${rec.name} funeral home ${rec.city || ''} ${rec.state_abbr || rec.state || ''}`.trim()

    try {
      const found = await googleTextSearch(query)
      if (!found) { await sleep(300); continue }

      const details = await googlePlaceDetails(found.place_id)
      if (!details) { await sleep(300); continue }

      const addrComponents: AddressComponent[] = details.address_components || []
      const geo = details.geometry?.location || {}

      const update: Record<string, unknown> = {
        maps_place_id:   found.place_id,
        google_place_id: found.place_id,
        google_reviews:  details.user_ratings_total ?? null,
        google_rating:   details.rating ?? null,
        address:         details.formatted_address ?? null,
        zip:             extractZip(addrComponents),
        lat:             geo.lat ?? null,
        lng:             geo.lng ?? null,
        last_enriched_at: new Date().toISOString(),
      }

      // Only fill phone/website if missing
      if (!rec.phone && details.formatted_phone_number) update.phone = details.formatted_phone_number
      if (!rec.website && details.website) update.website = details.website

      await supabaseAdmin.from('funeral_homes').update(update).eq('id', rec.id)
      enriched++
    } catch {
      // continue on individual failures
    }

    await sleep(300)
  }

  // ── Grouping pass ──────────────────────────────────────────────────────────
  // Pull all enriched records to find multi-location clusters
  const { data: allEnriched } = await supabaseAdmin
    .from('funeral_homes')
    .select('id,name,website,phone')
    .not('maps_place_id', 'is', null)

  let groups = 0

  if (allEnriched?.length) {
    const domainMap = new Map<string, string[]>()
    const phoneMap  = new Map<string, string[]>()

    for (const r of allEnriched) {
      const domain = normalizeDomain(r.website)
      const phone  = (r.phone || '').replace(/\D/g, '')
      if (domain && domain.length > 4) {
        if (!domainMap.has(domain)) domainMap.set(domain, [])
        domainMap.get(domain)!.push(r.id)
      }
      if (phone.length >= 10) {
        if (!phoneMap.has(phone)) phoneMap.set(phone, [])
        phoneMap.get(phone)!.push(r.id)
      }
    }

    // Merge clusters
    const idToCluster = new Map<string, Set<string>>()
    const clusters: Set<string>[] = []

    const mergeInto = (ids: string[]) => {
      const existing = ids.map(id => idToCluster.get(id)).filter(Boolean) as Set<string>[]
      let target: Set<string>
      if (existing.length) {
        target = existing[0]
        for (const s of existing.slice(1)) { s.forEach(id => { target.add(id); idToCluster.set(id, target) }) }
      } else {
        target = new Set<string>()
        clusters.push(target)
      }
      ids.forEach(id => { target.add(id); idToCluster.set(id, target) })
    }

    for (const ids of domainMap.values()) if (ids.length > 1) mergeInto(ids)
    for (const ids of phoneMap.values())  if (ids.length > 1) mergeInto(ids)

    const uniqueClusters = [...new Set(clusters)].filter(c => c.size > 1)
    groups = uniqueClusters.length

    for (const cluster of uniqueClusters) {
      const ids = [...cluster]
      const members = allEnriched.filter(r => ids.includes(r.id))
      const parentName = members.map(r => r.name).sort((a, b) => a.length - b.length)[0]
      for (const id of ids) {
        await supabaseAdmin.from('funeral_homes').update({
          location_count: ids.length,
          parent_company: parentName,
        }).eq('id', id)
      }
    }
  }

  return NextResponse.json({ enriched, total: records.length, groups })
}
