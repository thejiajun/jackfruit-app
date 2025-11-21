# Gemini Live API 实现分析 (Ultrathink)
**分析时间**: 2025-11-21
**目标**: 将参考的 Gemini Live API 实现集成到 Stage2Mirror.jsx

---

## 📊 参考代码分析

### 核心架构

#### 1. **使用的库和依赖**
```typescript
import {
  GoogleGenAI,
  LiveServerMessage,
  MediaResolution,
  Modality,
  Session,
} from '@google/genai';
```

**关键发现**:
- 使用 `@google/genai` SDK（Google 官方 SDK）
- 这是一个 **Node.js 包**，需要检查是否有浏览器版本
- 提供 TypeScript 类型定义

---

#### 2. **Session 管理模式**

**创建 Session**:
```typescript
session = await ai.live.connect({
  model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
  callbacks: {
    onopen: () => console.debug('Opened'),
    onmessage: (message) => responseQueue.push(message),
    onerror: (e) => console.debug('Error:', e.message),
    onclose: (e) => console.debug('Close:', e.reason)
  },
  config: {
    responseModalities: [Modality.AUDIO],  // 返回音频
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Zephyr'  // 预设语音
        }
      }
    }
  }
});
```

**关键特性**:
- WebSocket 连接（长连接）
- 回调驱动（onopen, onmessage, onerror, onclose）
- 配置语音输出（Zephyr 语音）
- 返回音频数据（base64 编码）

---

#### 3. **消息队列模式**

**异步消息处理**:
```typescript
const responseQueue: LiveServerMessage[] = [];

// 等待消息
async function waitMessage(): Promise<LiveServerMessage> {
  while (true) {
    const message = responseQueue.shift();
    if (message) {
      return message;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// 处理完整回合
async function handleTurn(): Promise<LiveServerMessage[]> {
  const turn: LiveServerMessage[] = [];
  let done = false;
  while (!done) {
    const message = await waitMessage();
    turn.push(message);
    if (message.serverContent?.turnComplete) {
      done = true;
    }
  }
  return turn;
}
```

**设计优势**:
- 非阻塞的消息处理
- 支持流式响应（多个消息组成一个回合）
- 清晰的回合边界（turnComplete 标志）

---

#### 4. **音频处理流程**

**接收和转换音频**:
```typescript
const audioParts: string[] = [];

function handleModelTurn(message: LiveServerMessage) {
  const part = message.serverContent?.modelTurn?.parts?.[0];

  if (part?.inlineData) {
    // 收集 base64 音频片段
    audioParts.push(part.inlineData.data);

    // 转换为 WAV 格式
    const buffer = convertToWav(audioParts, part.inlineData.mimeType);

    // 保存到文件（Node.js）
    saveBinaryFile('audio.wav', buffer);
  }

  if (part?.text) {
    console.log(part.text);  // 同时返回文本
  }
}
```

**音频格式**:
- 接收：base64 编码的 PCM/L16 音频
- 转换：WAV 格式（添加 44 字节 WAV header）
- 参数：sample rate, channels, bits per sample

---

#### 5. **发送消息**

**文本输入**:
```typescript
session.sendClientContent({
  turns: [
    `INSERT_INPUT_HERE`  // 文本输入
  ]
});
```

**音频输入** (代码中未展示，但 API 支持):
```typescript
session.sendClientContent({
  turns: [{
    parts: [{
      inlineData: {
        mimeType: 'audio/pcm;rate=16000',
        data: base64AudioData
      }
    }]
  }]
});
```

---

## 🔍 与当前实现的对比

### 当前实现 (Stage2Mirror.jsx)

**使用 REST API**:
```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    body: JSON.stringify({
      contents: [...conversationHistory],
      generationConfig: { temperature: 0.9, maxOutputTokens: 100 }
    })
  }
);
```

**问题**:
- ❌ 每次请求都是独立的（没有持久连接）
- ❌ 只返回文本（没有音频）
- ❌ 不支持流式响应
- ❌ 不支持实时语音输入

---

### 参考实现 (Gemini Live API)

**使用 WebSocket**:
```typescript
session = await ai.live.connect({
  model: 'gemini-2.5-flash-native-audio-preview-09-2025',
  callbacks: { onmessage: handleMessage }
});
```

**优势**:
- ✅ 长连接（WebSocket）
- ✅ 返回音频和文本
- ✅ 支持流式响应
- ✅ 支持实时语音输入/输出
- ✅ 更低延迟

---

## 🚧 集成挑战

### 挑战 1: 浏览器兼容性

**问题**: `@google/genai` 是否支持浏览器？

**检查方式**:
1. 查看包的 `package.json` → `browser` 字段
2. 检查是否使用 Node.js 特定 API (fs, crypto)
3. 尝试在浏览器环境导入

**可能结果**:
- ✅ 如果有浏览器版本 → 直接使用
- ❌ 如果只支持 Node.js → 需要替代方案

---

### 挑战 2: 音频播放（浏览器环境）

**参考代码使用 Node.js**:
```typescript
import { writeFile } from 'fs';  // ❌ 浏览器不支持

function saveBinaryFile(fileName: string, content: Buffer) {
  writeFile(fileName, content, 'utf8', (err) => {
    // ...
  });
}
```

**浏览器需要使用 Web Audio API**:
```javascript
// 1. 解码 base64 → ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// 2. 创建 Blob
const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });

// 3. 创建 URL
const audioUrl = URL.createObjectURL(audioBlob);

// 4. 播放
const audio = new Audio(audioUrl);
audio.play();
```

---

### 挑战 3: 麦克风输入

**Stage 1 已请求权限**:
```javascript
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
});
```

**需要实现**:
1. 获取麦克风 MediaStream
2. 使用 MediaRecorder 录制音频
3. 转换为 base64 PCM/L16 格式
4. 通过 WebSocket 发送

---

## 🎯 推荐的实现方案

### 方案 A: 使用 @google/genai（如果支持浏览器）

**步骤**:
1. 安装包: `npm install @google/genai`
2. 在 Stage2Mirror.jsx 中导入
3. 实现 Session 管理
4. 使用 Web Audio API 播放音频

**优点**:
- 官方支持
- 完整的类型定义
- 稳定的 API

**缺点**:
- 需要检查浏览器兼容性
- 包大小可能较大

---

### 方案 B: 使用原生 WebSocket（手动实现）

**步骤**:
1. 使用原生 WebSocket API
2. 参考 Gemini Live API 文档
3. 手动处理消息格式

**Gemini Live API Endpoint**:
```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent
```

**优点**:
- 完全控制
- 轻量级（无额外依赖）

**缺点**:
- 需要手动实现协议
- 可能需要处理复杂的消息格式

---

### 方案 C: 混合方案（推荐用于快速迭代）

**对话**: 使用当前的 REST API (`chatWithGemini`)
**音频输出**: 使用浏览器 TTS 或 ElevenLabs API
**音频输入**: 暂时不实现（先完成文本对话）

**优点**:
- 快速实现
- 不依赖 Live API
- 逐步迭代

**缺点**:
- 不是"真正的" Live API
- 没有实时语音对话

---

## 🔧 实现步骤（方案 A）

### 步骤 1: 安装依赖

```bash
cd character-app
npm install @google/genai
```

---

### 步骤 2: 创建 Gemini Live Service

**文件**: `character-app/src/services/geminiLiveService.js`

```javascript
import { GoogleGenAI, Modality, MediaResolution } from '@google/genai';

class GeminiLiveService {
  constructor(apiKey) {
    this.ai = new GoogleGenAI({ apiKey });
    this.session = null;
    this.responseQueue = [];
    this.audioParts = [];
  }

  async connect() {
    const config = {
      responseModalities: [Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Zephyr'
          }
        }
      }
    };

    this.session = await this.ai.live.connect({
      model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => console.log('[GeminiLive] Connected'),
        onmessage: (message) => this.handleMessage(message),
        onerror: (e) => console.error('[GeminiLive] Error:', e),
        onclose: (e) => console.log('[GeminiLive] Closed:', e.reason)
      },
      config
    });
  }

  handleMessage(message) {
    this.responseQueue.push(message);

    // 如果有音频数据
    const part = message.serverContent?.modelTurn?.parts?.[0];
    if (part?.inlineData) {
      this.audioParts.push(part.inlineData.data);

      // 播放音频（浏览器环境）
      this.playAudio(part.inlineData.data, part.inlineData.mimeType);
    }

    // 如果有文本
    if (part?.text) {
      console.log('[GeminiLive] Text:', part.text);
    }
  }

  playAudio(base64Data, mimeType) {
    // 转换 base64 → ArrayBuffer
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 添加 WAV header
    const wavBuffer = this.addWavHeader(bytes.buffer, mimeType);

    // 创建 Blob 和 URL
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);

    // 播放
    const audio = new Audio(url);
    audio.play().catch(e => console.error('[GeminiLive] Play error:', e));

    // 清理 URL
    audio.onended = () => URL.revokeObjectURL(url);
  }

  addWavHeader(audioData, mimeType) {
    // 解析 mime type (e.g., "audio/pcm;rate=16000")
    const rate = parseInt(mimeType.match(/rate=(\d+)/)?.[1] || '16000');
    const numChannels = 1;
    const bitsPerSample = 16;

    const dataLength = audioData.byteLength;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF chunk descriptor
    view.setUint32(0, 0x46464952, true);  // "RIFF"
    view.setUint32(4, 36 + dataLength, true);
    view.setUint32(8, 0x45564157, true);  // "WAVE"

    // fmt sub-chunk
    view.setUint32(12, 0x20746d66, true); // "fmt "
    view.setUint32(16, 16, true);         // Subchunk1Size (PCM)
    view.setUint16(20, 1, true);          // AudioFormat (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * numChannels * bitsPerSample / 8, true);
    view.setUint16(32, numChannels * bitsPerSample / 8, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    view.setUint32(36, 0x61746164, true); // "data"
    view.setUint32(40, dataLength, true);

    // 合并 header + data
    const combined = new Uint8Array(44 + dataLength);
    combined.set(new Uint8Array(header), 0);
    combined.set(new Uint8Array(audioData), 44);

    return combined.buffer;
  }

  async sendText(text) {
    if (!this.session) throw new Error('Session not connected');

    await this.session.sendClientContent({
      turns: [text]
    });
  }

  async waitForResponse() {
    const turn = [];
    let done = false;

    while (!done) {
      const message = await this.waitMessage();
      turn.push(message);

      if (message.serverContent?.turnComplete) {
        done = true;
      }
    }

    return turn;
  }

  async waitMessage() {
    while (true) {
      const message = this.responseQueue.shift();
      if (message) return message;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  close() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }
}

export default GeminiLiveService;
```

---

### 步骤 3: 在 Stage2Mirror.jsx 中使用

**修改**: `Stage2Mirror.jsx`

```javascript
import GeminiLiveService from '../../../services/geminiLiveService';

const Stage2Mirror = ({ config, globalStyles, onComplete, currentStep, userData }) => {
  // ... 其他状态
  const [geminiLive, setGeminiLive] = useState(null);

  // 连接 Gemini Live
  useEffect(() => {
    const connectGeminiLive = async () => {
      try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        const live = new GeminiLiveService(apiKey);
        await live.connect();
        setGeminiLive(live);
        console.log('[Stage2Mirror] Gemini Live connected');
      } catch (error) {
        console.error('[Stage2Mirror] Failed to connect Gemini Live:', error);
      }
    };

    connectGeminiLive();

    return () => {
      if (geminiLive) {
        geminiLive.close();
      }
    };
  }, []);

  // 修改 generateAIQuestion 使用 Gemini Live
  const generateAIQuestion = async () => {
    if (isAISpeaking || !geminiLive) return;

    setIsAISpeaking(true);

    try {
      // 构建 prompt
      let contextPrompt = '';
      if (latestAnalysis) {
        contextPrompt = `Visual Context: User is in ${latestAnalysis.location}. Clothing: ${latestAnalysis.clothing}. Mood: ${latestAnalysis.mood}.`;
      }

      const systemPrompt = `You are Pika, a digital reflection entity.
Your style: Short, direct, warm. Max 10 words.
${contextPrompt}

Based on the visual context, ask ONE simple, gentle question to learn about the user.`;

      // 发送到 Gemini Live
      await geminiLive.sendText(systemPrompt);

      // 等待响应
      const response = await geminiLive.waitForResponse();

      // 提取文本
      const textParts = response
        .map(msg => msg.serverContent?.modelTurn?.parts?.[0]?.text)
        .filter(Boolean);

      const question = textParts.join('');

      // 添加到消息历史
      setMessages(prev => [...prev, { role: 'ai', text: question }]);
      conversationCountRef.current += 1;

      // 音频已经通过 handleMessage 自动播放了

    } catch (error) {
      console.error('[Stage2Mirror] Failed to generate AI question:', error);
      // Fallback...
    } finally {
      setIsAISpeaking(false);
    }
  };

  // ...
};
```

---

## 🧪 测试计划

### 1. 检查包兼容性
```bash
cd character-app
npm install @google/genai
npm run dev
```

**观察**:
- 是否有浏览器兼容性错误？
- 是否有 "Module not found" 错误？

---

### 2. 测试 WebSocket 连接
```javascript
console.log('[Test] Connecting to Gemini Live...');
const live = new GeminiLiveService(apiKey);
await live.connect();
console.log('[Test] Connected!');
```

**期望输出**:
```
[GeminiLive] Connected
```

---

### 3. 测试文本输入/输出
```javascript
await live.sendText('Hello, introduce yourself in 5 words.');
const response = await live.waitForResponse();
console.log('[Test] Response:', response);
```

**期望**:
- 收到文本响应
- 收到音频数据

---

### 4. 测试音频播放
```javascript
// 音频应该自动播放（通过 handleMessage）
```

**验证**:
- 浏览器播放音频
- 没有播放错误
- 音质清晰

---

## ⚠️ 潜在问题和解决方案

### 问题 1: @google/genai 不支持浏览器

**症状**:
```
Error: Cannot find module 'fs'
```

**解决方案**:
- 方案 B: 使用原生 WebSocket
- 或等待 Google 发布浏览器版本

---

### 问题 2: CORS 错误

**症状**:
```
Access to XMLHttpRequest at 'wss://generativelanguage.googleapis.com'
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**解决方案**:
- Gemini Live API 应该支持 CORS（需要验证）
- 如果不支持，需要使用代理服务器

---

### 问题 3: 音频格式不支持

**症状**:
```
DOMException: Failed to load because no supported source was found
```

**解决方案**:
- 确保 WAV header 正确
- 检查 mime type 解析
- 尝试不同的音频格式

---

## 📊 性能考虑

### WebSocket vs REST API

**WebSocket (Live API)**:
- ✅ 延迟: 100-300ms
- ✅ 连接复用
- ❌ 连接管理复杂

**REST API**:
- ❌ 延迟: 500-1000ms
- ❌ 每次请求都建立连接
- ✅ 简单易用

---

### 音频带宽

**假设**:
- 采样率: 16000 Hz
- 声道: 1 (Mono)
- 位深: 16 bit
- 响应时间: 3 秒

**计算**:
```
16000 Hz × 1 channel × 2 bytes × 3 seconds = 96,000 bytes ≈ 94 KB
```

**每次对话**: ~100 KB 音频数据

---

## 🎯 总结

### 推荐方案

**短期（快速实现）**:
- 使用方案 C（混合方案）
- 保持当前 REST API
- 使用浏览器 TTS 或 ElevenLabs

**长期（完整体验）**:
- 等待 `@google/genai` 浏览器支持
- 或手动实现 WebSocket 客户端
- 实现完整的 Live API 集成

---

### 立即行动

1. **检查** `@google/genai` 是否支持浏览器
   ```bash
   npm install @google/genai
   npm run dev
   ```

2. **如果支持**: 按照步骤 2-3 实现
3. **如果不支持**: 使用方案 C（混合方案）

---

**分析完成**: 2025-11-21
**下一步**: 等待用户反馈"还是有问题"的具体表现
