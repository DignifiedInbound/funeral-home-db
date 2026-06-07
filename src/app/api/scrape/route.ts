export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// ─── Software fingerprints ────────────────────────────────────────────────────
const SOFTWARE_FINGERPRINTS: Record<string, RegExp[]> = {
  parting_pro:    [/partingpro\.com/i, /parting_pro/i],
  efuneral:       [/efuneral\.com/i],
  tukios:         [/tukios\.com/i, /twp-assets/i],
  frontrunner:    [/frontrunnerpro\.com/i, /assets\.[a-z0-9-]+\.com\/images\/globals\/_/i],
  funeralone:     [/funeralone\.com/i, /f1connect/i],
  tribute_tech:   [/tributetech\.com/i, /tribute-tech/i],
  osiris:         [/osiris-solutions\.com/i, /osirisnet/i],
  batesville:     [/tributearchive\.com/i],
  frazer:         [/frazerconsultants\.com/i, /frazerwebsites\.com/i],
  domani:         [/domanicare\.com/i, /domani\.cloud/i],
  legacy_embed:   [/legacy\.com\/obituaries\/embed/i],
  wordpress:      [/wp-content\//i, /wp-includes\//i],
  wix:            [/static\.wixstatic\.com/i, /wix\.com/i],
  squarespace:    [/squarespace\.com/i, /sqsp\.net/i],
}

// ─── Fetch with timeout + UA ──────────────────────────────────────────────────
async function fetchPage(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ─── Software detection ───────────────────────────────────────────────────────
function detectSoftware(html: string): string | null {
  for (const [name, patterns] of Object.entries(SOFTWARE_FINGERPRINTS)) {
    if (patterns.some(p => p.test(html))) return name
  }
  return null
}

// ─── Obituary count — multi-strategy ─────────────────────────────────────────
async function countObituaries(baseUrl: string, software: string | null): Promise<number> {
  const base = baseUrl.replace(/\/$/, '')
  const hostname = new URL(base).hostname

  // Strategy 1: XML sitemap — fastest, most accurate for Tukios/FrontRunner/FuneralOne
  const sitemaps = [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`]
  for (const sitemapUrl of sitemaps) {
    const xml = await fetchPage(sitemapUrl)
    if (!xml) continue
    // Count <loc> entries that contain /obituar
    const obitUrls = [...xml.matchAll(/<loc>([^<]*obituar[^<]*)<\/loc>/gi)].map(m => m[1])
    if (obitUrls.length > 0) return obitUrls.length
    // Sitemap index — fetch child sitemaps
    const childSitemaps = [...xml.matchAll(/<loc>([^<]*sitemap[^<]*)<\/loc>/gi)].map(m => m[1]).slice(0, 3)
    for (const child of childSitemaps) {
      const childXml = await fetchPage(child)
      if (!childXml) continue
      const childObits = [...childXml.matchAll(/<loc>([^<]*obituar[^<]*)<\/loc>/gi)].map(m => m[1])
      if (childObits.length > 0) return childObits.length
    }
  }

  // Strategy 2: FuneralOne — obituaries live on guestbook.domain.com
  if (software === 'funeralone') {
    const guestbookUrl = `https://guestbook.${hostname}/obituaries/`
    const html = await fetchPage(guestbookUrl)
    if (html) {
      const total = html.match(/(\d+)\s*(?:results|obituaries)/i)
      if (total) return parseInt(total[1])
      const links = [...html.matchAll(/href=["']([^"']*obituar[^"']{5,})['"]/gi)]
        .map(m => m[1]).filter(l => l.length > 20)
      if (links.length > 0) return links.length
    }
  }

  // Strategy 3: Static pagination — works for FrontRunner, custom sites
  const obitCandidates = [`${base}/obituaries`, `${base}/obits`, `${base}/recent-obituaries`]
  for (const url of obitCandidates) {
    const html = await fetchPage(url)
    if (!html) continue
    const seen = new Set<string>()
    let currentHtml = html

    for (let page = 1; page <= 15; page++) {
      const links = [...currentHtml.matchAll(/href=["']([^"']*\/obituar[^"']{3,})['"]/gi)]
        .map(m => m[1])
        .filter(l => l.length > 20 && !/\/p\d+$/.test(l) && !/obituar(?:ies)?\/?$/.test(l) && !/[?#]/.test(l))
      links.forEach(l => seen.add(l))
      const hasNext = new RegExp(`/obituaries/p${page + 1}|page=${page + 1}`, 'i').test(currentHtml)
      if (!hasNext) break
      const nextHtml = await fetchPage(`${base}/obituaries/p${page + 1}`)
      if (!nextHtml) break
      currentHtml = nextHtml
      await sleep(200)
    }
    if (seen.size > 0) return seen.size
  }
  return 0
}

// ─── Location extraction from /locations page ─────────────────────────────────
interface ScrapedLocation { name: string; address: string | null }

async function scrapeLocations(baseUrl: string): Promise<ScrapedLocation[]> {
  const base = baseUrl.replace(/\/$/, '')
  const candidates = [
    `${base}/locations`, `${base}/our-locations`, `${base}/funeral-homes`,
    `${base}/chapels`, `${base}/about/locations`, `${base}/find-us`, `${base}/about-us`,
  ]

  for (const url of candidates) {
    const html = await fetchPage(url)
    if (!html) continue

    // Strip tags to get text, then find headings and addresses
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const headings = [...html.matchAll(/<h[2-4][^>]*>([^<]{4,80})<\/h[2-4]>/gi)]
      .map(m => m[1].replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&[a-z]+;/g, ' ').trim())
      .filter(h => h.length > 4 && h.length < 80)

    const addresses = [...text.matchAll(/\d{2,5}\s+[A-Z][a-zA-Z\s]{3,40}(?:St|Ave|Rd|Blvd|Dr|Ln|Way|Pkwy|Ct|Pl|Hwy)\.?[^.]{0,50}\d{5}/g)]
      .map(m => m[0].trim())

    if (headings.length > 0) {
      // Pair headings with addresses where possible
      return headings.slice(0, 20).map((name, i) => ({
        name,
        address: addresses[i] || null,
      }))
    }
  }
  return []
}

// ─── Phone extraction ─────────────────────────────────────────────────────────
function extractPhones(html: string): string[] {
  const raw = [...html.matchAll(/\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g)].map(m => m[0].trim())
  return [...new Set(raw)].slice(0, 5)
}

// ─── Email extraction ─────────────────────────────────────────────────────────
function extractEmails(html: string): string[] {
  const raw = [...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
    .map(m => m[0])
    .filter(e => !e.includes('sentry') && !e.includes('example') && !e.includes('wix'))
  return [...new Set(raw)].slice(0, 3)
}

// ─── Main scrape function ─────────────────────────────────────────────────────
async function scrapeWebsite(website: string) {
  const html = await fetchPage(website)
  if (!html) return null

  const software = detectSoftware(html)
  const phones = extractPhones(html)
  const emails = extractEmails(html)

  // Scrape contact page for more contact info
  const contactHtml = await fetchPage(`${website.replace(/\/$/, '')}/contact`) || ''
  const contactHtml2 = await fetchPage(`${website.replace(/\/$/, '')}/contact-us`) || ''
  const allContactHtml = html + contactHtml + contactHtml2
  const allPhones = extractPhones(allContactHtml)
  const allEmails = extractEmails(allContactHtml)

  // Obituaries (async, separate pages)
  const obitCount = await countObituaries(website, software)

  // Locations
  const locations = await scrapeLocations(website)

  return {
    software,
    phones: allPhones,
    emails: allEmails,
    obit_count: obitCount,
    locations,
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { limit = 10, offset = 0, ids } = await req.json().catch(() => ({}))

  // Fetch records — either specific IDs or next unscraped batch with websites
  let query = supabaseAdmin
    .from('funeral_homes')
    .select('id,name,city,state_abbr,website,phone,email,software_detected')
    .not('website', 'is', null)
  if (ids?.length) {
    query = query.in('id', ids)
  } else {
    query = query.is('last_scraped_at', null)
      .order('obits_count', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)
  }
  const { data: records, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!records?.length) return NextResponse.json({ scraped: 0, message: 'No unscraped records with websites' })

  let scraped = 0
  const results: Array<{ name: string; software: string | null; obits: number; locations: number }> = []

  for (const rec of records) {
    if (!rec.website) continue
    console.log(`[scrape] ${rec.name} — ${rec.website}`)

    try {
      const data = await scrapeWebsite(rec.website)
      if (!data) {
        await supabaseAdmin.from('funeral_homes').update({
          website_scrape_status: 'unreachable',
          last_scraped_at: new Date().toISOString(),
        }).eq('id', rec.id)
        continue
      }

      const update: Record<string, unknown> = {
        website_scrape_status: 'ok',
        last_scraped_at: new Date().toISOString(),
        website_software:    data.software,
        website_obit_count:  data.obit_count || null,
        website_locations:   data.locations.length > 0 ? data.locations : null,
      }

      // Fill gaps — only update phone/email if we don't have them
      if (!rec.phone && data.phones[0]) update.phone = data.phones[0]
      if (!rec.email && data.emails[0]) update.email = data.emails[0]

      // Update software_detected if we found something the import didn't catch
      if (!rec.software_detected && data.software) {
        update.software_detected = data.software
        // Set the boolean flags too
        if (data.software === 'parting_pro') update.uses_parting_pro = true
        if (data.software === 'efuneral')    update.uses_efuneral = true
        if (data.software === 'tukios')      update.uses_tukios = true
      }

      await supabaseAdmin.from('funeral_homes').update(update).eq('id', rec.id)
      scraped++
      results.push({ name: rec.name, software: data.software, obits: data.obit_count, locations: data.locations.length })
      console.log(`  → software=${data.software || 'unknown'} obits=${data.obit_count} locations=${data.locations.length}`)
    } catch (err) {
      console.error(`  Error scraping ${rec.website}:`, err)
      await supabaseAdmin.from('funeral_homes').update({
        website_scrape_status: 'error',
        last_scraped_at: new Date().toISOString(),
      }).eq('id', rec.id)
    }

    await sleep(500)
  }

  return NextResponse.json({ scraped, total: records.length, results })
}
