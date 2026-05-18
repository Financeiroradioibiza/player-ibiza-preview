// supabase/functions/get-preview/index.ts
//
// Valida o código do cliente, devolve faixas com URLs assinadas
// e o feedback existente desta sessão.
//
// Deploy:  supabase functions deploy get-preview --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, session_id } = await req.json()

    if (!code || typeof code !== 'string') {
      return json({ error: 'Código inválido' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: preview, error: previewErr } = await supabase
      .from('previews')
      .select('id, client_name, expires_at, is_active, is_archived')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle()

    if (previewErr || !preview) {
      return json({ error: 'Código não encontrado' }, 404)
    }

    if (!preview.is_active || preview.is_archived) {
      return json({ error: 'inactive' }, 403)
    }

    if (new Date(preview.expires_at) < new Date()) {
      return json({ error: 'expired', expired: true }, 403)
    }

    // Faixas (apenas aprovadas)
    const { data: trackRows } = await supabase
      .from('preview_tracks')
      .select('position, tracks!inner(id, title, artist, storage_path, duration_seconds, status)')
      .eq('preview_id', preview.id)
      .eq('tracks.status', 'approved')
      .order('position', { ascending: true })

    const tracks = await Promise.all(
      (trackRows ?? []).map(async (row: any) => {
        let url: string | null = null
        if (row.tracks.storage_path) {
          const { data: signed } = await supabase.storage
            .from('tracks')
            .createSignedUrl(row.tracks.storage_path, 3600)
          url = signed?.signedUrl ?? null
        }
        return {
          id: row.tracks.id,
          title: row.tracks.title,
          artist: row.tracks.artist,
          duration_seconds: row.tracks.duration_seconds,
          url,
        }
      })
    )

    // Feedback existente desta sessão
    let feedback: any[] = []
    if (session_id) {
      const { data } = await supabase
        .from('track_feedback')
        .select('track_id, vote, comment')
        .eq('preview_id', preview.id)
        .eq('client_session', session_id)
      feedback = data || []
    }

    // Log de acesso
    const ua = req.headers.get('user-agent') ?? ''
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? ''
    const ipHash = ip ? await sha256(ip) : null

    await supabase.from('access_logs').insert({
      preview_id: preview.id,
      client_session: session_id ?? null,
      user_agent: ua.slice(0, 300),
      ip_hash: ipHash,
    })

    return json({
      preview_id: preview.id,
      client_name: preview.client_name,
      expires_at: preview.expires_at,
      tracks,
      feedback,
    })
  } catch (e) {
    return json({ error: 'Erro interno', detail: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
