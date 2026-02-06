/**
 * Gemini Live API Service - V2 重写版
 * 基于官方文档的最佳实践,专注于可靠性和简单性
 */

import { GoogleGenAI, Modality, MediaResolution } from '@google/genai'

class GeminiLiveService {
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      throw new Error('Gemini API key is required')
    }

    this.apiKey = apiKey
    this.ai = new GoogleGenAI({ apiKey })
    this.session = null
    this.isConnected = false

    // 音频录制相关
    this.audioContext = null
    this.mediaStream = null
    this.audioWorkletNode = null
    this.inputSource = null
    this.isRecording = false

    // 配置
    this.config = {
      model: options.model || 'models/gemini-2.5-flash-native-audio-preview-09-2025',
      voiceName: options.voiceName || 'Achird',
      ...options
    }

    // 回调函数
    this.onConnected = options.onConnected || null
    this.onError = options.onError || null
    this.onClosed = options.onClosed || null
    this.onAudio = options.onAudio || null
    this.onText = options.onText || null
    this.onLog = options.onLog || console.log

    console.log('[GeminiLive] Service initialized with model:', this.config.model)
  }

  /**
   * 连接到 Gemini Live API
   */
  async connect() {
    if (this.isConnected) {
      console.warn('[GeminiLive] Already connected')
      return
    }

    try {
      this.log('Connecting to Gemini Live API...')

      this.session = await this.ai.live.connect({
        model: this.config.model,
        config: {
          responseModalities: [Modality.AUDIO],
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.config.voiceName
              }
            }
          }
        },
        callbacks: {
          onopen: () => {
            this.log('✅ WebSocket opened')
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
            this.log(`🔌 WebSocket closed: ${event.reason}`)
            this.isConnected = false
            if (this.onClosed) this.onClosed(event)
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

    // 收集这一轮的所有音频块
    if (!this.currentTurnAudio) {
      this.currentTurnAudio = []
    }

    for (const part of parts) {
      // 处理音频
      if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
        this.currentTurnAudio.push({
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType
        })
        if (this.onAudio) {
          this.onAudio(part.inlineData.data, part.inlineData.mimeType)
        }
      }

      // 处理文本
      if (part.text) {
        this.log(`💬 AI: ${part.text}`)
        if (this.onText) {
          this.onText(part.text)
        }
      }
    }

    // 轮次完成,播放合并的音频
    if (turnComplete && this.currentTurnAudio.length > 0) {
      this.log(`🔊 Turn complete, playing ${this.currentTurnAudio.length} audio chunks`)
      this.playMergedAudio(this.currentTurnAudio)
      this.currentTurnAudio = []
    }
  }

  /**
   * 播放合并的音频
   */
  async playMergedAudio(audioChunks) {
    if (audioChunks.length === 0) return

    try {
      // 合并所有音频数据
      const mergedData = audioChunks.map(chunk => chunk.data).join('')
      const mimeType = audioChunks[0].mimeType

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
      audio.onended = () => URL.revokeObjectURL(url)
      audio.onerror = (e) => {
        this.log(`❌ Audio playback error: ${e}`)
        URL.revokeObjectURL(url)
      }
      await audio.play()
      this.log('🔊 Audio playing...')
    } catch (error) {
      this.log(`❌ Failed to play audio: ${error.message}`)
    }
  }

  /**
   * 开始录音
   */
  async startRecording() {
    if (!this.session || !this.isConnected) {
      throw new Error('Not connected to Gemini Live API')
    }

    if (this.isRecording) {
      this.log('⚠️ Already recording')
      return
    }

    try {
      this.log('🎤 Starting recording...')
      this.isRecording = true

      // 初始化 AudioContext
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000
        })
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      // 获取麦克风
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      this.inputSource = this.audioContext.createMediaStreamSource(this.mediaStream)

      // 加载 AudioWorklet
      if (!this.audioContext.audioWorklet.modules || this.audioContext.audioWorklet.modules.size === 0) {
        const workletCode = this.getAudioWorkletCode()
        const blob = new Blob([workletCode], { type: 'application/javascript' })
        const url = URL.createObjectURL(blob)
        await this.audioContext.audioWorklet.addModule(url)
        URL.revokeObjectURL(url)
      }

      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-processor')

      // 处理音频数据
      this.audioWorkletNode.port.onmessage = async (event) => {
        if (event.data.type === 'audio') {
          await this.sendAudioChunk(event.data.buffer)
        }
      }

      // 连接音频图
      this.inputSource.connect(this.audioWorkletNode)
      this.audioWorkletNode.connect(this.audioContext.destination)

      this.log('✅ Recording started')
    } catch (error) {
      this.log(`❌ Failed to start recording: ${error.message}`)
      this.isRecording = false
      throw error
    }
  }

  /**
   * 停止录音
   */
  async stopRecording() {
    if (!this.isRecording) {
      return
    }

    try {
      this.log('⏹️ Stopping recording...')

      // 断开音频节点
      if (this.audioWorkletNode) {
        this.audioWorkletNode.disconnect()
        this.audioWorkletNode = null
      }

      if (this.inputSource) {
        this.inputSource.disconnect()
        this.inputSource = null
      }

      // 停止媒体流
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop())
        this.mediaStream = null
      }

      // 🔥🔥🔥 关键修复: 使用 sendClientContent 标记轮次完成!
      // 这告诉 Gemini "用户说完了,该你回复了"
      await this.session.sendClientContent({
        turnComplete: true  // 这就是 Python 的 end_of_turn!
      })

      this.isRecording = false
      this.log('✅ Recording stopped, waiting for AI response...')
    } catch (error) {
      this.log(`❌ Failed to stop recording: ${error.message}`)
    }
  }

  /**
   * 发送音频块
   */
  async sendAudioChunk(arrayBuffer) {
    if (!this.session || !this.isRecording) return

    try {
      const mimeType = `audio/pcm;rate=${this.audioContext.sampleRate}`
      const audioBlob = new Blob([arrayBuffer], { type: mimeType })

      await this.session.sendRealtimeInput({
        audio: audioBlob
      })
    } catch (error) {
      // 静默失败,避免刷屏
    }
  }

  /**
   * 关闭连接
   */
  close() {
    this.log('Closing connection...')

    if (this.isRecording) {
      this.stopRecording()
    }

    if (this.session) {
      this.session.close()
      this.session = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.isConnected = false
    this.log('✅ Connection closed')
  }

  /**
   * AudioWorklet 代码
   */
  getAudioWorkletCode() {
    return `
      class AudioProcessor extends AudioWorkletProcessor {
        constructor() {
          super()
          this.bufferSize = 4096
          this.buffer = new Int16Array(this.bufferSize)
          this.bufferIndex = 0
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0]
          if (input.length > 0) {
            const inputChannel = input[0]

            for (let i = 0; i < inputChannel.length; i++) {
              // 转换为 Int16
              const sample = Math.max(-1, Math.min(1, inputChannel[i]))
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
            this.port.postMessage({
              type: 'audio',
              buffer: data.buffer
            })
            this.bufferIndex = 0
          }
        }
      }
      registerProcessor('audio-processor', AudioProcessor)
    `
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

    // RIFF chunk
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

  log(message) {
    const timestamp = new Date().toLocaleTimeString()
    const logMessage = `[${timestamp}] [GeminiLive] ${message}`
    console.log(logMessage)
    if (this.onLog) {
      this.onLog(message)
    }
  }
}

export default GeminiLiveService
