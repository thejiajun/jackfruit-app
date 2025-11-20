import { useState, useEffect } from 'react'
import { analyzePersonalityFromPhotos, generateIntroScript } from '../../../services/geminiService'
import '../../Onboarding/styles/onboarding.css'

/**
 * Stage 3: Forging & Memory Shards
 *
 * 1. 用户上传 1-N 张照片
 * 2. Gemini Vision 性格分析
 * 3. Gemini Chat 生成自我介绍 Script
 * 4. 后台生成 Lip-Sync + Transition 视频
 */
const Stage3Forging = ({ config, globalStyles, onComplete, currentStep, userData }) => {
  const [phase, setPhase] = useState('upload') // upload | analyzing | generating | complete
  const [photos, setPhotos] = useState([])
  const [progress, setProgress] = useState(45)
  const [statusText, setStatusText] = useState('CONSTRUCTING VESSEL')
  const [currentMessage, setCurrentMessage] = useState('')
  const [personalityData, setPersonalityData] = useState(null)
  const [introScript, setIntroScript] = useState('')

  useEffect(() => {
    console.log('[Stage3Forging] Mounted', { phase, userData })
  }, [])

  const handleUpload = async (slotIndex) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'

    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (event) => {
        const newPhotos = [...photos]
        newPhotos[slotIndex] = event.target.result
        setPhotos(newPhotos)

        console.log('[Stage3Forging] Photo uploaded to slot', slotIndex)
      }
      reader.readAsDataURL(file)
    }

    input.click()
  }

  const handleDoneUpload = async () => {
    console.log('[Stage3Forging] Photos uploaded, starting analysis...')
    setPhase('analyzing')
    setProgress(50)
    setStatusText('ANALYZING YOUR ESSENCE')
    setCurrentMessage('Analyzing personality from photos...')

    try {
      // 调用 Gemini Vision 分析所有照片
      const photoDataUrls = photos.filter(Boolean) // 过滤掉空位
      const personality = await analyzePersonalityFromPhotos(photoDataUrls)
      setPersonalityData(personality)
      console.log('[Stage3Forging] Personality analysis complete:', personality)

      setProgress(70)
      setStatusText('CRAFTING YOUR STORY')
      setCurrentMessage('Generating your introduction script...')

      // 调用 Gemini Chat 生成 Script
      const characterName = userData.character_name || 'Unknown'
      const script = await generateIntroScript(personality, characterName)
      setIntroScript(script)
      console.log('[Stage3Forging] Intro script generated:', script)

      setPhase('generating')
      setProgress(85)
      setStatusText('FORGING YOUR DIGITAL SHELL')
      setCurrentMessage('Creating your character...')

      // TODO: 触发视频生成（开发环境跳过）
      setTimeout(() => {
        setPhase('complete')
        setProgress(100)
        setStatusText('VESSEL COMPLETE')
      }, 2000)
    } catch (error) {
      console.error('[Stage3Forging] Analysis/generation failed:', error)

      // 失败时使用 fallback
      setPersonalityData({
        personality_tags: ['Creative', 'Thoughtful', 'Tech-savvy'],
        personality_summary: 'A mysterious soul navigating the digital realm',
        interests: ['Technology', 'Art', 'Philosophy'],
        lifestyle: 'Digital nomad'
      })
      setIntroScript('I am a wanderer in the digital void, seeking connections beyond the screen.')

      setPhase('complete')
      setProgress(100)
      setStatusText('VESSEL COMPLETE')
    }
  }

  const handleReveal = () => {
    console.log('[Stage3Forging] Revealing character...')

    onComplete({
      photos: photos.filter(Boolean),
      personality_analysis: personalityData,
      intro_script: introScript,
      revealing_video_url: '/mock-videos/revealing.mp4'
    })
  }

  return (
    <div className="onboarding-step stage3-forging">
      {/* 背景层：粒子动画 */}
      <div className="background-layer">
        <div className="particle-animation">
          {/* TODO: 添加粒子动画 canvas */}
        </div>
      </div>

      {/* 进度条 */}
      <div className="status-bar">
        <span className="status-text">
          STATUS: ⚡️ {statusText} ({progress}%)
        </span>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 内容层 */}
      <div className="content-layer">
        {/* Phase: 上传照片 */}
        {phase === 'upload' && (
          <div className="upload-section">
            <div className="entity-speech">
              <p>"While I weave your digital shell..."</p>
              <p>"Give it a soul."</p>
              <p>"Feed me Memory Shards to complete the mind."</p>
            </div>

            <div className="upload-slots">
              {[0, 1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className={`upload-slot ${photos[i] ? 'filled' : ''}`}
                  onClick={() => !photos[i] && handleUpload(i)}
                >
                  {photos[i] ? (
                    <>
                      <img src={photos[i]} alt={`Memory ${i + 1}`} />
                      <div className="absorb-animation" />
                    </>
                  ) : (
                    <span className="upload-prompt">[ ➕ Upload Photo ]</span>
                  )}
                </div>
              ))}
            </div>

            <button
              className="done-btn terminal-btn"
              onClick={handleDoneUpload}
              disabled={photos.filter(Boolean).length === 0}
            >
              [ ✓ DONE ]
            </button>
          </div>
        )}

        {/* Phase: 分析/生成中 */}
        {(phase === 'analyzing' || phase === 'generating') && (
          <div className="generating-section">
            {/* TODO: 集成 NovaOrbCanvas mode="PROCESSING" */}
            <div className="orb-placeholder" style={{
              width: '150px',
              height: '150px',
              margin: '2rem auto',
              background: 'radial-gradient(circle, rgba(0,255,65,0.5) 0%, transparent 70%)',
              borderRadius: '50%',
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />

            <p className="generation-message">{currentMessage}</p>
          </div>
        )}

        {/* Phase: 完成 */}
        {phase === 'complete' && (
          <button
            className="reveal-btn terminal-btn eye-animation"
            onClick={handleReveal}
          >
            [ 👁️ SHOW ME ]
          </button>
        )}
      </div>
    </div>
  )
}

export default Stage3Forging
