/**
 * 模板服务
 *
 * 从 Supabase prompt_items 表加载模板数据
 */

import { supabase } from './supabaseClient'

/**
 * 加载所有 looking 类别的模板
 * @returns {Promise<Array>} 模板列表
 */
export async function loadLookingTemplates() {
  try {
    console.log('[templateService] Loading looking templates from prompt_items...')

    const { data, error } = await supabase
      .from('prompt_items')
      .select('*')
      .eq('category', 'looking')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[templateService] Supabase query error:', error)
      throw error
    }

    console.log(`[templateService] Loaded ${data?.length || 0} templates`)
    return data || []
  } catch (error) {
    console.error('[templateService] Failed to load templates:', error)

    // 返回空数组而不是抛出错误
    return []
  }
}

/**
 * 根据 ID 获取单个模板
 * @param {string} templateId - 模板 ID
 * @returns {Promise<Object|null>} 模板对象
 */
export async function getTemplateById(templateId) {
  try {
    const { data, error } = await supabase
      .from('prompt_items')
      .select('*')
      .eq('id', templateId)
      .single()

    if (error) {
      console.error('[templateService] Failed to get template:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('[templateService] Error:', error)
    return null
  }
}

/**
 * 生成模板预览图（占位符）
 * 生产环境会调用 FAL API 实时生成
 * @param {string} templateId - 模板 ID
 * @param {string} photoDataUrl - 用户照片
 * @returns {Promise<string>} 预览图 URL
 */
export async function generateTemplatePreview(templateId, photoDataUrl) {
  // 开发环境：返回占位符
  console.log('[templateService] Generating preview for template:', templateId)

  // TODO: 生产环境调用 FAL API
  // const response = await fetch('/api/generate-preview', {
  //   method: 'POST',
  //   body: JSON.stringify({ templateId, photo: photoDataUrl })
  // })

  // 返回一个简单的数据 URL 占位符
  return new Promise(resolve => {
    setTimeout(() => {
      // 使用原图作为占位符
      resolve(photoDataUrl)
    }, 500)
  })
}

export default {
  loadLookingTemplates,
  getTemplateById,
  generateTemplatePreview
}
