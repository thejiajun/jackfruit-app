import { supabase } from './supabaseClient'
import { generatePikaVideo } from './pikaVideoService'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export const statusService = {
  // 获取所有状态
  async getAll() {
    const { data, error } = await supabase
      .from('character_statuses')
      .select(`
        *,
        character:ai_characters(character_id, name, avatar_url)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  },

  // 获取单个状态
  async getById(statusId) {
    const { data, error } = await supabase
      .from('character_statuses')
      .select(`
        *,
        character:ai_characters(character_id, name, avatar_url)
      `)
      .eq('status_id', statusId)
      .single()

    if (error) throw error
    return data
  },

  // 按角色筛选
  async getByCharacterId(characterId) {
    const { data, error } = await supabase
      .from('character_statuses')
      .select(`
        *,
        character:ai_characters(character_id, name, avatar_url)
      `)
      .eq('character_id', characterId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  },

  // 创建状态
  async create(status) {
    const { data, error } = await supabase
      .from('character_statuses')
      .insert(status)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // 更新状态
  async update(statusId, updates) {
    const { data, error } = await supabase
      .from('character_statuses')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('status_id', statusId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // 删除状态
  async delete(statusId) {
    const { error } = await supabase
      .from('character_statuses')
      .delete()
      .eq('status_id', statusId)

    if (error) throw error
  },

  // 设置默认状态
  async setDefault(characterId, statusId) {
    // 先取消该角色的所有默认状态
    await supabase
      .from('character_statuses')
      .update({ is_default: false })
      .eq('character_id', characterId)

    // 设置新的默认状态
    const { data, error } = await supabase
      .from('character_statuses')
      .update({ is_default: true })
      .eq('status_id', statusId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ========== Gen-AI 工作流 ==========

  // Step 1: 生成文本内容（调用 Gemini）
  async generateTextContent(statusId, characterId, mood, statusDescription) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-text-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        status_id: statusId,
        character_id: characterId,
        mood,
        status_description: statusDescription || ''
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Text generation failed')
    }

    const result = await response.json()
    // Edge Function 返回 { success: true, data: {...} }
    // 我们需要返回 data 部分
    return result.data || result
  },

  // Step 2: 生成首帧图（调用 FAL SeeDrawm）
  async generateStartingImage(statusId, characterAvatarUrl, scenePrompt, mood) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-starting-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        status_id: statusId,
        character_avatar_url: characterAvatarUrl,
        scene_prompt: scenePrompt,
        mood
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Image generation failed')
    }

    const result = await response.json()
    // Edge Function 返回 { success: true, data: { image_url, original_fal_url } }
    // 返回 data 并将 image_url 重命名为 starting_image_url
    const data = result.data || result
    return {
      starting_image_url: data.image_url || data.starting_image_url,
      original_fal_url: data.original_fal_url
    }
  },

  // Step 3: 生成单个视频（Cloudflare Worker → Pika Business API）
  async generateSingleVideo(statusId, startingImageUrl, scenePrompt, mood, videoDuration = 3) {
    const duration = videoDuration <= 5 ? 5 : 10
    const videoUrl = await generatePikaVideo({
      mode: 'image-to-video',
      image_url: startingImageUrl,
      prompt: `${scenePrompt}. The character's mood is ${mood}. Smooth natural movement.`,
      aspect_ratio: '9:16',
      resolution: '720p',
      duration
    })
    return { video_url: videoUrl, duration, status_id: statusId }
  },

  // 上传视频到 Storage
  async uploadVideo(file) {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `videos/${fileName}`

    const { error } = await supabase.storage
      .from('character-videos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) throw error

    // 获取公开 URL
    const { data: { publicUrl } } = supabase.storage
      .from('character-videos')
      .getPublicUrl(filePath)

    return publicUrl
  },

  // 上传首帧图到 Storage
  async uploadImage(file) {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `starting-images/${fileName}`

    const { error } = await supabase.storage
      .from('character-videos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) throw error

    // 获取公开 URL
    const { data: { publicUrl } } = supabase.storage
      .from('character-videos')
      .getPublicUrl(filePath)

    return publicUrl
  },

  // 更新视频播放列表顺序
  async updateVideosPlaylist(statusId, videosPlaylist) {
    const { data, error } = await supabase
      .from('character_statuses')
      .update({
        videos_playlist: videosPlaylist,
        updated_at: new Date().toISOString()
      })
      .eq('status_id', statusId)
      .select()
      .single()

    if (error) throw error
    return data
  }
}
