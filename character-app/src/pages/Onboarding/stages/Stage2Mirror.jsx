import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { NovaOrbCanvas } from '../../../components/NovaOrbCanvas'
import { analyzePhotoWithVision } from '../../../services/geminiService'
import { generateRecommendedIdentity, generateWithRetry } from '../../../services/imageGenerationService'
import GeminiLiveService from '../../../services/geminiLiveService'
import { uploadPhoto } from '../../../services/storageService'
import '../../Onboarding/styles/onboarding.css'
import '../../Onboarding/styles/voice-controls.css'

/**
 * 【产品模块】第二阶段:镜像引导 - 与 AI 对话并生成数字身份
 *
 * 产品目标:
 * 1. 建立"AI 能看到你"的沉浸感 - 通过实时视频流让 Gemini Live 分析用户外貌环境
 * 2. 收集用户信息但不让用户感觉在"填表" - 用自然对话替代传统表单
 * 3. 生成用户的数字身份图像 - 基于拍照+对话内容,AI 生成一张推荐的虚拟形象
 *
 * 用户体验流程:
 * → INTRO 阶段:Pika 语音介绍,摄像头全屏打开,营造"被注视"的感觉
 * → CONVERSATION 阶段(核心):
 *    - CAMERA 子状态:摄像头实时画面,Gemini Live 每 2 秒"看到"一帧,基于视觉提问
 *    - 用户随时可拍照 → REVIEWING 子状态
 *    - REVIEWING:显示拍摄的照片,用户可以 RETAKE(重拍)或 CONFIRM(确认)
 *    - CONFIRM 后 → GENERATING 子状态:后台生成图像(10-30秒),同时对话继续(不让用户干等)
 *    - 生成完成 → 镜像边框闪烁 + "Your digital form is ready"通知
 *    - 用户点击 VIEW RESULT → SHOWING_RESULT 子状态
 *    - SHOWING_RESULT:可在摄像头画面和生成图像间切换,最终点击 CONFIRM IDENTITY 进入下一阶段
 *
 * 技术架构亮点(2025-01 重构):
 * - 使用 Gemini Live WebSocket 替代传统 REST API,实现双向实时音视频通信
 * - 3 层状态机: phase (INTRO/CONVERSATION) → conversationSubState (CAMERA/REVIEWING/...) → mirrorDisplayMode (camera/photo/image)
 * - 非阻塞生成:图像生成期间对话不中断,提升 UX
 */
const Stage2Mirror = ({ config, globalStyles, onComplete, currentStep, userData }) => {
  // ============================================================
  // 【核心状态机】三层架构控制整个 Stage 2 流程
  // ============================================================
  // 第 1 层:主阶段 phase
  const [phase, setPhase] = useState('INTRO')  // 'INTRO'(AI 介绍) | 'CONVERSATION'(主对话流程)

  // 第 2 层:对话子状态 conversationSubState (只在 CONVERSATION phase 下有效)
  const [conversationSubState, setConversationSubState] = useState('CAMERA')
  // 'CAMERA' - 摄像头实时画面,AI 持续"看到"用户
  // 'REVIEWING' - 用户拍照后查看,可重拍或确认
  // 'GENERATING' - 后台生成数字身份图像中,对话继续
  // 'SHOWING_RESULT' - 显示生成的图像,可切换查看

  // 第 3 层:镜像显示模式 mirrorDisplayMode (控制镜像框内显示什么)
  const [mirrorDisplayMode, setMirrorDisplayMode] = useState('camera')
  // 'camera' - 显示实时摄像头画面
  // 'captured_photo' - 显示用户拍摄的照片
  // 'generated_image' - 显示 AI 生成的数字身份图像

  // ============================================================
  // 【对话系统】AI 与用户的消息历史和状态
  // ============================================================
  const [messages, setMessages] = useState([])  // 对话历史数组 [{ role: 'ai' | 'user', text: '...' }]
  const [isAISpeaking, setIsAISpeaking] = useState(false)  // AI 是否正在说话(控制粒子球动画和 UI 状态)

  // ============================================================
  // 【照片和分析数据】用户拍照和 AI 视觉分析结果
  // ============================================================
  const [capturedPhotoDataUrl, setCapturedPhotoDataUrl] = useState(null)  // 用户拍摄的照片(base64)
  const [latestAnalysis, setLatestAnalysis] = useState(null)              // 最新一帧的 AI 分析结果(location, mood, clothing)
  const [confirmedAnalysis, setConfirmedAnalysis] = useState(null)        // 用户确认照片后的分析结果(用于生成)

  // ============================================================
  // 【AI 生成状态】数字身份图像生成的状态追踪
  // ============================================================
  const [generationStatus, setGenerationStatus] = useState('idle')
  // 'idle' - 未开始生成
  // 'generating' - 正在后台生成中(调用 FAL SeeDrawm API)
  // 'completed' - 生成完成
  // 'failed' - 生成失败

  const [generatedImageUrl, setGeneratedImageUrl] = useState(null)          // 生成的图像 URL
  const [showGenerationNotification, setShowGenerationNotification] = useState(false)  // 是否显示"图像已生成"通知
  const [mirrorBorderFlash, setMirrorBorderFlash] = useState(false)         // 镜像边框闪烁动画(提示用户图像已就绪)

  // ============================================================
  // 【摄像头设置】前置/后置摄像头切换
  // ============================================================
  const [facingMode, setFacingMode] = useState('user')  // 'user'(前置摄像头) | 'environment'(后置摄像头)

  // ============================================================
  // 【防重复提交】用户点击"CONFIRM IDENTITY"按钮时的 debounce 锁
  // ============================================================
  const [isSubmitting, setIsSubmitting] = useState(false)  // 防止用户连续点击多次导致重复提交

  // ============================================================
  // 【Gemini Live API】实时音视频对话的核心连接对象和状态
  // ============================================================
  const [geminiLive, setGeminiLive] = useState(null)                    // GeminiLiveService 实例
  const [geminiConnected, setGeminiConnected] = useState(false)         // WebSocket 是否已连接
  const [inputMode, setInputMode] = useState('voice')                   // 用户输入模式:'voice'(语音) | 'text'(文字)
  const [isRecording, setIsRecording] = useState(false)                 // 是否正在录音
  const isRecordingRef = useRef(false)                                  // 录音状态 ref(避免闭包问题)
  const [textInput, setTextInput] = useState('')                        // 文字输入框内容

  const geminiLiveRef = useRef(null)                                    // GeminiLiveService 实例 ref
  const connectionInitializedRef = useRef(false)                        // 🔥 防止 StrictMode 重复连接的标志

  // ============================================================
  // 【DOM Refs】访问 DOM 元素和存储不触发重渲染的变量
  // ============================================================
  const videoRef = useRef(null)                   // <video> 元素(摄像头画面)
  const canvasRef = useRef(null)                  // <canvas> 元素(用于捕获视频帧)
  const streamRef = useRef(null)                  // MediaStream 对象(摄像头媒体流)
  const autoAnalysisIntervalRef = useRef(null)    // 自动帧分析定时器 ID
  const conversationCountRef = useRef(0)          // 对话轮数计数(用于限制对话次数)
  const audioContextRef = useRef(null)            // Web Audio API AudioContext(录音用)
  const processorRef = useRef(null)               // Audio Processor(录音用)
  const audioStreamRef = useRef(null)             // 音频 MediaStream(录音用)
  const introExecutedRef = useRef(false)          // 🔥 防止 INTRO 序列重复执行的标志

  // ============================================================
  // 【视觉特效】镜像框 3D 倾斜效果 - 跟随鼠标移动产生视差感
  // 产品需求:让镜像框有"悬浮在空中"的感觉,增强科技感和交互性
  // ============================================================
  const mouseX = useMotionValue(0)  // 鼠标 X 坐标(-0.5 到 0.5)
  const mouseY = useMotionValue(0)  // 鼠标 Y 坐标(-0.5 到 0.5)
  const springConfig = { damping: 25, stiffness: 150 }  // 弹簧动画参数(控制倾斜的平滑度)
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [5, -5]), springConfig)   // 上下倾斜角度
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-5, 5]), springConfig)   // 左右倾斜角度
  const shineX = useSpring(useTransform(mouseX, [-0.5, 0.5], [0, 100]), springConfig)   // 光泽位置

  // 监听鼠标移动,实时更新倾斜效果
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseX.set((e.clientX / window.innerWidth) - 0.5)   // 将屏幕坐标转换为 -0.5 到 0.5
      mouseY.set((e.clientY / window.innerHeight) - 0.5)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [mouseX, mouseY])

  // ============================================================
  // 【核心功能】Gemini Live WebSocket 连接 - 实时音视频对话的基础
  // 产品需求:让 AI "看到"用户并实时对话,替代传统的表单填写
  // 技术实现:WebSocket 双向通信,音频流式输入输出,视频帧流式发送(0.5 FPS)
  // ============================================================
  useEffect(() => {
    let isActive = true  // 🔥 防止 cleanup 后仍然设置状态

    const connectGeminiLive = async () => {
      try {
        // 🔥 防止重复连接（StrictMode 会导致 useEffect 执行两次）
        // 使用持久化的 ref 标志，即使 cleanup 清空了 geminiLiveRef.current，这个标志仍然保留
        if (connectionInitializedRef.current) {
          console.log('[Stage2Mirror] ⚠️ Gemini Live 已初始化，跳过重复连接 (StrictMode 第二次渲染)')
          return
        }

        // 🔥 标记为已初始化（这个标志在整个组件生命周期内保持，不会被 cleanup 清空）
        connectionInitializedRef.current = true

        // 检查 API Key 是否配置
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY
        if (!apiKey) {
          console.error('[Stage2Mirror] ❌ 缺少 Gemini API key,无法连接')
          return
        }

        console.log('[Stage2Mirror] 🔌 正在连接 Gemini Live WebSocket...')

        // 创建 Gemini Live 连接实例
        const live = new GeminiLiveService(apiKey, {
          model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',  // Gemini 2.5 Flash Native Audio 模型
          voiceName: 'Zephyr',                                             // AI 语音(Zephyr 是男声)
          responseModality: 'AUDIO',                                       // 返回音频(不返回文本,性能更好)
          temperature: 0.9,                                                // 回答的随机性(0.9 = 比较有创意)

          // 【关键回调 1】AI 返回文本时触发(即使 responseModality 是 AUDIO,也会有文本转录)
          onText: (text) => {
            if (!isActive) return  // 🔥 组件已卸载，忽略回调
            console.log('[Stage2Mirror] 💬 AI 说:', text)
            // 将 AI 回复添加到消息历史(用于 UI 显示和追踪对话)
            setMessages(prev => [...prev, { role: 'ai', text }])
            conversationCountRef.current += 1  // 对话轮数 +1
          },

          // 【关键回调 2】WebSocket 连接成功时触发
          onConnected: () => {
            if (!isActive) return  // 🔥 组件已卸载，忽略回调
            console.log('[Stage2Mirror] ✅ Gemini Live WebSocket 已连接')
            setGeminiConnected(true)
            // 连接成功后立即开始音频流(让 AI 能"听到"用户)
            startAudioStream()
          },

          // 【关键回调 3】连接出错时触发
          onError: (error) => {
            console.error('[Stage2Mirror] ❌ Gemini Live 错误:', error)
          },

          // 【关键回调 4】连接关闭时触发
          onClosed: () => {
            if (!isActive) return  // 🔥 组件已卸载，忽略回调
            console.log('[Stage2Mirror] 🔌 Gemini Live 连接已关闭')
            setGeminiConnected(false)
          }
        })

        // 开始连接(异步操作)
        await live.connect()

        // 🔥 只有在组件仍然 active 时才设置状态
        if (!isActive) {
          console.log('[Stage2Mirror] ⚠️ 组件已卸载，关闭刚创建的连接')
          live.close()
          return
        }

        setGeminiLive(live)
        geminiLiveRef.current = live

        console.log('[Stage2Mirror] ✅ Gemini Live 初始化完成,可以开始对话')
      } catch (error) {
        console.error('[Stage2Mirror] ❌ Gemini Live 连接失败:', error)
      }
    }

    // 组件加载后立即连接
    connectGeminiLive()

    // 组件卸载时清理连接(避免内存泄漏和重复连接)
    return () => {
      isActive = false  // 🔥 标记组件已卸载
      console.log('[Stage2Mirror] 🧹 Cleaning up Gemini Live connection...')
      if (geminiLiveRef.current) {
        geminiLiveRef.current.close()
        geminiLiveRef.current = null
      }
      stopAudioStream()
      // 🔥 注意：不清空 connectionInitializedRef.current，保持标志以防止重复连接
    }
  }, [])

  // ============================================================
  // 🔥 Audio Streaming (Microphone)
  // ============================================================
  const startAudioStream = async () => {
    try {
      console.log('[Stage2Mirror] Starting microphone stream...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStreamRef.current = stream

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!geminiLiveRef.current || !geminiConnected || !isRecordingRef.current) return

        const inputData = e.inputBuffer.getChannelData(0)

        // Convert float32 to int16
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        // Convert to base64
        const buffer = pcmData.buffer
        let binary = ''
        const bytes = new Uint8Array(buffer)
        const len = bytes.byteLength
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)

        // Send to Gemini
        geminiLiveRef.current.sendAudio(base64, 'audio/pcm;rate=16000')
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      console.log('[Stage2Mirror] ✅ Microphone stream active')
    } catch (error) {
      console.error('[Stage2Mirror] Failed to start audio stream:', error)
    }
  }

  const stopAudioStream = () => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop())
      audioStreamRef.current = null
    }
    console.log('[Stage2Mirror] Audio stream stopped')
  }

  const startRecording = () => {
    setIsRecording(true)
    isRecordingRef.current = true
  }

  const stopRecording = () => {
    setIsRecording(false)
    isRecordingRef.current = false
  }

  const handleSendText = () => {
    if (!textInput.trim() || !geminiLiveRef.current) return
    geminiLiveRef.current.sendText(textInput)
    setTextInput('')
  }

  // ============================================================
  // 🔥 INTRO Stage - AI Voice Introduction
  // ============================================================
  useEffect(() => {
    let isCancelled = false  // 🔥 防止 cleanup 后仍然执行

    const runIntro = async () => {
      // 🔥 防止 INTRO 序列重复执行（StrictMode 会导致 useEffect 执行两次）
      if (introExecutedRef.current) {
        console.log('[Stage2Mirror] ⚠️ INTRO 已执行过，跳过重复执行 (StrictMode 第二次渲染)')
        return
      }

      if (phase === 'INTRO') {
        // 🔥 标记为已执行（这个标志在整个组件生命周期内保持）
        introExecutedRef.current = true

        console.log('[Stage2Mirror] Starting INTRO sequence...')

        try {
          // ✅ 整个 INTRO 流程最多 20 秒，超时后强制进入 CONVERSATION
          const introPromise = (async () => {
            // Start camera immediately
            await startCamera()

            // 🔥 检查是否已取消
            if (isCancelled) return

            // 等待 Gemini Live 连接就绪（最多 5 秒）
            let waitCount = 0
            while (!geminiConnected && waitCount < 50 && !isCancelled) {
              await new Promise(r => setTimeout(r, 100))
              waitCount++
            }

            if (isCancelled) return  // 🔥 检查是否已取消

            if (!geminiConnected) {
              console.warn('[Stage2Mirror] Gemini Live not connected after 5s, skipping INTRO speech')
            }

            // First message: "I am your guide."
            const text1 = "I am your guide."
            if (!isCancelled) {
              setMessages([{ role: 'ai', text: text1 }])
              await speakViaGeminiLive(text1)
            }

            if (isCancelled) return  // 🔥 检查是否已取消

            // Second message: "Please show me your form."
            const text2 = "Please show me your form."
            if (!isCancelled) {
              setMessages(prev => [...prev, { role: 'ai', text: text2 }])
              await speakViaGeminiLive(text2)
            }

            if (isCancelled) return  // 🔥 检查是否已取消

            // 短暂停顿后进入对话阶段
            await new Promise(r => setTimeout(r, 1000))
          })()

          const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
              if (!isCancelled) {
                console.warn('[Stage2Mirror] ⚠️ INTRO timeout (20s), force transitioning to CONVERSATION')
                resolve()
              }
            }, 20000) // 20秒超时
          })

          // ✅ 等待 INTRO 完成或超时（取最快的）
          await Promise.race([introPromise, timeoutPromise])

          // 🔥 只有在未取消时才切换阶段
          if (isCancelled) return

          // Transition to CONVERSATION phase
          console.log('[Stage2Mirror] INTRO complete, transitioning to CONVERSATION')
          setPhase('CONVERSATION')
          setConversationSubState('CAMERA')
        } catch (error) {
          console.error('[Stage2Mirror] INTRO error:', error)
          // ✅ 即使出错也强制进入 CONVERSATION（确保流程继续）
          if (!isCancelled) {
            console.warn('[Stage2Mirror] INTRO failed, force transitioning to CONVERSATION')
            setPhase('CONVERSATION')
            setConversationSubState('CAMERA')
          }
        }
      }
    }

    runIntro()

    // 🔥 Cleanup function
    return () => {
      isCancelled = true
      console.log('[Stage2Mirror] 🧹 Cancelling INTRO sequence...')
      // 🔥 注意：不清空 introExecutedRef.current，保持标志以防止重复执行
    }
  }, [phase])

  // ============================================================
  // 🔥 Camera Management
  // ============================================================
  useEffect(() => {
    if (phase === 'CONVERSATION') {
      startCamera()
    }

    return () => {
      stopCamera()
    }
  }, [phase, facingMode])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
      }

      console.log('[Stage2Mirror] Camera started')
    } catch (error) {
      console.error('[Stage2Mirror] Camera error:', error)
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
  // 🔥 实时视频流输入到 Gemini Live API (替换旧的 Auto-Frame Analysis)
  // ============================================================
  useEffect(() => {
    // Only run video streaming when:
    // 1. In CONVERSATION phase
    // 2. Gemini Live is connected
    // 3. Showing camera feed
    // 4. NOT in REVIEWING state
    if (
      phase === 'CONVERSATION' &&
      geminiLive &&
      geminiConnected &&
      mirrorDisplayMode === 'camera' &&
      conversationSubState !== 'REVIEWING'
    ) {
      console.log('[Stage2Mirror] Starting video stream to Gemini Live...')

      // 每 2 秒发送一帧视频到 Gemini Live (0.5 FPS)
      autoAnalysisIntervalRef.current = setInterval(async () => {
        try {
          if (!videoRef.current || !canvasRef.current) return

          // 🔥 使用 geminiLive.captureAndSendFrame() 发送视频帧
          await geminiLive.captureAndSendFrame(
            canvasRef.current,
            videoRef.current,
            0.8 // JPEG quality
          )

          console.log('[Stage2Mirror] ✅ Video frame sent to Gemini Live')

        } catch (error) {
          console.error('[Stage2Mirror] Failed to send video frame:', error)
        }
      }, 2000) // ✅ 每 2 秒发送一帧 (0.5 FPS)

      return () => {
        if (autoAnalysisIntervalRef.current) {
          clearInterval(autoAnalysisIntervalRef.current)
          autoAnalysisIntervalRef.current = null
        }
      }
    }
  }, [phase, geminiLive, geminiConnected, mirrorDisplayMode, conversationSubState])

  // ============================================================
  // 🔥 AI Conversation System
  // ============================================================
  useEffect(() => {
    // Start first AI question when entering CONVERSATION phase
    if (phase === 'CONVERSATION' && conversationCountRef.current === 0) {
      setTimeout(() => {
        generateAIQuestion()
      }, 500) // Wait 0.5s after transition
    }
  }, [phase])

  const generateAIQuestion = async () => {
    // 检查是否正在说话或未连接到 Gemini Live
    if (isAISpeaking || !geminiLive || !geminiConnected) {
      console.log('[Stage2Mirror] Cannot generate question:', {
        isAISpeaking,
        geminiLive: !!geminiLive,
        geminiConnected
      })
      return
    }

    setIsAISpeaking(true)

    try {
      // 🔥 Gemini 已经通过视频流"看到"用户，不需要额外的 context
      // 🔥 关键：明确禁用 thinking mode，要求直接回答
      const prompt = `You are Pika, a digital reflection entity.

IMPORTANT: Respond directly without showing your thinking process. Do not use markdown formatting or explain your reasoning. Just give your final response naturally.

Goal: Help the user discover their true self.
Style: Mysterious, insightful, cyberpunk.
Task: Based on what you see, ask ONE deep question about the user's vibe.
Constraint: Keep it under 10 words.

Your response:`

      await geminiLive.sendText(prompt)

    } catch (error) {
      console.error('[Stage2Mirror] Failed to generate AI question:', error)

      // Fallback: 使用预设问题，通过 Gemini Live 播放
      const fallbackQuestions = [
        "This space feels intentional. Tell me more.",
        "What brings you here today?",
        "I sense quiet focus. What's on your mind?"
      ]
      const fallbackQuestion = fallbackQuestions[conversationCountRef.current % fallbackQuestions.length]
      setMessages(prev => [...prev, { role: 'ai', text: fallbackQuestion }])
      conversationCountRef.current += 1

      // 使用 Gemini Live 播放 fallback 问题
      await speakViaGeminiLive(fallbackQuestion)
    } finally {
      setIsAISpeaking(false)
    }
  }

  // 🔥 使用 Gemini Live API 发送文本消息（AI 会自动用语音回复）
  const speakViaGeminiLive = async (text) => {
    try {
      console.log('[Stage2Mirror] Sending message via Gemini Live:', text)

      if (!geminiLiveRef.current || !geminiConnected) {
        console.warn('[Stage2Mirror] Gemini Live not connected, skipping speech')
        // 等待一小段时间，让用户看到文本消息
        await new Promise(resolve => setTimeout(resolve, Math.max(text.length * 50, 1000)))
        return
      }

      // 🔥 发送文本给 Gemini Live，AI 会自动用语音回复
      await geminiLiveRef.current.sendText(text)

      // 等待 AI 语音播放完成（估算时长：按字符数计算）
      const estimatedDuration = Math.max(text.length * 80, 2000)
      await new Promise(resolve => setTimeout(resolve, estimatedDuration))

      console.log('[Stage2Mirror] ✅ Gemini Live speech completed')
    } catch (error) {
      console.error('[Stage2Mirror] Gemini Live speech error:', error)
      // 即使出错也等待一小段时间，确保用户能看到消息
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // 【工具函数】从摄像头视频流中捕获当前帧
  // 技术实现:使用 Canvas API 将 video 元素绘制成图片,返回 base64 格式
  const captureCurrentFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null

    const video = videoRef.current
    const canvas = canvasRef.current

    // 检查视频是否已加载足够数据(避免捕获黑屏或空白帧)
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return null

    // 设置 Canvas 尺寸与视频一致
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // 将视频当前帧绘制到 Canvas
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)

    // 转换为 base64 格式的 JPEG 图片(0.8 质量,平衡文件大小和清晰度)
    return canvas.toDataURL('image/jpeg', 0.8)
  }

  // ============================================================
  // 【核心交互 1】用户点击拍照按钮 - 进入照片审核流程
  // 产品需求:让用户可以选择最满意的照片角度,而不是强制使用第一张
  // 用户体验:点击拍照 → 看到静态照片 → 可以重拍或确认
  // ============================================================
  const handleCapture = () => {
    console.log('[Stage2Mirror] 📸 用户点击拍照按钮')

    // 捕获当前视频帧
    const frame = captureCurrentFrame()
    if (!frame) {
      console.error('[Stage2Mirror] ❌ 捕获失败,视频可能未加载')
      return
    }

    // 保存照片并切换到照片查看模式
    setCapturedPhotoDataUrl(frame)
    setMirrorDisplayMode('captured_photo')    // 镜像框显示静态照片
    setConversationSubState('REVIEWING')       // 进入审核状态

    console.log('[Stage2Mirror] ✅ 照片已捕获,进入 REVIEWING 状态')
    // 此时 UI 会显示 RETAKE/CONFIRM 按钮
  }

  // 【核心交互 2】用户点击"重拍"按钮 - 返回摄像头画面
  // 产品需求:给用户反悔的机会,降低拍照压力
  const handleRetake = () => {
    console.log('[Stage2Mirror] 🔄 用户点击重拍')

    // 清除已拍摄的照片
    setCapturedPhotoDataUrl(null)

    // 返回摄像头实时画面
    setMirrorDisplayMode('camera')
    setConversationSubState('CAMERA')

    // 注意:对话历史不清除,对话继续
  }

  // 【核心交互 3】用户点击"确认"按钮 - 开始生成数字身份图像
  // 产品需求:后台生成图像(10-30秒),同时对话不中断,避免用户干等
  // 技术亮点:非阻塞生成 + AI 视觉分析 + 生成完成后通知用户
  const handleConfirmPhoto = async () => {
    console.log('[Stage2Mirror] ✅ 用户确认照片,开始生成流程...')

    // 第 1 步:使用 Gemini Vision API 分析照片
    // 分析内容:用户的位置、心情、穿着等,用于生成提示词
    try {
      const analysis = await analyzePhotoWithVision(capturedPhotoDataUrl)
      setConfirmedAnalysis(analysis)
      console.log('[Stage2Mirror] 📊 照片分析完成:', analysis)
    } catch (error) {
      console.error('[Stage2Mirror] ❌ 分析失败:', error)
    }

    // 第 2 步:切换到 GENERATING 状态
    setConversationSubState('GENERATING')
    console.log('[Stage2Mirror] → 状态机: CONVERSATION/GENERATING')

    // 【关键】保持显示摄像头画面(而不是静态照片),让对话继续
    setMirrorDisplayMode('camera')

    // 第 3 步:后台触发图像生成(非阻塞)
    triggerBackgroundGeneration()

    // 第 4 步:让 Gemini Live 说出"正在生成中"的消息
    const announcement = "Perfect. I'm crafting your form now."
    setMessages(prev => [...prev, { role: 'ai', text: announcement }])

    // 通过 Gemini Live 发送消息,AI 会自动用语音回复(替代原有的 ttsService)
    if (geminiLiveRef.current) {
      await geminiLiveRef.current.sendText(announcement)
    }

    console.log('[Stage2Mirror] 🎨 图像生成已开始,对话可以继续...')
    // 用户可以继续和 AI 聊天,不会感觉在"干等"
  }

  // ============================================================
  // 【后台任务】数字身份图像生成 - 调用 FAL SeeDrawm API
  // 产品需求:基于用户照片+AI 分析结果,生成一张推荐的虚拟形象
  // 技术实现:调用 imageGenerationService → FAL SeeDrawm v4 Edit API
  // 时长:10-30 秒(取决于 API 响应速度),期间对话不中断
  // ============================================================
  const triggerBackgroundGeneration = async () => {
    setGenerationStatus('generating')
    console.log('[Stage2Mirror] 🎨 后台生成开始...')

    try {
      // 调用图像生成服务(带重试机制,最多 3 次)
      const result = await generateWithRetry(
        capturedPhotoDataUrl,                      // 用户拍摄的照片
        confirmedAnalysis || latestAnalysis,       // AI 分析结果(location, mood, clothing)
        3 // 3 retries
      )

      console.log('[Stage2Mirror] Generation successful:', result)

      setGeneratedImageUrl(result.imageUrl)
      setGenerationStatus('completed')

      console.log('[Stage2Mirror] ✅ Generation completed successfully!')
      console.log('[Stage2Mirror] → Generated image URL:', result.imageUrl)

      // Notify user: border flash + message
      notifyGenerationComplete()

    } catch (error) {
      console.error('[Stage2Mirror] Generation failed:', error)
      setGenerationStatus('failed')

      // Show error message - 让 Gemini Live 说出错误消息
      const errorMsg = "Generation failed. Let's try again."
      setMessages(prev => [...prev, { role: 'ai', text: errorMsg }])

      // 通过 Gemini Live 发送消息,AI 会自动用语音回复(替代原有的 ttsService)
      if (geminiLiveRef.current) {
        await geminiLiveRef.current.sendText(errorMsg)
      }
    }
  }

  const notifyGenerationComplete = async () => {
    console.log('[Stage2Mirror] Notifying user of generation completion')

    // Border flash animation
    setMirrorBorderFlash(true)
    setTimeout(() => setMirrorBorderFlash(false), 2000)

    // AI message - 让 Gemini Live 说出"已完成"的消息
    const announcement = "Your digital form is ready."
    setMessages(prev => [...prev, { role: 'ai', text: announcement }])

    // 通过 Gemini Live 发送消息,AI 会自动用语音回复(替代原有的 ttsService)
    if (geminiLiveRef.current) {
      await geminiLiveRef.current.sendText(announcement)
    }

    // Show notification UI
    setShowGenerationNotification(true)
  }

  const handleViewResult = () => {
    console.log('[Stage2Mirror] 👁️ User clicked VIEW RESULT button')

    // Switch mirror to show generated image
    setMirrorDisplayMode('generated_image')
    setConversationSubState('SHOWING_RESULT')
    console.log('[Stage2Mirror] → State: CONVERSATION/SHOWING_RESULT')
    console.log('[Stage2Mirror] → Mirror display: generated_image')

    // Hide notification
    setShowGenerationNotification(false)

    console.log('[Stage2Mirror] ⚠️ CONFIRM IDENTITY button should now be visible')
  }

  const handleRetryGeneration = () => {
    console.log('[Stage2Mirror] Retrying generation')

    setGenerationStatus('idle')
    setGeneratedImageUrl(null)

    // Restart generation
    triggerBackgroundGeneration()
  }

  // ============================================================
  // 🔥 Mirror Display Toggle
  // ============================================================
  const handleToggleMirror = () => {
    if (mirrorDisplayMode === 'camera') {
      setMirrorDisplayMode('generated_image')
    } else {
      setMirrorDisplayMode('camera')
    }

    console.log('[Stage2Mirror] Toggled mirror:', mirrorDisplayMode)
  }

  // ============================================================
  // 🔥 Complete Stage
  // ============================================================
  const handleConfirmIdentity = async () => {
    // 🔒 Debounce: 防止重复提交
    if (isSubmitting) {
      console.warn('[Stage2Mirror] ⚠️ Already submitting, ignoring duplicate click')
      return
    }

    setIsSubmitting(true)
    console.log('[Stage2Mirror] 🔒 User confirmed identity, uploading photos...')

    try {
      // 上传照片到 Supabase Storage
      let capturedPhotoUrl = null
      let generatedImageUrlFinal = generatedImageUrl

      // 上传 captured photo (如果存在)
      if (capturedPhotoDataUrl) {
        console.log('[Stage2Mirror] Uploading captured photo...')
        capturedPhotoUrl = await uploadPhoto(capturedPhotoDataUrl, 'onboarding-resources', 'stage2-captured')
        console.log('[Stage2Mirror] ✅ Captured photo uploaded:', capturedPhotoUrl)
      }

      // generated_image_url 已经是 URL (从 generateWithRetry 返回)，无需上传

      const completionData = {
        captured_photo_url: capturedPhotoUrl,
        generated_image_url: generatedImageUrlFinal,
        analysis: confirmedAnalysis || latestAnalysis,
        conversation_history: messages
      }

      console.log('[Stage2Mirror] ✅ Calling onComplete with data:', completionData)
      onComplete(completionData)

      // 注意：成功后不解锁，防止用户重复点击
    } catch (error) {
      console.error('[Stage2Mirror] ❌ Failed to upload photos:', error)
      alert('上传照片失败，请重试。')
      setIsSubmitting(false) // 失败时解锁，允许重试
    }
  }


  // Handle user text input (for future implementation)
  const handleUserMessage = (text) => {
    setMessages(prev => [...prev, { role: 'user', text }])

    // Generate AI response after user input
    setTimeout(() => {
      generateAIQuestion()
    }, 1000)
  }

  return (
    <div className="onboarding-step stage2-mirror">
      {/* Background */}
      <div className="background-layer pika-silver-grid">
        <div className="grid-overlay-pika" />
        <div className="noise-texture-pika" />
      </div>

      {/* Hidden canvas for capturing frames */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Flex wrapper for centering - 参考 Pika 结构 */}
      <div style={{
        flex: 1,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        minHeight: 0,
        padding: '1rem'
      }}>
        {/* Mirror Container */}
        <motion.div
          className={`mirror-container ${mirrorBorderFlash ? 'border-flash' : ''}`}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="mirror-frame"
            style={{
              rotateX,
              rotateY,
              transformStyle: 'preserve-3d'
            }}
          >
            <div className="mirror-content">
              {/* ========================================== */}
              {/* INTRO Phase: Camera + AI Introduction */}
              {/* ========================================== */}
              {phase === 'INTRO' && (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="mirror-video"
                    style={{
                      transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
                    }}
                  />

                  {/* AI Messages at bottom of mirror */}
                  <div className="mirror-dialogue-container">
                    <AnimatePresence mode="popLayout">
                      {messages.slice(-2).map((msg, i) => (
                        <motion.div
                          key={i + msg.text}
                          className="dialogue-message"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: i === messages.slice(-2).length - 1 ? 1 : 0.6, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                        >
                          <span className="dialogue-label">PIKA_ENTITY</span>
                          <p className="dialogue-text">{msg.text}</p>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </>
              )}

              {/* ========================================== */}
              {/* CONVERSATION Phase */}
              {/* ========================================== */}
              {phase === 'CONVERSATION' && (
                <>
                  {/* Mirror Display based on mirrorDisplayMode */}
                  {mirrorDisplayMode === 'camera' && (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="mirror-video"
                      style={{
                        transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
                      }}
                    />
                  )}

                  {mirrorDisplayMode === 'captured_photo' && capturedPhotoDataUrl && (
                    <img
                      src={capturedPhotoDataUrl}
                      alt="Captured"
                      className="mirror-image"
                      style={{
                        transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
                      }}
                    />
                  )}

                  {mirrorDisplayMode === 'generated_image' && generatedImageUrl && (
                    <img
                      src={generatedImageUrl}
                      alt="Generated"
                      className="mirror-image"
                    />
                  )}

                  {/* AI Messages at bottom of mirror */}
                  <div className="mirror-dialogue-container">
                    <AnimatePresence mode="popLayout">
                      {messages.slice(-2).map((msg, i) => (
                        <motion.div
                          key={i + msg.text}
                          className="dialogue-message"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: i === messages.slice(-2).length - 1 ? 1 : 0.6, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                        >
                          <span className="dialogue-label">PIKA_ENTITY</span>
                          <p className="dialogue-text">{msg.text}</p>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Generation Notification */}
                  <AnimatePresence>
                    {showGenerationNotification && (
                      <motion.div
                        className="generation-notification"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                      >
                        <p>✨ Your digital form is ready</p>
                        <button
                          className="btn-view-result"
                          onClick={handleViewResult}
                        >
                          VIEW RESULT
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Toggle Mirror Button (when in SHOWING_RESULT) */}
                  {conversationSubState === 'SHOWING_RESULT' && (
                    <motion.button
                      className="btn-toggle-mirror"
                      onClick={handleToggleMirror}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      {mirrorDisplayMode === 'camera' ? '🖼️ Show Generated' : '📷 Show Camera'}
                    </motion.button>
                  )}

                  {/* Confirm Identity Button (when generation completed) */}
                  {generationStatus === 'completed' && conversationSubState === 'SHOWING_RESULT' && (
                    <motion.button
                      className="btn-confirm-identity"
                      onClick={handleConfirmIdentity}
                      disabled={isSubmitting}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: isSubmitting ? 1 : 1.05 }}
                      whileTap={{ scale: isSubmitting ? 1 : 0.95 }}
                      style={{
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        opacity: isSubmitting ? 0.6 : 1
                      }}
                    >
                      {isSubmitting ? 'UPLOADING...' : 'CONFIRM IDENTITY'}
                    </motion.button>
                  )}

                  {/* Retry Generation Button (if failed) */}
                  {generationStatus === 'failed' && (
                    <motion.button
                      className="btn-retry-generation"
                      onClick={handleRetryGeneration}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      RETRY GENERATION
                    </motion.button>
                  )}
                </>
              )}
            </div>

            {/* Shine overlay */}
            <motion.div
              style={{ x: shineX }}
              className="shine-overlay"
            />
          </motion.div>
        </motion.div>
      </div> {/* 关闭 flex wrapper */}

      {/* Bottom Controls (Outside Mirror) */}
      <div className="bottom-controls">
        {/* Nova Orb - Always show after INTRO */}
        {phase === 'CONVERSATION' && (
          <motion.div
            className="entity-visual-external"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <NovaOrbCanvas
              mode={isAISpeaking ? "SPEAKING" : "IDLE"}
              energy={isAISpeaking ? 0.8 : 0.3}
              particleCount={180}
              activeParticleCount={180}
              enableRotation={true}
              size={{ width: '100%', height: '100%' }}
            />
          </motion.div>
        )}

        {/* ========================================== */}
        {/* NEW INTERACTION CONTROLS */}
        {/* ========================================== */}
        {phase === 'CONVERSATION' && conversationSubState === 'CAMERA' && (
          <div className="voice-text-controls-container">

            {/* Input Mode Toggle */}
            <div className="input-mode-toggle">
              <button
                onClick={() => setInputMode('voice')}
                className={`mode-toggle-btn ${inputMode === 'voice' ? 'active' : ''}`}
              >
                VOICE
              </button>
              <button
                onClick={() => setInputMode('text')}
                className={`mode-toggle-btn ${inputMode === 'text' ? 'active' : ''}`}
              >
                TEXT
              </button>
            </div>

            {/* Controls */}
            {inputMode === 'voice' ? (
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={`mic-button ${isRecording ? 'recording' : ''}`}
              >
                <span className="mic-icon material-symbols-outlined">mic</span>
              </button>
            ) : (
              <div className="text-input-container">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                  placeholder="Type a message..."
                  className="text-input-field"
                />
                <button
                  onClick={handleSendText}
                  className="send-button"
                >
                  <span className="send-icon material-symbols-outlined">send</span>
                </button>
              </div>
            )}

            <div className="input-status-text">
              {inputMode === 'voice' ? (isRecording ? 'LISTENING...' : 'HOLD TO SPEAK') : 'TYPE TO CHAT'}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* REVIEWING State: RETAKE/CONFIRM Buttons */}
        {/* ========================================== */}
        {phase === 'CONVERSATION' && conversationSubState === 'REVIEWING' && (
          <motion.div
            className="review-controls"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <motion.button
              onClick={handleRetake}
              className="review-btn retake-btn-external"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="btn-icon">✕</span>
              <span className="btn-label">RETAKE</span>
            </motion.button>
            <motion.button
              onClick={handleConfirmPhoto}
              className="review-btn confirm-btn-external"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="btn-icon">✓</span>
              <span className="btn-label">CONFIRM</span>
            </motion.button>
          </motion.div>
        )}

        {/* ========================================== */}
        {/* GENERATING State: Progress Indicator */}
        {/* ========================================== */}
        {phase === 'CONVERSATION' && conversationSubState === 'GENERATING' && (
          <motion.div
            className="generation-progress"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="loading-spinner" />
            <p className="progress-text">Crafting your digital form...</p>
          </motion.div>
        )}

      </div>

    </div>
  )
}

export default Stage2Mirror
