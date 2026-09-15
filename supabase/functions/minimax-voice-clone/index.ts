/**
 * Supabase Edge Function: minimax-voice-clone
 * Handles voice clone workflow: upload audio → create clone → return voice_id.
 * iOS sends base64-encoded audio; this function proxies to Minimax API.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const MINIMAX_API_KEY = Deno.env.get('MINIMAX_API_KEY')
const MINIMAX_GROUP_ID = Deno.env.get('MINIMAX_GROUP_ID')

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { audio_base64, voice_id, device_id } = await req.json()

    if (!audio_base64) {
      return new Response(
        JSON.stringify({ error: 'audio_base64 is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!voice_id || voice_id.length < 8) {
      return new Response(
        JSON.stringify({ error: 'voice_id must be at least 8 characters, starting with a letter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!MINIMAX_API_KEY || !MINIMAX_GROUP_ID) {
      return new Response(
        JSON.stringify({ error: 'Minimax API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[voice-clone] Starting clone for voice_id=${voice_id} device=${device_id}`)

    // Step 1: Upload audio file to Minimax
    const binaryStr = atob(audio_base64)
    const audioBytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      audioBytes[i] = binaryStr.charCodeAt(i)
    }

    const formData = new FormData()
    formData.append('purpose', 'voice_clone')
    formData.append('file', new Blob([audioBytes], { type: 'audio/wav' }), 'voice_sample.wav')

    const uploadResponse = await fetch(
      `https://api.minimax.io/v1/files/upload?GroupId=${MINIMAX_GROUP_ID}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        },
        body: formData,
      }
    )

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error(`[voice-clone] Upload error: ${uploadResponse.status} - ${errorText}`)
      return new Response(
        JSON.stringify({ error: 'Failed to upload audio to Minimax', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const uploadResult = await uploadResponse.json()
    const fileId = uploadResult.file?.file_id

    if (!fileId) {
      console.error('[voice-clone] No file_id in upload response:', uploadResult)
      return new Response(
        JSON.stringify({ error: 'No file_id returned from upload' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[voice-clone] Uploaded file_id=${fileId}`)

    // Step 2: Create voice clone
    const cloneResponse = await fetch(
      `https://api.minimax.io/v1/voice_clone?GroupId=${MINIMAX_GROUP_ID}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MINIMAX_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_id: fileId,
          voice_id: voice_id,
          noise_reduction: true,
          accuracy: 0.8,
          need_volume_normalization: true,
        }),
      }
    )

    if (!cloneResponse.ok) {
      const errorText = await cloneResponse.text()
      console.error(`[voice-clone] Clone error: ${cloneResponse.status} - ${errorText}`)
      return new Response(
        JSON.stringify({ error: 'Failed to create voice clone', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cloneResult = await cloneResponse.json()

    if (cloneResult.base_resp?.status_code !== 0) {
      console.error('[voice-clone] Clone failed:', cloneResult.base_resp)
      return new Response(
        JSON.stringify({ error: cloneResult.base_resp?.status_msg || 'Voice clone failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[voice-clone] Clone created successfully: ${voice_id}`)

    return new Response(
      JSON.stringify({
        voice_id: voice_id,
        file_id: fileId,
        message: 'Voice clone created successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[voice-clone] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
