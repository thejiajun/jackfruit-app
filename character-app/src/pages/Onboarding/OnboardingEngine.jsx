import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOnboardingConfig } from './hooks/useOnboardingConfig'
import { useStepNavigation } from './hooks/useStepNavigation'
import { useUserData } from './hooks/useUserData'
import { MobileFrame } from '../../components/layout/MobileFrame'

// 导入所有 Stage 组件（新的 4-stage 架构）
import Stage1Boot from './stages/Stage1Boot'
import Stage2Mirror from './stages/Stage2Mirror'
import Stage3Forging from './stages/Stage3Forging'
import Stage4Avatar from './stages/Stage4Avatar'

import './styles/onboarding.css'

/**
 * Stage 组件映射（4-stage 新架构）
 * Stage 1: System Boot - 故障艺术 + Entity 聚合 + 权限请求
 * Stage 2: Mirror Guide - 摄像头拍照 + Gemini Vision 分析 + Gemini Live 对话 + 模板选择
 * Stage 3: Forging - 上传照片 + 性格分析 + Script 生成 + 视频生成触发
 * Stage 4: Living Avatar - Revealing 视频 + 命名 + Lip-Sync 视频 + Transition
 */
const STAGE_COMPONENTS = {
  1: Stage1Boot,
  2: Stage2Mirror,
  3: Stage3Forging,
  4: Stage4Avatar
}

/**
 * Stage 配置键名映射（前端 stage → 数据库字段）
 * TODO: 需要数据库迁移后更新字段名为 stage_1_boot, stage_2_mirror 等
 * 目前暂时使用旧字段名映射，保证向后兼容
 */
const STAGE_CONFIG_KEYS = {
  1: 'step_1_splash',           // 临时映射到旧字段（boot）
  2: 'step_3_identity_input',   // 临时映射到旧字段（mirror）
  3: 'step_5_creation',         // 临时映射到旧字段（forging）
  4: 'step_7_entry'             // 临时映射到旧字段（avatar）
}

export const OnboardingEngine = () => {
  const navigate = useNavigate()
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)

  // 加载配置
  const { config, loading: configLoading, error: configError, fromCache } = useOnboardingConfig()

  // 使用默认配置（如果没有从数据库加载）
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

  // 状态机（现在是 4 个 Stage）
  const { currentStepNumber, goToNextStep, goToStep } = useStepNavigation(4)

  // 用户数据管理
  const { sessionId, userData, updateUserData, initSession } = useUserData()

  // Loading 步骤动画（模拟加载进度）
  useEffect(() => {
    if (!configLoading || fromCache) {
      setLoadingStep(0)
      return
    }

    // 多段式加载提示
    const timers = [
      setTimeout(() => setLoadingStep(1), 300),   // "Loading character profile..."
      setTimeout(() => setLoadingStep(2), 800),   // "Preparing experience..."
      setTimeout(() => setLoadingStep(3), 1300)   // "Almost ready..."
    ]

    return () => timers.forEach(timer => clearTimeout(timer))
  }, [configLoading, fromCache])

  // 初始化会话
  useEffect(() => {
    if (effectiveConfig && !sessionId) {
      initSession(effectiveConfig.config_id)
    }
  }, [effectiveConfig?.config_id, sessionId])

  // 自动播放背景音乐（静音方式）并在用户交互后取消静音
  useEffect(() => {
    if (config?.global_styles?.background_music_url && !musicPlaying) {
      const audio = document.getElementById('global-background-music')
      if (!audio) return

      // 尝试静音自动播放
      audio.muted = true
      audio.play()
        .then(() => {
          console.log('[OnboardingEngine] Background music started (muted)')

          // 监听用户的第一次交互，然后取消静音
          const unmute = () => {
            audio.muted = false
            setMusicPlaying(true)
            console.log('[OnboardingEngine] Background music unmuted')
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

          // 如果静音播放也失败，等待用户交互
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

  // Loading 状态 - 只在配置加载且没有缓存时显示
  // 如果有缓存或配置已加载，直接进入 Stage 1
  if (configLoading && !fromCache && !config) {
    // 简化 loading，不显示复杂动画，让 Stage 1 的启动序列作为 loading
    // 这里只是一个极短的占位符
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

  // Error 状态（只在严重错误时显示，配置缺失不算）
  if (configError && !config) {
    console.warn('[OnboardingEngine] Config error, using default config:', configError)
  }

  // 获取当前 Stage 配置
  const stageConfigKey = STAGE_CONFIG_KEYS[currentStepNumber]
  const stageConfig = effectiveConfig[stageConfigKey]

  if (!stageConfig) {
    console.warn(`[OnboardingEngine] Missing config for stage ${currentStepNumber}, using minimal config`)
    // 不显示错误，使用最小配置继续
  }

  // 获取对应的 Stage 组件
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

  // 处理 Stage 完成
  const handleStageComplete = async (stageData) => {
    console.log(`[OnboardingEngine] Stage ${currentStepNumber} completed:`, stageData)

    // 更新用户数据
    if (stageData && Object.keys(stageData).length > 0) {
      updateUserData(stageData)
    }

    // Stage 4 完成后跳转到角色主页
    if (currentStepNumber === 4) {
      handleRedirect()
      return
    }

    // 正常流程：继续下一个 Stage
    goToNextStep()
  }

  // 跳转到目标角色
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
        {/* 全局背景音乐（循环播放，贯穿所有步骤） */}
        {effectiveConfig?.global_styles?.background_music_url && (
          <audio
            id="global-background-music"
            src={effectiveConfig.global_styles.background_music_url}
            loop
            style={{ display: 'none' }}
          />
        )}

        {/* Stage 指示器（左下角） */}
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
        />
      </div>
    </MobileFrame>
  )
}

export default OnboardingEngine
