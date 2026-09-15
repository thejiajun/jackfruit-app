const API_URL = import.meta.env.VITE_CF_API_URL
const POLL_INTERVAL_MS = 3000
const TIMEOUT_MS = 2 * 60 * 1000

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const getJobId = payload => payload.id || payload.job_id || payload.request_id
const getVideoUrl = payload => payload.video_url || payload.url || payload.result?.url || payload.output?.url || payload.data?.video_url

export async function generatePikaVideo(input) {
  if (!API_URL) throw new Error('Missing VITE_CF_API_URL')
  const apiUrl = API_URL.replace(/\/$/, '')
  const response = await fetch(`${apiUrl}/v1/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  const submitted = await response.json()
  if (!response.ok) throw new Error(submitted.error || submitted.message || 'Pika video submission failed')

  const immediateUrl = getVideoUrl(submitted)
  if (immediateUrl) return immediateUrl
  const jobId = getJobId(submitted)
  if (!jobId) throw new Error('Pika API did not return a job id')

  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    await wait(POLL_INTERVAL_MS)
    const statusResponse = await fetch(`${apiUrl}/v1/videos/${encodeURIComponent(jobId)}`)
    const status = await statusResponse.json()
    if (!statusResponse.ok) throw new Error(status.error || status.message || 'Pika video status check failed')
    const state = String(status.status || status.state || '').toLowerCase()
    if (['failed', 'error', 'cancelled', 'canceled'].includes(state)) throw new Error(status.error || status.message || 'Pika video generation failed')
    const videoUrl = getVideoUrl(status)
    if (videoUrl) return videoUrl
    if (['completed', 'succeeded', 'success', 'done'].includes(state)) return `${apiUrl}/v1/videos/${encodeURIComponent(jobId)}/content`
  }
  throw new Error('Pika video generation timed out')
}
