import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NovaOrbCanvas } from '../../../components/NovaOrbCanvas'
import { analyzePhotoWithVision } from '../../../services/geminiService'
import { generateWithRetry } from '../../../services/imageGenerationService'
import { uploadPhoto } from '../../../services/storageService'
import '../../Onboarding/styles/onboarding.css'

/**
 * Stage2Mirror - 简化版 (2025-01 重构)
 *
 * 核心需求：
 * 1. 进入时立即开启摄像头 + 播放欢迎语音
 * 2. 用户按住按钮说话（Push-to-Talk）
 * 3. AI 在 2-3 轮对话后提示拍照
 * 4. 拍照 → 生成数字身份 → 确认完成
 *
 * 状态流程：
 * CONNECTING → GREETING → TALKING → READY_TO_CAPTURE
 * → REVIEWING → GENERATING → SHOWING_RESULT → COMPLETED
 */

const STATES = {
  CONNECTING: 'connecting',       // 等待 Gemini Live 连接
  GREETING: 'greeting',           // 播放欢迎语音
  TALKING: 'talking',             // 可以按住说话
  READY_TO_CAPTURE: 'ready',      // AI 提示拍照，显示拍照按钮
  REVIEWING: 'reviewing',         // 查看照片，确认/重拍
  GENERATING: 'generating',       // 后台生成（对话继续）
  SHOWING_RESULT: 'showing',      // 查看生成的图像
  COMPLETED: 'completed'          // 确认身份，准备进入下一阶段
}

const Stage2Mirror = ({ config, onComplete, geminiLive }) => {
  // ===== 核心状态 =====
  const [state, setState] = useState(STATES.CONNECTING)

  // ===== UI 数据 =====
  const [messages, setMessages] = useState([])
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const [photoAnalysis, setPhotoAnalysis] = useState(null)
  const [generatedImage, setGeneratedImage] = useState(null)
  const [showGeneratedImage, setShowGeneratedImage] = useState(false)

  // ===== 交互状态 =====
  const [isRecording, setIsRecording] = useState(false)
  const [geminiConnected, setGeminiConnected] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ===== Refs =====
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const videoStreamIntervalRef = useRef(null)

  // ============================================================
  // 📌 初始化：检查 Gemini Live 连接状态
  // ============================================================
  useEffect(() => {
    if (!geminiLive) {
      console.error('[Stage2Mirror] ❌ Gemini Live 实例未传入')
      alert('Gemini Live 未初始化，请刷新页面')
      return
    }

    // 检查连接状态
    if (geminiLive.isConnected && geminiLive.isConnected()) {
      setGeminiConnected(true)
      setState(STATES.GREETING)
    } else {
      // 监听连接事件
      const checkConnection = setInterval(() => {
        if (geminiLive.isConnected && geminiLive.isConnected()) {
          clearInterval(checkConnection)
          setGeminiConnected(true)
          setState(STATES.GREETING)
        }
      }, 500)

      return () => clearInterval(checkConnection)
    }
  }, [geminiLive])

  // ============================================================
  // 📌 GREETING 阶段：开摄像头 + 播放欢迎语音
  // ============================================================
  useEffect(() => {
    if (state !== STATES.GREETING) return

    const runGreeting = async () => {
      // 1. 开启摄像头
      await startCamera()

      // 2. 开始视频流输入
      startVideoStreaming()

      // 3. 播放欢迎语音
      const greetingText = "I am your guide. Show me your form."
      setMessages([{ role: 'ai', text: greetingText }])

      if (geminiLive && geminiLive.sendText) {
        await geminiLive.sendText(greetingText)
      }

      // 4. 等待语音播放完成（约 3 秒），然后进入 TALKING
      setTimeout(() => {
        setState(STATES.TALKING)
      }, 3000)
    }

    runGreeting()

    // Cleanup
    return () => {
      stopVideoStreaming()
    }
  }, [state, geminiLive])

  // ============================================================
  // 📌 监听 Gemini Live 消息
  // ============================================================
  useEffect(() => {
    if (!geminiLive) return

    const handleMessage = (message) => {
      const parts = message.serverContent?.modelTurn?.parts || []

      for (const part of parts) {
        // 处理文本消息
        if (part.text) {
          setMessages(prev => [...prev, { role: 'ai', text: part.text }])

          // 检测 AI 是否提示拍照
          const lowerText = part.text.toLowerCase()
          if (
            (lowerText.includes('take a photo') ||
             lowerText.includes('show me a picture') ||
             lowerText.includes('capture') ||
             lowerText.includes('拍照')) &&
            state === STATES.TALKING
          ) {
            setState(STATES.READY_TO_CAPTURE)
          }
        }
      }
    }

    // 注册回调
    if (geminiLive.onMessage) {
      geminiLive.onMessage(handleMessage)
    }

    return () => {
      // 清理回调
      if (geminiLive.offMessage) {
        geminiLive.offMessage(handleMessage)
      }
    }
  }, [geminiLive, state])

  // ============================================================
  // 📌 Cleanup：组件卸载时清理资源
  // ============================================================
  useEffect(() => {
    return () => {
      stopCamera()
      stopVideoStreaming()
    }
  }, [])

  // ============================================================
  // 🎥 摄像头管理
  // ============================================================
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
      }
    } catch (error) {
      console.error('[Stage2Mirror] ❌ 摄像头错误:', error)
      alert('无法访问摄像头，请检查权限设置')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  // ============================================================
  // 🎞️ 视频流输入（每 2 秒发送一帧给 Gemini）
  // ============================================================
  const startVideoStreaming = () => {
    if (videoStreamIntervalRef.current) return // 防止重复启动


    videoStreamIntervalRef.current = setInterval(async () => {
      if (!geminiLive || !geminiConnected || !videoRef.current || !canvasRef.current) return

      try {
        // 捕获当前帧
        const canvas = canvasRef.current
        const video = videoRef.current
        const ctx = canvas.getContext('2d')

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // 转为 base64
        const frameData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]

        // 发送给 Gemini Live
        if (geminiLive.sendFrame) {
          await geminiLive.sendFrame(frameData)
        }
      } catch (error) {
        console.error('[Stage2Mirror] ❌ 视频帧发送失败:', error)
      }
    }, 2000)
  }

  const stopVideoStreaming = () => {
    if (videoStreamIntervalRef.current) {
      clearInterval(videoStreamIntervalRef.current)
      videoStreamIntervalRef.current = null
    }
  }

  // ============================================================
  // 🎤 Push-to-Talk：按住说话
  // ============================================================
  const handleStartRecording = () => {
    setIsRecording(true)

    if (geminiLive && geminiLive.startRecording) {
      geminiLive.startRecording()
    }
  }

  const handleStopRecording = () => {
    setIsRecording(false)

    if (geminiLive && geminiLive.stopRecording) {
      geminiLive.stopRecording()
    }

    // 添加用户消息占位符（实际文本由 Gemini 转录后返回）
    setMessages(prev => [...prev, { role: 'user', text: '[语音输入]' }])
  }

  // ============================================================
  // 📸 拍照流程
  // ============================================================
  const handleCapture = () => {
    console.log('[Stage2Mirror] 📸 用户点击拍照')

    const frame = captureCurrentFrame()
    if (!frame) {
      console.error('[Stage2Mirror] ❌ 捕获失败')
      return
    }

    setCapturedPhoto(frame)
    setState(STATES.REVIEWING)
  }

  const captureCurrentFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null

    const canvas = canvasRef.current
    const video = videoRef.current
    const ctx = canvas.getContext('2d')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/jpeg', 0.9)
  }

  const handleRetake = () => {
    console.log('[Stage2Mirror] 🔄 重拍')
    setCapturedPhoto(null)
    setState(STATES.READY_TO_CAPTURE)
  }

  const handleConfirmPhoto = async () => {
    console.log('[Stage2Mirror] ✅ 确认照片，开始分析')

    try {
      // 分析照片
      const analysis = await analyzePhotoWithVision(capturedPhoto)
      setPhotoAnalysis(analysis)


      // 切换到 GENERATING 状态
      setState(STATES.GENERATING)

      // 后台生成图像
      triggerBackgroundGeneration(analysis)
    } catch (error) {
      console.error('[Stage2Mirror] ❌ 照片分析失败:', error)
      alert('照片分析失败，请重试')
    }
  }

  // ============================================================
  // 🎨 图像生成
  // ============================================================
  const triggerBackgroundGeneration = async (analysis) => {

    try {
      const result = await generateWithRetry(capturedPhoto, analysis, 3)

      setGeneratedImage(result.imageUrl)

      // 通知用户
      notifyGenerationComplete()
    } catch (error) {
      console.error('[Stage2Mirror] ❌ 生成失败:', error)
      alert('图像生成失败，请重试')
    }
  }

  const notifyGenerationComplete = async () => {

    const announcement = "Your digital form is ready."
    setMessages(prev => [...prev, { role: 'ai', text: announcement }])

    if (geminiLive && geminiLive.sendText) {
      await geminiLive.sendText(announcement)
    }
  }

  const handleViewResult = () => {
    setShowGeneratedImage(true)
    setState(STATES.SHOWING_RESULT)
  }

  const handleToggleView = () => {
    setShowGeneratedImage(!showGeneratedImage)
  }

  const handleConfirmIdentity = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)

    console.log('[Stage2Mirror] ✅ 确认身份，准备进入下一阶段')

    try {
      // 上传照片和图像到 Supabase
      const photoUrl = await uploadPhoto(capturedPhoto, 'confirmed-photo')
      const imageUrl = generatedImage // 已经是 URL 了

      // 传递数据给下一阶段
      onComplete({
        photo: photoUrl,
        generatedImage: imageUrl,
        analysis: photoAnalysis,
        conversationHistory: messages
      })
    } catch (error) {
      console.error('[Stage2Mirror] ❌ 提交失败:', error)
      alert('提交失败，请重试')
      setIsSubmitting(false)
    }
  }

  // ============================================================
  // 🎨 UI 渲染
  // ============================================================
  return (
    <div className="stage2-container">
      {/* 背景粒子球 */}
      <div className="nova-orb-background">
        <NovaOrbCanvas
          mode="IDLE"
          particleCount={260}
        />
      </div>

      {/* 主内容区域 */}
      <div className="stage2-content">
        {/* 镜像显示区域 */}
        <div className="mirror-container">
          <div className="mirror-frame">
            {/* 视频画面 */}
            {!showGeneratedImage && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)' // 镜像效果
                }}
              />
            )}

            {/* 拍摄的照片 */}
            {state === STATES.REVIEWING && capturedPhoto && (
              <img
                src={capturedPhoto}
                alt="Captured"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            )}

            {/* 生成的图像 */}
            {showGeneratedImage && generatedImage && (
              <img
                src={generatedImage}
                alt="Generated"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            )}

            {/* 隐藏的 canvas（用于捕获帧） */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
        </div>

        {/* 状态指示器 */}
        <div className="state-indicator">
          {state === STATES.CONNECTING && <p>⏳ 连接中...</p>}
          {state === STATES.GREETING && <p>👋 欢迎</p>}
          {state === STATES.TALKING && <p>💬 对话中</p>}
          {state === STATES.READY_TO_CAPTURE && <p>📸 准备拍照</p>}
          {state === STATES.REVIEWING && <p>🔍 查看照片</p>}
          {state === STATES.GENERATING && <p>🎨 生成中...</p>}
          {state === STATES.SHOWING_RESULT && <p>✨ 查看结果</p>}
        </div>

        {/* 消息历史 */}
        <div className="messages-container">
          {messages.slice(-3).map((msg, idx) => (
            <div key={idx} className={`message message-${msg.role}`}>
              <span className="message-role">{msg.role === 'ai' ? '🤖' : '👤'}</span>
              <span className="message-text">{msg.text}</span>
            </div>
          ))}
        </div>

        {/* 交互控件 */}
        <div className="controls-container">
          {/* Push-to-Talk 按钮 */}
          {(state === STATES.TALKING || state === STATES.GENERATING) && (
            <button
              className={`push-to-talk-button ${isRecording ? 'recording' : ''}`}
              onMouseDown={handleStartRecording}
              onMouseUp={handleStopRecording}
              onTouchStart={handleStartRecording}
              onTouchEnd={handleStopRecording}
            >
              {isRecording ? '🔴 录音中...' : '🎤 按住说话'}
            </button>
          )}

          {/* 拍照按钮 */}
          {state === STATES.READY_TO_CAPTURE && (
            <button className="capture-button" onClick={handleCapture}>
              📸 拍照
            </button>
          )}

          {/* 查看照片控件 */}
          {state === STATES.REVIEWING && (
            <div className="review-controls">
              <button onClick={handleRetake}>🔄 重拍</button>
              <button onClick={handleConfirmPhoto}>✅ 确认</button>
            </div>
          )}

          {/* 生成完成通知 */}
          {state === STATES.GENERATING && generatedImage && (
            <button className="view-result-button" onClick={handleViewResult}>
              👁️ 查看结果
            </button>
          )}

          {/* 查看结果控件 */}
          {state === STATES.SHOWING_RESULT && (
            <div className="result-controls">
              <button onClick={handleToggleView}>
                {showGeneratedImage ? '📹 查看摄像头' : '🖼️ 查看生成图'}
              </button>
              <button
                onClick={handleConfirmIdentity}
                disabled={isSubmitting}
              >
                ✅ 确认身份
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Stage2Mirror
