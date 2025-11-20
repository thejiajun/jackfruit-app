import { useState, useEffect, useRef } from 'react'
import '../../Onboarding/styles/onboarding.css'

/**
 * Stage 4: Living Avatar
 *
 * 1. 播放 Revealing 视频
 * 2. 显示 Character Card + 用户输入名字
 * 3. 播放 Lip-Sync 视频
 * 4. 播放 Transition 视频 → 重定向
 */
const Stage4Avatar = ({ config, globalStyles, onComplete, currentStep, userData }) => {
  const [phase, setPhase] = useState('loading') // loading | revealing | naming | generating | lipsync | transition
  const [revealingVideoUrl, setRevealingVideoUrl] = useState(null)
  const [lipsyncVideoUrl, setLipsyncVideoUrl] = useState(null)
  const [transitionVideoUrl, setTransitionVideoUrl] = useState(null)
  const [characterData, setCharacterData] = useState(null)
  const [characterName, setCharacterName] = useState('')

  useEffect(() => {
    console.log('[Stage4Avatar] Mounted', { userData })
    checkRevealingVideo()
  }, [])

  const checkRevealingVideo = async () => {
    // TODO: 检查视频生成状态
    // 开发阶段直接使用 mock 视频
    setTimeout(() => {
      setRevealingVideoUrl('/mock-videos/revealing.mp4')
      setCharacterData({
        personality_tags: ['Introvert', 'Creative', 'Night Owl'],
        personality_summary: 'A quiet soul seeking wisdom in the digital void'
      })
      setPhase('revealing')
    }, 1000)
  }

  const handleRevealingEnded = () => {
    console.log('[Stage4Avatar] Revealing video ended')
    setPhase('naming')
  }

  const handleConfirmName = async () => {
    if (!characterName.trim()) return

    console.log('[Stage4Avatar] Name confirmed:', characterName)

    // 检查 Lip-Sync 视频状态
    setPhase('generating')

    // TODO: 真实环境检查视频生成状态
    // 开发阶段直接使用 mock 视频
    setTimeout(() => {
      setLipsyncVideoUrl('/mock-videos/lipsync.mp4')
      setTransitionVideoUrl('/mock-videos/transition.mp4')
      setPhase('lipsync')
    }, 2000)
  }

  const handleLipsyncEnded = () => {
    console.log('[Stage4Avatar] Lip-sync video ended')
    setPhase('transition')
  }

  const handleTransitionEnded = () => {
    console.log('[Stage4Avatar] Transition ended, redirecting...')

    // TODO: 重定向到角色页面
    // window.location.href = `/character/${characterId}`

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
              disabled={!characterName.trim()}
            >
              [ ✓ CONFIRM NAME ]
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
