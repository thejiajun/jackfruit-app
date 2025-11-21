# Stage 2 Mirror 功能实现深度分析 (Ultrathink)
**分析时间**: 2025-11-21
**问题**: 为什么 Stage 2 只显示 mirror，没有实时对话？

---

## 🔍 问题诊断

### 发现的核心问题

#### ❌ **问题 1: 开发环境 Gemini API 被禁用**

**文件**: `envService.js` Line 29-36
```javascript
getGeminiVisionConfig() {
  if (this.isDevelopment()) {
    return {
      enabled: false,        // ❌ 开发环境禁用
      mock: true,            // ✅ 使用 mock 数据
      mockDelay: 2000
    }
  }
  // ...
}
```

**影响**:
- 当前运行在开发模式 (`npm run dev`)
- Gemini Vision API 返回 `mock: true`
- Gemini Chat API 也返回 `mock: true`
- 但这本身不是问题，因为 mock 模式仍应该显示对话

---

#### ❌ **问题 2: INTRO Phase 可能卡住**

**文件**: `Stage2Mirror.jsx` Line 97-125

**INTRO 流程**:
```javascript
useEffect(() => {
  const runIntro = async () => {
    if (phase === 'INTRO') {
      console.log('[Stage2Mirror] Starting INTRO sequence...')

      // 1. 启动相机
      await startCamera()

      // 2. 第一条消息: "I am your guide."
      const text1 = "I am your guide."
      setMessages([{ role: 'ai', text: text1 }])
      await speakMessage(text1)  // ⚠️ 可能在这里卡住
      await new Promise(r => setTimeout(r, 2500))

      // 3. 第二条消息: "Please show me your form."
      const text2 = "Please show me your form."
      setMessages(prev => [...prev, { role: 'ai', text: text2 }])
      await speakMessage(text2)  // ⚠️ 可能在这里卡住
      await new Promise(r => setTimeout(r, 3000))

      // 4. 转换到 CONVERSATION phase
      console.log('[Stage2Mirror] INTRO complete, transitioning to CONVERSATION')
      setPhase('CONVERSATION')
      setConversationSubState('CAMERA')
    }
  }

  runIntro()
}, [phase])
```

**可能的卡点**:
1. `speakMessage(text1)` 可能永远不返回
2. `speakMessage(text2)` 可能永远不返回
3. 如果 TTS 失败且没有超时，整个流程会卡住
4. **关键**: 如果 INTRO 没有完成，就永远不会进入 CONVERSATION phase

---

#### ❌ **问题 3: speakMessage() 实现可能有问题**

**文件**: `Stage2Mirror.jsx` Line 266-314

```javascript
const speakMessage = async (text) => {
  try {
    console.log('[Stage2Mirror] Speaking:', text)

    // 调用 TTS service
    const audioUrl = await ttsService.textToSpeech(text, {
      voiceId: 'Pika',
      fallbackToBrowser: true
    })

    if (audioUrl) {
      const audio = new Audio(audioUrl)

      // ⚠️ Promise 包装器
      const playPromise = new Promise((resolve) => {
        audio.onended = () => {
          console.log('[Stage2Mirror] Audio finished')
          resolve()
        }
        audio.onerror = (error) => {
          console.error('[Stage2Mirror] Audio playback error:', error)
          resolve() // ✅ 错误时也 resolve
        }

        // ⚠️ 10秒超时
        setTimeout(() => {
          console.warn('[Stage2Mirror] Audio timeout, continuing...')
          audio.pause()
          resolve()
        }, 10000)

        audio.play().catch(error => {
          console.error('[Stage2Mirror] Audio play error:', error)
          resolve() // ✅ 错误时也 resolve
        })
      })

      await playPromise
    } else {
      // ⚠️ Browser TTS fallback - 没有实现！
      console.log('[Stage2Mirror] Using browser TTS fallback')
      // TODO: Implement voiceService.speak(text) if needed
    }
  } catch (error) {
    console.error('[Stage2Mirror] TTS error:', error)
    // ✅ 错误时继续执行（不阻塞）
  }
}
```

**潜在问题**:
1. `ttsService.textToSpeech()` 可能返回 `null`（开发环境）
2. 如果返回 `null`，代码进入 `else` 分支但什么都不做
3. **没有实现 browser TTS fallback**
4. 虽然有 `try/catch`，但如果没有明确返回，Promise 可能不 resolve

---

#### ❌ **问题 4: CONVERSATION Phase 触发条件**

**文件**: `Stage2Mirror.jsx` Line 208-215

```javascript
useEffect(() => {
  // Start first AI question when entering CONVERSATION phase
  if (phase === 'CONVERSATION' && conversationCountRef.current === 0) {
    setTimeout(() => {
      generateAIQuestion()
    }, 2000) // Wait 2s after transition
  }
}, [phase])
```

**问题**:
- 依赖项只有 `[phase]`
- 如果 INTRO phase 卡住，`phase` 永远不会变成 `'CONVERSATION'`
- 因此这个 useEffect 永远不会触发

---

#### ❌ **问题 5: Auto-Frame Analysis 可能消耗 API**

**文件**: `Stage2Mirror.jsx` Line 169-203

```javascript
useEffect(() => {
  if (
    phase === 'CONVERSATION' &&
    mirrorDisplayMode === 'camera' &&
    conversationSubState !== 'REVIEWING'
  ) {
    console.log('[Stage2Mirror] Starting auto-frame analysis...')

    autoAnalysisIntervalRef.current = setInterval(async () => {
      try {
        const frame = captureCurrentFrame()
        if (!frame) return

        console.log('[Stage2Mirror] Analyzing frame...')
        const analysis = await analyzePhotoWithVision(frame)  // ⚠️ 每 2 秒调用一次！
        setLatestAnalysis(analysis)
        console.log('[Stage2Mirror] Frame analysis:', analysis)

      } catch (error) {
        console.error('[Stage2Mirror] Auto-analysis error:', error)
      }
    }, 2000) // Every 2 seconds

    return () => {
      if (autoAnalysisIntervalRef.current) {
        clearInterval(autoAnalysisIntervalRef.current)
        autoAnalysisIntervalRef.current = null
      }
    }
  }
}, [phase, mirrorDisplayMode, conversationSubState])
```

**问题**:
- 即使在 mock 模式，每 2 秒也会触发一次分析
- 在生产模式（`enabled: true`），会实际调用 Gemini Vision API
- **这会快速消耗 Gemini API 配额！**
- 如果用户停留在 CAMERA 状态 1 分钟 = 30 次 API 调用

---

## 🎯 根本原因推测

### 最可能的原因：INTRO Phase 卡在 TTS

**证据**:
1. 用户说"只有一个 the mirror"
2. 说明 Stage 2 已经渲染（显示了 mirror）
3. 但没有看到对话消息
4. 推测：INTRO phase 正在运行，但 `speakMessage()` 卡住了

**推理链**:
```
Stage2Mirror 渲染
  ↓
phase = 'INTRO'
  ↓
运行 runIntro()
  ↓
启动相机 ✅
  ↓
setMessages([{ role: 'ai', text: "I am your guide." }])  ✅
  ↓
await speakMessage("I am your guide.")  ⚠️ 卡在这里！
  ↓
[永远不会到达下一步]
  ↓
phase 永远不会变成 'CONVERSATION'
  ↓
用户看到：mirror + 第一条消息（可能被遮挡）+ 没有对话
```

---

## 🔧 诊断步骤

### 1. 检查浏览器 Console 日志

**应该看到的日志**:
```
[Stage2Mirror] Mounted
[Stage2Mirror] Starting INTRO sequence...
[Stage2Mirror] Camera started
[Stage2Mirror] Speaking: I am your guide.
[ttsService] Generating TTS for: I am your guide.
[Stage2Mirror] Audio finished  // ⚠️ 这条可能缺失
[Stage2Mirror] Speaking: Please show me your form.
[ttsService] Generating TTS for: Please show me your form.
[Stage2Mirror] Audio finished  // ⚠️ 这条可能缺失
[Stage2Mirror] INTRO complete, transitioning to CONVERSATION
[Stage2Mirror] Starting auto-frame analysis...
[Stage2Mirror] Analyzing frame...
```

**如果卡住，日志会停在**:
```
[Stage2Mirror] Speaking: I am your guide.
[ttsService] Generating TTS for: I am your guide.
// [卡在这里，没有下一条日志]
```

---

### 2. 检查 TTS Service 实现

**文件**: `ttsService.js`

**需要验证**:
1. `textToSpeech()` 函数是否正确返回
2. 开发环境是否返回 `null` 或有效 URL
3. 如果返回 `null`，`speakMessage()` 是否正确处理

---

### 3. 检查 UI 渲染

**当前 UI 应该显示**:
- Phase: `'INTRO'`
- Mirror container
- 摄像头视频流
- 对话消息（在 mirror 底部）

**CSS 可能的问题**:
- 消息容器 `.mirror-dialogue-container` 可能不可见
- 消息可能被 mirror 遮挡
- 消息可能因为动画还未完成而不显示

---

## 📋 修复方案

### 方案 1: 修复 speakMessage() 超时机制

**问题**: 如果 `ttsService.textToSpeech()` 返回 `null`，代码不做任何事情就结束了。

**修复**:
```javascript
const speakMessage = async (text) => {
  try {
    console.log('[Stage2Mirror] Speaking:', text)

    const audioUrl = await ttsService.textToSpeech(text, {
      voiceId: 'Pika',
      fallbackToBrowser: true
    })

    if (audioUrl) {
      // ... 现有逻辑
    } else {
      // ✅ 添加 fallback: 直接返回，不阻塞
      console.log('[Stage2Mirror] No audio URL, skipping TTS')
      // 等待一小段时间模拟朗读
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  } catch (error) {
    console.error('[Stage2Mirror] TTS error:', error)
  }
}
```

---

### 方案 2: 简化 INTRO Phase（跳过 TTS）

**如果 TTS 一直有问题，可以先跳过语音播放**:

```javascript
useEffect(() => {
  const runIntro = async () => {
    if (phase === 'INTRO') {
      console.log('[Stage2Mirror] Starting INTRO sequence...')

      await startCamera()

      const text1 = "I am your guide."
      setMessages([{ role: 'ai', text: text1 }])
      // ❌ 暂时跳过 TTS
      // await speakMessage(text1)
      await new Promise(r => setTimeout(r, 2500))

      const text2 = "Please show me your form."
      setMessages(prev => [...prev, { role: 'ai', text: text2 }])
      // ❌ 暂时跳过 TTS
      // await speakMessage(text2)
      await new Promise(r => setTimeout(r, 3000))

      console.log('[Stage2Mirror] INTRO complete, transitioning to CONVERSATION')
      setPhase('CONVERSATION')
      setConversationSubState('CAMERA')
    }
  }

  runIntro()
}, [phase])
```

---

### 方案 3: 添加强制超时（整个 INTRO Phase）

**在 INTRO 最外层添加超时保护**:

```javascript
useEffect(() => {
  const runIntro = async () => {
    if (phase === 'INTRO') {
      console.log('[Stage2Mirror] Starting INTRO sequence...')

      try {
        // ✅ 整个 INTRO 最多 15 秒
        const introPromise = (async () => {
          await startCamera()

          const text1 = "I am your guide."
          setMessages([{ role: 'ai', text: text1 }])
          await speakMessage(text1)
          await new Promise(r => setTimeout(r, 2500))

          const text2 = "Please show me your form."
          setMessages(prev => [...prev, { role: 'ai', text: text2 }])
          await speakMessage(text2)
          await new Promise(r => setTimeout(r, 3000))
        })()

        const timeoutPromise = new Promise((resolve) => {
          setTimeout(() => {
            console.warn('[Stage2Mirror] INTRO timeout, force transitioning to CONVERSATION')
            resolve()
          }, 15000) // 15秒超时
        })

        await Promise.race([introPromise, timeoutPromise])

        console.log('[Stage2Mirror] INTRO complete, transitioning to CONVERSATION')
        setPhase('CONVERSATION')
        setConversationSubState('CAMERA')
      } catch (error) {
        console.error('[Stage2Mirror] INTRO error:', error)
        // 即使出错也继续
        setPhase('CONVERSATION')
        setConversationSubState('CAMERA')
      }
    }
  }

  runIntro()
}, [phase])
```

---

### 方案 4: 优化 Auto-Frame Analysis（降低 API 调用频率）

**问题**: 每 2 秒调用一次 Gemini Vision API 太频繁。

**修复**:
```javascript
useEffect(() => {
  if (
    phase === 'CONVERSATION' &&
    mirrorDisplayMode === 'camera' &&
    conversationSubState !== 'REVIEWING'
  ) {
    console.log('[Stage2Mirror] Starting auto-frame analysis...')

    // ✅ 改为 10 秒一次，降低 API 调用频率
    autoAnalysisIntervalRef.current = setInterval(async () => {
      try {
        const frame = captureCurrentFrame()
        if (!frame) return

        console.log('[Stage2Mirror] Analyzing frame...')
        const analysis = await analyzePhotoWithVision(frame)
        setLatestAnalysis(analysis)
        console.log('[Stage2Mirror] Frame analysis:', analysis)

      } catch (error) {
        console.error('[Stage2Mirror] Auto-analysis error:', error)
      }
    }, 10000) // ✅ 改为 10 秒

    return () => {
      if (autoAnalysisIntervalRef.current) {
        clearInterval(autoAnalysisIntervalRef.current)
        autoAnalysisIntervalRef.current = null
      }
    }
  }
}, [phase, mirrorDisplayMode, conversationSubState])
```

---

### 方案 5: 强制开发环境启用真实 Gemini API

**文件**: `envService.js`

```javascript
getGeminiVisionConfig() {
  // ✅ 开发环境也启用真实 API（用于测试）
  return {
    enabled: true,
    mock: false,  // 改为 false
    apiKey: import.meta.env.VITE_GEMINI_API_KEY
  }
}
```

**注意**: 这会消耗真实 API 配额，只在需要测试时启用。

---

## 🎬 推荐的立即修复步骤

### 步骤 1: 检查浏览器 Console

打开浏览器开发者工具 (F12)，查看 Console 标签页：

1. 刷新页面
2. 进入 Stage 2
3. 记录所有 `[Stage2Mirror]` 开头的日志
4. 查看日志停在哪一步

**判断**:
- 如果看到 `[Stage2Mirror] INTRO complete, transitioning to CONVERSATION` → INTRO 完成了
- 如果只看到 `[Stage2Mirror] Speaking: I am your guide.` → 卡在 TTS

---

### 步骤 2: 临时禁用 TTS（快速测试）

修改 `Stage2Mirror.jsx` Line 97-125:

```javascript
useEffect(() => {
  const runIntro = async () => {
    if (phase === 'INTRO') {
      console.log('[Stage2Mirror] Starting INTRO sequence...')

      await startCamera()

      const text1 = "I am your guide."
      setMessages([{ role: 'ai', text: text1 }])
      // await speakMessage(text1)  // ❌ 临时注释掉
      await new Promise(r => setTimeout(r, 1000))  // 缩短等待

      const text2 = "Please show me your form."
      setMessages(prev => [...prev, { role: 'ai', text: text2 }])
      // await speakMessage(text2)  // ❌ 临时注释掉
      await new Promise(r => setTimeout(r, 1000))  // 缩短等待

      console.log('[Stage2Mirror] INTRO complete, transitioning to CONVERSATION')
      setPhase('CONVERSATION')
      setConversationSubState('CAMERA')
    }
  }

  runIntro()
}, [phase])
```

**测试**: 刷新页面，看是否在 2 秒后进入 CONVERSATION phase 并开始对话。

---

### 步骤 3: 降低 Auto-Analysis 频率

修改 `Stage2Mirror.jsx` Line 194:

```javascript
}, 10000) // ✅ 改为 10 秒
```

---

### 步骤 4: 检查 UI 渲染

在浏览器 DevTools → Elements 标签页，检查：

1. `.mirror-dialogue-container` 是否存在
2. `.dialogue-message` 元素是否存在
3. 消息内容是否正确
4. CSS 样式是否正确（`opacity`, `display`, `z-index`）

---

## 🧪 测试清单

完成修复后，验证以下功能：

### INTRO Phase
- [ ] 进入 Stage 2，摄像头启动
- [ ] 2 秒内看到第一条消息 "I am your guide."
- [ ] 5 秒内看到第二条消息 "Please show me your form."
- [ ] 8 秒内自动转换到 CONVERSATION phase

### CONVERSATION Phase
- [ ] INTRO 完成后，2 秒内 AI 问第一个问题
- [ ] 问题显示在 mirror 底部
- [ ] 可以看到 Nova Orb 在底部显示
- [ ] 可以看到 CAPTURE 按钮

### Auto-Frame Analysis
- [ ] Console 每 10 秒看到 `[Stage2Mirror] Analyzing frame...`
- [ ] 不应该过于频繁（避免消耗 API 配额）

### UI Display
- [ ] Mirror 居中显示
- [ ] 对话消息在 mirror 底部清晰可见
- [ ] 消息有打字机动画效果
- [ ] Nova Orb 在 mirror 下方显示

---

## 📊 当前状态总结

### 已知问题
1. ⚠️ **INTRO phase 可能卡在 TTS** - speakMessage() 可能不返回
2. ⚠️ **开发环境 Gemini API 使用 mock** - 但这不影响对话显示
3. ⚠️ **Auto-Frame Analysis 频率过高** - 每 2 秒调用 Gemini Vision API
4. ⚠️ **Browser TTS fallback 未实现** - 如果 audioUrl 为 null，什么都不做
5. ⚠️ **没有强制超时保护** - 如果 TTS 卡住，整个流程停滞

### 建议的优先修复顺序
1. **高优先级**: 临时禁用 TTS，确保 INTRO → CONVERSATION 转换正常
2. **高优先级**: 降低 Auto-Analysis 频率（2s → 10s）
3. **中优先级**: 添加 speakMessage() 的 fallback 逻辑
4. **中优先级**: 添加 INTRO phase 的强制超时保护
5. **低优先级**: 实现 browser TTS fallback（如果需要语音）

---

**分析完成**: 2025-11-21
**核心问题**: INTRO phase TTS 可能阻塞，导致永远不进入 CONVERSATION phase
**推荐修复**: 临时禁用 TTS + 降低 Auto-Analysis 频率
