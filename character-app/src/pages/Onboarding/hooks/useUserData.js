/**
 * 【React Hook】用户数据管理器 - Onboarding 过程中的用户输入数据
 *
 * 产品价值:
 * 1. 数据持久化 - 每个 Stage 完成后自动保存到数据库,支持中断后恢复
 * 2. 进度追踪 - 记录用户在哪个 Stage,完成了哪些输入
 * 3. 数据完整性 - 保证所有必要数据收集完整后才进入下一步
 *
 * 技术实现:
 * - Session 机制:每次 Onboarding 创建唯一 session_id
 * - 增量更新:每个 Stage 只更新自己的数据字段,不覆盖其他 Stage 数据
 * - 数据库存储:onboarding_sessions 表,包含 current_step + user_data(JSONB)
 *
 * 数据结构:
 * - name: 用户名字(可选)
 * - photo_url: 用户照片 URL(Stage 2)
 * - voice_url: 用户语音 URL(可选)
 * - choice: 用户选择("keep_self" / "become_other")
 * - creation_prompt: AI 生成提示词
 */

import { useState } from 'react'
import { onboardingService } from '../../../services/onboardingService'

export const useUserData = () => {
  const [sessionId, setSessionId] = useState(null)
  const [userData, setUserData] = useState({
    name: '',
    photo_url: '',
    voice_url: '',
    choice: '',
    creation_prompt: ''
  })

  // ============================================================
  // 【核心函数】初始化 Onboarding 会话
  // 产品需求:记录每次 Onboarding 的开始时间和配置
  // 技术实现:调用 onboardingService 创建新 session 记录
  // @param {string} configId - 配置 ID(UUID)
  // @returns {string} 新创建的 session_id
  // ============================================================
  const initSession = async (configId) => {
    try {
      const newSessionId = await onboardingService.createSession(configId)
      setSessionId(newSessionId)
      console.log('[useUserData] Session initialized:', newSessionId)
      return newSessionId
    } catch (error) {
      console.error('[useUserData] Failed to init session:', error)
      throw error
    }
  }

  // ============================================================
  // 【核心函数】更新用户数据
  // 产品需求:每个 Stage 完成后保存用户输入的数据
  // 技术实现:增量更新 userData 对象 → 保存到数据库
  // @param {number} stepNumber - Stage 编号(1-4)
  // @param {object} stepData - 该 Stage 收集的数据
  // ============================================================
  const updateUserData = async (stepNumber, stepData) => {
    // 参数校验(防止调用错误)
    if (typeof stepNumber !== 'number') {
      console.error('[useUserData] Invalid stepNumber type:', typeof stepNumber, stepNumber)
      throw new Error(`stepNumber must be a number, got ${typeof stepNumber}`)
    }

    if (typeof stepData !== 'object' || stepData === null) {
      console.error('[useUserData] Invalid stepData type:', typeof stepData, stepData)
      throw new Error(`stepData must be an object, got ${typeof stepData}`)
    }

    // 合并新数据(不覆盖其他 Stage 的数据)
    const newData = { ...userData, ...stepData }
    setUserData(newData)

    // 保存到数据库(包含当前 Stage 编号)
    if (sessionId) {
      try {
        await onboardingService.updateSession(sessionId, stepNumber, newData)
        console.log('[useUserData] Data saved for step:', stepNumber)
      } catch (error) {
        console.error('[useUserData] Failed to save data:', error)
        throw error  // 向上抛出错误，让调用方处理
      }
    }
  }

  // ============================================================
  // 【核心函数】提交最终数据(标记 Onboarding 完成)
  // 产品需求:所有 Stage 完成后调用,标记会话为已完成状态
  // 技术实现:更新 onboarding_sessions 表的 completed_at 字段
  // ============================================================
  const submitUserData = async () => {
    if (!sessionId) {
      throw new Error('No active session')
    }

    try {
      await onboardingService.completeSession(sessionId, userData)
      console.log('[useUserData] Session completed')
      return { success: true }
    } catch (error) {
      console.error('[useUserData] Failed to submit:', error)
      throw error
    }
  }

  return {
    sessionId,       // 当前会话 ID(UUID)
    userData,        // 当前收集的用户数据(JSONB 对象)
    updateUserData,  // 更新用户数据(stepNumber, stepData)
    submitUserData,  // 提交最终数据(标记完成)
    initSession      // 初始化新会话(configId)
  }
}

export default useUserData
