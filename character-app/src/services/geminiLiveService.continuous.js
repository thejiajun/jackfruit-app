/**
 * Gemini Live API - 持续音频+视频流版本
 * 基于官方文档: https://ai.google.dev/gemini-api/docs/live
 *
 * 特性:
 * - 持续音频流 (不需要按住按钮)
 * - 实时视频帧发送 (0.5 FPS)
 * - 自动语音活动检测 (VAD)
 * - 自动播放 AI 响应
 */

import { GoogleGenAI, Modality } from '@google/genai'

class GeminiLiveContinuous {
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      throw new Error('Gemini API key is required')
    }

    this.apiKey = apiKey
    this.ai = new GoogleGenAI({ apiKey })
    this.session = null
    this.isConnected = false

    // 音频相关
    this.audioContext = null
    this.mediaStream = null
    this.audioWorkletNode = null
    this.inputSource = null
    this.isStreaming = false

    // 视频相关
    this.videoStream = null
    this.videoElement = null
    this.videoInterval = null

    // 音频播放
    this.audioQueue = []
    this.isPlaying = false

    // 配置
    this.config = {
      model: options.model || 'models/gemini-2.5-flash-native-audio-preview-09-2025',
      voiceName: options.voiceName || 'Achird',
      enableVideo: options.enableVideo !== false, // 默认启用视频
      videoFPS: options.videoFPS || 0.5, // 每秒发送 0.5 帧 (2秒一帧)
      ...options
    }

    // 回调
    this.onConnected = options.onConnected || null
    this.onDisconnected = options.onDisconnected || null
    this.onError = options.onError || null
    this.onAudioReceived = options.onAudioReceived || null
    this.onTextReceived = options.onTextReceived || null
    this.onLog = options.onLog || console.log

    this.log('Service initialized')
  }

  /**
   * 连接到 Gemini Live API
   */
  async connect() {
    if (this.isConnected) {
      this.log('Already connected')
      return
    }

    try {
      this.log('Connecting to Gemini Live API...')

      this.session = await this.ai.live.connect({
        model: this.config.model,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.config.voiceName
              }
            }
          },
          // 🔥 关键: 启用自动语音活动检测
          // 这样就不需要手动调用 turnComplete 了
          realtimeInputConfig: {
            automaticActivityDetection: {}
          }
        },
        callbacks: {
          onopen: () => {
            this.log('✅ WebSocket connected')
            this.isConnected = true
            if (this.onConnected) this.onConnected()
          },
          onmessage: (message) => {
            this.handleMessage(message)
          },
          onerror: (error) => {
            this.log(`❌ WebSocket error: ${error.message}`)
            if (this.onError) this.onError(error)
          },
          onclose: (event) => {
            this.log(`🔌 WebSocket closed: ${event.reason || 'Unknown'}`)
            this.isConnected = false
            if (this.onDisconnected) this.onDisconnected(event)
          }
        }
      })

      this.log('✅ Session created')
    } catch (error) {
      this.log(`❌ Connection failed: ${error.message}`)
      this.isConnected = false
      throw error
    }
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(message) {
    const parts = message.serverContent?.modelTurn?.parts || []
    const turnComplete = message.serverContent?.turnComplete === true

    // 收集音频数据
    for (const part of parts) {
      if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
        this.audioQueue.push({
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType
        })
        if (this.onAudioReceived) {
          this.onAudioReceived(part.inlineData.data, part.inlineData.mimeType)
        }
      }

      if (part.text) {
        this.log(`💬 AI: ${part.text}`)
        if (this.onTextReceived) {
          this.onTextReceived(part.text)
        }
      }
    }

    // 轮次完成,播放音频
    if (turnComplete && this.audioQueue.length > 0) {
      this.log(`🔊 Turn complete, playing audio (${this.audioQueue.length} chunks)`)
      this.playQueuedAudio()
    }
  }

  /**
   * 开始音频+视频流
   */
  async startStream(videoElement = null) {
    if (this.isStreaming) {
      this.log('Already streaming')
      return
    }

    try {
      this.log('🎬 Starting audio+video stream...')

      // 1. 启动音频流
      await this.startAudioStream()

      // 2. 启动视频流 (如果启用)
      if (this.config.enableVideo && videoElement) {
        this.videoElement = videoElement
        await this.startVideoStream()
      }

      this.isStreaming = true
      this.log('✅ Stream started')
    } catch (error) {
      this.log(`❌ Failed to start stream: ${error.message}`)
      throw error
    }
  }

  /**
   * 启动音频流
   */
  async startAudioStream() {
    // 初始化 AudioContext
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000
    })

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    // 获取麦克风
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    this.inputSource = this.audioContext.createMediaStreamSource(this.mediaStream)

    // 加载 AudioWorklet
    const workletCode = `
      class AudioProcessor extends AudioWorkletProcessor {
        constructor() {
          super()
          this.bufferSize = 4096
          this.buffer = new Int16Array(this.bufferSize)
          this.bufferIndex = 0
        }

        process(inputs) {
          const input = inputs[0]
          if (input.length > 0) {
            const channel = input[0]
            for (let i = 0; i < channel.length; i++) {
              const sample = Math.max(-1, Math.min(1, channel[i]))
              this.buffer[this.bufferIndex++] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
              if (this.bufferIndex >= this.bufferSize) {
                this.flush()
              }
            }
          }
          return true
        }

        flush() {
          if (this.bufferIndex > 0) {
            const data = new Int16Array(this.buffer.slice(0, this.bufferIndex))
            this.port.postMessage({ type: 'audio', buffer: data.buffer })
            this.bufferIndex = 0
          }
        }
      }
      registerProcessor('audio-processor', AudioProcessor)
    `

    const blob = new Blob([workletCode], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    await this.audioContext.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)

    this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-processor')

    // 处理音频数据
    this.audioWorkletNode.port.onmessage = async (event) => {
      if (event.data.type === 'audio') {
        await this.sendAudio(event.data.buffer)
      }
    }

    // 连接音频图
    this.inputSource.connect(this.audioWorkletNode)
    this.audioWorkletNode.connect(this.audioContext.destination)

    this.log('🎤 Audio stream started')
  }

  /**
   * 启动视频流
   */
  async startVideoStream() {
    if (!this.videoElement) {
      throw new Error('Video element is required')
    }

    // 获取摄像头
    this.videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      }
    })

    this.videoElement.srcObject = this.videoStream
    await this.videoElement.play()

    // 定期捕获并发送视频帧
    const intervalMs = 1000 / this.config.videoFPS
    this.videoInterval = setInterval(() => {
      this.captureAndSendVideoFrame()
    }, intervalMs)

    this.log(`📹 Video stream started (${this.config.videoFPS} FPS)`)
  }

  /**
   * 捕获并发送视频帧
   */
  async captureAndSendVideoFrame() {
    if (!this.videoElement || !this.session || !this.isConnected) return

    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1024
      canvas.height = 768
      const ctx = canvas.getContext('2d')
      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height)

      // 转换为 JPEG Blob
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.8)
      })

      if (blob) {
        await this.session.sendRealtimeInput({ video: blob })
      }
    } catch (error) {
      // 静默失败,避免刷屏
    }
  }

  /**
   * 发送音频数据
   */
  async sendAudio(arrayBuffer) {
    if (!this.session || !this.isConnected) return

    try {
      const mimeType = `audio/pcm;rate=${this.audioContext.sampleRate}`
      const audioBlob = new Blob([arrayBuffer], { type: mimeType })
      await this.session.sendRealtimeInput({ audio: audioBlob })
    } catch (error) {
      // 静默失败
    }
  }

  /**
   * 停止流
   */
  async stopStream() {
    if (!this.isStreaming) return

    try {
      this.log('⏹️ Stopping stream...')

      // 停止视频
      if (this.videoInterval) {
        clearInterval(this.videoInterval)
        this.videoInterval = null
      }

      if (this.videoStream) {
        this.videoStream.getTracks().forEach(track => track.stop())
        this.videoStream = null
      }

      if (this.videoElement) {
        this.videoElement.srcObject = null
      }

      // 停止音频
      if (this.audioWorkletNode) {
        this.audioWorkletNode.disconnect()
        this.audioWorkletNode = null
      }

      if (this.inputSource) {
        this.inputSource.disconnect()
        this.inputSource = null
      }

      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop())
        this.mediaStream = null
      }

      this.isStreaming = false
      this.log('✅ Stream stopped')
    } catch (error) {
      this.log(`❌ Failed to stop stream: ${error.message}`)
    }
  }

  /**
   * 播放队列中的音频
   */
  async playQueuedAudio() {
    if (this.audioQueue.length === 0 || this.isPlaying) return

    this.isPlaying = true

    try {
      // 合并所有音频块
      const mergedData = this.audioQueue.map(chunk => chunk.data).join('')
      const mimeType = this.audioQueue[0].mimeType

      // 清空队列
      this.audioQueue = []

      // 解码 base64
      const binaryString = atob(mergedData)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // 添加 WAV 头
      const wavBuffer = this.addWavHeader(bytes.buffer, mimeType)
      const blob = new Blob([wavBuffer], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)

      // 播放
      const audio = new Audio(url)
      audio.onended = () => {
        URL.revokeObjectURL(url)
        this.isPlaying = false
        this.log('🔊 Audio playback finished')
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        this.isPlaying = false
      }

      await audio.play()
      this.log('🔊 Playing audio...')
    } catch (error) {
      this.log(`❌ Failed to play audio: ${error.message}`)
      this.isPlaying = false
    }
  }

  /**
   * 添加 WAV 文件头
   */
  addWavHeader(audioData, mimeType) {
    const options = this.parseMimeType(mimeType)
    const dataLength = audioData.byteLength
    const { numChannels, sampleRate, bitsPerSample } = options

    const byteRate = sampleRate * numChannels * bitsPerSample / 8
    const blockAlign = numChannels * bitsPerSample / 8

    const buffer = new ArrayBuffer(44 + dataLength)
    const view = new DataView(buffer)

    this.writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + dataLength, true)
    this.writeString(view, 8, 'WAVE')

    this.writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitsPerSample, true)

    this.writeString(view, 36, 'data')
    view.setUint32(40, dataLength, true)

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
      if (!isNaN(bits)) options.bitsPerSample = bits
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
   * 关闭连接
   */
  close() {
    this.log('Closing connection...')

    this.stopStream()

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    if (this.session) {
      this.session.close()
      this.session = null
    }

    this.isConnected = false
    this.audioQueue = []
    this.log('✅ Connection closed')
  }

  log(message) {
    const timestamp = new Date().toLocaleTimeString()
    const logMessage = `[${timestamp}] [GeminiLive] ${message}`
    console.log(logMessage)
    if (this.onLog) this.onLog(message)
  }
}

export default GeminiLiveContinuous
