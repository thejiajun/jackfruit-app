/**
 * 【React Hook】Onboarding 配置加载器
 *
 * 产品价值:
 * 1. 动态配置支持 - 从 Supabase 加载 Onboarding 配置,支持 Admin 后台实时更新
 * 2. 缓存机制 - 5 分钟本地缓存,减少网络请求,加快加载速度
 * 3. 降级容错 - 配置加载失败时不阻塞,使用默认配置继续
 *
 * 技术实现:
 * - LocalStorage 缓存:配置数据 + 时间戳,有效期 5 分钟
 * - 自动刷新:forceRefresh 参数支持强制重新加载(Admin 更新后调用)
 * - 状态管理:loading/error/fromCache 三个状态供组件判断
 *
 * 使用场景:
 * - OnboardingEngine 首次加载时调用
 * - Admin 更新配置后调用 clearCache() + reload()
 */

import { useState, useEffect } from 'react'
import { onboardingService } from '../../../services/onboardingService'

const CACHE_KEY = 'onboarding_config_cache'  // LocalStorage 缓存键名
const CACHE_DURATION = 5 * 60 * 1000 // 缓存有效期:5 分钟

export const useOnboardingConfig = () => {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    loadActiveConfig()
  }, [])

  // ============================================================
  // 【辅助函数】从 LocalStorage 加载缓存配置
  // 技术实现:读取缓存 → 检查有效期 → 返回数据或 null
  // ============================================================
  const loadFromCache = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (!cached) return null

      const { data, timestamp } = JSON.parse(cached)
      const age = Date.now() - timestamp

      if (age < CACHE_DURATION) {
        console.log(`[useOnboardingConfig] Loaded from cache (${Math.round(age / 1000)}s old)`)
        return data
      } else {
        console.log('[useOnboardingConfig] Cache expired, fetching fresh data')
        localStorage.removeItem(CACHE_KEY)
        return null
      }
    } catch (err) {
      console.error('[useOnboardingConfig] Cache read error:', err)
      localStorage.removeItem(CACHE_KEY)
      return null
    }
  }

  // ============================================================
  // 【辅助函数】保存配置到 LocalStorage
  // 技术实现:数据 + 时间戳打包存储
  // ============================================================
  const saveToCache = (data) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
      console.log('[useOnboardingConfig] Config cached successfully')
    } catch (err) {
      console.error('[useOnboardingConfig] Cache write error:', err)
    }
  }

  // ============================================================
  // 【核心函数】加载配置(优先从缓存,降级到 Supabase)
  // 产品需求:快速加载配置,减少用户等待时间
  // 技术实现:优先读取缓存 → 缓存过期则从 Supabase 加载 → 更新缓存
  // @param {boolean} forceRefresh - 是否强制刷新(跳过缓存)
  // ============================================================
  const loadActiveConfig = async (forceRefresh = false) => {
    try {
      setLoading(true)
      setError(null)
      setFromCache(false)

      // 第 1 步:如果不强制刷新,先尝试从缓存加载
      if (!forceRefresh) {
        const cachedData = loadFromCache()
        if (cachedData) {
          setConfig(cachedData)
          setFromCache(true)
          setLoading(false)
          return
        }
      }

      // 第 2 步:从 Supabase 加载最新配置
      const data = await onboardingService.getActiveConfig()
      setConfig(data)
      saveToCache(data)
    } catch (err) {
      console.error('[useOnboardingConfig] Failed to load config:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ============================================================
  // 【辅助函数】清除缓存
  // 使用场景:Admin 更新配置后调用,强制前端重新加载最新配置
  // ============================================================
  const clearCache = () => {
    localStorage.removeItem(CACHE_KEY)
    console.log('[useOnboardingConfig] Cache cleared')
  }

  return {
    config,          // 配置数据(JSONB 对象)
    loading,         // 是否正在加载
    error,           // 错误信息(如果加载失败)
    fromCache,       // 是否从缓存加载(true 表示未发起网络请求)
    reload: loadActiveConfig,  // 手动刷新配置(可传 forceRefresh=true 跳过缓存)
    clearCache       // 清除缓存
  }
}

export default useOnboardingConfig
