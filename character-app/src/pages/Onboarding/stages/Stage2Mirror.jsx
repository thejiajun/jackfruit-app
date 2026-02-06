import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NovaOrbCanvas } from '../../../components/NovaOrbCanvas'
import { analyzePhotoWithVision } from '../../../services/geminiService'
import { generateWithRetry } from '../../../services/imageGenerationService'
import { uploadPhoto } from '../../../services/storageService'
import '../../Onboarding/styles/onboarding.css'
import '../../Onboarding/styles/stage2-realtime.css'

/**
 * Stage2Mirror - Realtime Mini Refactor (2025-01)
 *
 * 核心变更:
 * - 替换 GeminiLive 为 OpenAIRealtimeService
 * - 交互模式: 实时语音 (VAD) + 持续视觉理解 (每 3 秒截帧)
 * - UI: 增加静音控制、摄像头开关
 */

const STATES = {
  CONNECTING: 'connecting',       // 等待连接
  INTERACTING: 'interacting',     // 实时对话中 (VAD + Vision)
  READY_TO_CAPTURE: 'ready',      // AI 提示拍照 (保留原有逻辑)
  REVIEWING: 'reviewing',         // 查看照片
  GENERATING: 'generating',       // 生成 Identity
  SHOWING_RESULT: 'showing',      // 展示结果
  COMPLETED: 'completed'          // 完成
}

const Stage2Mirror = ({ config, onComplete, realtimeService }) => {
  // ===== 核心状态 =====
  const [state, setState] = useState(STATES.CONNECTING)
  const [messages, setMessages] = useState([])

  // ===== Realtime 状态 =====
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraActive, setIsCameraActive] = useState(true)

  // ===== 业务数据 =====
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const [photoAnalysis, setPhotoAnalysis] = useState(null)
  const [generatedImage, setGeneratedImage] = useState(null)
  const [backViewImage, setBackViewImage] = useState(null) // 新增: 背影照
  const [showGeneratedImage, setShowGeneratedImage] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ===== 输入状态 =====
  const [textInput, setTextInput] = useState('')

  // ===== Refs =====
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const videoIntervalRef = useRef(null)
  const messagesEndRef = useRef(null)

  // ============================================================
  // 🔌 Realtime Service 初始化与连接
  // ============================================================
  useEffect(() => {
    if (!realtimeService) {
      console.error('[Stage2Mirror] ❌ Realtime Service 未传入')
      return
    }

    const initService = async () => {
      // 注册回调
      realtimeService.onText = (text, role) => {
        setMessages(prev => [...prev, { role: role === 'assistant' ? 'ai' : 'user', text }])

        // 简单的意图检测 (保留原有逻辑: AI 提示拍照)
        if (role === 'assistant') {
          const lower = text.toLowerCase()
          if ((lower.includes('take a photo') || lower.includes('capture')) && state === STATES.INTERACTING) {
            setState(STATES.READY_TO_CAPTURE)
          }
        }
      }

      realtimeService.onConnected = () => {
        setIsConnected(true)
        setState(STATES.INTERACTING)
        // 连接成功后自动开启 VAD 录音
        realtimeService.startRecording().catch(console.error)
      }

      realtimeService.onClosed = () => {
        setIsConnected(false)
        setState(STATES.CONNECTING)
      }

      // 如果尚未连接，发起连接
      if (!realtimeService.connected) {
        try {
          await realtimeService.connect()
        } catch (err) {
          console.error('[Stage2Mirror] 连接失败:', err)
        }
      } else {
        setIsConnected(true)
        setState(STATES.INTERACTING)
        // 确保录音开启
        realtimeService.startRecording().catch(console.error)
      }
    }

    initService()

    return () => {
      // 组件卸载时不一定断开连接(可能由 Engine 管理)，但应停止 UI 相关的定时器
      stopVideoStreaming()
    }
  }, [realtimeService])

  // 自动滚动消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ============================================================
  // 🎥 摄像头与持续视觉理解
  // ============================================================
  useEffect(() => {
    if (isCameraActive) {
      startCamera()
      startVideoStreaming()
    } else {
      stopCamera()
      stopVideoStreaming()
    }
    return () => {
      stopCamera()
      stopVideoStreaming()
    }
  }, [isCameraActive, isConnected]) // 依赖连接状态，连接后才开始推流

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: false // 音频由 RealtimeService 独立管理
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
      }
    } catch (err) {
      console.error('[Stage2Mirror] 摄像头访问失败:', err)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  // 每 3 秒截帧发送给 AI
  const startVideoStreaming = () => {
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current)

    videoIntervalRef.current = setInterval(async () => {
      if (!realtimeService || !isConnected || !videoRef.current || !canvasRef.current || !isCameraActive) return

      // 仅在交互状态下发送视觉帧
      if (state !== STATES.INTERACTING && state !== STATES.READY_TO_CAPTURE) return

      try {
        const canvas = canvasRef.current
        const video = videoRef.current
        const ctx = canvas.getContext('2d')

        canvas.width = video.videoWidth / 2 // 降低分辨率以节省带宽
        canvas.height = video.videoHeight / 2
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        const base64 = canvas.toDataURL('image/jpeg', 0.6) // 压缩质量 0.6

        // 发送给 Realtime Service
        await realtimeService.sendVideoFrame(base64)
      } catch (err) {
        console.error('[Stage2Mirror] 截帧失败:', err)
      }
    }, 3000) // SPEC: 2-3 秒
  }

  const stopVideoStreaming = () => {
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current)
      videoIntervalRef.current = null
    }
  }

  // ============================================================
  // 🎤 音频控制
  // ============================================================
  const toggleMute = () => {
    if (!realtimeService) return

    if (isMuted) {
      realtimeService.startRecording()
      setIsMuted(false)
    } else {
      realtimeService.stopRecording() // 停止录音即静音
      setIsMuted(true)
    }
  }

  // ============================================================
  // 💬 文本输入
  // ============================================================
  const handleSendText = async () => {
    if (!textInput.trim() || !realtimeService) return

    const text = textInput.trim()
    setTextInput('')
    setMessages(prev => [...prev, { role: 'user', text }])

    try {
      await realtimeService.sendText(text)
    } catch (err) {
      console.error('[Stage2Mirror] 发送文本失败:', err)
    }
  }

  // ============================================================
  // 📸 拍照与生成流程 (保留原有业务逻辑)
  // ============================================================
  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const video = videoRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    const photo = canvas.toDataURL('image/jpeg', 0.9)
    setCapturedPhoto(photo)
    setState(STATES.REVIEWING)
  }

  const handleRetake = () => {
    setCapturedPhoto(null)
    setState(STATES.INTERACTING) // 回到交互状态
  }

  const handleConfirmPhoto = async () => {
    setState(STATES.GENERATING)

    try {
      // 1. 分析照片
      const analysis = await analyzePhotoWithVision(capturedPhoto)
      setPhotoAnalysis(analysis)

      // 2. 生成 Identity
      triggerGeneration(analysis)
    } catch (err) {
      console.error('分析失败:', err)
      alert('分析失败，请重试')
      setState(STATES.REVIEWING)
    }
  }

  const triggerGeneration = async (analysis) => {
    setGenerationProgress(0)
    const progressInterval = setInterval(() => {
      setGenerationProgress(p => p >= 90 ? 90 : p + 5)
    }, 500)

    try {
      // 生成 Identity
      const result = await generateWithRetry(capturedPhoto, analysis, 3)
      setGeneratedImage(result.imageUrl)

      // 生成背影照 (Step 216 新增需求)
      const { generateBackViewImage } = await import('../../../services/imageGenerationService')
      const backViewUrl = await generateBackViewImage(result.imageUrl)
      setBackViewImage(backViewUrl)

      clearInterval(progressInterval)
      setGenerationProgress(100)

      // 通知用户
      if (realtimeService) {
        realtimeService.sendText("I've forged your digital identity. Take a look.")
      }
    } catch (err) {
      console.error('生成失败:', err)
      alert('生成失败')
      setGenerationProgress(0)
      setState(STATES.REVIEWING)
    } finally {
      clearInterval(progressInterval)
    }
  }

  const handleViewResult = () => {
    setShowGeneratedImage(true)
    setState(STATES.SHOWING_RESULT)
  }

  const handleConfirmIdentity = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      const photoUrl = await uploadPhoto(capturedPhoto, 'confirmed-photo')

      onComplete({
        photo: photoUrl,
        generatedImage: generatedImage,
        backViewImage: backViewImage,
        analysis: photoAnalysis,
        conversationHistory: messages
      })
    } catch (err) {
      console.error('提交失败:', err)
      setIsSubmitting(false)
    }
  }

  // ============================================================
  // 🎨 UI Render
  // ============================================================
  return (
    <div className="stage2-mirror">
      <div className="mirror-container">
        <div className="mirror-frame">
          {/* Top Bar */}
          <div className="mirror-top-bar">
            <div className="mirror-title-section">
              <div className="mirror-title">THE MIRROR</div>
              <div className="mirror-status">
                <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
                <span className="status-text">{isConnected ? 'LIVE' : 'CONNECTING'}</span>
              </div>
            </div>

            {/* Controls: Mute & Camera */}
            <div className="mirror-controls-top">
              <button onClick={toggleMute} className={`icon-btn ${isMuted ? 'active' : ''}`}>
                {isMuted ? '🔇' : '🎤'}
              </button>
              <button onClick={() => setIsCameraActive(!isCameraActive)} className={`icon-btn ${!isCameraActive ? 'active' : ''}`}>
                {isCameraActive ? '📷' : '🚫'}
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="mirror-content">
            {/* Video Feed */}
            {!showGeneratedImage && state !== STATES.REVIEWING && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="mirror-video"
                style={{ opacity: isCameraActive ? 1 : 0 }}
              />
            )}

            {/* Captured / Generated Images */}
            {state === STATES.REVIEWING && capturedPhoto && (
              <img src={capturedPhoto} className="mirror-image" alt="Captured" />
            )}
            {showGeneratedImage && generatedImage && (
              <img src={generatedImage} className="mirror-image" alt="Generated" />
            )}

            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>

          {/* Dialogue Overlay */}
          <div className="mirror-dialogue-overlay">
            <div className="dialogue-messages" style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {messages.map((msg, idx) => (
                <div key={idx} className={`message-bubble ${msg.role}`}>
                  <span className="role-icon">{msg.role === 'ai' ? '🤖' : '👤'}</span>
                  <span className="text">{msg.text}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="mirror-controls-outer">
        <div className="controls-orb-background">
          <NovaOrbCanvas mode={state === STATES.GENERATING ? "PROCESSING" : "IDLE"} />
        </div>

        <AnimatePresence mode="wait">
          {/* 1. 交互模式: 文本输入 + 拍照按钮 */}
          {(state === STATES.INTERACTING || state === STATES.READY_TO_CAPTURE) && (
            <motion.div
              key="interaction-controls"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="interaction-controls"
            >
              <div className="input-bar">
                <input
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleSendText()}
                  placeholder="Type to chat..."
                />
                <button onClick={handleSendText}>→</button>
              </div>

              <button className="capture-btn-large" onClick={handleCapture}>
                📸
              </button>
            </motion.div>
          )}

          {/* 2. 审阅模式 */}
          {state === STATES.REVIEWING && (
            <motion.div key="review-controls" className="review-controls">
              <button onClick={handleRetake}>Retake</button>
              <button onClick={handleConfirmPhoto} className="primary">Confirm</button>
            </motion.div>
          )}

          {/* 3. 生成中 */}
          {state === STATES.GENERATING && (
            <motion.div key="generating" className="generating-status">
              <div className="progress-bar">
                <div className="fill" style={{ width: `${generationProgress}%` }} />
              </div>
              <p>Forging Identity... {generationProgress}%</p>
              {generatedImage && (
                <button onClick={handleViewResult} className="view-result-btn">
                  View Result
                </button>
              )}
            </motion.div>
          )}

          {/* 4. 结果展示 */}
          {state === STATES.SHOWING_RESULT && (
            <motion.div key="result-controls" className="result-controls">
              <button onClick={() => setShowGeneratedImage(!showGeneratedImage)}>
                {showGeneratedImage ? 'Show Camera' : 'Show Identity'}
              </button>
              <button onClick={handleConfirmIdentity} className="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Finalizing...' : 'Accept Identity'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default Stage2Mirror
