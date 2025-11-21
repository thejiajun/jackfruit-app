import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NovaOrbCanvas } from '../../../components/NovaOrbCanvas'
import { analyzePhotoWithVision } from '../../../services/geminiService'
import { generateWithRetry } from '../../../services/imageGenerationService'
import { uploadPhoto } from '../../../services/storageService'
import '../../Onboarding/styles/onboarding.css'

/**
 * Stage2Mirror - 重构版 (2025-01)
 *
 * UI 架构：
 * - 对话框在 Mirror 框架内部底部
 * - 粒子球作为底部按钮区域的背景光晕
 * - 按钮在同一位置平滑切换
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
  const [connectionError, setConnectionError] = useState(false)  // Gemini Live 连接失败
  const [cameraError, setCameraError] = useState(false)  // 摄像头访问失败
  const [generationProgress, setGenerationProgress] = useState(0)  // 图像生成进度 (0-100)
  const [inputMode, setInputMode] = useState('voice')  // 输入模式: 'voice' | 'text'
  const [textInput, setTextInput] = useState('')  // 文本输入内容

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
      setConnectionError(true)
      return
    }

    // 检查连接状态
    if (geminiLive.isConnected && geminiLive.isConnected()) {
      setGeminiConnected(true)
      setState(STATES.GREETING)
      return
    }

    // 10 秒超时检测
    const timeout = setTimeout(() => {
      setConnectionError(true)
    }, 10000)

    // 监听连接事件
    const checkConnection = setInterval(() => {
      if (geminiLive.isConnected && geminiLive.isConnected()) {
        clearInterval(checkConnection)
        clearTimeout(timeout)
        setGeminiConnected(true)
        setState(STATES.GREETING)
      }
    }, 500)

    return () => {
      clearInterval(checkConnection)
      clearTimeout(timeout)
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

      // 3. 等待 AI 主动打招呼（通过 systemInstruction 配置）
      // AI 会自动发送欢迎消息，我们只需监听消息即可

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
      setCameraError(true)
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
        if (geminiLive.sendVideoFrame) {
          await geminiLive.sendVideoFrame(frameData, 'image/jpeg')
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
  // ⌨️ 文本输入：发送文本消息
  // ============================================================
  const handleSendText = async () => {
    if (!textInput.trim()) return

    const text = textInput.trim()
    setTextInput('')

    // 显示用户消息
    setMessages(prev => [...prev, { role: 'user', text }])

    // 发送给 Gemini Live
    if (geminiLive && geminiLive.sendText) {
      await geminiLive.sendText(text)
    }
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
      // 重置进度
      setGenerationProgress(0)

      // 模拟进度更新（真实 API 没有进度反馈）
      const progressInterval = setInterval(() => {
        setGenerationProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + Math.random() * 15
        })
      }, 500)

      const result = await generateWithRetry(capturedPhoto, analysis, 3)

      // 完成时清除进度
      clearInterval(progressInterval)
      setGenerationProgress(100)

      setGeneratedImage(result.imageUrl)

      // 通知用户
      notifyGenerationComplete()
    } catch (error) {
      console.error('[Stage2Mirror] ❌ 生成失败:', error)
      alert('图像生成失败，请重试')
      setGenerationProgress(0)
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
    <div className="stage2-mirror">
      {/* Mirror 卡片容器 */}
      <div className="mirror-container">
        <div className="mirror-frame">
          {/* 顶部栏（在框架内） */}
          <div className="mirror-top-bar">
            <div className="mirror-title-section">
              <div className="mirror-title">THE MIRROR</div>
              <div className="mirror-status">
                <span className="status-dot"></span>
                <span className="status-text">ONLINE</span>
              </div>
            </div>

            {/* 输入模式切换按钮（中间） */}
            {(state === STATES.TALKING || state === STATES.GENERATING) && (
              <div style={{
                position: 'absolute',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '8px',
                background: 'rgba(15, 23, 42, 0.8)',
                borderRadius: '20px',
                padding: '4px',
                border: '1px solid rgba(34, 211, 238, 0.2)'
              }}>
                <button
                  onClick={() => setInputMode('voice')}
                  style={{
                    fontFamily: 'VT323, monospace',
                    fontSize: '14px',
                    padding: '6px 16px',
                    background: inputMode === 'voice' ? '#22d3ee' : 'transparent',
                    color: inputMode === 'voice' ? '#0f172a' : '#64748b',
                    border: 'none',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                >
                  🎤 语音
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  style={{
                    fontFamily: 'VT323, monospace',
                    fontSize: '14px',
                    padding: '6px 16px',
                    background: inputMode === 'text' ? '#22d3ee' : 'transparent',
                    color: inputMode === 'text' ? '#0f172a' : '#64748b',
                    border: 'none',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                >
                  ⌨️ 打字
                </button>
              </div>
            )}

            {/* 图像生成进度条（右上角） */}
            {state === STATES.GENERATING && generationProgress > 0 && generationProgress < 100 && (
              <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  fontFamily: 'VT323, monospace',
                  fontSize: '14px',
                  color: '#22d3ee',
                  minWidth: '40px'
                }}>
                  {Math.floor(generationProgress)}%
                </div>
                <div style={{
                  width: '100px',
                  height: '4px',
                  background: 'rgba(100, 116, 139, 0.3)',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${generationProgress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #22d3ee, #06b6d4)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* 视频/图像显示区 */}
          <div className="mirror-content">
            {/* 视频画面 */}
            {!showGeneratedImage && state !== STATES.REVIEWING && (
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

          {/* 对话框（在框架内底部） */}
          <div className="mirror-dialogue-overlay">
            <div className="pika-entity-label">PIKA_ENTITY</div>
            <div className="dialogue-messages">
              {messages.slice(-3).map((msg, idx) => (
                <div key={idx} className="dialogue-message">
                  <span style={{ color: msg.role === 'ai' ? '#22d3ee' : '#94a3b8' }}>
                    {msg.role === 'ai' ? '🤖 ' : '👤 '}
                  </span>
                  {msg.text}
                </div>
              ))}
            </div>

            {/* 转录文本显示（最后一句，滚动效果） */}
            {messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: 'rgba(34, 211, 238, 0.1)',
                borderLeft: '2px solid #22d3ee',
                borderRadius: '4px',
                overflow: 'hidden',
                whiteSpace: 'nowrap'
              }}>
                <div style={{
                  fontFamily: 'VT323, monospace',
                  fontSize: '14px',
                  color: '#22d3ee',
                  animation: 'scrollText 10s linear infinite'
                }}>
                  📝 转录: {messages[messages.length - 1].text}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 控制按钮区域（在框架外） */}
      <div className="mirror-controls-outer">
        {/* 粒子球背景光晕 */}
        <div className="controls-orb-background">
          <NovaOrbCanvas
            mode="IDLE"
            particleCount={260}
          />
        </div>

        {/* 主按钮切换（使用 AnimatePresence） */}
        <AnimatePresence mode="wait">
          {/* 语音模式: Push-to-Talk 按钮 */}
          {inputMode === 'voice' &&
            (state === STATES.TALKING ||
              (state === STATES.GENERATING && !generatedImage)) && (
            <motion.button
              key="push-to-talk"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
              className={`push-to-talk-button ${isRecording ? 'recording' : ''}`}
              onMouseDown={handleStartRecording}
              onMouseUp={handleStopRecording}
              onTouchStart={handleStartRecording}
              onTouchEnd={handleStopRecording}
            >
              {isRecording ? '🔴 录音中...' : '🎤 按住说话'}
            </motion.button>
          )}

          {/* 打字模式: 文本输入框 + 发送按钮 */}
          {inputMode === 'text' &&
            (state === STATES.TALKING ||
              (state === STATES.GENERATING && !generatedImage)) && (
            <motion.div
              key="text-input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                width: '100%',
                maxWidth: '400px'
              }}
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
                placeholder="输入消息..."
                style={{
                  flex: 1,
                  fontFamily: 'VT323, monospace',
                  fontSize: '16px',
                  padding: '12px 16px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(34, 211, 238, 0.3)',
                  borderRadius: '8px',
                  outline: 'none'
                }}
              />
              <button
                onClick={handleSendText}
                disabled={!textInput.trim()}
                style={{
                  fontFamily: 'VT323, monospace',
                  fontSize: '16px',
                  padding: '12px 24px',
                  background: textInput.trim() ? '#22d3ee' : 'rgba(34, 211, 238, 0.3)',
                  color: textInput.trim() ? '#0f172a' : '#64748b',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: textInput.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease'
                }}
              >
                📤 发送
              </button>
            </motion.div>
          )}

          {/* 拍照按钮 */}
          {state === STATES.READY_TO_CAPTURE && (
            <motion.button
              key="capture"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
              className="capture-button"
              onClick={handleCapture}
            >
              📸 拍照
            </motion.button>
          )}

          {/* 查看结果按钮 */}
          {state === STATES.GENERATING && generatedImage && (
            <motion.button
              key="view-result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.4 }}
              className="view-result-button"
              onClick={handleViewResult}
            >
              👁️ 查看结果
            </motion.button>
          )}
        </AnimatePresence>

        {/* 多按钮状态 */}
        {/* 审阅照片控件 */}
        {state === STATES.REVIEWING && (
          <div className="review-controls">
            <button onClick={handleRetake}>🔄 重拍</button>
            <button onClick={handleConfirmPhoto}>✅ 确认</button>
          </div>
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

      {/* 连接状态提示 */}
      {state === STATES.CONNECTING && !connectionError && (
        <div className="connecting-overlay">
          <p>⏳ 连接中...</p>
        </div>
      )}

      {/* 连接失败提示 */}
      {connectionError && (
        <div className="connection-error-overlay" style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 100,
          background: 'rgba(15, 23, 42, 0.98)',
          border: '1px solid rgba(34, 211, 238, 0.3)',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '400px',
          textAlign: 'center'
        }}>
          <p style={{
            fontFamily: 'VT323, monospace',
            fontSize: '20px',
            color: '#f59e0b',
            marginBottom: '16px'
          }}>
            ⚠️ 连接失败
          </p>

          <p style={{
            fontFamily: 'VT323, monospace',
            fontSize: '16px',
            color: '#94a3b8',
            lineHeight: 1.6,
            marginBottom: '24px'
          }}>
            无法连接 PIKA 语音系统，请重试。
          </p>

          <button
            onClick={() => {
              setConnectionError(false)
              setState(STATES.CONNECTING)
              // 重新触发连接检查
              window.location.reload()
            }}
            style={{
              fontFamily: 'VT323, monospace',
              fontSize: '18px',
              padding: '12px 32px',
              background: 'transparent',
              color: '#22d3ee',
              border: '1px solid #22d3ee',
              cursor: 'pointer',
              letterSpacing: '1px'
            }}
          >
            [ ↻ 重试连接 ]
          </button>
        </div>
      )}

      {/* 摄像头失败提示 */}
      {cameraError && (
        <div className="camera-error-overlay" style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 100,
          background: 'rgba(15, 23, 42, 0.98)',
          border: '1px solid rgba(34, 211, 238, 0.3)',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '400px',
          textAlign: 'center'
        }}>
          <p style={{
            fontFamily: 'VT323, monospace',
            fontSize: '20px',
            color: '#f59e0b',
            marginBottom: '16px'
          }}>
            ⚠️ 无法访问摄像头
          </p>

          <p style={{
            fontFamily: 'VT323, monospace',
            fontSize: '16px',
            color: '#94a3b8',
            lineHeight: 1.6,
            marginBottom: '24px'
          }}>
            请检查浏览器权限设置，或上传照片继续。
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => {
                setCameraError(false)
                startCamera()
              }}
              style={{
                fontFamily: 'VT323, monospace',
                fontSize: '18px',
                padding: '12px 32px',
                background: 'transparent',
                color: '#22d3ee',
                border: '1px solid #22d3ee',
                cursor: 'pointer',
                letterSpacing: '1px'
              }}
            >
              [ ↻ 重试 ]
            </button>

            <button
              onClick={() => {
                // TODO: 切换到上传照片模式
                // 当前先跳过摄像头，直接允许手动拍照
                setCameraError(false)
                setState(STATES.READY_TO_CAPTURE)
              }}
              style={{
                fontFamily: 'VT323, monospace',
                fontSize: '18px',
                padding: '12px 32px',
                background: 'transparent',
                color: '#64748b',
                border: '1px solid #64748b',
                cursor: 'pointer',
                letterSpacing: '1px'
              }}
            >
              [ 上传照片 ]
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Stage2Mirror
