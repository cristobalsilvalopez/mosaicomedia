import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await supabase.auth.admin.updateUserById(
    'e3764de0-d453-4a57-aa94-e3312ec145cb',
    { password: 'roccozac2019' }
  )
  return NextResponse.json({ success: !error, error: error?.message })
}
