# Gemini Live API 集成总结

**完成时间**: 2025-11-21
**目标**: 在 Stage 2 (Mirror Guide) 中集成 Gemini Live API，实现实时语音对话

---

## ✅ 已完成任务

### 1. 安装 @google/genai 包
```bash
cd character-app
npm install @google/genai
```

**包信息**:
- **包名**: `@google/genai`
- **版本**: 最新版本
- **用途**: 浏览器端访问 Google Gemini API（包括 Live API）

---

### 2. 创建 geminiLiveService.js

**文件位置**: `/character-app/src/services/geminiLiveService.js`

**核心功能**:
- WebSocket 连接管理（通过 `@google/genai` SDK）
- 实时音频流处理
- 自动 WAV 音频编码（44字节 header + PCM data）
- 消息队列管理
- Callback 驱动架构

**主要方法**:
```javascript
// 连接到 Gemini Live API
await geminiLive.connect()

// 发送文本消息
await geminiLive.sendText("Ask me a question")

// 发送音频数据（base64 encoded）
await geminiLive.sendAudio(base64AudioData, 'audio/pcm;rate=16000')

// 关闭连接
geminiLive.close()
```

**配置选项**:
```javascript
const live = new GeminiLiveService(apiKey, {
  model: 'models/gemini-2.0-flash-exp',
  voiceName: 'Pika', // 语音选项: Pika, Zephyr, Aoede, Charon, Kore, Fenrir, Orbit
  responseModality: 'AUDIO_TEXT', // 'AUDIO' | 'TEXT' | 'AUDIO_TEXT'
  temperature: 0.9,

  // Callbacks
  onText: (text) => {},      // 接收文本转录
  onAudio: (data, mime) => {}, // 接收音频数据（base64）
  onConnected: () => {},     // 连接成功
  onError: (error) => {},    // 错误处理
  onClosed: (event) => {}    // 连接关闭
})
```

**音频处理流程**:
1. 接收 base64 PCM 音频数据
2. 解码为 Uint8Array
3. 添加 44 字节 WAV header
4. 创建 Blob 和 URL
5. 使用 `new Audio()` 播放

---

### 3. 修改 Stage2Mirror.jsx 集成 Live API

**文件位置**: `/character-app/src/pages/Onboarding/stages/Stage2Mirror.jsx`

#### 3.1 添加 Gemini Live 状态

```javascript
const [geminiLive, setGeminiLive] = useState(null)
const [geminiConnected, setGeminiConnected] = useState(false)
const geminiLiveRef = useRef(null)
```

#### 3.2 添加 Gemini Live 连接逻辑 (Line 105-158)

```javascript
useEffect(() => {
  const connectGeminiLive = async () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY

    const live = new GeminiLiveService(apiKey, {
      voiceName: 'Pika',
      responseModality: 'AUDIO_TEXT', // ✅ 同时返回音频和文本
      temperature: 0.9,

      onText: (text) => {
        // 自动添加到消息历史
        setMessages(prev => [...prev, { role: 'ai', text }])
        conversationCountRef.current += 1
      },
      onConnected: () => setGeminiConnected(true),
      onError: (error) => console.error('[Stage2Mirror] Gemini Live error:', error),
      onClosed: () => setGeminiConnected(false)
    })

    await live.connect()
    setGeminiLive(live)
    geminiLiveRef.current = live
  }

  connectGeminiLive()

  return () => {
    if (geminiLiveRef.current) {
      geminiLiveRef.current.close()
    }
  }
}, [])
```

#### 3.3 重构 generateAIQuestion() 使用 Live API (Line 304-355)

**之前（REST API）**:
```javascript
const generateAIQuestion = async () => {
  // 调用 chatWithGemini() REST API
  const question = await chatWithGemini(systemPrompt, messages, latestAnalysis)

  // 手动添加到消息
  setMessages(prev => [...prev, { role: 'ai', text: question }])

  // 手动调用 TTS
  await speakMessage(question)
}
```

**之后（Live API）**:
```javascript
const generateAIQuestion = async () => {
  // 检查连接状态
  if (isAISpeaking || !geminiLive || !geminiConnected) return

  setIsAISpeaking(true)

  try {
    // 构建上下文提示
    let contextPrompt = ''
    if (latestAnalysis) {
      contextPrompt = `Visual Context: User is in ${latestAnalysis.location}. Clothing: ${latestAnalysis.clothing}. Mood: ${latestAnalysis.mood}.`
    }

    const prompt = `${contextPrompt}

Based on this visual context, ask ONE simple, gentle question to learn about the user. Keep it under 10 words.`

    // 🔥 发送到 Gemini Live
    await geminiLive.sendText(prompt)

    // ✅ 音频和文本响应由 callbacks 自动处理：
    // - onText callback 会自动添加消息到 conversation
    // - 音频会自动播放（geminiLiveService.js 中的 playAudio）

  } catch (error) {
    console.error('[Stage2Mirror] Failed to generate AI question:', error)
    // Fallback 逻辑...
  } finally {
    setIsAISpeaking(false)
  }
}
```

**关键改进**:
- ✅ 不再需要手动调用 `speakMessage()`
- ✅ 不再需要手动更新 `messages`（由 onText callback 处理）
- ✅ 音频自动播放（由 geminiLiveService 处理）
- ✅ 文本自动添加到对话历史

---

## 🎯 技术架构

### 数据流

```
用户界面 (Stage2Mirror.jsx)
    ↓
    | generateAIQuestion() 调用
    ↓
geminiLive.sendText(prompt)
    ↓
    | WebSocket 通信 (@google/genai SDK)
    ↓
Gemini Live API (Google 服务器)
    ↓
    | 返回音频 + 文本
    ↓
geminiLiveService.handleMessage()
    ├─→ onText callback → 更新 messages 状态
    └─→ playAudio() → 浏览器播放音频
    ↓
用户听到 AI 语音响应，看到文本显示
```

### Callback 驱动模式

```javascript
// geminiLiveService.js 中的 callback 触发顺序
1. onConnected() → 连接建立
2. onText(text) → 接收文本转录
3. onAudio(data, mimeType) → 接收音频数据
4. playAudio() 自动调用 → 播放音频
5. onClosed() → 连接关闭
```

---

## 🔧 环境变量

确保在 `.env` 文件中设置：

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

**获取 API Key**:
- 访问 https://aistudio.google.com/apikey
- 创建新的 API key
- 复制粘贴到 `.env` 文件

---

## 🧪 测试清单

### 手动测试步骤

1. **启动开发服务器**:
   ```bash
   cd /Users/jiajun/social-look-app
   npm run dev:character
   ```

2. **访问 Onboarding 流程**:
   - 打开浏览器：http://localhost:5173
   - 进入 Stage 1 (Boot)
   - 点击 "INITIATE TALKING" → 进入 Stage 2

3. **Stage 2 测试要点**:
   - [ ] 摄像头自动启动
   - [ ] INTRO 阶段：听到 AI 语音 "I am your guide." 和 "Please show me your form."
   - [ ] 进入 CONVERSATION 阶段（2秒后）
   - [ ] 每 10 秒自动分析画面（检查 console 日志）
   - [ ] 2 秒后自动生成第一个 AI 问题
   - [ ] 听到 AI 语音问题（Pika 语音）
   - [ ] 在屏幕上看到 AI 问题文本

4. **检查浏览器 Console 日志**:
   ```
   [Stage2Mirror] Connecting to Gemini Live...
   [GeminiLive] Service initialized
   [GeminiLive] Connecting...
   [GeminiLive] ✅ Connected
   [Stage2Mirror] ✅ Gemini Live connected
   [Stage2Mirror] ✅ Gemini Live ready
   [Stage2Mirror] Sending prompt to Gemini Live: ...
   [GeminiLive] 📨 Message received: ...
   [GeminiLive] 🔊 Audio data received
   [GeminiLive] Playing audio...
   [GeminiLive] ✅ Audio playing
   [GeminiLive] 💬 Text received: ...
   [Stage2Mirror] Gemini text: ...
   ```

5. **测试错误处理**:
   - [ ] 暂时移除 `VITE_GEMINI_API_KEY`，检查是否有友好的错误提示
   - [ ] 模拟网络断开，检查 fallback 机制是否生效
   - [ ] 检查 INTRO 超时保护（20秒后强制进入 CONVERSATION）

---

## 📝 已知限制和待办事项

### 当前限制

1. **单向对话**: 目前只实现了 AI → User 方向的语音，User 还不能通过麦克风回复
2. **INTRO 阶段**: INTRO 阶段仍然使用 TTS 服务（speakMessage），未使用 Live API
3. **对话轮数**: 没有限制对话轮数（可能需要添加最大轮数限制）
4. **错误重试**: 如果 Live API 连接失败，没有自动重试机制

### 待办事项

#### 1. 实现麦克风输入（双向对话）

**优先级**: 中
**复杂度**: 高

**实现思路**:
```javascript
// 在 Stage2Mirror.jsx 中添加
const [isRecording, setIsRecording] = useState(false)
const mediaRecorderRef = useRef(null)

const startRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mediaRecorder = new MediaRecorder(stream)

  mediaRecorder.ondataavailable = async (event) => {
    const audioBlob = event.data
    const arrayBuffer = await audioBlob.arrayBuffer()
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    // 发送音频到 Gemini Live
    await geminiLive.sendAudio(base64Audio, 'audio/pcm;rate=16000')
  }

  mediaRecorder.start()
  mediaRecorderRef.current = mediaRecorder
  setIsRecording(true)
}

const stopRecording = () => {
  if (mediaRecorderRef.current) {
    mediaRecorderRef.current.stop()
    setIsRecording(false)
  }
}
```

**UI 修改**:
- 添加麦克风按钮（按住说话）
- 录音时显示波形动画
- 用户语音识别结果显示在消息列表中

#### 2. 改进 INTRO 阶段使用 Live API

**优先级**: 低
**复杂度**: 中

**问题**: INTRO 阶段的语音目前使用 TTS 服务，应该统一使用 Gemini Live API

**实现思路**:
```javascript
// 在 INTRO 阶段也使用 Live API
useEffect(() => {
  const runIntro = async () => {
    if (phase === 'INTRO' && geminiLive && geminiConnected) {
      await startCamera()

      // 使用 Live API 发送预设文本
      await geminiLive.sendText("Say: I am your guide.")
      await new Promise(r => setTimeout(r, 3000))

      await geminiLive.sendText("Say: Please show me your form.")
      await new Promise(r => setTimeout(r, 3000))

      setPhase('CONVERSATION')
    }
  }

  runIntro()
}, [phase, geminiLive, geminiConnected])
```

#### 3. 添加对话轮数限制

**优先级**: 中
**复杂度**: 低

**实现**:
```javascript
const MAX_CONVERSATION_ROUNDS = 5

const generateAIQuestion = async () => {
  // 检查对话轮数
  if (conversationCountRef.current >= MAX_CONVERSATION_ROUNDS) {
    console.log('[Stage2Mirror] Reached max conversation rounds')
    return
  }

  // ... rest of logic
}
```

#### 4. 添加重试机制

**优先级**: 中
**复杂度**: 中

**实现**:
```javascript
const connectGeminiLive = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      await live.connect()
      setGeminiLive(live)
      return
    } catch (error) {
      console.error(`[Stage2Mirror] Connection attempt ${i + 1} failed:`, error)
      if (i === retries - 1) throw error
      await new Promise(r => setTimeout(r, 2000)) // 等待 2 秒后重试
    }
  }
}
```

---

## 🎉 总结

### 完成情况

✅ **核心功能已实现**:
- Gemini Live API 连接管理
- 实时语音生成和播放
- 文本转录自动显示
- 上下文感知对话（基于照片分析）
- 错误处理和 fallback 机制

✅ **代码质量**:
- 编译无错误
- HMR 热更新正常
- Console 日志完善
- 代码注释清晰

### 下一步

1. **手动测试**: 在浏览器中测试实时语音对话功能
2. **用户测试**: 收集用户反馈
3. **可选改进**: 根据需求实现麦克风输入

---

**开发服务器状态**: ✅ 正常运行 (http://localhost:5173)
**编译状态**: ✅ 无错误
**HMR 状态**: ✅ 正常工作
