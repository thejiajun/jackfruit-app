/**
 * 【服务模块】Gemini Vision API 服务 - AI 图像分析和文本生成
 *
 * 产品价值:
 * 1. 场景分析 - 理解用户照片中的环境、服饰、情绪等信息
 * 2. 性格推断 - 基于多张照片,推断用户的性格特质和兴趣爱好
 * 3. 文案生成 - 根据性格数据,AI 生成个性化的自我介绍文本
 *
 * 技术实现:
 * - Gemini Vision API:支持图像理解(单张/多张照片分析)
 * - Gemini Chat API:文本生成(基于上下文生成自我介绍)
 * - 开发环境 Mock:返回预设数据,避免消耗 API 配额
 *
 * 使用场景:
 * - Stage 2 (Mirror): analyzePhotoWithVision() - 分析用户拍摄的照片
 * - Stage 3 (Forging): analyzePersonalityFromPhotos() - 分析多张"记忆碎片"照片
 * - Stage 3 (Forging): generateIntroScript() - 生成角色自我介绍文本
 */

import envService from './envService'

/**
 * 【核心功能】分析单张照片 - 提取场景上下文信息
 *
 * 产品需求:用户拍照后,AI 分析照片中的环境、天气、服饰、情绪等信息
 * 技术实现:调用 Gemini Vision API,返回结构化 JSON 数据
 *
 * 分析维度:
 * - location: 地点类型(office/home/cafe/outdoor)
 * - weather: 天气情况(sunny/rainy/cloudy) - 如果可见
 * - clothing: 服饰风格(casual/formal/sportswear)
 * - mood: 情绪推断(happy/focused/tired) - 基于面部表情
 * - time_of_day: 时间推断(morning/afternoon/evening/night)
 * - environment: 室内/室外(indoor/outdoor)
 * - activity: 活动推断(working/relaxing/exercising)
 *
 * @param {string} photoDataUrl - Base64 格式的照片数据 (data:image/jpeg;base64,...)
 * @returns {Promise<Object>} 分析结果 JSON 对象
 */
export async function analyzePhotoWithVision(photoDataUrl) {
  const config = envService.getGeminiVisionConfig()

  // === 开发环境:返回 Mock 数据,避免消耗 API 配额 ===
  if (config.mock) {
    console.log('[geminiService] Using mock Vision API')

    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          location: 'office',       // 示例:办公室场景
          weather: 'rainy',         // 天气:下雨
          clothing: 'casual',       // 服饰:休闲装
          mood: 'focused',          // 情绪:专注
          time_of_day: 'afternoon', // 时间:下午
          environment: 'indoor',    // 环境:室内
          activity: 'working'       // 活动:工作中
        })
      }, config.mockDelay)  // 模拟网络延迟
    })
  }

  // === 生产环境:调用真实 Gemini Vision API ===
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
 * 【核心功能】分析多张照片 - 推断用户性格特质
 *
 * 产品需求:用户上传多张"记忆碎片"照片后,AI 推断性格、兴趣、生活方式
 * 技术实现:批量发送照片到 Gemini Vision API,进行综合分析
 *
 * 分析维度:
 * - personality_tags: 性格标签数组(3-5 个),例如 ["Introvert", "Creative", "Night Owl"]
 * - personality_summary: 1-2 句诗意化的性格描述
 * - interests: 兴趣爱好数组(3-5 个),例如 ["Technology", "Art", "Philosophy"]
 * - lifestyle: 生活方式简述
 *
 * 使用场景: Stage 3 (Forging) - 用户上传 1-5 张照片后触发
 *
 * @param {Array<string>} photoDataUrls - 多张照片的 Base64 数据数组
 * @returns {Promise<Object>} 性格分析结果 JSON 对象
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
 * 【核心功能】生成自我介绍文本 - 基于性格数据创作开场白
 *
 * 产品需求:根据 AI 分析的性格数据,生成一段诗意化的自我介绍文本
 * 技术实现:调用 Gemini Chat API,传入性格数据作为上下文
 *
 * 文案风格:
 * - 略带神秘和哲学感("A quiet soul wandering...")
 * - 反映性格特质(例如"night owl"→"finds inspiration in silent hours")
 * - 第一人称叙述("I'm {characterName}...")
 * - 适合文字转语音(TTS)播放
 *
 * 使用场景: Stage 3 (Forging) - 性格分析完成后生成
 *
 * @param {Object} personalityData - 性格分析数据 (来自 analyzePersonalityFromPhotos)
 * @param {string} characterName - 角色名字 (用户输入或 AI 生成)
 * @returns {Promise<string>} 自我介绍文本 (2-3 句话)
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



export default {
  analyzePhotoWithVision,
  analyzePersonalityFromPhotos,
  generateIntroScript
}
