export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const [total, withPhone, withEmail, withObits, byStatus, bySoftware] = await Promise.all([
    supabaseAdmin.from('funeral_homes').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('funeral_homes').select('*', { count: 'exact', head: true }).not('phone', 'is', null),
    supabaseAdmin.from('funeral_homes').select('*', { count: 'exact', head: true }).not('email', 'is', null),
    supabaseAdmin.from('funeral_homes').select('*', { count: 'exact', head: true }).not('obits_count', 'is', null),
    supabaseAdmin.from('funeral_homes').select('lead_status'),
    supabaseAdmin.from('funeral_homes').select('software_detected').not('software_detected', 'is', null),
  ])

  const statusCounts = (byStatus.data || []).reduce((acc: Record<string, number>, r) => {
    acc[r.lead_status] = (acc[r.lead_status] || 0) + 1
    return acc
  }, {})

  const softwareCounts = (bySoftware.data || []).reduce((acc: Record<string, number>, r) => {
    if (r.software_detected) acc[r.software_detected] = (acc[r.software_detected] || 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    total:       total.count      || 0,
    with_phone:  withPhone.count  || 0,
    with_email:  withEmail.count  || 0,
    with_obits:  withObits.count  || 0,
    by_status:   statusCounts,
    by_software: softwareCounts,
  })
}
