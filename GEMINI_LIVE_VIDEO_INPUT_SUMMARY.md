# Gemini Live API 视频输入实现总结

**完成时间**: 2025-11-21
**目标**: 在 Stage 2 (Mirror Guide) 中实现实时视频流输入到 Gemini Live API

---

## ✅ 核心改进

### 之前的实现（❌ 错误）
```
摄像头 → 每10秒捕获一帧 → Vision API (REST) → 分析结果 → 生成文本 context
                                                              ↓
                                                    Gemini Live API (文本提示)
```

**问题**:
- 每 10 秒调用一次 Vision API（REST），高延迟
- 需要手动构建 context prompt
- Gemini 无法"实时看到"用户
- 两个独立的 API 调用（Vision + Live）

---

### 现在的实现（✅ 正确）
```
摄像头 → 每2秒捕获一帧 → Gemini Live API (视频流 + 文本提示)
                              ↓
                        实时语音响应（基于视频内容）
```

**优势**:
- Gemini 实时"看到"用户（0.5 FPS 视频流）
- 单一 WebSocket 连接（视频 + 音频 + 文本）
- 低延迟（无需等待 REST API）
- 真正的多模态对话（视觉 + 听觉 + 语言）

---

## 📝 实现细节

### 1. geminiLiveService.js 新增方法

#### `sendVideoFrame(imageData, mimeType)`
发送单张视频帧（base64 JPEG/PNG）

```javascript
await geminiLive.sendVideoFrame(base64ImageData, 'image/jpeg')
```

**参数**:
- `imageData`: base64 编码的图片数据（不包含 `data:image/jpeg;base64,` 前缀）
- `mimeType`: `'image/jpeg'` 或 `'image/png'`

**底层实现**:
```javascript
await this.session.sendRealtimeInput({
  image: {
    data: imageData,
    mimeType
  }
})
```

---

#### `captureAndSendFrame(canvas, video, quality)`
从摄像头捕获当前帧并发送到 Gemini Live

```javascript
await geminiLive.captureAndSendFrame(canvasRef.current, videoRef.current, 0.8)
```

**流程**:
1. 从 `<video>` 元素绘制当前帧到 `<canvas>`
2. 使用 `canvas.toDataURL('image/jpeg', quality)` 转换为 base64
3. 移除 `data:image/jpeg;base64,` 前缀
4. 调用 `sendVideoFrame()` 发送到 Gemini Live

**参数**:
- `canvas`: Canvas 元素引用
- `video`: Video 元素引用
- `quality`: JPEG 压缩质量 (0-1，推荐 0.8)

---

### 2. Stage2Mirror.jsx 修改

#### 视频流发送逻辑 (Line 256-297)

**之前（Auto-Frame Analysis）**:
```javascript
useEffect(() => {
  if (phase === 'CONVERSATION' && mirrorDisplayMode === 'camera') {
    autoAnalysisIntervalRef.current = setInterval(async () => {
      const frame = captureCurrentFrame()
      const analysis = await analyzePhotoWithVision(frame) // ❌ REST API
      setLatestAnalysis(analysis)
    }, 10000) // ❌ 10秒一次，延迟高
  }
}, [phase, mirrorDisplayMode])
```

**现在（Video Streaming）**:
```javascript
useEffect(() => {
  if (
    phase === 'CONVERSATION' &&
    geminiLive &&
    geminiConnected &&
    mirrorDisplayMode === 'camera' &&
    conversationSubState !== 'REVIEWING'
  ) {
    console.log('[Stage2Mirror] Starting video stream to Gemini Live...')

    // ✅ 每 2 秒发送一帧 (0.5 FPS)
    autoAnalysisIntervalRef.current = setInterval(async () => {
      try {
        if (!videoRef.current || !canvasRef.current) return

        // 🔥 发送视频帧到 Gemini Live
        await geminiLive.captureAndSendFrame(
          canvasRef.current,
          videoRef.current,
          0.8 // JPEG quality
        )

        console.log('[Stage2Mirror] ✅ Video frame sent to Gemini Live')
      } catch (error) {
        console.error('[Stage2Mirror] Failed to send video frame:', error)
      }
    }, 2000) // ✅ 2秒一次 (0.5 FPS，参考文档推荐)

    return () => {
      if (autoAnalysisIntervalRef.current) {
        clearInterval(autoAnalysisIntervalRef.current)
      }
    }
  }
}, [phase, geminiLive, geminiConnected, mirrorDisplayMode, conversationSubState])
```

**关键改进**:
- ✅ 从 10 秒降低到 2 秒（更实时）
- ✅ 直接发送到 Gemini Live（不经过 Vision API）
- ✅ 检查 `geminiConnected` 状态（确保连接已建立）
- ✅ 跳过 REVIEWING 状态（用户查看照片时不发送视频流）

---

#### generateAIQuestion() 简化 (Line 311-356)

**之前**:
```javascript
const generateAIQuestion = async () => {
  // ❌ 手动构建 context
  let contextPrompt = ''
  if (latestAnalysis) {
    contextPrompt = `Visual Context: User is in ${latestAnalysis.location}. Clothing: ${latestAnalysis.clothing}. Mood: ${latestAnalysis.mood}.`
  }

  const prompt = `${contextPrompt}

Based on this visual context, ask ONE simple, gentle question...`

  await geminiLive.sendText(prompt)
}
```

**现在**:
```javascript
const generateAIQuestion = async () => {
  if (isAISpeaking || !geminiLive || !geminiConnected) return

  setIsAISpeaking(true)

  try {
    // 🔥 Gemini 已经通过视频流"看到"用户，不需要额外 context
    const prompt = "Based on what you see, ask ONE simple, gentle question to learn about the user. Keep it under 10 words."

    console.log('[Stage2Mirror] Sending prompt to Gemini Live:', prompt)

    // 🔥 Gemini 会综合视频帧和文本提示生成响应
    await geminiLive.sendText(prompt)

    // Audio + text responses handled by callbacks automatically
  } catch (error) {
    console.error('[Stage2Mirror] Failed to generate AI question:', error)
    // Fallback logic...
  } finally {
    setIsAISpeaking(false)
  }
}
```

**关键简化**:
- ✅ 不再需要 `latestAnalysis` 状态
- ✅ 不再需要构建 context prompt
- ✅ Prompt 更简洁直接
- ✅ Gemini 自动"看到"视频内容并基于此提问

---

## 🎯 技术架构

### 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                    Stage2Mirror Component                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  <video ref={videoRef}>  ──────┐                            │
│  <canvas ref={canvasRef}>      │                            │
│                                 ↓                            │
│                    geminiLive.captureAndSendFrame()         │
│                    (每 2 秒调用一次)                          │
│                                 │                            │
└─────────────────────────────────┼───────────────────────────┘
                                  ↓
                    ┌─────────────────────────┐
                    │  geminiLiveService.js   │
                    ├─────────────────────────┤
                    │                         │
                    │  sendRealtimeInput({    │
                    │    image: {             │
                    │      data: base64,      │
                    │      mimeType: "image/jpeg" │
                    │    }                    │
                    │  })                     │
                    │                         │
                    └──────────┬──────────────┘
                               ↓
                    ┌──────────────────────────┐
                    │  @google/genai SDK       │
                    │  WebSocket Connection    │
                    └──────────┬───────────────┘
                               ↓
                    ┌─────────────────────────────┐
                    │  Gemini Live API (Google)   │
                    │  gemini-2.0-flash-exp       │
                    ├─────────────────────────────┤
                    │  Input:                     │
                    │  - Video frames (0.5 FPS)   │
                    │  - Text prompts             │
                    │                             │
                    │  Output:                    │
                    │  - Audio (Pika voice)       │
                    │  - Text (transcription)     │
                    └──────────┬──────────────────┘
                               ↓
                    ┌─────────────────────────────┐
                    │  Callbacks                  │
                    ├─────────────────────────────┤
                    │  onText: (text) => {        │
                    │    setMessages([...])       │
                    │  }                          │
                    │                             │
                    │  onAudio: (data) => {       │
                    │    playAudio(data)          │
                    │  }                          │
                    └─────────────────────────────┘
                               ↓
                    用户听到 AI 语音，看到文本对话
```

---

## 🔧 API 调用格式

### sendRealtimeInput() 参数格式

根据官方文档，`session.sendRealtimeInput()` 支持以下格式：

#### 音频输入
```javascript
session.sendRealtimeInput({
  audio: {
    data: base64AudioData,
    mimeType: "audio/pcm;rate=16000"
  }
})
```

#### 视频/图片输入
```javascript
session.sendRealtimeInput({
  image: {
    data: base64ImageData,
    mimeType: "image/jpeg" // 或 "image/png"
  }
})
```

#### 文本输入
```javascript
session.sendText("Your prompt here")
```

**注意**:
- 音频必须是 16-bit PCM, 16kHz, mono
- 图片可以是 JPEG 或 PNG 格式
- 所有数据都是 base64 编码（不包含 `data:` 前缀）

---

## 📊 性能优化

### 视频帧率选择：0.5 FPS (每2秒一帧)

**为什么是 0.5 FPS？**
- 根据文档建议："typical FPS is set to 0.5, or one frame every 2 seconds"
- 平衡实时性和 API 成本
- 对于对话场景，0.5 FPS 足够捕捉用户状态变化

**可调整参数**:
```javascript
// Stage2Mirror.jsx Line 288
}, 2000) // 2秒一帧 (0.5 FPS)

// 如果需要更高帧率：
}, 1000) // 1秒一帧 (1 FPS)

// 如果需要降低成本：
}, 4000) // 4秒一帧 (0.25 FPS)
```

### JPEG 压缩质量：0.8

```javascript
// geminiLiveService.js Line 280
await geminiLive.captureAndSendFrame(canvas, video, 0.8)
```

**质量参数**:
- `0.8` - 推荐（平衡质量和大小）
- `0.6-0.7` - 更小文件（可能降低视觉识别精度）
- `0.9-1.0` - 更高质量（更大文件，更慢传输）

---

## 🧪 测试清单

### 浏览器测试

1. **启动开发服务器**:
   ```bash
   cd /Users/jiajun/social-look-app
   npm run dev:character
   ```

2. **打开浏览器控制台**:
   - 访问 http://localhost:5173
   - 打开 DevTools → Console

3. **Stage 2 测试要点**:
   - [ ] 摄像头自动启动
   - [ ] Gemini Live 连接成功（看到 `✅ Gemini Live connected`）
   - [ ] 进入 CONVERSATION 阶段后，每 2 秒看到一条日志：
     ```
     [Stage2Mirror] ✅ Video frame sent to Gemini Live
     [GeminiLive] Sending video frame...
     [GeminiLive] ✅ Video frame sent
     ```
   - [ ] AI 提出的问题基于视频内容（例如，如果你在户外，AI 可能问 "Enjoying the outdoors?"）
   - [ ] 听到 Pika 语音回答
   - [ ] 看到文本转录显示在消息列表中

### Console 日志检查

**正常流程日志**:
```
[Stage2Mirror] Connecting to Gemini Live...
[GeminiLive] Service initialized
[GeminiLive] Connecting...
[GeminiLive] ✅ Connected
[Stage2Mirror] ✅ Gemini Live connected
[Stage2Mirror] ✅ Gemini Live ready
[Stage2Mirror] Starting INTRO sequence...
[Stage2Mirror] INTRO complete, transitioning to CONVERSATION
[Stage2Mirror] Starting video stream to Gemini Live...
[Stage2Mirror] ✅ Video frame sent to Gemini Live  ← 每2秒重复
[GeminiLive] Sending video frame...
[GeminiLive] ✅ Video frame sent
[Stage2Mirror] Sending prompt to Gemini Live: Based on what you see...
[GeminiLive] 📨 Message received: ...
[GeminiLive] 🔊 Audio data received
[GeminiLive] Playing audio...
[GeminiLive] 💬 Text received: What's behind you?
[Stage2Mirror] Gemini text: What's behind you?
```

### 网络检查

**Chrome DevTools → Network → WS (WebSockets)**:
- 应该看到一个持续的 WebSocket 连接到 Gemini API
- 每 2 秒发送一个消息（视频帧）
- 接收到的消息包含音频和文本数据

---

## 🎉 总结

### 核心改进

1. **✅ 真正的实时视频对话**
   - Gemini 每 2 秒"看到"用户当前状态
   - 基于视觉内容生成上下文感知的问题

2. **✅ 简化架构**
   - 移除了 Vision API (REST) 调用
   - 单一 WebSocket 连接处理所有模态
   - 不再需要手动构建 context prompt

3. **✅ 更低延迟**
   - 从 10 秒降低到 2 秒
   - WebSocket 比 REST API 更快
   - 音频自动播放（无需等待 TTS）

4. **✅ 成本优化**
   - 0.5 FPS 平衡实时性和成本
   - JPEG 0.8 质量平衡大小和精度
   - 单一 API 调用（不再分别调用 Vision + Live）

### 技术亮点

- **多模态输入**: 同时发送视频帧和文本提示
- **自动化处理**: Canvas 捕获 → Base64 转换 → 自动发送
- **Callback 驱动**: 音频和文本响应自动处理，无需手动管理状态
- **错误容错**: 失败时使用 fallback 预设问题

---

**开发服务器状态**: ✅ 正常运行 (http://localhost:5173)
**编译状态**: ✅ HMR 正常工作
**下一步**: 在浏览器中测试实时视频+语音对话功能
