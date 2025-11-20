import { useState, useEffect, useRef } from 'react'
import { analyzePhotoWithVision } from '../../../services/geminiService'
import { loadLookingTemplates } from '../../../services/templateService'
import '../../Onboarding/styles/onboarding.css'

/**
 * Stage 2: Mirror Guide
 *
 * 1. 摄像头开启 → 用户手动拍照
 * 2. Gemini Vision 分析照片
 * 3. Gemini Live API 实时语音对话（2 轮）
 * 4. 模板选择（轮播）
 */
const Stage2Mirror = ({ config, globalStyles, onComplete, currentStep, userData }) => {
  const [phase, setPhase] = useState('camera') // camera | captured | analyzing | conversation | templates
  const [photoDataUrl, setPhotoDataUrl] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [templates, setTemplates] = useState([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    console.log('[Stage2Mirror] Mounted', { phase })

    // 开启摄像头
    if (phase === 'camera') {
      startCamera()
    }

    return () => {
      stopCamera()
    }
  }, [])

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
      console.error('[Stage2Mirror] Camera error:', error)
      alert('无法访问摄像头，请检查权限设置')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
  }

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setPhotoDataUrl(dataUrl)
    setPhase('captured')

    console.log('[Stage2Mirror] Photo captured')
  }

  const handleConfirmPhoto = async () => {
    console.log('[Stage2Mirror] Confirming photo, starting analysis...')
    setPhase('analyzing')

    try {
      // 调用 Gemini Vision API 分析照片
      const analysis = await analyzePhotoWithVision(photoDataUrl)
      setAnalysisResult(analysis)
      setPhase('conversation')
      console.log('[Stage2Mirror] Analysis complete:', analysis)
    } catch (error) {
      console.error('[Stage2Mirror] Analysis failed:', error)

      // 失败时使用 fallback 数据
      const fallbackAnalysis = {
        location: 'unknown',
        weather: 'unknown',
        clothing: 'casual',
        mood: 'neutral'
      }
      setAnalysisResult(fallbackAnalysis)
      setPhase('conversation')
    }
  }

  const handleRetake = () => {
    setPhotoDataUrl(null)
    setPhase('camera')
    startCamera()
  }

  // 加载模板数据
  useEffect(() => {
    if (phase === 'templates') {
      loadTemplates()
    }
  }, [phase])

  const loadTemplates = async () => {
    setLoadingTemplates(true)

    try {
      const data = await loadLookingTemplates()
      setTemplates(data)
      console.log('[Stage2Mirror] Templates loaded:', data.length)
    } catch (error) {
      console.error('[Stage2Mirror] Failed to load templates:', error)
      setTemplates([])
    } finally {
      setLoadingTemplates(false)
    }
  }

  const handleTemplateSelect = (template) => {
    console.log('[Stage2Mirror] Template selected:', template)
    setSelectedTemplate(template)

    // 完成 Stage 2
    onComplete({
      photo_url: photoDataUrl,
      analysis: analysisResult,
      template_id: template.id,
      template_name: template.name,
      conversation_history: [] // TODO: 添加真实对话记录
    })
  }

  return (
    <div className="onboarding-step stage2-mirror">
      {/* 背景层：摄像头或照片 */}
      <div className="background-layer">
        {phase === 'camera' && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="camera-video"
          />
        )}

        {(phase === 'captured' || phase === 'analyzing') && photoDataUrl && (
          <img
            src={photoDataUrl}
            alt="Captured"
            className="captured-photo"
          />
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      {/* 顶部状态栏 */}
      <div className="top-bar">
        <button className="back-btn">[ ← ]</button>
        <span className="rec-indicator">[ REC ● ]</span>
      </div>

      {/* 内容层 */}
      <div className="content-layer">
        {/* Phase: 拍照 */}
        {phase === 'camera' && (
          <div className="camera-controls">
            <button
              className="capture-btn terminal-btn"
              onClick={handleCapture}
            >
              [ 📸 CAPTURE ]
            </button>
          </div>
        )}

        {/* Phase: 确认照片 */}
        {phase === 'captured' && (
          <div className="photo-preview-controls">
            <button
              className="confirm-btn terminal-btn"
              onClick={handleConfirmPhoto}
            >
              [ ✓ CONFIRM ]
            </button>
            <button
              className="retake-btn terminal-btn"
              onClick={handleRetake}
            >
              [ ↻ RETAKE ]
            </button>
          </div>
        )}

        {/* Phase: 分析中 */}
        {phase === 'analyzing' && (
          <div className="analyzing-section">
            <div className="loading-spinner" />
            <p className="analyzing-text">Analyzing your essence...</p>
          </div>
        )}

        {/* Phase: 对话 (TODO: 集成 Gemini Live API) */}
        {phase === 'conversation' && (
          <div className="conversation-section">
            <p className="ai-speech">
              I AM YOUR GUIDE IN THIS REALM.
            </p>
            <p className="ai-speech">
              I see you're in {analysisResult?.location}. Busy day?
            </p>

            <button
              className="skip-conversation-btn terminal-btn"
              onClick={() => setPhase('templates')}
            >
              [ SKIP TO TEMPLATES ]
            </button>
          </div>
        )}

        {/* Phase: 模板选择 */}
        {phase === 'templates' && (
          <div className="template-selection">
            <p className="template-prompt">
              Want to keep your look, or try something wild?
            </p>

            {loadingTemplates ? (
              <div className="loading-spinner" style={{ margin: '40px auto' }} />
            ) : (
              <div className="template-grid">
                {templates.length > 0 ? (
                  templates.map(template => (
                    <button
                      key={template.id}
                      className="template-card"
                      onClick={() => handleTemplateSelect(template)}
                    >
                      <div style={{ marginBottom: '8px' }}>
                        {template.name || 'Unnamed'}
                      </div>
                      {template.preview_image_url && (
                        <img
                          src={template.preview_image_url}
                          alt={template.name}
                          style={{
                            width: '100%',
                            height: '120px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            marginTop: '8px'
                          }}
                        />
                      )}
                    </button>
                  ))
                ) : (
                  <div style={{
                    textAlign: 'center',
                    color: '#00FF41',
                    fontFamily: 'VT323, monospace',
                    fontSize: '18px'
                  }}>
                    No templates available
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Stage2Mirror
