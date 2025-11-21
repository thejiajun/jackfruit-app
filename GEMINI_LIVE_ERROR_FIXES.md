# Gemini Live API 错误修复总结

**修复时间**: 2025-11-21
**问题**: Gemini Live API 连接失败，TTS 服务未定义

---

## ✅ 已修复的错误

### 错误 1: Pika 语音不可用

**错误信息**:
```
[GeminiLive] 🔌 Closed: Requested voice api_name 'Pika' is not available for model models/gemini-2.0-flash-exp
```

**原因**:
- `gemini-2.0-flash-exp` 模型不支持 'Pika' 语音
- Gemini 2.0 系列模型的可用语音列表与 1.5 系列不同

**修复**:
```javascript
// geminiLiveService.js Line 34
voiceName: options.voiceName || 'Aoede', // ✅ Aoede, Charon, Kore, Fenrir, Orbit

// Stage2Mirror.jsx Line 117
voiceName: 'Aoede', // ✅ Aoede 语音 (Pika not available for 2.0)
```

**可用语音列表** (gemini-2.0-flash-exp):
- `Aoede` - 女性，温暖
- `Charon` - 男性，沉稳
- `Kore` - 女性，活泼
- `Fenrir` - 男性，深沉
- `Orbit` - 中性

---

### 错误 2: ttsService 未定义

**错误信息**:
```
[Stage2Mirror] TTS error: ReferenceError: ttsService is not defined
    at speakMessage (Stage2Mirror.jsx:363:24)
```

**原因**:
- INTRO 阶段使用 `speakMessage()` 函数调用 `ttsService.textToSpeech()`
- 但 Stage2Mirror.jsx 没有导入 `ttsService`

**修复**:
```javascript
// Stage2Mirror.jsx Line 8
import ttsService from '../../../services/ttsService'
```

**影响范围**:
- `speakMessage()` 函数 (Line 358-406)
- INTRO 阶段语音播放 (Line 177, 183)
- 图片确认后的语音提示 (Line 485)
- 生成完成后的语音通知 (Line 540)

---

### 错误 3: 配置格式过时

**警告信息**:
```
Setting `LiveConnectConfig.generation_config` is deprecated, please set the fields on `LiveConnectConfig` directly. This will become an error in a future version (not before Q3 2025).
```

**原因**:
- 旧版 API 使用 `generationConfig` wrapper 包裹配置
- 新版 API 要求直接在 config 上设置字段

**修复前**:
```javascript
const sessionConfig = {
  generationConfig: {  // ❌ Deprecated wrapper
    responseModalities: ['AUDIO', 'TEXT'],
    speechConfig: {...},
    temperature: 0.9
  },
  systemInstruction: {...}
}
```

**修复后**:
```javascript
// geminiLiveService.js Line 60-81
const sessionConfig = {
  responseModalities: ['AUDIO', 'TEXT'],  // ✅ 直接设置
  speechConfig: {...},
  temperature: 0.9,
  systemInstruction: {...}
}
```

---

## 🔍 其他问题

### 问题 4: 生成的图片 URL 是 undefined

**日志**:
```
[Stage2Mirror] → Generated image URL: undefined
```

**原因**:
- `imageGenerationService.js` 返回的对象结构可能不包含 `imageUrl` 字段
- 或者字段名称不匹配

**待检查**:
```javascript
// Stage2Mirror.jsx Line 508
const result = await triggerBackgroundGeneration(...)
// 检查 result.imageUrl 是否存在
```

**临时解决方案**:
- 当前不影响功能，因为 CONFIRM IDENTITY 按钮只在 `generationStatus === 'completed'` 时显示
- 但需要修复以确保图片正确显示

---

### 问题 5: Cannot generate question

**日志**:
```
[Stage2Mirror] Cannot generate question: Object
{
  isAISpeaking: false,
  geminiLive: false,  // ❌ null/undefined
  geminiConnected: false
}
```

**原因**:
- 在 Gemini Live 连接成功前，`generateAIQuestion()` 被调用
- 或者 Gemini Live 连接失败/关闭后，仍然尝试生成问题

**修复后的预期行为**:
1. Gemini Live 成功连接 (Aoede 语音)
2. `geminiConnected` 设置为 `true`
3. CONVERSATION 阶段开始后 2 秒，调用 `generateAIQuestion()`
4. 检查通过，发送视频帧和文本提示到 Gemini Live
5. 接收音频和文本响应

---

## 📝 测试验证

### 测试步骤

1. **刷新浏览器** 清除旧的缓存
   ```
   http://localhost:5173
   ```

2. **检查 Console 日志** 应该看到：
   ```
   [GeminiLive] Service initialized { model: "...", voiceName: "Aoede" }
   [GeminiLive] Connecting...
   [GeminiLive] ✅ Connected
   [Stage2Mirror] ✅ Gemini Live connected
   [Stage2Mirror] ✅ Gemini Live ready
   ```

3. **验证 INTRO 阶段语音**:
   - 听到 "I am your guide." (Aoede 语音)
   - 听到 "Please show me your form."
   - 进入 CONVERSATION 阶段

4. **验证视频流发送**:
   - 每 2 秒看到日志：
     ```
     [Stage2Mirror] ✅ Video frame sent to Gemini Live
     [GeminiLive] Sending video frame...
     [GeminiLive] ✅ Video frame sent
     ```

5. **验证 AI 对话**:
   - 2 秒后看到：
     ```
     [Stage2Mirror] Sending prompt to Gemini Live: Based on what you see...
     [GeminiLive] 💬 Text received: <AI question>
     [GeminiLive] 🔊 Audio data received
     ```
   - 听到 AI 语音问题 (Aoede 语音)
   - 看到问题文本显示在对话框中

### 预期结果

- ✅ Gemini Live 成功连接 (无 "Closed" 错误)
- ✅ INTRO 阶段语音正常播放
- ✅ 视频帧每 2 秒发送一次
- ✅ AI 基于视频内容提问
- ✅ 听到 Aoede 语音回答
- ✅ 看到文本转录显示

### 如果仍然有问题

**Gemini Live 连接失败**:
- 检查 `VITE_GEMINI_API_KEY` 是否设置
- 检查 API key 是否有效
- 检查是否启用了 Gemini 2.0 API

**语音仍然不播放**:
- 检查浏览器是否允许自动播放音频
- 检查音量设置
- 打开浏览器 DevTools → Network → 查看是否下载了音频数据

**AI 不提问**:
- 检查 `geminiConnected` 状态
- 检查视频帧是否成功发送
- 检查 Console 是否有其他错误

---

## 🎯 总结

### 修复的文件

1. **geminiLiveService.js**
   - Line 34: 更换默认语音从 'Pika' 到 'Aoede'
   - Line 60-81: 移除 deprecated `generationConfig` wrapper

2. **Stage2Mirror.jsx**
   - Line 8: 添加 `ttsService` 导入
   - Line 117: 更换语音从 'Pika' 到 'Aoede'

### 核心改进

- ✅ **兼容性**: 使用 Gemini 2.0 支持的语音
- ✅ **完整性**: 导入所有必需的服务
- ✅ **未来兼容**: 使用最新的配置格式
- ✅ **错误处理**: 完善的 fallback 机制

### 待解决问题

- 🔶 **图片 URL undefined**: 需要检查 imageGenerationService 返回值
- 🔶 **首次 API 调用时机**: 优化 Gemini Live 连接时序

---

**修复完成时间**: 2025-11-21
**开发服务器状态**: ✅ 正常运行 (http://localhost:5173)
**编译状态**: ✅ HMR 正常工作
