export type LeadStatus = 'prospect' | 'contacted' | 'qualified' | 'existing_customer' | 'churned' | 'not_a_fit'

export interface FuneralHome {
  id: string
  name: string
  slug: string | null
  domain: string | null
  city: string | null
  state: string | null
  state_abbr: string | null
  zip: string | null
  address: string | null
  lat: number | null
  lng: number | null
  obits_count: number | null
  google_reviews: number | null
  google_rating: number | null
  employee_count: number | null
  uses_parting_pro: boolean
  uses_efuneral: boolean
  uses_tukios: boolean
  software_detected: string | null
  phone: string | null
  email: string | null
  owner_name: string | null
  website: string | null
  source: string | null
  sources: string[] | null
  echovita_url: string | null
  legacy_url: string | null
  maps_place_id: string | null
  lead_status: LeadStatus
  priority_score: number
  notes: string | null
  last_enriched_at: string | null
  created_at: string
  updated_at: string
  computed_score?: number
}

export interface FuneralHomeFilters {
  search?: string
  state?: string
  source?: string
  lead_status?: string
  software?: string
  has_phone?: boolean
  has_email?: boolean
  has_obits?: boolean
  min_obits?: number
  page?: number
  per_page?: number
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}
