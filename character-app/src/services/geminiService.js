/**
 * Gemini API 服务
 *
 * 封装 Gemini Vision API 和 Gemini Live API 的调用
 */

import envService from './envService'

/**
 * Gemini Vision API - 分析照片
 * @param {string} photoDataUrl - Base64 格式的照片数据
 * @returns {Promise<Object>} 分析结果
 */
export async function analyzePhotoWithVision(photoDataUrl) {
  const config = envService.getGeminiVisionConfig()

  // 开发环境：返回 mock 数据
  if (config.mock) {
    console.log('[geminiService] Using mock Vision API')

    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          location: 'office',
          weather: 'rainy',
          clothing: 'casual',
          mood: 'focused',
          time_of_day: 'afternoon',
          environment: 'indoor',
          activity: 'working'
        })
      }, config.mockDelay)
    })
  }

  // 生产环境：调用真实 Gemini Vision API
  console.log('[geminiService] Calling Gemini Vision API')

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Analyze this photo and extract the following information:
- location: where is this person (e.g., office, home, cafe, outdoor)
- weather: current weather if visible (e.g., sunny, rainy, cloudy)
- clothing: what type of clothing (e.g., casual, formal, sportswear)
- mood: estimated mood from facial expression (e.g., happy, focused, tired)
- time_of_day: estimated time (e.g., morning, afternoon, evening, night)
- environment: indoor or outdoor
- activity: what they might be doing (e.g., working, relaxing, exercising)

Return ONLY a JSON object with these fields, no additional text.`
                },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: photoDataUrl.split(',')[1] // 移除 data:image/jpeg;base64, 前缀
                  }
                }
              ]
            }
          ]
        })
      }
    )

    const data = await response.json()
    const text = data.candidates[0].content.parts[0].text

    // 解析 JSON 结果
    const result = JSON.parse(text.replace(/```json\n?|\n?```/g, ''))
    console.log('[geminiService] Vision API result:', result)

    return result
  } catch (error) {
    console.error('[geminiService] Vision API error:', error)
    throw error
  }
}

/**
 * Gemini Vision API - 分析多张照片（性格分析）
 * @param {Array<string>} photoDataUrls - 多张照片的 Base64 数据数组
 * @returns {Promise<Object>} 性格分析结果
 */
export async function analyzePersonalityFromPhotos(photoDataUrls) {
  const config = envService.getGeminiVisionConfig()

  // 开发环境：返回 mock 数据
  if (config.mock) {
    console.log('[geminiService] Using mock Vision API for personality analysis')

    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          personality_tags: ['Introvert', 'Creative', 'Night Owl', 'Tech Enthusiast'],
          personality_summary: 'A quiet soul seeking wisdom in the digital void. Often found working late at night, deeply focused on creative projects.',
          interests: ['Technology', 'Art', 'Philosophy', 'Gaming'],
          lifestyle: 'Urban professional with a creative mindset'
        })
      }, config.mockDelay)
    })
  }

  // 生产环境：调用真实 Gemini Vision API
  console.log('[geminiService] Calling Gemini Vision API for personality analysis')

  try {
    const imageParts = photoDataUrls.map(url => ({
      inline_data: {
        mime_type: 'image/jpeg',
        data: url.split(',')[1]
      }
    }))

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Analyze these photos and infer the person's personality. Return a JSON object with:
- personality_tags: array of 3-5 personality traits (e.g., "Introvert", "Creative", "Adventurous")
- personality_summary: a 1-2 sentence poetic description of their character
- interests: array of 3-5 likely interests or hobbies
- lifestyle: brief description of their lifestyle

Return ONLY a JSON object, no additional text.`
                },
                ...imageParts
              ]
            }
          ]
        })
      }
    )

    const data = await response.json()
    const text = data.candidates[0].content.parts[0].text

    const result = JSON.parse(text.replace(/```json\n?|\n?```/g, ''))
    console.log('[geminiService] Personality analysis result:', result)

    return result
  } catch (error) {
    console.error('[geminiService] Personality analysis error:', error)
    throw error
  }
}

/**
 * Gemini Chat API - 生成自我介绍 Script
 * @param {Object} personalityData - 性格分析数据
 * @param {string} characterName - 角色名字
 * @returns {Promise<string>} 自我介绍文本
 */
export async function generateIntroScript(personalityData, characterName) {
  const config = envService.getGeminiVisionConfig() // 复用 Vision config

  // 开发环境：返回 mock 数据
  if (config.mock) {
    console.log('[geminiService] Using mock Chat API for intro script')

    return new Promise(resolve => {
      setTimeout(() => {
        resolve(`Hello, I'm ${characterName}. A quiet soul wandering through the digital realm, seeking meaning in the void. I'm a night owl who finds inspiration in the silent hours, crafting worlds from pixels and dreams.`)
      }, config.mockDelay)
    })
  }

  // 生产环境：调用真实 Gemini Chat API
  console.log('[geminiService] Calling Gemini Chat API for intro script')

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Generate a poetic, AI-character-style self-introduction (2-3 sentences) based on this personality data:

Name: ${characterName}
Personality: ${personalityData.personality_summary}
Tags: ${personalityData.personality_tags.join(', ')}
Interests: ${personalityData.interests.join(', ')}

The introduction should:
- Sound slightly mysterious and philosophical
- Reflect the personality traits
- Be spoken in first person ("I'm ${characterName}...")
- Be suitable for text-to-speech conversion

Return ONLY the introduction text, no quotes or formatting.`
                }
              ]
            }
          ]
        })
      }
    )

    const data = await response.json()
    const introScript = data.candidates[0].content.parts[0].text.trim()

    console.log('[geminiService] Generated intro script:', introScript)
    return introScript
  } catch (error) {
    console.error('[geminiService] Intro script generation error:', error)
    throw error
  }
}

/**
 * Gemini Live API - 建立 WebSocket 连接
 * 注意：这是一个占位符函数，实际实现需要在 Phase 5
 */
export function createGeminiLiveConnection() {
  const config = envService.getGeminiLiveConfig()

  if (config.mock) {
    console.log('[geminiService] Gemini Live API not implemented yet (mock mode)')
    return null
  }

  // TODO: Phase 5 实现
  throw new Error('Gemini Live API not implemented yet')
}

export default {
  analyzePhotoWithVision,
  analyzePersonalityFromPhotos,
  generateIntroScript,
  createGeminiLiveConnection
}
