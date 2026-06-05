import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { rows } = await req.json()
    if (!rows?.length) return NextResponse.json({ error: 'No rows provided' }, { status: 400 })

    const mapped = rows.map((r: Record<string, string>) => ({
      name:             r.name?.trim()                || 'Unknown',
      city:             r.city?.trim()                || null,
      state:            r.state?.trim()               || null,
      state_abbr:       r.state_abbr?.trim()          || null,
      obits_count:      r.obits && !isNaN(+r.obits)   ? parseInt(r.obits) : null,
      website:          r.website?.trim()             || null,
      phone:            r.phone?.trim()               || null,
      email:            r.email?.trim()               || null,
      owner_name:       r.owner_name?.trim()          || null,
      source:           r.source?.trim()              || 'csv_import',
      uses_parting_pro: r.uses_parting_pro === 'yes'  || r.parting_pro === 'yes',
      uses_efuneral:    r.uses_efuneral === 'yes'     || r.source === 'efuneral',
      uses_tukios:      r.uses_tukios === 'yes'       || r.source === 'tukios',
      software_detected:r.software_detected?.trim()  || null,
      echovita_url:     r.echovita_url?.trim()        || null,
      legacy_url:       r.legacy_url?.trim()          || null,
      lead_status:      r.lead_status?.trim()         || (r.uses_parting_pro === 'yes' ? 'existing_customer' : 'prospect'),
    }))

    // Upsert in chunks of 500
    const CHUNK = 500
    let inserted = 0
    for (let i = 0; i < mapped.length; i += CHUNK) {
      const chunk = mapped.slice(i, i + CHUNK)
      const { error } = await supabaseAdmin
        .from('funeral_homes')
        .upsert(chunk, { onConflict: 'name,city,state_abbr', ignoreDuplicates: true })
      if (error) throw error
      inserted += chunk.length
    }

    return NextResponse.json({ success: true, inserted })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
