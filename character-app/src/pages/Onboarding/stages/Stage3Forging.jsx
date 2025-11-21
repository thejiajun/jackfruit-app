import { useState, useEffect } from 'react'
import { analyzePersonalityFromPhotos, generateIntroScript } from '../../../services/geminiService'
import { uploadPhotos } from '../../../services/storageService'
import '../../Onboarding/styles/onboarding.css'

/**
 * 【产品模块】第三阶段:锻造与记忆碎片 - 用照片生成角色性格和自我介绍
 *
 * 产品目标:
 * 1. 收集用户的"记忆碎片"(照片) - 包装成"注入灵魂"而非"上传照片",增强仪式感
 * 2. AI 性格分析 - 基于多张照片,Gemini Vision 分析用户的性格、兴趣、生活方式
 * 3. 生成角色自我介绍 - Gemini 根据性格分析撰写一段角色的开场白
 * 4. 生成口型同步视频 - 角色"开口"说出自我介绍(未来功能,当前跳过)
 *
 * 用户体验流程:
 * → UPLOAD 阶段:看到 5 个上传槽位,Pika 引导"Feed me Memory Shards"
 * → 用户上传 1-5 张照片,每上传一张进度条增长(视觉反馈)
 * → 点击 DONE → ANALYZING 阶段:Pika 分析性格特质
 * → GENERATING 阶段:生成自我介绍脚本 + 后台生成视频
 * → COMPLETE 阶段:显示"SHOW ME"按钮,点击后上传照片并进入 Stage 4
 *
 * 技术实现:
 * - 照片分析:Gemini Vision API 批量分析多张照片
 * - 脚本生成:Gemini Chat API 根据性格数据生成文案
 * - 进度管理:45% → 50% → 70% → 85% → 100%,让用户感觉"正在发生什么"
 * - 防重复提交:使用 isSubmitting 锁
 */
const Stage3Forging = ({ config, globalStyles, onComplete, currentStep, userData }) => {
  // === 核心状态机 ===
  const [phase, setPhase] = useState('upload')  // 阶段:'upload'(上传照片) | 'analyzing'(分析中) | 'generating'(生成中) | 'complete'(完成)
  const [photos, setPhotos] = useState([])      // 用户上传的照片数组(base64 格式),最多 5 张

  // === UI 状态 ===
  const [progress, setProgress] = useState(45)                  // 进度条百分比(45% → 100%)
  const [statusText, setStatusText] = useState('CONSTRUCTING VESSEL')  // 状态文案(显示在进度条上)
  const [currentMessage, setCurrentMessage] = useState('')      // 当前操作提示文案

  // === AI 生成结果 ===
  const [personalityData, setPersonalityData] = useState(null)  // Gemini Vision 分析的性格数据
  const [introScript, setIntroScript] = useState('')            // Gemini 生成的自我介绍脚本

  // === 防重复提交锁 ===
  const [isSubmitting, setIsSubmitting] = useState(false)  // 防止用户连续点击"SHOW ME"按钮

  useEffect(() => {
  }, [])

  // ============================================================
  // 【交互 1】用户点击上传槽位,选择照片上传
  // 产品需求:让用户可以上传 1-5 张照片,每张照片显示在对应槽位
  // 技术实现:创建隐藏的 input[type=file],选择后读取为 base64
  // ============================================================
  const handleUpload = async (slotIndex) => {
    // 创建隐藏的文件选择器
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'  // 只接受图片文件

    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return

      // 使用 FileReader 将图片转换为 base64(方便预览和上传)
      const reader = new FileReader()
      reader.onload = (event) => {
        const newPhotos = [...photos]
        newPhotos[slotIndex] = event.target.result  // 保存 base64 数据
        setPhotos(newPhotos)

        // 每上传一张,进度条自动增长(视觉反馈)
      }
      reader.readAsDataURL(file)
    }

    input.click()  // 触发文件选择器
  }

  // ============================================================
  // 【交互 2】用户点击 DONE 按钮,开始 AI 分析和生成流程
  // 产品需求:分析用户性格 → 生成自我介绍 → 生成视频(未来)
  // 用户体验:进度条从 45% → 50% → 70% → 85% → 100%,让用户感觉"正在发生什么"
  // ============================================================
  const handleDoneUpload = async () => {

    // === 第 1 步:性格分析 ===
    setPhase('analyzing')
    setProgress(50)
    setStatusText('ANALYZING YOUR ESSENCE')  // 文案:"分析你的本质"
    setCurrentMessage('Analyzing personality from photos...')

    try {
      // 调用 Gemini Vision API 批量分析照片
      const photoDataUrls = photos.filter(Boolean)  // 过滤掉空槽位
      const personality = await analyzePersonalityFromPhotos(photoDataUrls)
      setPersonalityData(personality)

      // === 第 2 步:生成自我介绍脚本 ===
      setProgress(70)
      setStatusText('CRAFTING YOUR STORY')  // 文案:"编织你的故事"
      setCurrentMessage('Generating your introduction script...')

      // 调用 Gemini Chat API 根据性格生成开场白
      const characterName = userData.character_name || 'Unknown'
      const script = await generateIntroScript(personality, characterName)
      setIntroScript(script)

      // === 第 3 步:视频生成(未来功能,当前跳过) ===
      setPhase('generating')
      setProgress(85)
      setStatusText('FORGING YOUR DIGITAL SHELL')  // 文案:"锻造你的数字躯壳"
      setCurrentMessage('Creating your character...')

      // TODO: 调用 FAL SeeDance API 生成口型同步视频
      // 当前开发环境跳过,直接进入完成状态
      setTimeout(() => {
        setPhase('complete')
        setProgress(100)
        setStatusText('VESSEL COMPLETE')  // 文案:"躯壳完成"
      }, 2000)  // 模拟 2 秒生成时间

    } catch (error) {
      console.error('[Stage3Forging] ❌ 分析/生成失败:', error)

      // 【容错处理】失败时使用 fallback 数据,避免流程卡死
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

  // ============================================================
  // 【交互 3】用户点击"SHOW ME"按钮,上传照片并进入 Stage 4
  // 产品需求:将照片上传到云端,传递分析结果给下一阶段
  // 技术实现:上传到 Supabase Storage,传递 URLs 而非 base64
  // ============================================================
  const handleReveal = async () => {
    // 防止用户连续点击多次
    if (isSubmitting) {
      return
    }

    setIsSubmitting(true)

    try {
      // 上传所有照片到 Supabase Storage
      const photoDataUrls = photos.filter(Boolean)

      // 边界情况:如果用户没上传任何照片(可能直接跳过)
      if (photoDataUrls.length === 0) {
        onComplete({
          photo_urls: [],
          personality_analysis: personalityData,
          intro_script: introScript,
          revealing_video_url: '/mock-videos/revealing.mp4'  // 占位视频
        })
        return
      }

      const photoUrls = await uploadPhotos(photoDataUrls, 'onboarding-resources', 'stage3-photos')

      // 调用 onComplete 回调,传递数据给 Stage 4
      onComplete({
        photo_urls: photoUrls,                        // 云端 URLs(不是 base64)
        personality_analysis: personalityData,        // AI 分析的性格数据
        intro_script: introScript,                    // 生成的自我介绍
        revealing_video_url: '/mock-videos/revealing.mp4'  // 揭示视频(未来替换为真实生成的视频)
      })

      // 注意:成功后不解锁,防止用户在跳转过程中重复点击
    } catch (error) {
      console.error('[Stage3Forging] ❌ 上传照片失败:', error)
      alert('上传照片失败，请重试。')
      setIsSubmitting(false)  // 失败时解锁,允许用户重试
    }
  }

  return (
    <div className="onboarding-step stage3-forging">
      {/* 🔥 Pika 银色方格背景 */}
      <div className="background-layer pika-silver-grid">
        <div className="grid-overlay-pika" />
        <div className="noise-texture-pika" />
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
            disabled={isSubmitting}
            style={{
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1
            }}
          >
            {isSubmitting ? '[ UPLOADING... ]' : '[ 👁️ SHOW ME ]'}
          </button>
        )}
      </div>
    </div>
  )
}

export default Stage3Forging
