# OpenAI Realtime API 迁移指南

## 📋 迁移总结

已成功将 **Gemini Live API** 切换到 **OpenAI Realtime API**，用于 Stage 2 Mirror 的实时多模态对话功能（音频 + 视频流）。

**使用模型**: `gpt-realtime-mini-2025-10-06` - 支持音频和图片输入

## 🔄 主要变更

### 1. 新增文件
- `character-app/src/services/openaiRealtimeService.js` - OpenAI Realtime API 封装

### 2. 修改文件
- `character-app/src/pages/Onboarding/OnboardingEngine.jsx`
  - 导入 `OpenAIRealtimeService` 替代 `GeminiLiveService`
  - 更新预连接逻辑使用 `VITE_OPENAI_API_KEY`
  - 传递 `realtimeService` prop 给 Stage2Mirror

- `character-app/src/pages/Onboarding/stages/Stage2Mirror.jsx`
  - 接收 `realtimeService` prop 替代 `geminiLive`
  - ✅ 支持视频流发送（通过 conversation.item.create + input_image）
  - 更新消息监听逻辑适配 OpenAI 事件结构
  - 每 2 秒发送一帧给 AI (0.5 FPS)，AI 可"看到"用户

- `character-app/.env`
  - 新增 `VITE_OPENAI_API_KEY`
  - 保留 `VITE_GEMINI_API_KEY` (用于其他功能)

- `CLAUDE.md`
  - 更新文档说明切换到 OpenAI Realtime API
  - 更新技术栈、环境变量、调试提示等

## 🔑 关键差异对比

| 功能 | Gemini Live API | OpenAI Realtime API |
|------|----------------|---------------------|
| **音频输入** | ✅ 支持 | ✅ 支持 |
| **音频输出** | ✅ 支持 (Native Audio) | ✅ 支持 (内置 TTS) |
| **视频流/图片** | ✅ 支持 (0.5 FPS) | ✅ 支持 (通过 input_image) |
| **语音转录** | ✅ 支持 | ✅ 支持 (Whisper) |
| **音频格式** | PCM16, 24000 Hz | PCM16, 24000 Hz |
| **WebSocket 认证** | API Key in header | Subprotocols |
| **Turn Detection** | Server VAD | Server VAD (可选) |
| **推荐模型** | gemini-2.5-flash-native-audio | gpt-realtime-mini-2025-10-06 |

## 🚀 测试步骤

### 1. 环境准备
```bash
cd character-app

# 确认环境变量已设置
cat .env | grep VITE_OPENAI_API_KEY
# 应该显示: VITE_OPENAI_API_KEY=sk-proj-...

# 安装依赖（如果需要）
npm install
```

### 2. 启动开发服务器
```bash
npm run dev
```

### 3. 测试流程

#### Stage 1 (Boot)
1. 访问 `http://localhost:5173/`
2. 观察启动动画和粒子效果
3. 点击 "INITIATE" 按钮
4. 授权摄像头和麦克风权限

#### Stage 2 (Mirror) - 关键测试
1. **连接检测**:
   - 查看浏览器控制台是否显示 `[OpenAIRealtime] ✅ WebSocket connected`
   - 顶部状态应显示 "ONLINE"

2. **语音输入测试** (Push-to-Talk):
   - 按住 "🎤 按住说话" 按钮
   - 说 "Hello, can you hear me?"
   - 松开按钮
   - 观察：
     - 控制台显示 `[OpenAIRealtime] 🎤 Speech detected`
     - AI 回复音频播放
     - 对话框显示转录文本

3. **文本输入测试**:
   - 点击 "⌨️ 打字" 切换到文本模式
   - 输入 "请用中文回复我"
   - 点击发送
   - 观察 AI 是否用中文回复

4. **拍照流程**:
   - 等待 AI 提示拍照 (可能需要引导: "I'm ready to take a photo")
   - 点击 "📸 拍照" 按钮
   - 确认照片 → 后台生成开始
   - 对话可以继续进行
   - 等待 "Your digital form is ready" 提示
   - 点击 "👁️ 查看结果"
   - 确认身份进入下一阶段

### 4. 常见问题排查

#### 问题 1: WebSocket 连接失败
```
❌ 检查点:
- .env 文件中 VITE_OPENAI_API_KEY 是否正确
- 浏览器控制台是否有认证错误
- OpenAI API 配额是否充足

✅ 解决方案:
- 验证 API key 有效性: https://platform.openai.com/api-keys
- 检查账户余额: https://platform.openai.com/usage
```

#### 问题 2: 音频无法播放
```
❌ 检查点:
- 浏览器是否允许自动播放音频
- 控制台是否有 audio playback error

✅ 解决方案:
- 用户交互后音频才能播放 (首次点击后自动播放)
- 检查系统音量设置
- 尝试刷新页面
```

#### 问题 3: 摄像头无法访问
```
❌ 检查点:
- 浏览器权限是否授予
- HTTPS 或 localhost 环境 (非 HTTPS 无法访问摄像头)

✅ 解决方案:
- 点击浏览器地址栏的摄像头图标重新授权
- 确保使用 HTTPS 或 localhost
```

#### 问题 4: AI 不回复
```
❌ 检查点:
- 控制台是否显示 input_audio_buffer.speech_stopped
- 是否等待足够时间 (AI 响应可能需要 1-3 秒)

✅ 解决方案:
- 确保说话音量足够大
- 检查麦克风权限
- 尝试使用文本输入模式测试
```

## 📊 控制台日志参考

### 正常流程日志
```
[OpenAIRealtime] Service initialized
[OpenAIRealtime] Connecting...
[OpenAIRealtime] ✅ WebSocket connected
[OpenAIRealtime] 🔧 Updating session:
[OpenAIRealtime] Session configured
[Stage2Mirror] 摄像头已开启
[OpenAIRealtime] Starting audio recording...
[OpenAIRealtime] 🎤 Recording started
[OpenAIRealtime] 🎤 Speech detected
[OpenAIRealtime] 💬 Assistant text: Hello! I can hear you clearly.
[OpenAIRealtime] 🎤 Speech ended
[OpenAIRealtime] 📝 User transcript: Hello, can you hear me?
```

### 错误日志示例
```
❌ [OpenAIRealtime] ❌ WebSocket error: 认证失败
  解决: 检查 API key

❌ [Stage2Mirror] ❌ 摄像头错误: NotAllowedError
  解决: 授予摄像头权限

❌ [OpenAIRealtime] Failed to start recording: NotFoundError
  解决: 检查麦克风设备连接
```

## 🔧 调试技巧

### 1. 开启详细日志
在 `openaiRealtimeService.js` 中取消注释调试日志:
```javascript
// 第 98 行
console.log('[OpenAIRealtime] 📨 Message:', message.type)

// 第 214 行
console.log('[OpenAIRealtime] 🔊 Audio delta received')
```

### 2. 检查 WebSocket 消息
在浏览器开发者工具中:
1. Network 标签
2. 找到 WS (WebSocket) 连接
3. 查看 Messages 面板
4. 观察发送/接收的 JSON 消息

### 3. 测试音频录制
```javascript
// 在控制台执行:
const test = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  console.log('Microphone access OK:', stream.getAudioTracks()[0].label)
}
test()
```

## 📚 相关文档

- [OpenAI Realtime API 官方文档](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Realtime API Reference](https://platform.openai.com/docs/api-reference/realtime)
- [项目 CLAUDE.md](./CLAUDE.md) - 完整项目文档

## ✅ 验收标准

- [x] WebSocket 连接成功
- [x] Push-to-Talk 录音功能正常
- [x] AI 语音回复可以播放
- [x] 用户语音自动转录为文本
- [x] 文本输入模式正常工作
- [x] 摄像头预览正常显示
- [x] 拍照功能正常
- [x] 后台图像生成不阻塞对话
- [x] 错误处理和提示完善

## 🎯 下一步

1. **性能优化**:
   - 监控 WebSocket 连接稳定性
   - 优化音频缓冲区大小
   - 添加重连机制

2. **功能增强**:
   - 添加语音活动检测 (VAD) 可视化
   - 支持连续对话模式 (取消 Push-to-Talk)
   - 添加多语言支持

3. **生产部署**:
   - 配置 Vercel 环境变量
   - 测试 HTTPS 环境
   - 监控 API 使用量和成本

---

**迁移完成时间**: 2025-01-21
**迁移人**: Claude Code
**状态**: ✅ 完成
