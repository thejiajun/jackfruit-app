import { supabase } from './supabaseClient'

/**
 * 【服务模块】AI 身份图像生成服务 - 将用户照片转换为优化的数字形象
 *
 * 产品价值:
 * 1. 生成"更好看的自己" - 基于用户照片,AI 生成一张优化后的数字形象
 * 2. 保留用户特征但提升颜值 - 平滑皮肤、优化光照、微调五官,同时保持辨识度
 * 3. 融合西方演员气质 - 让数字形象看起来更"国际化"、更有魅力
 *
 * 技术实现:
 * - 第 1 步:上传用户照片到 Supabase Storage
 * - 第 2 步:调用 Edge Function(内部使用 FAL SeeDrawm v4 Edit API)
 * - 第 3 步:返回生成的图像 URL
 *
 * 生成时长:10-30 秒(取决于 FAL API 响应速度)
 *
 * @param {string} userPhotoBase64 - 用户照片的 base64 data URL
 * @param {object} analysisContext - Gemini Vision 分析的场景上下文(location、clothing、mood 等)
 * @returns {Promise<{imageUrl: string, uploadedPhotoUrl: string}>} 生成结果
 */
export async function generateRecommendedIdentity(userPhotoBase64, analysisContext) {
  console.log('[imageGenerationService] Starting identity generation...', { analysisContext })

  try {
    // === 第 1 步:上传用户照片到云端存储 ===
    // 将 base64 转换为 Blob,方便上传
    const photoBlob = await fetch(userPhotoBase64).then(r => r.blob())
    const fileName = `user-photos/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('character-videos')  // 复用 character-videos bucket
      .upload(fileName, photoBlob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',      // 缓存 1 小时
        upsert: false              // 不覆盖已有文件
      })

    if (uploadError) {
      console.error('[imageGenerationService] Upload failed:', uploadError)
      throw new Error(`Failed to upload photo: ${uploadError.message}`)
    }

    console.log('[imageGenerationService] Photo uploaded:', uploadData.path)

    // === 第 2 步:获取照片的公开访问 URL ===
    const { data: { publicUrl } } = supabase.storage
      .from('character-videos')
      .getPublicUrl(uploadData.path)

    console.log('[imageGenerationService] Public URL:', publicUrl)

    // === 第 3 步:构建 AI 生成提示词 ===
    // 基于用户场景上下文(分析结果)定制提示词
    const scenePrompt = buildGenerationPrompt(analysisContext)

    console.log('[imageGenerationService] Scene prompt:', scenePrompt)

    // === 第 4 步:调用 Edge Function 生成图像 ===
    // Edge Function 内部调用 FAL SeeDrawm v4 Edit API
    const { data, error } = await supabase.functions.invoke('generate-starting-image', {
      body: {
        character_avatar_url: publicUrl,  // 用户照片 URL(作为参考图)
        scene_prompt: scenePrompt,        // AI 生成提示词
        mood: analysisContext?.mood || 'neutral',  // 情绪(影响表情和光照)
        // 传递分析上下文(可选,用于更精准的生成)
        analysis_context: {
          location: analysisContext?.location,      // 地点(例如"outdoor"/"indoor")
          weather: analysisContext?.weather,        // 天气(例如"sunny"/"cloudy")
          clothing: analysisContext?.clothing,      // 服饰风格(例如"casual"/"formal")
          time_of_day: analysisContext?.time_of_day // 时间(例如"morning"/"evening")
        }
      }
    })

    if (error) {
      console.error('[imageGenerationService] Edge function error:', error)
      throw new Error(`Generation failed: ${error.message}`)
    }

    console.log('[imageGenerationService] Generation successful:', data)

    return {
      imageUrl: data.image_url,              // 生成的数字形象 URL
      uploadedPhotoUrl: publicUrl            // 原始照片 URL(可用于对比显示)
    }

  } catch (error) {
    console.error('[imageGenerationService] Error:', error)
    throw error
  }
}

/**
 * 【提示词构建】根据产品需求和用户场景构建 AI 生成提示词
 *
 * 产品需求(来自产品文档):
 * 1. 去除头部配饰(帽子、头巾等)- 展示完整的五官和发型
 * 2. 更换服饰但保持风格一致 - 例如休闲装 → 时尚休闲装
 * 3. 微调五官但保持辨识度 - 让用户仍然能认出"这是我"
 * 4. 提升颜值:平滑皮肤、优化光照、真实肤质纹理
 * 5. 融合西方演员气质 - 增加"国际范儿"
 * 6. 整体氛围:自然、性感、酷炫
 * 7. 背景:专业摄影棚背景,双色渐变粉彩色调
 *
 * 技术实现:
 * - 使用固定的基础提示词模板(保证生成质量一致性)
 * - 可选:根据 mood 等上下文动态调整提示词
 *
 * @param {object} analysisContext - Gemini Vision 分析的场景上下文
 * @returns {string} 完整的 AI 生成提示词
 */
function buildGenerationPrompt(analysisContext) {
  // 基础提示词(精心调优过的模板,不要随意修改)
  const basePrompt = `Remove all the accessories on head if there are any, change the outfits to a similar vibe outfit, change the facial features a tiny bit, still looking good, a bit better looking version of this person, with smooth skin, great professional lighting, great real skin texture, add a tiny bit mixture with an actor from the west, looking natural, looking a bit more sexy, looking cool, background is aesthetic portrait photoshoot background drop, with artistic 2 tone gradient pastel color`

  // 可选:基于用户情绪动态调整提示词
  // 例如 mood="happy" 可以强化微笑表情
  if (analysisContext?.mood) {
    return `${basePrompt}. Mood: ${analysisContext.mood}.`
  }

  return basePrompt
}

/**
 * 【容错机制】带重试的图像生成(指数退避策略)
 *
 * 产品需求:图像生成偶尔会失败(网络波动/API 限流等),需要自动重试避免用户等待失败
 * 技术实现:最多重试 3 次,每次重试间隔翻倍(2 秒 → 4 秒 → 8 秒)
 *
 * 重试场景:
 * - FAL API 临时性错误(500/502/503 等)
 * - 网络超时
 * - Supabase Storage 上传失败
 *
 * 不重试场景:
 * - 用户输入错误(例如照片格式不支持)
 * - API 配额耗尽(需要人工介入)
 *
 * @param {string} userPhotoBase64 - 用户照片的 base64 data URL
 * @param {object} analysisContext - 场景上下文
 * @param {number} maxRetries - 最大重试次数(默认 3 次)
 * @returns {Promise<{imageUrl: string, uploadedPhotoUrl: string}>} 生成结果
 * @throws {Error} 所有重试都失败后抛出最后一次的错误
 */
export async function generateWithRetry(userPhotoBase64, analysisContext, maxRetries = 3) {
  let lastError = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[imageGenerationService] Attempt ${attempt}/${maxRetries}`)
      const result = await generateRecommendedIdentity(userPhotoBase64, analysisContext)
      return result  // 成功则立即返回
    } catch (error) {
      lastError = error
      console.error(`[imageGenerationService] Attempt ${attempt} failed:`, error)

      // 如果还有重试机会,等待后重试
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 // 指数退避:2s, 4s, 8s
        console.log(`[imageGenerationService] Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // 所有重试都失败,抛出错误
  throw lastError || new Error('Generation failed after retries')
}
