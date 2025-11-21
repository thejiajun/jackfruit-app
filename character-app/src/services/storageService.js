/**
 * 【服务模块】Supabase Storage 服务 - 云端文件存储
 *
 * 产品价值:
 * 1. 避免数据库膨胀 - 照片上传到云端存储,数据库只保存 URL 引用
 * 2. 提升加载速度 - CDN 分发,全球加速访问
 * 3. 降低传输成本 - URL 引用比 base64 小 99%
 *
 * 技术实现:
 * - Supabase Storage:兼容 S3 的对象存储服务
 * - Bucket:onboarding-resources(存储 Onboarding 相关资源)
 * - 文件夹结构:stage2-photos, stage3-photos
 *
 * 使用场景:
 * - Stage 2 (Mirror): uploadPhoto() - 上传用户拍摄的照片
 * - Stage 3 (Forging): uploadPhotos() - 批量上传"记忆碎片"照片
 */

import { supabase } from './supabaseClient'

/**
 * 【辅助函数】将 base64 data URL 转换为 Blob 对象
 *
 * 技术说明:
 * - Supabase Storage 只接受 Blob/File 对象,不接受 base64 字符串
 * - 需要先解码 base64,再转换为二进制 Blob
 *
 * @param {string} dataUrl - Base64 格式的图片数据 (data:image/jpeg;base64,...)
 * @returns {Blob} 图片 Blob 对象
 */
function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }

  return new Blob([u8arr], { type: mime })
}

/**
 * 【核心功能】上传单张照片到云端存储
 *
 * 产品需求:用户拍照后,上传到云端,获得可公开访问的 URL
 * 技术实现:base64 → Blob → Supabase Storage → 公开 URL
 *
 * 文件命名规则:
 * - 格式: {folder}/{timestamp}-{random}.jpg
 * - 示例: stage2-photos/1734567890-abc123.jpg
 * - 目的: 避免文件名冲突,支持按时间排序
 *
 * 使用场景: Stage 2 (Mirror) - 用户拍照确认后上传
 *
 * @param {string} dataUrl - Base64 格式的图片数据 (data:image/jpeg;base64,...)
 * @param {string} bucket - Storage bucket 名称 (默认: 'onboarding-resources')
 * @param {string} folder - 文件夹路径 (例如: 'stage2-photos')
 * @returns {Promise<string>} 上传后的公开 URL (https://...)
 */
export async function uploadPhoto(dataUrl, bucket = 'onboarding-resources', folder = 'stage2-photos') {
  try {
    console.log('[storageService] Uploading photo to Supabase Storage...')

    // 转换 data URL 为 Blob
    const blob = dataUrlToBlob(dataUrl)

    // 生成唯一文件名
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(7)
    const fileName = `${folder}/${timestamp}-${random}.jpg`

    // 上传到 Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: false
      })

    if (error) {
      console.error('[storageService] Upload failed:', error)
      throw error
    }

    console.log('[storageService] Upload successful:', data.path)

    // 获取公开 URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path)

    const publicUrl = urlData.publicUrl
    console.log('[storageService] Public URL:', publicUrl)

    return publicUrl
  } catch (error) {
    console.error('[storageService] Error uploading photo:', error)
    throw error
  }
}

/**
 * 【核心功能】批量上传多张照片到云端存储
 *
 * 产品需求:用户上传多张"记忆碎片"照片,批量上传以提升效率
 * 技术实现:并行上传所有照片,使用 Promise.all 等待全部完成
 *
 * 性能优化:
 * - 并行上传:5 张照片同时上传,比顺序上传快 5 倍
 * - 错误处理:任一照片失败,全部失败(保证数据一致性)
 *
 * 使用场景: Stage 3 (Forging) - 用户点击"SHOW ME"后批量上传
 *
 * @param {Array<string>} dataUrls - 多张照片的 Base64 数据数组
 * @param {string} bucket - Storage bucket 名称 (默认: 'onboarding-resources')
 * @param {string} folder - 文件夹路径 (例如: 'stage3-photos')
 * @returns {Promise<Array<string>>} 上传后的公开 URL 数组
 */
export async function uploadPhotos(dataUrls, bucket = 'onboarding-resources', folder = 'stage3-photos') {
  try {
    console.log(`[storageService] Uploading ${dataUrls.length} photos to Supabase Storage...`)

    // 并行上传所有照片
    const uploadPromises = dataUrls.map(dataUrl =>
      uploadPhoto(dataUrl, bucket, folder)
    )

    const publicUrls = await Promise.all(uploadPromises)

    console.log('[storageService] All photos uploaded successfully:', publicUrls)
    return publicUrls
  } catch (error) {
    console.error('[storageService] Error uploading photos:', error)
    throw error
  }
}

export default {
  uploadPhoto,
  uploadPhotos
}
