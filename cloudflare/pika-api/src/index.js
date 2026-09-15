const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }
const MAX_BODY_BYTES = 32 * 1024

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin')
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  if (!origin || !allowed.includes(origin)) return {}

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  }
}

function json(request, env, value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) }
  })
}

async function readJson(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0)
  if (contentLength > MAX_BODY_BYTES) throw new Error('Request body is too large')
  return request.json()
}

function validateGeneration(body) {
  const mode = body.mode === 'keyframes' ? 'keyframes' : 'image-to-video'
  const imageUrls = mode === 'keyframes' ? body.image_urls : [body.image_url]

  if (!Array.isArray(imageUrls) || imageUrls.some(url => typeof url !== 'string' || !url.startsWith('https://'))) {
    throw new Error(mode === 'keyframes' ? 'image_urls must contain HTTPS URLs' : 'image_url must be an HTTPS URL')
  }
  if (mode === 'keyframes' && (imageUrls.length < 2 || imageUrls.length > 5)) {
    throw new Error('Pikaframes requires 2 to 5 image URLs')
  }

  const duration = Number(body.duration || 5)
  if (![5, 10].includes(duration)) throw new Error('duration must be 5 or 10 seconds')

  const resolution = body.resolution || '720p'
  if (!['720p', '1080p'].includes(resolution)) throw new Error('resolution must be 720p or 1080p')

  return { mode, imageUrls, duration, resolution }
}

async function pikaFetch(env, path, init = {}) {
  return fetch(`${env.PIKA_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.PIKA_API_KEY}`,
      ...(init.headers || {})
    }
  })
}

async function proxyJson(request, env, upstream) {
  const payload = await upstream.json().catch(() => ({ error: 'Pika API returned a non-JSON response' }))
  if (!upstream.ok) {
    console.error(JSON.stringify({ event: 'pika_api_error', status: upstream.status, payload }))
  }
  return json(request, env, payload, upstream.status)
}

async function createGeneration(request, env) {
  let body
  try {
    body = await readJson(request)
    const { mode, imageUrls, duration, resolution } = validateGeneration(body)
    const model = mode === 'keyframes' ? env.PIKA_KEYFRAMES_MODEL : env.PIKA_IMAGE_TO_VIDEO_MODEL
    const payload = {
      model,
      prompt: typeof body.prompt === 'string' ? body.prompt : '',
      resolution,
      aspect_ratio: body.aspect_ratio || '9:16',
      duration,
      ...(mode === 'keyframes' ? { image_urls: imageUrls } : { image_url: imageUrls[0] })
    }

    const upstream = await pikaFetch(env, '/video/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return proxyJson(request, env, upstream)
  } catch (error) {
    return json(request, env, { error: error instanceof Error ? error.message : 'Invalid request' }, 400)
  }
}

async function getGeneration(request, env, id, content) {
  const upstream = await pikaFetch(env, `/video/generations/${encodeURIComponent(id)}${content ? '/content' : ''}`)
  if (!content) return proxyJson(request, env, upstream)

  const headers = new Headers(upstream.headers)
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value)
  return new Response(upstream.body, { status: upstream.status, headers })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) })
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(request, env, {
        status: 'ok',
        models: {
          image_to_video: env.PIKA_IMAGE_TO_VIDEO_MODEL,
          keyframes: env.PIKA_KEYFRAMES_MODEL
        }
      })
    }
    if (request.method === 'POST' && url.pathname === '/v1/videos') {
      return createGeneration(request, env)
    }

    const match = url.pathname.match(/^\/v1\/videos\/([^/]+)(\/content)?$/)
    if (request.method === 'GET' && match) {
      return getGeneration(request, env, match[1], Boolean(match[2]))
    }

    return json(request, env, { error: 'Not found' }, 404)
  }
}
