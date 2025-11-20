/**
 * 环境配置服务
 *
 * 用于在开发环境和生产环境之间切换
 * - 开发环境：使用 mock 数据和本地资源
 * - 生产环境：使用真实 API 和远程资源
 */

const ENV_MODE = import.meta.env.MODE // 'development' | 'production'

export const envService = {
  /**
   * 判断是否为开发环境
   */
  isDevelopment() {
    return ENV_MODE === 'development'
  },

  /**
   * 判断是否为生产环境
   */
  isProduction() {
    return ENV_MODE === 'production'
  },

  /**
   * 获取 Gemini Vision API 配置
   */
  getGeminiVisionConfig() {
    if (this.isDevelopment()) {
      return {
        enabled: false, // 开发环境暂不启用
        mock: true,
        mockDelay: 2000 // 模拟 API 延迟
      }
    }

    return {
      enabled: true,
      mock: false,
      apiKey: import.meta.env.VITE_GEMINI_API_KEY
    }
  },

  /**
   * 获取 Gemini Live API 配置
   */
  getGeminiLiveConfig() {
    if (this.isDevelopment()) {
      return {
        enabled: false, // 开发环境暂不启用
        mock: true,
        mockDelay: 1000
      }
    }

    return {
      enabled: true,
      mock: false,
      apiKey: import.meta.env.VITE_GEMINI_API_KEY,
      model: 'gemini-2.5-flash-native-audio-preview-09-2025'
    }
  },

  /**
   * 获取 FAL API 配置（视频生成）
   */
  getFalApiConfig() {
    if (this.isDevelopment()) {
      return {
        enabled: false, // 开发环境暂不启用
        mock: true,
        mockVideoUrls: {
          revealing: '/mock-videos/revealing.mp4',
          lipsync: '/mock-videos/lipsync.mp4',
          transition: '/mock-videos/transition.mp4'
        },
        mockDelay: 3000
      }
    }

    return {
      enabled: true,
      mock: false,
      apiKey: import.meta.env.VITE_FAL_API_KEY
    }
  },

  /**
   * 获取模板预览配置
   */
  getTemplatePreviewConfig() {
    if (this.isDevelopment()) {
      return {
        enabled: false, // 开发环境暂不启用实时生成
        mock: true,
        usePlaceholder: true // 使用占位符图片
      }
    }

    return {
      enabled: true,
      mock: false,
      parallelGeneration: true // 生产环境并行生成预览图
    }
  }
}

export default envService
