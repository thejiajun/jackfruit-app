/**
 * 【服务模块】OpenAI Realtime API 服务 - 实时多模态对话引擎
 *
 * 产品价值:
 * 1. 实现"AI 能听到你、看到你、和你对话"的沉浸式交互体验
 * 2. 替代传统的表单填写,用自然对话收集用户信息
 * 3. 支持实时音频流输入输出(麦克风 → AI → 扬声器)
 * 4. 支持图片输入(相机视频帧 → AI 视觉理解)
 *
 * 技术实现:
 * - 基于 OpenAI Realtime API 的 WebSocket 双向通信
 * - 音频:实时流式输入输出,PCM16, 24000 Hz (与浏览器原生兼容)
 * - 图片:通过 conversation.item.create + input_image 发送 base64 编码图片
 * - 推荐模型: gpt-4o-realtime-preview-2024-12-17 (支持音频 + 视觉输入)
 *
 * 参考文档:
 * - https://platform.openai.com/docs/guides/realtime
 * - https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/realtime-audio
 */

class OpenAIRealtimeService {
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required')
    }

    this.apiKey = apiKey
    this.ws = null                   // WebSocket 连接对象
    this.isConnected = false          // WebSocket 连接状态
    this.responseQueue = []           // AI 返回的消息队列

    // Audio Context & Processing
    this.audioContext = null
    this.mediaStream = null
    this.audioWorkletNode = null
    this.inputSource = null
    this.workletModuleLoaded = false

    // Audio playback queue (for handling streaming audio)
    this.audioPlaybackQueue = []
    this.isPlayingAudio = false

    // === 事件回调函数(业务层注册) ===
    this.onMessageCallback = options.onMessage || null
    this.onAudioCallback = options.onAudio || null
    this.onTextCallback = options.onText || null
    this.onErrorCallback = options.onError || null
    this.onConnectedCallback = options.onConnected || null
    this.onClosedCallback = options.onClosed || null

    // === OpenAI Realtime 配置参数 ===
    this.config = {
      // 使用最新公开的 Realtime 预览模型，避免旧版本被下线
      model: options.model || 'gpt-4o-realtime-preview-2024-12-17',
      voice: options.voice || 'alloy', // alloy, echo, fable, onyx, nova, shimmer
      temperature: options.temperature || 0.8,
      // 如果提供 prompt 且未显式传入 instructions，则保持为空，避免覆盖远端 prompt 配置
      instructions: options.instructions !== undefined
        ? options.instructions
        : (options.prompt ? null
          : "You are a helpful voice assistant named Pika. Always respond with natural conversational speech in the same language as the user. Keep responses concise (1-2 sentences). Be friendly and supportive."),
      // ✅ 支持 server-stored prompt（prompt.id + 可选 version/variables)，与官方示例一致
      prompt: options.prompt || null,
      // ✅ 是否启用视觉输入（当前 gpt-realtime 仅支持 text/audio，默认关闭）
      enableVision: options.enableVision || false,
      turnDetection: options.turnDetection !== false ? {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 200
      } : null,
      ...options.config
    }

    console.log('[OpenAIRealtime] Service initialized', {
      model: this.config.model,
      voice: this.config.voice
    })
  }

  /**
   * 【核心方法】建立与 OpenAI Realtime API 的 WebSocket 连接
   */
  async connect() {
    if (this.isConnected) {
      console.warn('[OpenAIRealtime] Already connected')
      return
    }

    try {
      console.log('[OpenAIRealtime] Connecting...')

      // === 构建 WebSocket URL ===
      const url = `wss://api.openai.com/v1/realtime?model=${this.config.model}`

      // === 创建 WebSocket 连接（使用 subprotocols 进行认证） ===
      this.ws = new WebSocket(url, [
        'realtime',
        // 必须传递 beta 协议字符串以替代 `OpenAI-Beta: realtime=v1` 头，否则连接会被拒绝
        'openai-beta.realtime-v1',
        `openai-insecure-api-key.${this.apiKey}`,
        // 可选: 添加 organization 和 project ID
        // `openai-organization.${OPENAI_ORG_ID}`,
        // `openai-project.${OPENAI_PROJECT_ID}`
      ])

      // === 注册 WebSocket 生命周期回调 ===
      this.ws.addEventListener('open', () => {
        console.log('[OpenAIRealtime] ✅ WebSocket connected')
        this.isConnected = true

        // 立即发送 session.update 配置会话
        this.updateSession()

        if (this.onConnectedCallback) {
          this.onConnectedCallback()
        }
      })

      this.ws.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data)
          // console.log('[OpenAIRealtime] 📨 Message:', message.type)
          this.handleServerEvent(message)
        } catch (error) {
          console.error('[OpenAIRealtime] Failed to parse message:', error)
        }
      })

      this.ws.addEventListener('error', (error) => {
        console.error('[OpenAIRealtime] ❌ WebSocket error:', error)
        if (this.onErrorCallback) {
          this.onErrorCallback(error)
        }
      })

      this.ws.addEventListener('close', (event) => {
        console.log('[OpenAIRealtime] 🔌 WebSocket closed:', event.reason)
        this.isConnected = false
        if (this.onClosedCallback) {
          this.onClosedCallback(event)
        }
      })

    } catch (error) {
      console.error('[OpenAIRealtime] Failed to connect:', error)
      this.isConnected = false
      throw error
    }
  }

  /**
   * 【配置会话】发送 session.update 事件配置 AI 行为
   */
  updateSession() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[OpenAIRealtime] Cannot update session: WebSocket not open')
      return
    }

    const sessionConfig = {
      type: 'session.update',
      session: {
        // 默认仅 text/audio；若显式开启 enableVision，再添加 vision
        modalities: this.config.enableVision ? ['text', 'audio', 'vision'] : ['text', 'audio'],
        ...(this.config.instructions ? { instructions: this.config.instructions } : {}),
        voice: this.config.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: this.config.turnDetection,
        temperature: this.config.temperature,
        // 如果提供了远端 prompt ID/版本/变量，则直接附带
        ...(this.config.prompt ? { prompt: this.config.prompt } : {})
      }
    }

    console.log('[OpenAIRealtime] 🔧 Updating session:', sessionConfig.session)
    this.sendEvent(sessionConfig)
  }

  /**
   * 【消息处理】处理从 WebSocket 收到的服务器事件
   */
  handleServerEvent(event) {
    // 📨 打印所有事件（调试用，帮助发现未处理的事件类型）
    console.log(`[OpenAIRealtime] 📨 Event: ${event.type}`, event)

    // 添加到响应队列
    this.responseQueue.push(event)

    // 触发通用回调
    if (this.onMessageCallback) {
      this.onMessageCallback(event)
    }

    // 根据事件类型分发处理
    switch (event.type) {
      case 'session.created':
      case 'session.updated':
        console.log('[OpenAIRealtime] Session configured:', event.session)
        break

      case 'conversation.item.created':
        // 新的对话项被创建（用户或助手消息）
        this.handleConversationItem(event.item)
        break

      case 'response.audio.delta':
        // 接收音频流数据
        this.handleAudioDelta(event.delta)
        break

      case 'response.audio_transcript.delta':
        // 接收音频的文本转录（增量）
        this.handleTranscriptDelta(event.delta)
        break

      case 'response.text.delta':
        // 接收纯文本响应（增量）
        this.handleTextDelta(event.delta)
        break

      case 'response.done':
        // 响应完成
        console.log('[OpenAIRealtime] Response completed')
        break

      case 'input_audio_buffer.speech_started':
        console.log('[OpenAIRealtime] 🎤 Speech detected')
        break

      case 'input_audio_buffer.speech_stopped':
        console.log('[OpenAIRealtime] 🎤 Speech ended')
        break

      case 'conversation.item.input_audio_transcription.completed':
        // 用户音频转录完成
        if (event.transcript) {
          console.log('[OpenAIRealtime] 📝 User transcript:', event.transcript)
          if (this.onTextCallback) {
            this.onTextCallback(event.transcript, 'user')
          }
        }
        break

      case 'error':
        // 详细打印错误信息（不只是 Object）
        console.error('[OpenAIRealtime] ❌ Server error details:', {
          type: event.error?.type,
          code: event.error?.code,
          message: event.error?.message,
          param: event.error?.param,
          event_id: event.error?.event_id,
          full: JSON.stringify(event.error, null, 2)
        })
        if (this.onErrorCallback) {
          this.onErrorCallback(event.error)
        }
        break

      default:
        // ⚠️ 打印未处理的事件类型（可能包含重要的文本响应或其他信息）
        console.warn('[OpenAIRealtime] ⚠️ Unhandled event type:', event.type, event)
        break
    }
  }

  /**
   * 处理对话项（conversation.item.created）
   */
  handleConversationItem(item) {
    // 📦 打印原始数据结构（调试用）
    console.log('[OpenAIRealtime] 📦 Conversation item:', {
      role: item.role,
      type: item.type,
      content: item.content,
      status: item.status
    })

    if (item.role === 'assistant' && item.content) {
      for (const content of item.content) {
        console.log('[OpenAIRealtime] 📝 Content item:', {
          type: content.type,
          hasText: !!content.text,
          text: content.text?.substring(0, 100) // 只显示前 100 字符
        })

        // 支持多种文本类型（text, input_text, output_text）
        if ((content.type === 'text' ||
             content.type === 'input_text' ||
             content.type === 'output_text') &&
            content.text) {
          console.log('[OpenAIRealtime] 💬 Assistant text:', content.text)
          if (this.onTextCallback) {
            this.onTextCallback(content.text, 'assistant')
          }
        }
      }
    } else {
      console.log('[OpenAIRealtime] ⚠️ Item 不符合预期格式 (role 或 content 缺失)')
    }
  }

  /**
   * 处理音频增量（response.audio.delta）
   */
  handleAudioDelta(delta) {
    if (!delta) return

    // delta 是 base64 编码的 PCM16 音频数据
    // console.log('[OpenAIRealtime] 🔊 Audio delta received')

    if (this.onAudioCallback) {
      this.onAudioCallback(delta, 'audio/pcm;rate=24000')
    }

    // 添加到播放队列
    this.queueAudioForPlayback(delta)
  }

  /**
   * 处理文本转录增量（response.audio_transcript.delta）
   */
  handleTranscriptDelta(delta) {
    if (!delta) return

    console.log('[OpenAIRealtime] 💬 Transcript delta:', delta)
    if (this.onTextCallback) {
      this.onTextCallback(delta, 'assistant')
    }
  }

  /**
   * 处理纯文本增量（response.text.delta）
   */
  handleTextDelta(delta) {
    if (!delta) return

    console.log('[OpenAIRealtime] 💬 Text delta:', delta)
    if (this.onTextCallback) {
      this.onTextCallback(delta, 'assistant')
    }
  }

  /**
   * 【音频播放队列】累积音频数据并播放
   */
  queueAudioForPlayback(base64Audio) {
    this.audioPlaybackQueue.push(base64Audio)

    // 如果当前没有正在播放，开始播放
    if (!this.isPlayingAudio) {
      this.playNextAudioChunk()
    }
  }

  async playNextAudioChunk() {
    if (this.audioPlaybackQueue.length === 0) {
      this.isPlayingAudio = false
      return
    }

    this.isPlayingAudio = true
    const base64Audio = this.audioPlaybackQueue.shift()

    try {
      await this.playAudio(base64Audio, 'audio/pcm;rate=24000')
    } catch (error) {
      console.error('[OpenAIRealtime] Audio playback error:', error)
    }

    // 播放下一个
    this.playNextAudioChunk()
  }

  /**
   * 【音频播放】将 PCM16 数据转换为 WAV 并播放
   */
  async playAudio(base64Data, mimeType) {
    try {
      // 解码 base64 → Uint8Array
      const binaryString = atob(base64Data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // 添加 WAV 头
      const wavBuffer = this.addWavHeader(bytes.buffer, mimeType)

      // 创建 Blob 和 URL
      const blob = new Blob([wavBuffer], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)

      // 播放音频
      const audio = new Audio(url)

      return new Promise((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(url)
          resolve()
        }

        audio.onerror = (error) => {
          console.error('[OpenAIRealtime] Audio element error:', error)
          URL.revokeObjectURL(url)
          reject(error)
        }

        audio.play().catch(reject)
      })
    } catch (error) {
      console.error('[OpenAIRealtime] Failed to play audio:', error)
      throw error
    }
  }

  /**
   * 【开始录音】使用 AudioWorklet 实时流式发送音频
   */
  async startRecording() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[OpenAIRealtime] Cannot start recording: WebSocket not connected')
      return
    }

    try {
      console.log('[OpenAIRealtime] Starting audio recording...')

      // 初始化 AudioContext
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000 // OpenAI Realtime 使用 24kHz
        })
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      console.log('[OpenAIRealtime] AudioContext sampleRate:', this.audioContext.sampleRate)

      // 获取麦克风流
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      // 创建音频源
      this.inputSource = this.audioContext.createMediaStreamSource(this.mediaStream)

      // 加载 AudioWorklet 模块
      if (!this.workletModuleLoaded) {
        const workletCode = `
          class PCMProcessor extends AudioWorkletProcessor {
            constructor() {
              super()
              this.bufferSize = 4096
              this.buffer = new Float32Array(this.bufferSize)
              this.bufferIndex = 0
            }

            process(inputs, outputs, parameters) {
              const input = inputs[0]
              if (input.length > 0) {
                const inputChannel = input[0]

                for (let i = 0; i < inputChannel.length; i++) {
                  this.buffer[this.bufferIndex++] = inputChannel[i]

                  if (this.bufferIndex >= this.bufferSize) {
                    this.flush()
                  }
                }
              }
              return true
            }

            flush() {
              if (this.bufferIndex > 0) {
                // 转换为 Int16 PCM
                const int16Data = new Int16Array(this.bufferIndex)
                for (let i = 0; i < this.bufferIndex; i++) {
                  const s = Math.max(-1, Math.min(1, this.buffer[i]))
                  int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
                }

                this.port.postMessage(int16Data.buffer)
                this.bufferIndex = 0
              }
            }
          }
          registerProcessor('pcm-processor', PCMProcessor)
        `
        const blob = new Blob([workletCode], { type: 'application/javascript' })
        const workletUrl = URL.createObjectURL(blob)

        await this.audioContext.audioWorklet.addModule(workletUrl)
        this.workletModuleLoaded = true
        URL.revokeObjectURL(workletUrl)
      }

      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor')

      // 接收音频数据并发送到 OpenAI
      this.audioWorkletNode.port.onmessage = (event) => {
        const pcmBuffer = event.data
        this.sendAudioChunk(pcmBuffer)
      }

      // 连接音频图
      this.inputSource.connect(this.audioWorkletNode)
      this.audioWorkletNode.connect(this.audioContext.destination)

      console.log('[OpenAIRealtime] 🎤 Recording started')
    } catch (error) {
      console.error('[OpenAIRealtime] Failed to start recording:', error)
      throw error
    }
  }

  /**
   * 【发送音频数据】发送 input_audio_buffer.append 事件
   */
  sendAudioChunk(arrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    try {
      // 转换为 base64
      const int16Array = new Int16Array(arrayBuffer)
      const uint8Array = new Uint8Array(int16Array.buffer)
      let binary = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i])
      }
      const base64 = btoa(binary)

      // 发送事件
      this.sendEvent({
        type: 'input_audio_buffer.append',
        audio: base64
      })
    } catch (error) {
      // 静默失败，避免刷屏
      // console.error('[OpenAIRealtime] Failed to send audio chunk:', error)
    }
  }

  /**
   * 【停止录音】停止音频采集
   */
  async stopRecording() {
    console.log('[OpenAIRealtime] Stopping recording...')

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect()
      this.audioWorkletNode = null
    }

    if (this.inputSource) {
      this.inputSource.disconnect()
      this.inputSource = null
    }

    // 提交音频缓冲区（告诉 AI 用户说完了）
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendEvent({
        type: 'input_audio_buffer.commit'
      })

      // 如果 turn detection 关闭，需要手动触发响应
      if (!this.config.turnDetection) {
        this.sendEvent({
          type: 'response.create'
        })
      }
    }

    console.log('[OpenAIRealtime] ⏹️ Recording stopped')
  }

  /**
   * 【发送文本消息】创建对话项并触发响应
   */
  async sendText(text) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    try {
      console.log('[OpenAIRealtime] Sending text:', text)

      // 创建用户消息
      this.sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: text
            }
          ]
        }
      })

      // 触发响应
      this.sendEvent({
        type: 'response.create'
      })

      console.log('[OpenAIRealtime] ✅ Text sent')
    } catch (error) {
      console.error('[OpenAIRealtime] Failed to send text:', error)
      throw error
    }
  }

  /**
   * 【发送视频帧/图片】通过 conversation.item.create 发送图片给 AI
   * OpenAI Realtime API 支持图片输入（gpt-realtime, gpt-realtime-mini 模型）
   *
   * @param {string} imageData - Data URI 格式的图片 (data:image/jpeg;base64,...)
   * @param {string} mimeType - 图片 MIME 类型 (用于日志，实际使用 imageData 中的格式)
   */
  async sendVideoFrame(imageData, mimeType = 'image/jpeg') {
    // 当前模型默认不支持图片输入，除非显式开启 enableVision
    if (!this.config.enableVision) {
      console.warn('[OpenAIRealtime] Image input skipped: enableVision=false or model not supporting vision')
      return
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[OpenAIRealtime] Cannot send image: WebSocket not connected')
      return
    }

    if (!imageData || !imageData.startsWith('data:image/')) {
      console.error('[OpenAIRealtime] Invalid imageData format. Expected data URI (data:image/...;base64,...)')
      return
    }

    // 发送图片消息
    this.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_image',
            image_url: imageData
          }
        ]
      }
    })

    console.log('[OpenAIRealtime] 🖼️ Image frame sent')
  }

  /**
   * 【发送事件】通用方法，发送 JSON 事件到 WebSocket
   */
  sendEvent(event) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[OpenAIRealtime] Cannot send event: WebSocket not open')
      return
    }

    try {
      this.ws.send(JSON.stringify(event))
    } catch (error) {
      console.error('[OpenAIRealtime] Failed to send event:', error)
    }
  }

  /**
   * 【WAV 文件头】为 PCM 数据添加 WAV 头
   */
  addWavHeader(audioData, mimeType) {
    const options = this.parseMimeType(mimeType)
    const dataLength = audioData.byteLength
    const { numChannels, sampleRate, bitsPerSample } = options

    const byteRate = sampleRate * numChannels * bitsPerSample / 8
    const blockAlign = numChannels * bitsPerSample / 8

    const buffer = new ArrayBuffer(44 + dataLength)
    const view = new DataView(buffer)

    // RIFF chunk descriptor
    this.writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + dataLength, true)
    this.writeString(view, 8, 'WAVE')

    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitsPerSample, true)

    // data sub-chunk
    this.writeString(view, 36, 'data')
    view.setUint32(40, dataLength, true)

    // Copy audio data
    const audioBytes = new Uint8Array(audioData)
    const finalBytes = new Uint8Array(buffer)
    finalBytes.set(audioBytes, 44)

    return buffer
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  parseMimeType(mimeType) {
    const [fileType, ...params] = (mimeType || '').split(';').map(s => s.trim())
    const [_, format] = fileType.split('/')

    const options = {
      numChannels: 1,
      sampleRate: 24000,
      bitsPerSample: 16,
    }

    if (format && format.startsWith('L')) {
      const bits = parseInt(format.slice(1), 10)
      if (!isNaN(bits)) {
        options.bitsPerSample = bits
      }
    }

    for (const param of params) {
      const [key, value] = param.split('=').map(s => s.trim())
      if (key === 'rate') {
        options.sampleRate = parseInt(value, 10)
      }
    }

    return options
  }

  /**
   * 【关闭连接】清理所有资源
   */
  close() {
    console.log('[OpenAIRealtime] Closing connection...')

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.stopRecording()

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.isConnected = false
    this.responseQueue = []
    this.audioPlaybackQueue = []

    console.log('[OpenAIRealtime] ✅ Connection closed')
  }

  /**
   * 【状态查询】检查 WebSocket 是否已连接
   */
  get connected() {
    return this.isConnected
  }
}

export default OpenAIRealtimeService
