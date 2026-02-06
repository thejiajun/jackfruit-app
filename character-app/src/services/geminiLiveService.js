/**
 * 【服务模块】Gemini Live API 服务 - 实时音视频对话引擎
 *
 * 产品价值:
 * 1. 实现"AI 能看到你、听到你、和你对话"的沉浸式交互体验
 * 2. 替代传统的表单填写,用自然对话收集用户信息
 * 3. 支持同时发送视频帧(0.5 FPS)和音频流,AI 实时理解用户环境和情绪
 *
 * 技术实现:
 * - 基于 Google @google/genai SDK 的 WebSocket 双向通信
 * - 音频:实时流式输入输出(麦克风 → AI → 扬声器)
 * - 视频:定期发送摄像头帧(Canvas 截图 → base64 JPEG → Gemini)
 * - 模型:gemini-2.5-flash-native-audio-preview(支持原生音频理解和生成)
 *
 * 参考文档: https://github.com/googleapis/js-genai
 */

import { GoogleGenAI, Modality, MediaResolution } from '@google/genai'

class GeminiLiveService {
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      throw new Error('Gemini API key is required')
    }

    this.apiKey = apiKey
    this.ai = new GoogleGenAI({ apiKey })
    this.session = null              // WebSocket 会话对象
    this.responseQueue = []           // AI 返回的消息队列(用于异步处理)
    this.audioParts = []              // 收到的音频数据片段
    this.audioMimeType = null         // 🔥 当前音频的 MIME 类型
    this.isConnected = false          // WebSocket 连接状态

    // Audio Context & Processing
    this.audioContext = null
    this.mediaStream = null
    this.audioProcessor = null
    this.audioWorkletNode = null
    this.inputSource = null
    this.workletModuleLoaded = false  // 🔥 防止重复注册 AudioWorklet
    this.recordedAudioChunks = []     // 🔥 累积录制的音频数据

    // === 事件回调函数(业务层注册) ===
    this.onMessageCallback = options.onMessage || null     // 收到任何消息时触发
    this.onAudioCallback = options.onAudio || null         // 收到音频数据时触发
    this.onTextCallback = options.onText || null           // 收到文本数据时触发
    this.onErrorCallback = options.onError || null         // 连接出错时触发
    this.onConnectedCallback = options.onConnected || null // 连接成功时触发
    this.onClosedCallback = options.onClosed || null       // 连接关闭时触发

    // === Gemini Live 配置参数 ===
    this.config = {
      model: options.model || 'models/gemini-2.5-flash-native-audio-preview-09-2025', // AI 模型(原生音频版)
      voiceName: options.voiceName || 'Zephyr',                // AI 语音角色(Zephyr 男声 / Achird 女声)
      responseModalities: options.responseModalities || [Modality.AUDIO],   // 返回模式:仅音频(Native Audio 模型限制)
      temperature: options.temperature || 0.9,                 // 创造性参数(0-1,越高越随机)
      ...options.config
    }
    this.onLog = options.onLog || console.log // 日志回调

    console.log('[GeminiLive] Service initialized', {
      model: this.config.model,
      voiceName: this.config.voiceName,
      responseModalities: this.config.responseModalities
    })
  }

  /**
   * 【核心方法】建立与 Gemini Live API 的 WebSocket 连接
   */
  async connect() {
    if (this.isConnected) {
      console.warn('[GeminiLive] Already connected')
      return
    }

    try {
      console.log('[GeminiLive] Connecting...')

      // === 构建 Gemini Live 会话配置 ===
      const sessionConfig = {
        responseModalities: this.config.responseModalities,
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.config.voiceName
            }
          }
        },
        contextWindowCompression: {
          triggerTokens: '25600',
          slidingWindow: { targetTokens: '12800' },
        },
        // 🔥 关键修复:添加 systemInstruction 告诉 Gemini 用语音回复
        systemInstruction: {
          parts: [{
            text: "You are a helpful voice assistant named Pika. Always respond with natural conversational speech in the same language as the user. Keep responses concise (1-2 sentences). Be friendly and supportive."
          }]
        }
      }

      console.log('[GeminiLive] 🔍 Model:', this.config.model)
      console.log('[GeminiLive] 🔍 responseModalities:', sessionConfig.responseModalities)
      console.log('[GeminiLive] 🔍 mediaResolution:', sessionConfig.mediaResolution)
      console.log('[GeminiLive] 🔍 voiceName:', sessionConfig.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName)

      // === 创建 WebSocket 会话并注册生命周期回调 ===
      this.session = await this.ai.live.connect({
        model: this.config.model,
        config: sessionConfig,
        callbacks: {
          // 【回调 1】WebSocket 连接成功
          onopen: () => {
            console.log('[GeminiLive] ✅ Connected')
            this.isConnected = true
            if (this.onConnectedCallback) {
              this.onConnectedCallback()  // 通知业务层可以开始发送音视频了
            }
          },
          // 【回调 2】收到 AI 返回的消息(音频/文本)
          onmessage: (message) => {
            // console.log('[GeminiLive] 📨 Message received:', message)
            this.handleMessage(message)  // 解析消息,触发 onText/onAudio 回调
          },
          // 【回调 3】连接出错(网络断开/API 错误等)
          onerror: (error) => {
            console.error('[GeminiLive] ❌ Error:', error)
            if (this.onErrorCallback) {
              this.onErrorCallback(error)  // 通知业务层显示错误提示
            }
          },
          // 【回调 4】连接关闭(用户主动关闭/超时等)
          onclose: (event) => {
            console.log('[GeminiLive] 🔌 Closed:', event.reason)
            this.isConnected = false
            if (this.onClosedCallback) {
              this.onClosedCallback(event)  // 通知业务层停止发送音视频
            }
          }
        }
      })

      console.log('[GeminiLive] Session created successfully')

      // 🔥 注意:不需要发送初始消息,systemInstruction 已经足够让 Gemini 知道如何响应
      // 用户说话后 Gemini 会自动用语音回复
    } catch (error) {
      console.error('[GeminiLive] Failed to connect:', error)
      this.isConnected = false
      throw error
    }
  }

  /**
   * 【消息处理】解析 WebSocket 收到的消息,分发音频和文本数据
   */
  handleMessage(message) {
    // 添加到响应队列(供 waitMessage 等辅助方法使用)
    this.responseQueue.push(message)

    // 触发通用回调(业务层可能需要完整的原始消息)
    if (this.onMessageCallback) {
      this.onMessageCallback(message)
    }

    // 解析消息内容数组(一条消息可能包含多个 part)
    const parts = message.serverContent?.modelTurn?.parts || []
    const isTurnComplete = message.serverContent?.turnComplete === true

    // 🔥 收集音频块和文本，但不立即播放音频
    for (const part of parts) {
      // 【处理音频数据】AI 返回的语音回复
      if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
        // console.log(`[GeminiLive] 🔊 Audio chunk received (${this.audioParts.length + 1})`)
        this.audioParts.push(part.inlineData.data)
        this.audioMimeType = part.inlineData.mimeType  // 保存 mimeType

        // 触发音频回调(业务层可能需要保存或显示音频可视化)
        if (this.onAudioCallback) {
          this.onAudioCallback(part.inlineData.data, part.inlineData.mimeType)
        }
      }

      // 【处理文本数据】AI 返回的文字回复(仅在 AUDIO_TEXT 模式下存在)
      if (part.text) {
        console.log('[GeminiLive] 💬 Text received:', part.text)
        if (this.onTextCallback) {
          this.onTextCallback(part.text)  // 触发文本回调(业务层显示对话气泡)
        }
      }
    }

    // 🔥 只在 turnComplete 时合并播放所有音频块
    if (isTurnComplete && this.audioParts.length > 0) {
      console.log(`[GeminiLive] Turn complete, merging ${this.audioParts.length} audio chunks`)
      this.playMergedAudio()
    }
  }

  /**
   * 【开始录音】使用 AudioWorklet 录制音频并实时流式发送给 Gemini
   */
  async startRecording() {
    if (!this.session) {
      console.error('[GeminiLive] Cannot start recording: session not connected')
      return
    }

    try {
      console.log('[GeminiLive] Starting audio recording (Streaming Mode)...')

      // Initialize AudioContext if needed
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000 // Try to request 16kHz
        })
      }

      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      // 🔥 获取实际采样率
      const actualSampleRate = this.audioContext.sampleRate
      console.log('[GeminiLive] AudioContext sampleRate:', actualSampleRate)
      this.recordingSampleRate = actualSampleRate

      // Get microphone stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000
        }
      })

      // Create source
      this.inputSource = this.audioContext.createMediaStreamSource(this.mediaStream)

      // 🔥 只在第一次时加载 AudioWorklet 模块
      if (!this.workletModuleLoaded) {
        const workletCode = `
          class PCMProcessor extends AudioWorkletProcessor {
            constructor() {
              super()
              this.bufferSize = 4096 // 适当缓冲，避免过于频繁的 WebSocket 消息
              this.buffer = new Float32Array(this.bufferSize)
              this.bufferIndex = 0
            }

            process(inputs, outputs, parameters) {
              const input = inputs[0]
              if (input.length > 0) {
                const inputChannel = input[0]
                
                // 填充缓冲区
                for (let i = 0; i < inputChannel.length; i++) {
                  this.buffer[this.bufferIndex++] = inputChannel[i]
                  
                  // 缓冲区满，发送数据
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

      // 🔥 实时接收并发送音频数据
      this.audioWorkletNode.port.onmessage = (event) => {
        const pcmBuffer = event.data
        this.sendRealtimeAudioChunk(pcmBuffer)
      }

      // Connect graph
      this.inputSource.connect(this.audioWorkletNode)
      this.audioWorkletNode.connect(this.audioContext.destination)

      console.log('[GeminiLive] 🎤 Recording started')
    } catch (error) {
      console.error('[GeminiLive] Failed to start recording:', error)
    }
  }

  /**
   * 【辅助方法】发送实时音频块
   */
  async sendRealtimeAudioChunk(arrayBuffer) {
    if (!this.session) return

    try {
      // 🔥 关键修复: 创建真正的 Blob 对象,而不是对象字面量
      const mimeType = `audio/pcm;rate=${this.recordingSampleRate || 16000}`
      const audioBlob = new Blob([arrayBuffer], { type: mimeType })

      // 🔥 使用 audio 属性直接发送 Blob (不需要 base64 转换)
      await this.session.sendRealtimeInput({
        audio: audioBlob
      })
    } catch (error) {
      // 忽略发送错误，避免刷屏
      // console.error('[GeminiLive] Failed to send audio chunk:', error)
    }
  }

  /**
   * 【停止录音】只负责停止采集和断开连接
   */
  async stopRecording() {
    console.log('[GeminiLive] Stopping recording...')

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

    // 发送一个空的 clientContent 可能有助于标记结束，但通常不需要
    // await this.sendText('') 

    console.log('[GeminiLive] ⏹️ Recording stopped')
  }


  /**
   * 【发送消息】向 AI 发送文本消息
   */
  async sendText(text) {
    if (!this.session) {
      throw new Error('Session not connected')
    }

    try {
      console.log('[GeminiLive] Sending text:', text)

      // 发送对话轮次(turn)格式的消息
      await this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }]
      })

      console.log('[GeminiLive] ✅ Text sent')
    } catch (error) {
      console.error('[GeminiLive] Failed to send text:', error)
      throw error
    }
  }

  /**
   * 【发送视频帧】向 AI 发送摄像头的单帧图像
   */
  async sendVideoFrame(imageData, mimeType = 'image/jpeg') {
    if (!this.session) {
      throw new Error('Session not connected')
    }

    try {
      // console.log('[GeminiLive] Sending video frame...')

      // 🔥 关键修复: 将 base64 转换为 Blob 对象
      // imageData 是 base64 字符串（不含前缀）
      const binaryString = atob(imageData)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const videoBlob = new Blob([bytes], { type: mimeType })

      // 🔥 使用 video 属性直接发送 Blob
      await this.session.sendRealtimeInput({
        video: videoBlob
      })

      // console.log('[GeminiLive] ✅ Video frame sent')
    } catch (error) {
      console.error('[GeminiLive] Failed to send video frame:', error)
      // 不抛出错误，避免打断主循环
    }
  }

  /**
   * 【音频合并播放】将收集的所有音频块合并为一个完整音频并播放
   */
  playMergedAudio() {
    if (this.audioParts.length === 0) {
      console.warn('[GeminiLive] No audio chunks to play')
      return
    }

    try {
      // 合并所有音频块(简单拼接 base64 字符串)
      const mergedAudioData = this.audioParts.join('')
      const mimeType = this.audioMimeType || 'audio/pcm;rate=24000'

      console.log(`[GeminiLive] Playing merged audio (${this.audioParts.length} chunks, ${mergedAudioData.length} bytes)`)

      // 播放合并后的音频
      this.playAudio(mergedAudioData, mimeType)

      // 清空缓存,准备下一轮对话
      this.audioParts = []
      this.audioMimeType = null
    } catch (error) {
      console.error('[GeminiLive] Failed to play merged audio:', error)
      this.audioParts = []
      this.audioMimeType = null
    }
  }

  /**
   * 【音频播放】将 AI 返回的音频数据转换为 WAV 格式并播放
   */
  async playAudio(base64Data, mimeType) {
    try {
      // console.log('[GeminiLive] Playing audio...')

      // === 第 1 步:解码 base64 → Uint8Array ===
      const binaryString = atob(base64Data)  // base64 解码为二进制字符串
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // === 第 2 步:添加 WAV 文件头 ===
      // Gemini 返回的是裸 PCM 数据,需要添加 WAV 头才能被浏览器识别
      const wavBuffer = this.addWavHeader(bytes.buffer, mimeType)

      // === 第 3 步:创建 Blob 和临时 URL ===
      const blob = new Blob([wavBuffer], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)

      // === 第 4 步:播放音频 ===
      const audio = new Audio(url)

      audio.onended = () => {
        console.log('[GeminiLive] Audio playback finished')
        URL.revokeObjectURL(url)  // 释放内存
      }

      audio.onerror = (error) => {
        console.error('[GeminiLive] Audio playback error:', error)
        URL.revokeObjectURL(url)
      }

      await audio.play()
      console.log('[GeminiLive] ✅ Audio playing')
    } catch (error) {
      console.error('[GeminiLive] Failed to play audio:', error)
    }
  }

  /**
   * 【音频处理】为裸 PCM 数据添加 WAV 文件头
   */
  /**
   * 【音频处理】为裸 PCM 数据添加 WAV 文件头
   * 参考用户提供的最佳实践实现
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
    view.setUint32(16, 16, true)             // Subchunk1Size (PCM)
    view.setUint16(20, 1, true)              // AudioFormat (1 = PCM)
    view.setUint16(22, numChannels, true)    // NumChannels
    view.setUint32(24, sampleRate, true)     // SampleRate
    view.setUint32(28, byteRate, true)       // ByteRate
    view.setUint16(32, blockAlign, true)     // BlockAlign
    view.setUint16(34, bitsPerSample, true)  // BitsPerSample

    // data sub-chunk
    this.writeString(view, 36, 'data')
    view.setUint32(40, dataLength, true)     // Subchunk2Size

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

  /**
   * 【辅助方法】从 MIME 类型字符串解析音频参数
   * 参考用户提供的最佳实践实现
   */
  parseMimeType(mimeType) {
    const [fileType, ...params] = (mimeType || '').split(';').map(s => s.trim())
    const [_, format] = fileType.split('/')

    const options = {
      numChannels: 1,
      sampleRate: 24000, // Default for Gemini
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
   * 【生命周期】关闭 WebSocket 连接并清理资源
   */
  close() {
    if (this.session) {
      console.log('[GeminiLive] Closing session...')
      this.session.close()
      this.session = null
    }

    this.stopRecording()

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.isConnected = false
    this.responseQueue = []      // 清空消息队列
    this.audioParts = []          // 清空音频缓存
    console.log('[GeminiLive] ✅ Session closed')
  }

  /**
   * 【状态查询】检查 WebSocket 是否已连接
   */
  get connected() {
    return this.isConnected
  }
}

export default GeminiLiveService
