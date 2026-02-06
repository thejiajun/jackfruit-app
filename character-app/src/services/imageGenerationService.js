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
    // Edge Function 内部调用 FAL API (更换为 nano banana / Flux Pro Ultra)
    const { data, error } = await supabase.functions.invoke('generate-starting-image', {
      body: {
        character_avatar_url: publicUrl,  // 用户照片 URL(作为参考图)
        scene_prompt: scenePrompt,        // AI 生成提示词
        mood: analysisContext?.mood || 'neutral',
        aspect_ratio: "9:16",             // 🔥 强制 9:16 竖屏
        model_id: "fal-ai/flux-pro/v1.1-ultra", // 🔥 更换为高质量模型 (Nano Banana?)
        // 传递分析上下文
        analysis_context: {
          location: analysisContext?.location,
          weather: analysisContext?.weather,
          clothing: analysisContext?.clothing,
          time_of_day: analysisContext?.time_of_day
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
      uploadedPhotoUrl: publicUrl            // 原始照片 URL
    }

  } catch (error) {
    console.error('[imageGenerationService] Error:', error)
    throw error
  }
}

/**
 * 【新功能】生成黑白背影照
 * 基于已生成的 Identity 照片，生成一张背对镜头的黑白照片
 * 
 * @param {string} identityImageUrl - S2 生成的 Identity 照片 URL
 * @returns {Promise<string>} 生成的背影照 URL
 */
export async function generateBackViewImage(identityImageUrl) {
  console.log('[imageGenerationService] Generating back view image...')

  try {
    // 构建背影照 Prompt
    const backViewPrompt = "Back view of this person, looking away from camera, black and white photography, high contrast, noir style, cinematic lighting, 9:16 aspect ratio, minimalist background"

    // 调用 Edge Function (复用 generate-starting-image，但用途不同)
    const { data, error } = await supabase.functions.invoke('generate-starting-image', {
      body: {
        character_avatar_url: identityImageUrl, // 使用 Identity 图作为参考
        scene_prompt: backViewPrompt,
        image_strength: 0.6,                    // 适当降低参考图权重，允许姿态变化
        aspect_ratio: "9:16",
        model_id: "fal-ai/flux-pro/v1.1-ultra"
      }
    })

    if (error) {
      throw new Error(`Back view generation failed: ${error.message}`)
    }

    console.log('[imageGenerationService] Back view generated:', data.image_url)
    return data.image_url

  } catch (error) {
    console.error('[imageGenerationService] Error generating back view:', error)
    throw error
  }
}

/**
 * 【提示词构建】根据产品需求和用户场景构建 AI 生成提示词
 */
function buildGenerationPrompt(analysisContext) {
  // 基础提示词 (更新为 9:16 竖屏适配)
  const basePrompt = `Remove all the accessories on head if there are any, change the outfits to a similar vibe outfit, change the facial features a tiny bit, still looking good, a bit better looking version of this person, with smooth skin, great professional lighting, great real skin texture, add a tiny bit mixture with an actor from the west, looking natural, looking a bit more sexy, looking cool, background is aesthetic portrait photoshoot background drop, with artistic 2 tone gradient pastel color, 9:16 vertical aspect ratio`

  if (analysisContext?.mood) {
    return `${basePrompt}. Mood: ${analysisContext.mood}.`
  }

  return basePrompt
}

/**
 * 【容错机制】带重试的图像生成
 */
export async function generateWithRetry(userPhotoBase64, analysisContext, maxRetries = 3) {
  let lastError = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[imageGenerationService] Attempt ${attempt}/${maxRetries}`)
      const result = await generateRecommendedIdentity(userPhotoBase64, analysisContext)
      return result
    } catch (error) {
      lastError = error
      console.error(`[imageGenerationService] Attempt ${attempt} failed:`, error)

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000
        console.log(`[imageGenerationService] Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError || new Error('Generation failed after retries')
}

/**
 * 【新功能】生成过渡视频 (Google Veo)
 * 从黑白背影照过渡到彩色 Identity 照
 * 
 * @param {string} firstFrameUrl - 起始帧 (黑白背影)
 * @param {string} lastFrameUrl - 结束帧 (彩色 Identity)
 * @returns {Promise<string>} 生成的视频 URL
 */
export async function generateTransitionVideo(firstFrameUrl, lastFrameUrl) {
  console.log('[mediaGenerationService] Generating transition video...')

  try {
    // 调用 Edge Function (假设有一个支持 Veo 的 endpoint)
    // 如果没有专门的 generate-video，可能需要更新 generate-starting-image 或新建
    // 这里假设我们使用 generate-video-veo
    const { data, error } = await supabase.functions.invoke('generate-video-veo', {
      body: {
        first_frame_image_url: firstFrameUrl,
        last_frame_image_url: lastFrameUrl,
        aspect_ratio: "9:16",
        model_id: "google/veo-3.1-fast", // 🔥 指定 Veo 3.1 Fast
        prompt: "Cinematic transition from back view to front view, high quality, smooth motion"
      }
    })

    if (error) {
      throw new Error(`Video generation failed: ${error.message}`)
    }

    console.log('[mediaGenerationService] Video generated:', data.video_url)
    return data.video_url

  } catch (error) {
    console.error('[mediaGenerationService] Error generating video:', error)
    // throw error // 暂时不抛出阻断错误，以免影响流程，返回 null
    return null
  }
}
