/**
 * 视频生成服务
 *
 * 封装 FAL API 视频生成逻辑
 * 支持开发环境使用 mock 视频
 */

import envService from './envService'

/**
 * 生成 Revealing 视频
 * @param {string} templateId - 模板 ID（从 prompt_items 表的 looking category 选择）
 * @param {Object} analysisData - Gemini Vision 分析结果
 * @returns {Promise<string>} 视频 URL
 */
export async function generateRevealingVideo(templateId, analysisData) {
  const config = envService.getFalApiConfig()

  // 开发环境：返回 mock 视频
  if (config.mock) {
    console.log('[videoGenerationService] Using mock Revealing video')

    return new Promise(resolve => {
      setTimeout(() => {
        resolve(config.mockVideoUrls.revealing)
      }, config.mockDelay)
    })
  }

  // 生产环境：调用 FAL API
  console.log('[videoGenerationService] Generating Revealing video with FAL API')

  try {
    // TODO: 实现真实 FAL API 调用
    // 1. 调用 FAL SeeDrawm 生成起始图片
    // 2. 调用 FAL SeeDance 生成视频
    // 3. 轮询检查生成状态
    // 4. 返回视频 URL

    throw new Error('FAL API not implemented yet')
  } catch (error) {
    console.error('[videoGenerationService] Revealing video generation error:', error)
    throw error
  }
}

/**
 * 生成 Lip-Sync 视频
 * @param {string} introScript - 自我介绍文本
 * @param {string} startingImageUrl - 起始图片 URL
 * @returns {Promise<string>} 视频 URL
 */
export async function generateLipsyncVideo(introScript, startingImageUrl) {
  const config = envService.getFalApiConfig()

  // 开发环境：返回 mock 视频
  if (config.mock) {
    console.log('[videoGenerationService] Using mock Lip-sync video')

    return new Promise(resolve => {
      setTimeout(() => {
        resolve(config.mockVideoUrls.lipsync)
      }, config.mockDelay)
    })
  }

  // 生产环境：调用 FAL API
  console.log('[videoGenerationService] Generating Lip-sync video with FAL API')

  try {
    // TODO: 实现真实 FAL API 调用
    // 1. 将 introScript 转换为语音（ElevenLabs TTS）
    // 2. 调用 FAL SeeDance 生成对口型视频
    // 3. 轮询检查生成状态
    // 4. 返回视频 URL

    throw new Error('FAL API not implemented yet')
  } catch (error) {
    console.error('[videoGenerationService] Lip-sync video generation error:', error)
    throw error
  }
}

/**
 * 获取 Transition 视频
 * @returns {Promise<string>} 视频 URL
 */
export async function getTransitionVideo() {
  const config = envService.getFalApiConfig()

  // 开发环境：返回 mock 视频
  if (config.mock) {
    console.log('[videoGenerationService] Using mock Transition video')
    return Promise.resolve(config.mockVideoUrls.transition)
  }

  // 生产环境：返回预设的 Transition 视频
  // Transition 视频通常是预设的，不需要实时生成
  console.log('[videoGenerationService] Using preset Transition video')
  return Promise.resolve('/videos/transition-default.mp4')
}

/**
 * 检查视频生成状态
 * @param {string} jobId - FAL API 任务 ID
 * @returns {Promise<Object>} 状态信息
 */
export async function checkVideoGenerationStatus(jobId) {
  const config = envService.getFalApiConfig()

  // 开发环境：立即返回完成状态
  if (config.mock) {
    console.log('[videoGenerationService] Mock status check: completed')

    return Promise.resolve({
      status: 'completed',
      progress: 100,
      videoUrl: config.mockVideoUrls.revealing
    })
  }

  // 生产环境：调用 FAL API 检查状态
  try {
    const response = await fetch(`https://fal.run/fal-ai/status/${jobId}`, {
      headers: {
        Authorization: `Key ${config.apiKey}`
      }
    })

    const data = await response.json()
    return data
  } catch (error) {
    console.error('[videoGenerationService] Status check error:', error)
    throw error
  }
}

/**
 * 轮询视频生成状态直到完成
 * @param {string} jobId - FAL API 任务 ID
 * @param {Function} onProgress - 进度回调函数
 * @returns {Promise<string>} 视频 URL
 */
export async function pollVideoGenerationStatus(jobId, onProgress) {
  const maxAttempts = 60 // 最多轮询 60 次
  const interval = 2000 // 每 2 秒轮询一次

  for (let i = 0; i < maxAttempts; i++) {
    const status = await checkVideoGenerationStatus(jobId)

    if (onProgress) {
      onProgress(status.progress || 0)
    }

    if (status.status === 'completed') {
      console.log('[videoGenerationService] Video generation completed')
      return status.videoUrl
    }

    if (status.status === 'failed') {
      throw new Error('Video generation failed')
    }

    // 等待下一次轮询
    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error('Video generation timeout')
}

export default {
  generateRevealingVideo,
  generateLipsyncVideo,
  getTransitionVideo,
  checkVideoGenerationStatus,
  pollVideoGenerationStatus
}
