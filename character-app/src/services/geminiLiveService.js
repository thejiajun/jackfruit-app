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
      responseModalities: options.responseModalities || [Modality.AUDIO, Modality.TEXT],   // 返回模式:音频+文本
      temperature: options.temperature || 0.9,                 // 创造性参数(0-1,越高越随机)
      ...options.config
    }

    console.log('[GeminiLive] Service initialized', {
      model: this.config.model,
      voiceName: this.config.voiceName,
      responseModalities: this.config.responseModalities
    })
  }

  /**
   * 【核心方法】建立与 Gemini Live API 的 WebSocket 连接
   *
   * 产品需求:在用户进入 Stage 2(Mirror)时自动连接,准备好实时对话能力
   * 技术实现:创建 WebSocket 会话,注册 4 个生命周期回调(open/message/error/close)
   *
   * 配置说明:
   * - responseModalities: 控制 AI 返回音频还是文字(或两者)
   * - mediaResolution: 视频质量(MEDIUM 平衡性能和清晰度)
   * - voiceConfig: AI 语音角色选择(Zephyr/Achird/Kore/...)
   * - contextWindowCompression: 对话历史压缩策略(超过 25600 tokens 时自动压缩到 12800)
   */
  async connect() {
    if (this.isConnected) {
      console.warn('[GeminiLive] Already connected')
      return
    }

    try {
      console.log('[GeminiLive] Connecting...')

      // === 构建 Gemini Live 会话配置 ===
      // 🔥 测试：使用最小化配置，逐步添加参数来定位问题
      const sessionConfig = {
        responseModalities: this.config.responseModalities     // 返回格式: [Modality.AUDIO, Modality.TEXT]
      }

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
            console.log('[GeminiLive] 📨 Message received:', message)
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
    } catch (error) {
      console.error('[GeminiLive] Failed to connect:', error)
      this.isConnected = false
      throw error
    }
  }

  /**
   * 【消息处理】解析 WebSocket 收到的消息,分发音频和文本数据
   *
   * 产品需求:AI 返回的消息可能包含音频、文本或两者,需要分别处理
   * 技术实现:解析 message.serverContent.modelTurn.parts 数组,识别数据类型并触发对应回调
   *
   * 消息结构示例:
   * {
   *   serverContent: {
   *     modelTurn: {
   *       parts: [
   *         { text: "Hello, how are you?" },                           // 文本消息
   *         { inlineData: { data: "base64...", mimeType: "audio/pcm" } } // 音频消息
   *       ]
   *     }
   *   }
   * }
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
        console.log(`[GeminiLive] 🔊 Audio chunk received (${this.audioParts.length + 1})`)
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
   * 【音频合并播放】将收集的所有音频块合并为一个完整音频并播放
   *
   * 产品需求:用户听到完整连贯的 AI 语音回复,而不是断断续续的片段
   * 技术实现:合并所有 base64 音频块,转换为 WAV 格式,播放一次
   *
   * 为什么需要合并:
   * - Gemini Live 以流式方式返回音频(每次返回一个小片段)
   * - 如果逐个播放会导致重叠或断断续续
   * - 合并后播放可以确保完整性和流畅性
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
   *
   * 产品需求:用户听到 AI 的语音回复,营造真实对话感
   * 技术实现:base64 PCM → Uint8Array → 添加 WAV 头 → Blob URL → Audio 元素播放
   *
   * 流程:
   * 1. 解码 base64 字符串为二进制数组
   * 2. 添加 WAV 文件头(浏览器只能播放完整的音频格式)
   * 3. 创建 Blob URL(内存中的临时 URL)
   * 4. 使用 Audio 元素播放
   * 5. 播放完成后释放内存
   */
  async playAudio(base64Data, mimeType) {
    try {
      console.log('[GeminiLive] Playing audio...')

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
   *
   * 技术说明:
   * - Gemini Live 返回的音频是 PCM 格式(未压缩的原始音频数据)
   * - 浏览器无法直接播放 PCM,需要添加 WAV 头信息(采样率、声道数等)
   * - WAV 头固定 44 字节,包含 RIFF 描述符、fmt 子块、data 子块
   *
   * 参数:
   * - audioData: 原始 PCM 音频数据(ArrayBuffer)
   * - mimeType: MIME 类型字符串,例如 "audio/pcm;rate=24000"
   *
   * 返回: 完整的 WAV 音频数据(ArrayBuffer)
   */
  addWavHeader(audioData, mimeType) {
    const { sampleRate, numChannels, bitsPerSample } = this.parseMimeType(mimeType)
    const dataLength = audioData.byteLength
    const header = new ArrayBuffer(44)  // WAV 头固定 44 字节
    const view = new DataView(header)

    // === RIFF chunk descriptor(块描述符) ===
    view.setUint32(0, 0x46464952, true)        // "RIFF" 标识(小端序)
    view.setUint32(4, 36 + dataLength, true)   // 文件总大小 - 8 字节
    view.setUint32(8, 0x45564157, true)        // "WAVE" 标识

    // === fmt sub-chunk(格式子块) ===
    view.setUint32(12, 0x20746d66, true)       // "fmt " 标识
    view.setUint32(16, 16, true)               // fmt 块大小(PCM 固定 16)
    view.setUint16(20, 1, true)                // 音频格式(1 = PCM)
    view.setUint16(22, numChannels, true)      // 声道数(1 = 单声道, 2 = 立体声)
    view.setUint32(24, sampleRate, true)       // 采样率(Hz)
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true) // 字节率(每秒传输字节数)
    view.setUint16(32, numChannels * bitsPerSample / 8, true) // 块对齐(一个采样占用字节数)
    view.setUint16(34, bitsPerSample, true)    // 位深度(每个采样的位数)

    // === data sub-chunk(数据子块) ===
    view.setUint32(36, 0x61746164, true)       // "data" 标识
    view.setUint32(40, dataLength, true)       // 音频数据大小

    // === 合并 header + 原始音频数据 ===
    const combined = new Uint8Array(44 + dataLength)
    combined.set(new Uint8Array(header), 0)    // 前 44 字节是头信息
    combined.set(new Uint8Array(audioData), 44)  // 后续是音频数据

    return combined.buffer
  }

  /**
   * 【辅助方法】从 MIME 类型字符串解析音频参数
   *
   * 示例:
   * - "audio/pcm;rate=24000" → { sampleRate: 24000, numChannels: 1, bitsPerSample: 16 }
   * - "audio/pcm" → 使用默认值
   */
  parseMimeType(mimeType) {
    // 默认值(Gemini Live 通常使用 24kHz 单声道 16bit)
    let sampleRate = 24000
    let numChannels = 1
    let bitsPerSample = 16

    if (!mimeType) return { sampleRate, numChannels, bitsPerSample }

    const parts = mimeType.split(';')
    for (const part of parts) {
      const [key, value] = part.trim().split('=')
      if (key === 'rate' && value) {
        sampleRate = parseInt(value, 10)
      }
    }

    return { sampleRate, numChannels, bitsPerSample }
  }

  /**
   * 【发送消息】向 AI 发送文本消息
   *
   * 产品场景:用户在对话界面输入文字消息(不使用麦克风时)
   * 技术实现:使用 sendClientContent API,格式为 turns 数组
   *
   * 注意:如果需要同时发送音频,应该使用 sendRealtimeInput 而不是此方法
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
   * 【发送音频】向 AI 发送麦克风录制的音频数据
   *
   * 产品场景:用户通过麦克风说话,实时传输给 AI
   * 技术实现:将 AudioWorklet 捕获的音频数据(base64 PCM)发送到 Gemini Live
   *
   * 参数:
   * - audioData: base64 编码的音频数据(通常是 PCM 格式)
   * - mimeType: 音频格式,例如 "audio/pcm;rate=16000"(16kHz 采样率)
   */
  async sendAudio(audioData, mimeType = 'audio/pcm;rate=16000') {
    if (!this.session) {
      throw new Error('Session not connected')
    }

    try {
      console.log('[GeminiLive] Sending audio data...')

      await this.session.sendRealtimeInput({
        audio: {
          data: audioData, // base64 encoded PCM
          mimeType
        }
      })

      console.log('[GeminiLive] ✅ Audio sent')
    } catch (error) {
      console.error('[GeminiLive] Failed to send audio:', error)
      throw error
    }
  }

  /**
   * 【发送视频帧】向 AI 发送摄像头的单帧图像
   *
   * 产品场景:让 AI "看到"用户,分析用户的外貌、环境、表情等
   * 技术实现:定期(例如每 2 秒)捕获摄像头画面,转为 JPEG Blob 后发送
   *
   * 参数:
   * - imageData: base64 编码的图片数据(不含 data URL 前缀)
   * - mimeType: 图片格式,推荐 'image/jpeg'(比 PNG 小 70%)
   */
  async sendVideoFrame(imageData, mimeType = 'image/jpeg') {
    if (!this.session) {
      throw new Error('Session not connected')
    }

    try {
      console.log('[GeminiLive] Sending video frame...')

      // 🔥 将 base64 转换为 Blob（API 要求 Blob 格式，不是 { data, mimeType }）
      const byteCharacters = atob(imageData)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: mimeType })

      await this.session.sendRealtimeInput({
        video: blob  // 🔥 使用 video 属性发送 Blob（没有 image 属性！）
      })

      console.log('[GeminiLive] ✅ Video frame sent')
    } catch (error) {
      console.error('[GeminiLive] Failed to send video frame:', error)
      throw error
    }
  }

  /**
   * 【便捷方法】从 Canvas 捕获视频帧并发送给 AI
   *
   * 产品场景:Stage 2(Mirror)中每 2 秒自动捕获用户画面发送给 AI
   * 技术实现:Video → Canvas 绘制 → toDataURL 转 JPEG → 发送
   *
   * 参数:
   * - canvas: 用于截图的 Canvas 元素(隐藏的,不显示在页面上)
   * - video: 摄像头视频流元素(<video> 标签)
   * - quality: JPEG 压缩质量(0-1),0.8 平衡质量和大小
   *
   * 流程:
   * 1. 调整 Canvas 尺寸为视频分辨率
   * 2. 绘制视频当前帧到 Canvas
   * 3. 转换为 base64 JPEG
   * 4. 发送到 Gemini Live
   */
  async captureAndSendFrame(canvas, video, quality = 0.8) {
    if (!canvas || !video) {
      console.error('[GeminiLive] Canvas or video element not provided')
      return
    }

    try {
      // === 第 1 步:将视频当前帧绘制到 canvas ===
      const ctx = canvas.getContext('2d')
      canvas.width = video.videoWidth    // 使用视频原始宽度
      canvas.height = video.videoHeight  // 使用视频原始高度
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // === 第 2 步:将 canvas 转换为 base64 JPEG ===
      const dataUrl = canvas.toDataURL('image/jpeg', quality)  // quality 控制压缩率
      const base64Data = dataUrl.split(',')[1] // 移除 "data:image/jpeg;base64," 前缀

      // === 第 3 步:发送到 Gemini Live ===
      await this.sendVideoFrame(base64Data, 'image/jpeg')
    } catch (error) {
      console.error('[GeminiLive] Failed to capture and send frame:', error)
      throw error
    }
  }

  /**
   * 【辅助方法】等待 AI 完成一个完整的回合(turn)
   *
   * 使用场景:需要等待 AI 完整回复后再执行后续逻辑时使用
   * 技术说明:Gemini Live 的回复可能分多个消息返回,通过 turnComplete 标志判断结束
   *
   * 参数:
   * - timeout: 超时时间(毫秒),默认 30 秒
   *
   * 返回: 包含本轮所有消息的数组
   */
  async waitForTurnComplete(timeout = 30000) {
    const turn = []
    let done = false
    const startTime = Date.now()

    while (!done) {
      // 超时检查(避免无限等待)
      if (Date.now() - startTime > timeout) {
        console.warn('[GeminiLive] Wait for turn timeout')
        break
      }

      const message = await this.waitMessage(1000)
      if (message) {
        turn.push(message)

        // 检查是否完成(turnComplete 标志表示 AI 回复结束)
        if (message.serverContent?.turnComplete) {
          done = true
        }
      }
    }

    return turn
  }

  /**
   * 【辅助方法】等待下一条消息从队列中出现
   *
   * 使用场景:需要同步等待 AI 回复时使用(例如测试或调试)
   * 技术说明:轮询检查 responseQueue,直到有消息或超时
   *
   * 参数:
   * - timeout: 超时时间(毫秒),默认 5 秒
   *
   * 返回: 消息对象或 null(超时)
   */
  async waitMessage(timeout = 5000) {
    const startTime = Date.now()

    while (true) {
      const message = this.responseQueue.shift()
      if (message) {
        return message
      }

      // 超时检查
      if (Date.now() - startTime > timeout) {
        return null
      }

      // 等待 100ms 再检查(避免 CPU 占用过高)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  /**
   * 【辅助方法】从一个回合(turn)中提取所有文本内容
   *
   * 使用场景:需要获取 AI 本轮回复的完整文字时使用
   * 技术说明:遍历 turn 数组中所有 message,合并所有文本 part
   *
   * 参数:
   * - turn: waitForTurnComplete 返回的消息数组
   *
   * 返回: 合并后的文本字符串
   */
  extractTextFromTurn(turn) {
    const textParts = []

    for (const message of turn) {
      const parts = message.serverContent?.modelTurn?.parts || []
      for (const part of parts) {
        if (part.text) {
          textParts.push(part.text)
        }
      }
    }

    return textParts.join(' ')  // 用空格连接所有文本片段
  }

  /**
   * 【生命周期】关闭 WebSocket 连接并清理资源
   *
   * 产品场景:用户离开 Stage 2 或完成 Onboarding 时调用
   * 技术实现:关闭 WebSocket,清空消息队列和音频缓存
   *
   * 注意:关闭后需要重新调用 connect() 才能再次使用
   */
  close() {
    if (this.session) {
      console.log('[GeminiLive] Closing session...')
      this.session.close()
      this.session = null
      this.isConnected = false
      this.responseQueue = []      // 清空消息队列
      this.audioParts = []          // 清空音频缓存
      console.log('[GeminiLive] ✅ Session closed')
    }
  }

  /**
   * 【状态查询】检查 WebSocket 是否已连接
   *
   * 使用场景:发送消息前检查连接状态,避免报错
   * 返回: true(已连接) | false(未连接)
   */
  get connected() {
    return this.isConnected
  }
}

export default GeminiLiveService
