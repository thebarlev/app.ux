import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

function readEnv(name) {
  const txt = readFileSync('.env.local', 'utf-8')
  const line = txt.split('\n').find(l => l.startsWith(name + '='))
  return line ? line.split('=').slice(1).join('=').trim() : ''
}

function maskEmail(e='') {
  const [u,d] = e.split('@')
  if (!d) return e ? e.slice(0,2) + '…' : ''
  return (u?.slice(0,2) || '') + '…@' + d
}
function die(msg) { console.error(msg); process.exit(1); }

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  readEnv('SUPABASE_URL') ||
  readEnv('NEXT_PUBLIC_SUPABASE_URL')

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  readEnv('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL) die('Missing SUPABASE_URL')
if (!SERVICE_ROLE) die('Missing SUPABASE_SERVICE_ROLE_KEY')

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: admins, error } = await sb
  .from('system_admins')
  .select('id,email,auth_user_id')

if (error) die('Failed to read system_admins: ' + error.message)
if (!admins || admins.length === 0) die('No admins found in system_admins')

console.log('Found admins:', admins.length)
admins.forEach((a,i) =>
  console.log(`#${i+1} auth_user_id=${a.auth_user_id} email=${maskEmail(a.email||'')}`)
)

if (admins.length !== 1) {
  console.log('Multiple admins found. Specify one manually if needed.')
}

const target = admins[0]

console.log('\nTarget admin:')
console.log(`auth_user_id=${target.auth_user_id}`)
console.log(`email=${maskEmail(target.email||'')}`)

const NEW_EMAIL = process.env.NEW_EMAIL
const NEW_PASSWORD = process.env.NEW_PASSWORD

if (!NEW_EMAIL && !NEW_PASSWORD) {
  console.log('\nNothing to update. Provide NEW_PASSWORD and/or NEW_EMAIL.')
  process.exit(0)
}

const update = {}
if (NEW_EMAIL) {
  update.email = NEW_EMAIL
  update.email_confirm = true
}
if (NEW_PASSWORD) {
  if (NEW_PASSWORD.length < 8) die('Password must be at least 8 characters.')
  update.password = NEW_PASSWORD
}

const { error: updErr } = await sb.auth.admin.updateUserById(target.auth_user_id, update)
if (updErr) die('Auth update failed: ' + updErr.message)

if (NEW_EMAIL) {
  await sb
    .from('system_admins')
    .update({ email: NEW_EMAIL })
    .eq('auth_user_id', target.auth_user_id)
}

console.log('\n✅ Updated successfully.')
