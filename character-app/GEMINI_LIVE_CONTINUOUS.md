# Gemini Live API - 持续音视频流实现

## 概述

这是基于官方文档的**完整实现**,支持:
- ✅ 持续音频流 (无需按住按钮)
- ✅ 实时视频流 (0.5 FPS)
- ✅ 自动语音活动检测 (VAD)
- ✅ 自动播放 AI 响应

## 核心区别

### 之前的问题版本
```javascript
// ❌ 需要按住按钮
// ❌ 需要手动调用 turnComplete
// ❌ 音频和视频分离

startRecording() // 开始
stopRecording() // 停止 + 调用 sendClientContent({ turnComplete: true })
```

### 现在的持续流版本
```javascript
// ✅ 一次启动,持续运行
// ✅ AI 自动检测语音活动
// ✅ 音频和视频同时流式传输

startStream(videoElement) // 启动音频+视频流
stopStream() // 停止流
```

## 关键技术实现

### 1. 自动语音活动检测 (VAD)

```javascript
this.session = await this.ai.live.connect({
  model: this.config.model,
  config: {
    responseModalities: [Modality.AUDIO],
    // 🔥 关键: 启用自动语音活动检测
    realtimeInputConfig: {
      automaticActivityDetection: {}
    }
  }
})
```

**效果:**
- AI 自动检测用户何时开始说话
- AI 自动检测用户何时停止说话
- 无需手动调用 `turnComplete`

### 2. 持续音频流

```javascript
// AudioWorklet 持续处理音频
this.audioWorkletNode.port.onmessage = async (event) => {
  if (event.data.type === 'audio') {
    // 🔥 持续发送音频块
    await this.sendAudio(event.data.buffer)
  }
}

async sendAudio(arrayBuffer) {
  const mimeType = `audio/pcm;rate=${this.audioContext.sampleRate}`
  const audioBlob = new Blob([arrayBuffer], { type: mimeType })

  // 🔥 持续调用 sendRealtimeInput
  await this.session.sendRealtimeInput({ audio: audioBlob })
}
```

**音频格式:**
- 采样率: 16kHz (输入) / 24kHz (输出)
- 格式: 16-bit PCM
- 声道: 单声道

### 3. 实时视频流

```javascript
// 定期捕获视频帧 (0.5 FPS = 每 2 秒一帧)
const intervalMs = 1000 / this.config.videoFPS
this.videoInterval = setInterval(() => {
  this.captureAndSendVideoFrame()
}, intervalMs)

async captureAndSendVideoFrame() {
  // 1. 从 video 元素捕获帧
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 768
  ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height)

  // 2. 转换为 JPEG Blob
  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', 0.8)
  })

  // 3. 发送视频帧
  await this.session.sendRealtimeInput({ video: blob })
}
```

**视频配置:**
- 分辨率: 1024x768
- 格式: JPEG
- 帧率: 0.5 FPS (可配置)
- 质量: 0.8 (80%)

### 4. 音频响应播放

```javascript
handleMessage(message) {
  const parts = message.serverContent?.modelTurn?.parts || []
  const turnComplete = message.serverContent?.turnComplete === true

  // 收集音频块
  for (const part of parts) {
    if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
      this.audioQueue.push({
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType
      })
    }
  }

  // 🔥 轮次完成时,播放合并的音频
  if (turnComplete && this.audioQueue.length > 0) {
    this.playQueuedAudio()
  }
}
```

## 使用方法

### 1. 基础用法

```javascript
import GeminiLiveContinuous from './services/geminiLiveService.continuous'

// 创建实例
const gemini = new GeminiLiveContinuous(apiKey, {
  model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
  voiceName: 'Achird',
  enableVideo: true,
  videoFPS: 0.5,
  onTextReceived: (text) => console.log('AI:', text),
  onAudioReceived: (data, mimeType) => console.log('Audio received')
})

// 连接
await gemini.connect()

// 启动流 (需要提供 video 元素)
const videoElement = document.querySelector('video')
await gemini.startStream(videoElement)

// 现在可以直接说话,AI 会自动检测并回复!

// 停止流
await gemini.stopStream()

// 关闭连接
gemini.close()
```

### 2. React 组件中使用

参考 `/pages/DebugContinuous.jsx` 完整示例。

## 测试页面

访问: **http://localhost:5176/debug-continuous**

### 测试步骤

1. **输入 API Key** 并点击"连接"
2. **点击"开始流"** 启动音视频流
3. **允许权限**: 浏览器会请求摄像头和麦克风权限
4. **直接说话**: 无需按住按钮!
   - 示例: "Hello, can you see me?"
   - 示例: "What am I wearing?"
   - 示例: "Tell me a joke"
5. **观察日志**: 查看 AI 的文本和音频响应
6. **听取回复**: AI 的语音会自动播放
7. **完成后**: 点击"停止流"

### 预期结果

```
[时间] Connecting to Gemini Live API...
[时间] ✅ WebSocket connected
[时间] ✅ Session created
[时间] 🎬 Starting audio+video stream...
[时间] 🎤 Audio stream started
[时间] 📹 Video stream started (0.5 FPS)
[时间] ✅ Stream started - AI is listening and watching!

[用户说话...]

[时间] 💬 AI: Yes, I can see you! You're wearing a blue shirt.
[时间] 🔊 Audio chunk (audio/pcm;rate=24000)
[时间] 🔊 Audio chunk (audio/pcm;rate=24000)
[时间] 🔊 Turn complete, playing audio (3 chunks)
[时间] 🔊 Playing audio...
[时间] 🔊 Audio playback finished
```

## 配置选项

```javascript
new GeminiLiveContinuous(apiKey, {
  // 模型
  model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',

  // 语音
  voiceName: 'Achird', // 或 'Zephyr'

  // 视频
  enableVideo: true, // 是否启用视频
  videoFPS: 0.5, // 视频帧率 (帧/秒)

  // 回调
  onConnected: () => {},
  onDisconnected: (event) => {},
  onError: (error) => {},
  onAudioReceived: (data, mimeType) => {},
  onTextReceived: (text) => {},
  onLog: (message) => {}
})
```

## 优势

✅ **用户体验更自然**
- 像正常对话一样,无需按键操作
- AI 自动检测说话和停顿

✅ **实时视觉理解**
- AI 能"看到"用户
- 支持视觉问答 (如 "我穿的什么颜色?")

✅ **性能优化**
- 持续流式传输,延迟更低
- 音频块自动合并播放

✅ **代码更简洁**
- 一次启动,持续运行
- 无需复杂的状态管理

## 技术栈

- **WebSocket**: 双向实时通信
- **Web Audio API**: 音频捕获和处理
- **AudioWorklet**: 高性能音频处理
- **MediaDevices API**: 摄像头和麦克风访问
- **Canvas API**: 视频帧捕获
- **Blob API**: 二进制数据处理

## 浏览器要求

- Chrome 91+
- Safari 15+
- Firefox 90+
- Edge 91+

必须支持:
- WebSocket
- AudioWorklet
- getUserMedia
- Canvas

## 安全注意事项

⚠️ **不要在客户端应用中硬编码 API Key**

推荐方案:
1. 使用后端服务器代理请求
2. 使用临时令牌 (Short-lived tokens)
3. 使用环境变量 (仅开发环境)

## 故障排查

### 问题 1: 没有音频响应
- 检查是否启用了 `automaticActivityDetection`
- 确认 API Key 正确
- 查看浏览器控制台错误

### 问题 2: 视频帧不发送
- 确认摄像头权限已授予
- 检查 `enableVideo: true`
- 验证 video 元素已挂载

### 问题 3: 音频播放失败
- 检查浏览器是否允许自动播放
- 确认 WAV 头添加正确
- 查看音频格式是否匹配

## 下一步

- [ ] 添加音频可视化 (波形图)
- [ ] 支持打断 AI 说话
- [ ] 添加会话历史记录
- [ ] 支持多语言检测
- [ ] 优化视频帧压缩

## 参考资料

- [Gemini Live API 官方文档](https://ai.google.dev/gemini-api/docs/live)
- [Google Gen AI SDK (JS)](https://github.com/googleapis/js-genai)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaDevices API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices)
