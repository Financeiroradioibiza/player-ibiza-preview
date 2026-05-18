// supabase/functions/save-feedback/index.ts
//
// Recebe { preview_id, track_id, session_id, vote, comment } do player.
// Faz upsert na tabela track_feedback. Valida que o preview está ativo.
//
// Deploy:  supabase functions deploy save-feedback --no-verify-jwt

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
    const { preview_id, track_id, session_id, vote, comment } = await req.json()

    if (!preview_id || !track_id || !session_id) {
      return json({ error: 'Parâmetros incompletos' }, 400)
    }
    if (vote !== null && vote !== 1 && vote !== -1 && vote !== undefined) {
      return json({ error: 'vote inválido' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Confirma que o preview ainda está válido
    const { data: preview } = await supabase
      .from('previews')
      .select('id, is_active, is_archived, expires_at')
      .eq('id', preview_id)
      .maybeSingle()

    if (!preview || !preview.is_active || preview.is_archived ||
        new Date(preview.expires_at) < new Date()) {
      return json({ error: 'Preview indisponível' }, 403)
    }

    // Upsert
    const { error } = await supabase
      .from('track_feedback')
      .upsert({
        preview_id,
        track_id,
        client_session: session_id,
        vote: vote ?? null,
        comment: comment?.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'preview_id,track_id,client_session' })

    if (error) {
      return json({ error: error.message }, 500)
    }
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
