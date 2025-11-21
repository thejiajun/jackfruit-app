
/**
 * 【核心模块】Onboarding 引擎 - 4 阶段流程编排器
 *
 * 产品价值:
 * 1. 统一管理 4 个 Stage 的流程 - 从启动到角色诞生的完整体验
 * 2. 动态配置支持 - 从 Supabase 加载配置,支持 Admin 后台实时更新
 * 3. 用户数据追踪 - 记录每个 Stage 的进度和用户输入数据
 * 4. 背景音乐控制 - 支持全局背景音乐循环播放
 *
 * 技术实现:
 * - 状态机:通过 currentStepNumber (1-4) 控制当前 Stage
 * - 配置系统:从 Supabase 加载 onboarding_configs,有缓存机制(5分钟)
 * - 会话追踪:每次 Onboarding 创建 session 记录在 onboarding_sessions 表
 * - 防重复触发:使用 isTransitioning 锁避免 Stage 重复切换
 * - Fallback 机制:配置加载失败时使用默认配置继续运行
 *
 * Stage 架构:
 * Stage 1: System Boot - 故障艺术 + Entity 聚合 + 权限请求
 * Stage 2: Mirror Guide - 摄像头拍照 + Gemini Vision 分析 + Gemini Live 对话
 * Stage 3: Forging - 上传"记忆碎片" + 性格分析 + Script 生成 + 视频生成触发
 * Stage 4: Living Avatar - Revealing 视频 + 命名 + Lip-Sync 视频 + Transition 传送门
 */

import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOnboardingConfig } from './hooks/useOnboardingConfig'
import { useStepNavigation } from './hooks/useStepNavigation'
import { useUserData } from './hooks/useUserData'
import { MobileFrame } from '../../components/layout/MobileFrame'
import GeminiLiveService from '../../services/geminiLiveService'

// 导入所有 Stage 组件（新的 4-stage 架构）
import Stage1Boot from './stages/Stage1Boot'
import Stage2Mirror from './stages/Stage2Mirror'
import Stage3Forging from './stages/Stage3Forging'
import Stage4Avatar from './stages/Stage4Avatar'

import './styles/onboarding.css'

/**
 * 【Stage 组件映射表】
 * 将 Stage 编号(1-4)映射到对应的 React 组件
 */
const STAGE_COMPONENTS = {
  1: Stage1Boot,
  2: Stage2Mirror,
  3: Stage3Forging,
  4: Stage4Avatar
}

/**
 * 【Stage 配置键名映射表】- ⚠️ 历史遗留问题
 *
 * 将前端 Stage 编号映射到数据库字段名
 *
 * 问题说明:
 * - 当前 4-Stage 架构仍使用旧 7-Step 架构的数据库字段名
 * - 导致编号不连续(Stage 2 → step_3, Stage 3 → step_5)
 * - 这是为了保持与现有数据库表 onboarding_theme 的兼容性
 *
 * 理想状态:
 * - Stage 1 → stage_1_boot (而非 step_1_splash)
 * - Stage 2 → stage_2_mirror (而非 step_3_identity_input)
 * - Stage 3 → stage_3_forging (而非 step_5_creation)
 * - Stage 4 → stage_4_avatar (而非 step_7_entry)
 *
 * TODO: 需要数据库迁移才能修复此命名问题
 * 1. 在 onboarding_theme 表添加新字段(stage_1_boot, stage_2_mirror, etc.)
 * 2. 迁移旧数据到新字段
 * 3. 更新此映射为连续的 stage_N 命名
 * 4. 删除旧字段(step_1_splash, step_3_identity_input, etc.)
 */
const STAGE_CONFIG_KEYS = {
  1: 'step_1_splash',           // ⚠️ 历史遗留:应为 stage_1_boot
  2: 'step_3_identity_input',   // ⚠️ 历史遗留:应为 stage_2_mirror(注意跳号!)
  3: 'step_5_creation',         // ⚠️ 历史遗留:应为 stage_3_forging(注意跳号!)
  4: 'step_7_entry'             // ⚠️ 历史遗留:应为 stage_4_avatar(注意跳号!)
}

export const OnboardingEngine = () => {
  const navigate = useNavigate()
  const [musicPlaying, setMusicPlaying] = useState(false)  // 背景音乐播放状态
  const [loadingStep, setLoadingStep] = useState(0)  // Loading 动画步骤(0-3)
  const [isTransitioning, setIsTransitioning] = useState(false)  // 防重复锁:避免 Stage 重复切换

  // === Gemini Live 预连接（优化 Stage2 加载时间） ===
  const geminiLiveRef = useRef(null)

  // === 配置加载 ===
  const { config, loading: configLoading, error: configError, fromCache } = useOnboardingConfig()

  // === Fallback 默认配置 ===
  // 如果 Supabase 配置加载失败,使用这个默认配置保证流程继续运行
  const effectiveConfig = config || {
    config_id: 'default',
    config_name: 'Default 4-Stage Onboarding',
    flow_type: 'fixed_character',
    target_character_id: null,
    global_styles: {
      font_family: "'VT323', monospace",
      primary_color: '#00FF41',
      background_overlay: 'rgba(0, 0, 0, 0.7)',
      animation_speed: 'medium'
    },
    // 临时使用旧字段名（与 STAGE_CONFIG_KEYS 映射对应）
    step_1_splash: {
      visual: { glitch_effect: true, crt_scanlines: true },
      content: { entity_name: 'Pika', greeting: 'WELCOME.' }
    },
    step_3_identity_input: {
      visual: { camera_overlay: 'scan_lines' },
      interaction: { gemini_vision_enabled: true }
    },
    step_5_creation: {
      visual: { particle_animation: true },
      content: { max_photos: 5 }
    },
    step_7_entry: {
      visual: { character_card: true },
      videos: { transition_video: '/mock-videos/transition.mp4' }
    }
  }

  // === Stage 状态机(1-4) ===
  const { currentStepNumber, goToNextStep, goToStep } = useStepNavigation(4)

  // === 用户数据管理 ===
  const { sessionId, userData, updateUserData, initSession } = useUserData()

  // ============================================================
  // 【生命周期】Loading 步骤动画
  // 产品需求:配置加载时显示多段式加载提示,让用户感觉"正在发生什么"
  // 技术实现:0.3s → 0.8s → 1.3s 逐步显示不同的加载文案
  // ============================================================
  useEffect(() => {
    if (!configLoading || fromCache) {
      setLoadingStep(0)
      return
    }

    // 多段式加载提示(3个阶段)
    const timers = [
      setTimeout(() => setLoadingStep(1), 300),   // "Loading character profile..."
      setTimeout(() => setLoadingStep(2), 800),   // "Preparing experience..."
      setTimeout(() => setLoadingStep(3), 1300)   // "Almost ready..."
    ]

    return () => timers.forEach(timer => clearTimeout(timer))
  }, [configLoading, fromCache])

  // ============================================================
  // 【生命周期】初始化用户会话
  // 产品需求:记录每次 Onboarding 的进度和数据,支持中断后恢复
  // 技术实现:配置加载成功后创建 session 记录在 onboarding_sessions 表
  // 注意:只有真实配置(有 UUID)才创建会话,默认配置不创建
  // ============================================================
  useEffect(() => {
    if (config && !sessionId && config.config_id && config.config_id !== 'default') {
      initSession(config.config_id)
    }
  }, [config?.config_id, sessionId])

  // ============================================================
  // 【生命周期】背景音乐自动播放
  // 产品需求:进入 Onboarding 时自动播放背景音乐,营造沉浸感
  // 技术实现:先静音自动播放(绕过浏览器限制),用户首次交互后取消静音
  // ============================================================
  useEffect(() => {
    if (config?.global_styles?.background_music_url && !musicPlaying) {
      const audio = document.getElementById('global-background-music')
      if (!audio) return

      // 第 1 步:静音播放(绕过浏览器自动播放限制)
      audio.muted = true
      audio.play()
        .then(() => {
          console.log('[OnboardingEngine] Background music started (muted)')

          // 第 2 步:监听用户首次交互(点击/触摸/按键),然后取消静音
          const unmute = () => {
            audio.muted = false
            setMusicPlaying(true)
            document.removeEventListener('click', unmute)
            document.removeEventListener('touchstart', unmute)
            document.removeEventListener('keydown', unmute)
          }

          document.addEventListener('click', unmute)
          document.addEventListener('touchstart', unmute)
          document.addEventListener('keydown', unmute)

          return () => {
            document.removeEventListener('click', unmute)
            document.removeEventListener('touchstart', unmute)
            document.removeEventListener('keydown', unmute)
          }
        })
        .catch(err => {
          console.log('[OnboardingEngine] Music autoplay failed:', err.message)

          // 如果静音播放也失败,等待用户交互后播放(兜底方案)
          const playOnInteraction = () => {
            audio.muted = false
            audio.play()
              .then(() => {
                setMusicPlaying(true)
                console.log('[OnboardingEngine] Background music started after user interaction')
              })
              .catch(e => console.error('[OnboardingEngine] Failed to play music:', e))

            document.removeEventListener('click', playOnInteraction)
            document.removeEventListener('touchstart', playOnInteraction)
          }

          document.addEventListener('click', playOnInteraction)
          document.addEventListener('touchstart', playOnInteraction)
        })
    }
  }, [config?.global_styles?.background_music_url, musicPlaying])

  // ============================================================
  // 【渲染逻辑】Loading 状态
  // 产品需求:只在首次加载配置时显示极简 loading,有缓存则跳过
  // 技术实现:Stage 1 的启动序列本身就是 loading 动画,这里只是占位符
  // ============================================================
  if (configLoading && !fromCache && !config) {
    return (
      <MobileFrame>
        <div className="onboarding-loading">
          <div className="loading-content">
            <div className="loading-dots">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
          </div>
        </div>
      </MobileFrame>
    )
  }

  // ============================================================
  // 【渲染逻辑】Error 状态
  // 产品需求:配置加载失败时不阻塞流程,使用默认配置继续
  // 技术实现:只打印警告,不显示错误页,保证用户体验不中断
  // ============================================================
  if (configError && !config) {
    console.warn('[OnboardingEngine] Config error, using default config:', configError)
  }

  // ============================================================
  // 【核心逻辑】获取当前 Stage 的配置数据
  // ============================================================
  const stageConfigKey = STAGE_CONFIG_KEYS[currentStepNumber]
  const stageConfig = effectiveConfig[stageConfigKey]

  if (!stageConfig) {
    console.warn(`[OnboardingEngine] Missing config for stage ${currentStepNumber}, using minimal config`)
    // 不显示错误,使用最小配置继续(保证流程不中断)
  }

  // ============================================================
  // 【核心逻辑】获取当前 Stage 对应的 React 组件
  // ============================================================
  const StageComponent = STAGE_COMPONENTS[currentStepNumber]

  if (!StageComponent) {
    console.error(`[OnboardingEngine] No component for stage ${currentStepNumber}`)
    return (
      <MobileFrame>
        <div className="onboarding-error">
          <div style={{ textAlign: 'center' }}>
            <div>&gt; STAGE NOT IMPLEMENTED</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>
              Stage {currentStepNumber} is not available in DEMO mode
            </div>
          </div>
        </div>
      </MobileFrame>
    )
  }

  // ============================================================
  // 【核心回调】Stage 完成处理
  // 产品需求:Stage 完成后保存用户数据,并切换到下一个 Stage
  // 技术实现:防重复锁 + 数据保存 + Stage 4 后跳转角色主页
  // ============================================================
  const handleStageComplete = async (stageData) => {
    // 防重复触发:如果正在转换中,忽略重复调用
    if (isTransitioning) {
      console.warn(`[OnboardingEngine] Stage transition already in progress, ignoring duplicate call`)
      return
    }

    setIsTransitioning(true)  // 加锁
    console.log(`[OnboardingEngine] Stage ${currentStepNumber} completed:`, stageData)

    try {
      // 保存 Stage 数据到数据库(如果有数据)
      if (stageData && Object.keys(stageData).length > 0) {
        await updateUserData(currentStepNumber, stageData)
      }

      // 🔥 优化：Stage1 完成后预连接 Gemini Live，减少 Stage2 等待时间
      if (currentStepNumber === 1 && !geminiLiveRef.current) {
        try {
          const apiKey = import.meta.env.VITE_GEMINI_API_KEY
          if (!apiKey) {
            console.error('[OnboardingEngine] ❌ VITE_GEMINI_API_KEY 未设置')
          } else {
            geminiLiveRef.current = new GeminiLiveService(apiKey, {
              model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
              voiceName: 'Achird'
              // responseModalities 使用默认值: [Modality.AUDIO, Modality.TEXT]
            })
            geminiLiveRef.current.connect()
          }
        } catch (error) {
          console.error('[OnboardingEngine] ❌ Gemini Live 预连接失败:', error)
        }
      }

      // Stage 4 完成后跳转到角色主页(Onboarding 流程结束)
      if (currentStepNumber === 4) {
        handleRedirect()
        return
      }

      // 正常流程:继续下一个 Stage
      goToNextStep()
    } finally {
      // 300ms 后解锁(给状态更新时间)
      setTimeout(() => {
        setIsTransitioning(false)
      }, 300)
    }
  }

  // ============================================================
  // 【核心逻辑】跳转到目标角色页面
  // 产品需求:Onboarding 完成后引导用户进入角色主页
  // 技术实现:根据 flow_type 和 target_character_id 跳转
  // ============================================================
  const handleRedirect = () => {
    const targetCharacterId = effectiveConfig.target_character_id

    console.log('[OnboardingEngine] Redirecting to character:', targetCharacterId)

    if (effectiveConfig.flow_type === 'fixed_character' && targetCharacterId) {
      setTimeout(() => {
        navigate(`/character/${targetCharacterId}`)
      }, 500)
    } else {
      console.warn('[OnboardingEngine] No target character configured, staying on onboarding')
      // Fallback: 重新开始或显示完成消息
      // navigate('/characters')
    }
  }

  return (
    <MobileFrame>
      <div className="onboarding-engine">
        {/* 全局背景音乐(循环播放,贯穿所有 Stage) */}
        {effectiveConfig?.global_styles?.background_music_url && (
          <audio
            id="global-background-music"
            src={effectiveConfig.global_styles.background_music_url}
            loop
            style={{ display: 'none' }}
          />
        )}

        {/* Stage 进度指示器(左下角显示当前进度) */}
        <div className="step-indicator">
          <div className="step-number">Stage {currentStepNumber}/4</div>
          <div className="step-name">{stageConfigKey}</div>
        </div>

        <StageComponent
          config={stageConfig || {}}
          globalStyles={effectiveConfig?.global_styles}
          onComplete={handleStageComplete}
          currentStep={currentStepNumber}
          userData={userData}
          geminiLive={currentStepNumber === 2 ? geminiLiveRef.current : undefined}
        />
      </div>
    </MobileFrame>
  )
}

export default OnboardingEngine
