/**
 * Supabase Edge Function: minimax-tts
 * Proxy for Minimax T2A v2 API — text to speech synthesis.
 * Caches audio in Supabase Storage to avoid duplicate API calls.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MINIMAX_API_KEY = Deno.env.get('MINIMAX_API_KEY')
const MINIMAX_GROUP_ID = Deno.env.get('MINIMAX_GROUP_ID')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const STORAGE_BUCKET = 'onboarding-resources'

// Default voice — Minimax built-in English female
const DEFAULT_VOICE_ID = 'English_Trustworthy_Girl'
const DEFAULT_MODEL = 'speech-02-hd'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, voice_id, model } = await req.json()

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!MINIMAX_API_KEY || !MINIMAX_GROUP_ID) {
      return new Response(
        JSON.stringify({ error: 'Minimax API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const voiceId = voice_id || DEFAULT_VOICE_ID
    const modelId = model || DEFAULT_MODEL

    console.log(`[minimax-tts] text="${text.substring(0, 50)}..." voice=${voiceId} model=${modelId}`)

    // Check cache
    const textHash = await hashText(`${text}|${voiceId}|${modelId}`)
    const fileName = `tts-minimax/${textHash}.mp3`
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    const { data: existingFile } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .list('tts-minimax', { search: `${textHash}.mp3` })

    if (existingFile && existingFile.length > 0) {
      const { data: urlData } = supabase
        .storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(fileName)

      console.log(`[minimax-tts] Cache hit: ${textHash}`)
      return new Response(
        JSON.stringify({ audio_url: urlData.publicUrl, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call Minimax T2A v2 API
    const ttsResponse = await fetch(
      `https://api.minimax.io/v1/t2a_v2?GroupId=${MINIMAX_GROUP_ID}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MINIMAX_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          text: text,
          voice_id: voiceId,
          speed: 1.0,
          vol: 1.0,
          pitch: 0,
          audio_sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
        }),
      }
    )

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text()
      console.error(`[minimax-tts] API error: ${ttsResponse.status} - ${errorText}`)
      return new Response(
        JSON.stringify({ error: `Minimax API error: ${ttsResponse.status}`, details: errorText }),
        { status: ttsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await ttsResponse.json()

    if (result.base_resp?.status_code !== 0) {
      console.error(`[minimax-tts] API error:`, result.base_resp)
      return new Response(
        JSON.stringify({ error: result.base_resp?.status_msg || 'Minimax API error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Decode base64 audio
    const audioBase64 = result.audio_file
    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: 'No audio data in response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const binaryStr = atob(audioBase64)
    const audioBlob = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      audioBlob[i] = binaryStr.charCodeAt(i)
    }

    console.log(`[minimax-tts] Generated audio: ${(audioBlob.length / 1024).toFixed(2)} KB`)

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .upload(fileName, audioBlob, {
        contentType: 'audio/mpeg',
        cacheControl: '31536000',
        upsert: true,
      })

    if (uploadError) {
      console.error('[minimax-tts] Upload error:', uploadError)
      return new Response(
        JSON.stringify({ error: 'Failed to upload audio', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: urlData } = supabase
      .storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName)

    console.log(`[minimax-tts] Uploaded: ${urlData.publicUrl}`)

    return new Response(
      JSON.stringify({
        audio_url: urlData.publicUrl,
        cached: false,
        trace_id: result.trace_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[minimax-tts] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
