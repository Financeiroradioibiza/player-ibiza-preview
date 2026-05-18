import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('Faltam variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env')
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Gera um código curto tipo IBZ-7K9M2
export function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem 0/O/1/I/l
  let out = 'IBZ-'
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}
