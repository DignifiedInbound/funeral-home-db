export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { FuneralHomeFilters } from '@/types/funeral-home'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const filters: FuneralHomeFilters = {
    search:     searchParams.get('search')     || undefined,
    state:      searchParams.get('state')      || undefined,
    source:     searchParams.get('source')     || undefined,
    lead_status:searchParams.get('lead_status')|| undefined,
    software:   searchParams.get('software')   || undefined,
    has_phone:  searchParams.get('has_phone')  === 'true' ? true : undefined,
    has_email:  searchParams.get('has_email')  === 'true' ? true : undefined,
    has_obits:  searchParams.get('has_obits')  === 'true' ? true : undefined,
    min_obits:  searchParams.get('min_obits')  ? parseInt(searchParams.get('min_obits')!) : undefined,
    page:       parseInt(searchParams.get('page')     || '1'),
    per_page:   parseInt(searchParams.get('per_page') || '50'),
    sort_by:    searchParams.get('sort_by')    || 'obits_count',
    sort_dir:   (searchParams.get('sort_dir')  || 'desc') as 'asc' | 'desc',
  }

  const parentCompany = searchParams.get('parent_company') || undefined

  let query = supabaseAdmin.from('funeral_homes').select('*', { count: 'exact' })

  if (parentCompany) {
    query = query.eq('parent_company', parentCompany)
  }
  if (filters.search) {
    query = query.ilike('name', `%${filters.search}%`)
  }
  if (filters.state)      query = query.eq('state_abbr', filters.state)
  if (filters.source)     query = query.eq('source', filters.source)
  if (filters.lead_status)query = query.eq('lead_status', filters.lead_status)
  if (filters.has_phone)  query = query.not('phone', 'is', null)
  if (filters.has_email)  query = query.not('email', 'is', null)
  if (filters.has_obits)  query = query.not('obits_count', 'is', null)
  if (filters.min_obits)  query = query.gte('obits_count', filters.min_obits)

  if (filters.software === 'parting_pro') query = query.eq('uses_parting_pro', true)
  else if (filters.software === 'efuneral') query = query.eq('uses_efuneral', true)
  else if (filters.software === 'tukios')  query = query.eq('uses_tukios', true)
  else if (filters.software === 'none')    query = query.is('software_detected', null)

  const sortCol = filters.sort_by === 'computed_score' ? 'priority_score' : (filters.sort_by || 'obits_count')
  query = query.order(sortCol, { ascending: filters.sort_dir === 'asc', nullsFirst: false })

  const from = ((filters.page! - 1) * filters.per_page!)
  const to   = from + filters.per_page! - 1
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data,
    total: count || 0,
    page: filters.page,
    per_page: filters.per_page,
    total_pages: Math.ceil((count || 0) / filters.per_page!),
  })
}
