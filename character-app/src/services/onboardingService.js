/**
 * 【服务模块】Onboarding 服务 - 配置和会话管理
 *
 * 产品价值:
 * 1. 动态配置加载 - 从 Supabase 读取 Onboarding 配置,支持 Admin 后台实时更新
 * 2. 会话追踪 - 记录每个用户的 Onboarding 进度和数据,支持中断后恢复
 * 3. 文件上传 - 统一管理用户上传的照片/音频等资源
 *
 * 技术实现:
 * - 并行查询:配置+主题同时加载,减少 50% 等待时间
 * - 会话机制:onboarding_sessions 表记录用户进度和数据(JSONB 字段)
 * - 云端存储:Supabase Storage 存储用户上传文件
 */

import { supabase } from './supabaseClient'

export const onboardingService = {
  // ============================================================
  // 【核心功能】获取激活的 Onboarding 配置(包含主题)
  // 产品需求:加载配置和视觉主题,渲染 Onboarding UI
  // 技术实现:并行查询 onboarding_configs + onboarding_theme 表,合并结果
  // ============================================================
  async getActiveConfig() {
    try {
      const startTime = performance.now()
      console.log('[onboardingService] Fetching active config and theme...')

      // 并行查询配置和主题(性能优化:减少 50% 等待时间)
      const [configResult, themeResult] = await Promise.all([
        supabase
          .from('onboarding_configs')
          .select('*')
          .eq('is_active', true)
          .single(),
        supabase
          .from('onboarding_theme')
          .select('*')
          .single()
      ])

      // 错误检查:配置加载失败则抛出错误
      if (configResult.error) {
        console.error('[onboardingService] Error fetching config:', configResult.error)
        throw configResult.error
      }

      if (!configResult.data) {
        throw new Error('No active onboarding configuration found')
      }

      // 错误检查:主题加载失败则抛出错误
      if (themeResult.error) {
        console.error('[onboardingService] Error fetching theme:', themeResult.error)
        throw themeResult.error
      }

      if (!themeResult.data) {
        throw new Error('No onboarding theme found')
      }

      const config = configResult.data
      const theme = themeResult.data

      // 合并配置和主题为单一对象(方便组件使用)
      const mergedConfig = {
        ...config,
        global_styles: theme.global_styles,
        step_1_splash: theme.step_1_splash,
        step_2_guidance: theme.step_2_guidance,
        step_3_identity_input: theme.step_3_identity_input,
        step_4_choice: theme.step_4_choice,
        step_5_creation: theme.step_5_creation,
        step_6_finalizing: theme.step_6_finalizing,
        step_7_entry: theme.step_7_entry,
        theme_id: theme.theme_id,
        theme_name: theme.theme_name
      }

      const loadTime = Math.round(performance.now() - startTime)
      console.log(`[onboardingService] Config loaded in ${loadTime}ms:`, config.config_name, 'Theme:', theme.theme_name)
      return mergedConfig
    } catch (error) {
      console.error('[onboardingService] Failed to get active config:', error)
      throw error
    }
  },

  // ============================================================
  // 【核心功能】创建新的 Onboarding 会话
  // 产品需求:记录用户开始 Onboarding 的时间点,追踪进度
  // 技术实现:在 onboarding_sessions 表创建新记录,返回 session_id
  // @param {string} configId - 配置 ID(UUID)
  // @returns {string} 新创建的 session_id
  // ============================================================
  async createSession(configId) {
    try {
      console.log('[onboardingService] Creating session for config:', configId)

      const { data, error } = await supabase
        .from('onboarding_sessions')
        .insert([
          {
            config_id: configId,
            current_step: 1,
            ip_address: null,  // 可以通过 API 获取用户 IP
            user_agent: navigator.userAgent
          }
        ])
        .select()
        .single()

      if (error) {
        console.error('[onboardingService] Error creating session:', error)
        throw error
      }

      console.log('[onboardingService] Session created:', data.session_id)
      return data.session_id
    } catch (error) {
      console.error('[onboardingService] Failed to create session:', error)
      throw error
    }
  },

  // ============================================================
  // 【核心功能】更新会话数据
  // 产品需求:每个 Stage 完成后保存用户输入和进度
  // 技术实现:更新 onboarding_sessions 表的 current_step + user_data(JSONB)
  // @param {string} sessionId - 会话 ID(UUID)
  // @param {number} currentStep - 当前 Stage 编号(1-4)
  // @param {object} userData - 用户数据对象(JSONB 格式)
  // ============================================================
  async updateSession(sessionId, currentStep, userData) {
    try {
      console.log('[onboardingService] Updating session:', sessionId, 'step:', currentStep)

      // 数据库表结构: session_id, config_id, current_step, user_data(JSONB), completed_at, created_at
      const updateData = {
        current_step: currentStep,
        user_data: userData  // 所有用户数据存储在 JSONB 字段中
      }

      const { error } = await supabase
        .from('onboarding_sessions')
        .update(updateData)
        .eq('session_id', sessionId)

      if (error) {
        console.error('[onboardingService] Error updating session:', error)
        throw error
      }

      console.log('[onboardingService] Session updated successfully')
    } catch (error) {
      console.error('[onboardingService] Failed to update session:', error)
      throw error
    }
  },

  // ============================================================
  // 【核心功能】完成会话(标记 Onboarding 完成)
  // 产品需求:用户完成所有 Stage 后标记会话为已完成
  // 技术实现:更新 completed_at 字段为当前时间,current_step 设为最后一步
  // @param {string} sessionId - 会话 ID(UUID)
  // @param {object} finalUserData - 最终用户数据(JSONB 格式)
  // ============================================================
  async completeSession(sessionId, finalUserData) {
    try {
      console.log('[onboardingService] Completing session:', sessionId)

      const { error } = await supabase
        .from('onboarding_sessions')
        .update({
          user_data: finalUserData,  // 最终用户数据存储在 JSONB 字段中
          completed_at: new Date().toISOString(),  // 标记完成时间
          current_step: 7  // 标记为最后一步(兼容旧架构)
        })
        .eq('session_id', sessionId)

      if (error) {
        console.error('[onboardingService] Error completing session:', error)
        throw error
      }

      console.log('[onboardingService] Session completed successfully')
    } catch (error) {
      console.error('[onboardingService] Failed to complete session:', error)
      throw error
    }
  },

  // ============================================================
  // 【核心功能】上传文件到云端存储
  // 产品需求:用户上传的照片/音频统一存储到 Supabase Storage
  // 技术实现:上传到 onboarding-uploads bucket,返回公开访问 URL
  // @param {File} file - 文件对象
  // @param {string} sessionId - 会话 ID(用于组织文件夹)
  // @param {string} fileType - 文件类型('photo' | 'audio' | 'video')
  // @returns {string} 文件的公开访问 URL
  // ============================================================
  async uploadFile(file, sessionId, fileType = 'photo') {
    try {
      console.log('[onboardingService] Uploading file:', file.name)

      const fileExt = file.name.split('.').pop()
      const fileName = `${sessionId}/${fileType}-${Date.now()}.${fileExt}`

      const { data, error } = await supabase.storage
        .from('onboarding-uploads')
        .upload(fileName, file, {
          cacheControl: '3600',  // CDN 缓存 1 小时
          upsert: false  // 不覆盖已存在的文件
        })

      if (error) {
        console.error('[onboardingService] Error uploading file:', error)
        throw error
      }

      // 获取文件的公开访问 URL
      const { data: urlData } = supabase.storage
        .from('onboarding-uploads')
        .getPublicUrl(fileName)

      console.log('[onboardingService] File uploaded:', urlData.publicUrl)
      return urlData.publicUrl
    } catch (error) {
      console.error('[onboardingService] Failed to upload file:', error)
      throw error
    }
  }
}

export default onboardingService
