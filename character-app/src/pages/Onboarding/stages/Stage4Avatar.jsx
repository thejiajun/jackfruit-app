import { useState, useEffect, useRef } from 'react'
import '../../Onboarding/styles/onboarding.css'

/**
 * 【产品模块】第四阶段:活化身 - 角色"苏醒"与命名
 *
 * 产品目标:
 * 1. 营造"角色诞生"的仪式感 - 通过 3 段视频连续播放,制造情绪高潮
 * 2. 让用户感觉"创造了生命" - Revealing(苏醒) → 命名 → Lip-Sync(开口说话) → Transition(进入世界)
 * 3. 完成 Onboarding 流程 - 将用户引导至角色主页面
 *
 * 用户体验流程:
 * → LOADING 阶段:等待 Revealing 视频生成完成(后台生成中)
 * → REVEALING 阶段:播放角色"睁眼苏醒"视频(约 3-5 秒)
 * → NAMING 阶段:显示角色性格卡片,用户输入角色名字
 * → GENERATING 阶段:等待 Lip-Sync 视频生成(角色说出自我介绍)
 * → LIPSYNC 阶段:播放角色"开口说话"视频(约 10-15 秒)
 * → TRANSITION 阶段:播放传送门视频,进入角色世界
 *
 * 技术实现:
 * - 视频生成:FAL SeeDance API(后台在 Stage 3 触发)
 * - 状态机:6 个阶段顺序切换(loading → revealing → naming → generating → lipsync → transition)
 * - 防重复提交:使用 isSubmitting 锁,避免用户连续点击或视频重复触发
 */
const Stage4Avatar = ({ config, globalStyles, onComplete, currentStep, userData }) => {
  // === 核心状态机 ===
  const [phase, setPhase] = useState('loading')  // 阶段:'loading'(加载) | 'revealing'(苏醒) | 'naming'(命名) | 'generating'(生成) | 'lipsync'(说话) | 'transition'(传送)

  // === 视频资源 URLs ===
  const [revealingVideoUrl, setRevealingVideoUrl] = useState(null)    // Revealing 视频(角色睁眼)
  const [lipsyncVideoUrl, setLipsyncVideoUrl] = useState(null)        // Lip-Sync 视频(角色说话)
  const [transitionVideoUrl, setTransitionVideoUrl] = useState(null)  // Transition 视频(传送门)

  // === 角色数据 ===
  const [characterData, setCharacterData] = useState(null)  // 性格数据(从 Stage 3 传递)
  const [characterName, setCharacterName] = useState('')    // 用户输入的角色名字

  // === 防重复提交锁 ===
  const [isSubmitting, setIsSubmitting] = useState(false)  // 防止用户连续点击"CONFIRM NAME"或视频多次触发 onComplete

  useEffect(() => {
    console.log('[Stage4Avatar] Mounted', { userData })
    checkRevealingVideo()
  }, [])

  // ============================================================
  // 【生命周期】检查 Revealing 视频生成状态
  // 产品需求:Stage 3 触发视频生成后,Stage 4 需要轮询检查生成是否完成
  // 技术实现:开发环境直接使用 mock 视频,生产环境需要调用 API 查询生成状态
  // ============================================================
  const checkRevealingVideo = async () => {
    // TODO: 生产环境调用 API 查询视频生成状态
    // const status = await videoGenerationService.checkStatus(userData.generation_job_id)
    // if (status.completed) { setRevealingVideoUrl(status.video_url) }

    // 开发阶段:直接使用 mock 视频
    setTimeout(() => {
      setRevealingVideoUrl('/mock-videos/revealing.mp4')
      setCharacterData({
        personality_tags: ['Introvert', 'Creative', 'Night Owl'],
        personality_summary: 'A quiet soul seeking wisdom in the digital void'
      })
      setPhase('revealing')
    }, 1000)
  }

  // ============================================================
  // 【视频回调】Revealing 视频播放完成
  // 用户体验:角色"睁眼"后,进入命名阶段
  // ============================================================
  const handleRevealingEnded = () => {
    console.log('[Stage4Avatar] Revealing video ended')
    setPhase('naming')
  }

  // ============================================================
  // 【核心交互】用户确认角色名字
  // 产品需求:用户输入名字后,进入 Lip-Sync 视频生成流程
  // 技术实现:开发环境直接使用 mock 视频,生产环境需要触发真实生成
  // ============================================================
  const handleConfirmName = async () => {
    if (!characterName.trim()) return

    // 防止用户连续点击
    if (isSubmitting) {
      console.warn('[Stage4Avatar] ⚠️ Already submitting, ignoring duplicate click')
      return
    }

    setIsSubmitting(true)
    console.log('[Stage4Avatar] 🔒 Name confirmed:', characterName)

    // 进入"生成中"阶段,显示加载动画
    setPhase('generating')

    // TODO: 生产环境触发 Lip-Sync 视频生成
    // await videoGenerationService.generateLipsync(userData.intro_script, userData.starting_image_url)

    // 开发阶段:直接使用 mock 视频
    setTimeout(() => {
      setLipsyncVideoUrl('/mock-videos/lipsync.mp4')
      setTransitionVideoUrl('/mock-videos/transition.mp4')
      setPhase('lipsync')
    }, 2000)
  }

  // ============================================================
  // 【视频回调】Lip-Sync 视频播放完成
  // 用户体验:角色"说完话"后,进入传送门阶段
  // ============================================================
  const handleLipsyncEnded = () => {
    console.log('[Stage4Avatar] Lip-sync video ended')
    setPhase('transition')
  }

  // ============================================================
  // 【视频回调】Transition 视频播放完成 - Onboarding 流程结束
  // 产品需求:视频播放完成后,将用户重定向到角色主页面
  // 技术实现:调用 onComplete 回调,传递角色数据给父组件
  // ============================================================
  const handleTransitionEnded = () => {
    // 防止视频重复触发(某些浏览器可能触发多次 onEnded 事件)
    if (isSubmitting) {
      console.warn('[Stage4Avatar] ⚠️ Already submitted, ignoring duplicate event')
      return
    }

    setIsSubmitting(true)
    console.log('[Stage4Avatar] 🔒 Transition ended, redirecting...')

    // 调用父组件回调,完成 Onboarding
    onComplete({
      character_name: characterName,
      completed: true
    })
  }

  return (
    <div className="onboarding-step stage4-avatar">
      {/* Phase: Loading (等待 Revealing 视频) */}
      {phase === 'loading' && (
        <div className="loading-overlay">
          <div className="orb-placeholder" style={{
            width: '200px',
            height: '200px',
            margin: '2rem auto',
            background: 'radial-gradient(circle, rgba(0,255,65,0.4) 0%, transparent 70%)',
            borderRadius: '50%',
            animation: 'pulse 2s ease-in-out infinite'
          }} />
          <p className="loading-text">"Materializing your character..."</p>
          <div className="loading-bar" />
        </div>
      )}

      {/* Phase: Revealing 视频 */}
      {phase === 'revealing' && revealingVideoUrl && (
        <video
          src={revealingVideoUrl}
          autoPlay
          onEnded={handleRevealingEnded}
          className="fullscreen-video"
        />
      )}

      {/* Phase: 命名 */}
      {phase === 'naming' && (
        <div className="naming-section">
          <div className="character-card fade-in">
            <div className="personality-tags">
              {characterData?.personality_tags.map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
            <p className="character-intro">{characterData?.personality_summary}</p>
          </div>

          <div className="name-input-section">
            <p className="prompt-text">What do you want to call this character?</p>
            <input
              type="text"
              className="name-input terminal-input"
              placeholder="Enter name..."
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              autoFocus
            />
            <button
              className="confirm-btn terminal-btn"
              onClick={handleConfirmName}
              disabled={!characterName.trim() || isSubmitting}
              style={{
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1
              }}
            >
              {isSubmitting ? '[ PROCESSING... ]' : '[ ✓ CONFIRM NAME ]'}
            </button>
          </div>
        </div>
      )}

      {/* Phase: 生成中 (等待 Lip-Sync 视频) */}
      {phase === 'generating' && (
        <div className="generating-overlay">
          <div className="orb-placeholder" style={{
            width: '180px',
            height: '180px',
            margin: '2rem auto',
            background: 'radial-gradient(circle, rgba(0,255,65,0.6) 0%, transparent 70%)',
            borderRadius: '50%',
            animation: 'pulse 1.2s ease-in-out infinite'
          }} />
          <p className="generating-text">"Breathing life into {characterName}..."</p>
          <div className="loading-bar animated" />
        </div>
      )}

      {/* Phase: Lip-Sync 视频 */}
      {phase === 'lipsync' && lipsyncVideoUrl && (
        <video
          src={lipsyncVideoUrl}
          autoPlay
          onEnded={handleLipsyncEnded}
          className="fullscreen-video"
        />
      )}

      {/* Phase: Transition 视频 */}
      {phase === 'transition' && transitionVideoUrl && (
        <video
          src={transitionVideoUrl}
          autoPlay
          onEnded={handleTransitionEnded}
          className="fullscreen-video"
        />
      )}
    </div>
  )
}

export default Stage4Avatar
