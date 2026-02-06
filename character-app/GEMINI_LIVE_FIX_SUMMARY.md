# Gemini Live API 修复总结

## 核心问题

你的代码之前无法正常工作,主要原因是 **`sendRealtimeInput` 的参数格式错误**。

### ❌ 错误的方式 (之前的代码)

```javascript
await this.session.sendRealtimeInput({
  mediaChunks: [{
    mimeType: 'audio/pcm;rate=16000',
    data: base64Data  // ❌ 错误: 传递对象字面量
  }]
})
```

### ✅ 正确的方式 (修复后的代码)

```javascript
const audioBlob = new Blob([arrayBuffer], { type: 'audio/pcm;rate=16000' })

await this.session.sendRealtimeInput({
  audio: audioBlob  // ✅ 正确: 传递真正的 Blob 对象
})
```

## 详细修复内容

### 1. 修复音频流发送 (`sendRealtimeAudioChunk`)

**问题:**
- 将 ArrayBuffer 转换为 base64 字符串
- 传递对象字面量 `{ mimeType, data }` 给 `mediaChunks`
- API 期望的是 `Blob` 对象,不是字符串

**修复:**
```javascript
// 之前: 转换为 base64 然后传对象
const base64Data = btoa(binary)
await this.session.sendRealtimeInput({
  mediaChunks: [{ mimeType: mimeType, data: base64Data }]
})

// 现在: 直接创建 Blob 并发送
const audioBlob = new Blob([arrayBuffer], { type: mimeType })
await this.session.sendRealtimeInput({
  audio: audioBlob  // 使用 audio 属性,更清晰
})
```

**优势:**
- ✅ 无需 base64 转换,性能更好
- ✅ 符合官方 API 规范
- ✅ 减少内存占用

### 2. 修复视频帧发送 (`sendVideoFrame`)

**问题:**
- 接收 base64 字符串
- 传递对象字面量给 `mediaChunks`

**修复:**
```javascript
// 之前: 直接传 base64 字符串
await this.session.sendRealtimeInput({
  mediaChunks: [{ mimeType: mimeType, data: imageData }]
})

// 现在: 转换为 Blob 后发送
const binaryString = atob(imageData)
const bytes = new Uint8Array(binaryString.length)
for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i)
}
const videoBlob = new Blob([bytes], { type: mimeType })

await this.session.sendRealtimeInput({
  video: videoBlob  // 使用 video 属性,更清晰
})
```

### 3. 优化 Debug 页面回调

**改进:**
- 添加了 `onConnected`, `onError`, `onClosed` 回调
- 在日志中显示 MIME 类型信息
- 改进了日志消息的可读性

## API 规范说明

根据 Google 官方文档 (`@google/genai` SDK):

### `LiveClientRealtimeInput` 接口

```typescript
interface LiveClientRealtimeInput {
  audio?: Blob          // 音频 Blob
  video?: Blob          // 视频 Blob
  text?: string         // 文本输入
  mediaChunks?: Blob[]  // Blob 数组(不是对象数组!)
  audioStreamEnd?: boolean
  activityStart?: ActivityStart
  activityEnd?: ActivityEnd
}
```

### 关键要点

1. **`audio`, `video`, `mediaChunks` 必须是 Blob 对象**
   - ❌ 不能传 `{ mimeType, data }` 对象
   - ❌ 不能传 base64 字符串
   - ✅ 必须传 `Blob` 实例

2. **推荐使用 `audio` 和 `video` 属性**
   - 更清晰,语义明确
   - `mediaChunks` 主要用于向后兼容

3. **Blob 构造函数会自动处理 MIME 类型**
   ```javascript
   new Blob([data], { type: 'audio/pcm;rate=16000' })
   ```

## 测试步骤

1. **启动开发服务器**
   ```bash
   cd character-app
   npm run dev
   ```

2. **访问 Debug 页面**
   ```
   http://localhost:5173/debug
   ```

3. **测试流程**
   - 输入你的 Gemini API Key
   - 点击 "Connect" 按钮
   - 等待连接成功消息: "✅ Connected successfully (ready to record)"
   - 按住 "Hold to Talk" 按钮说话
   - 松开按钮
   - 查看日志中是否出现:
     - `🔊 Audio chunk received (type: audio/pcm;rate=24000)`
     - `💬 AI says: "..."`
     - 听到 AI 的语音回复

## 预期结果

✅ **成功的标志:**
- WebSocket 连接成功
- 录音时看到实时发送音频块(无错误)
- AI 返回文本转录
- AI 返回音频数据并自动播放
- 能听到 AI 的语音回复

❌ **常见错误(已修复):**
- `Unsupported mime type: undefined` ❌ (已修复)
- `mediaChunks must be an array of Blob` ❌ (已修复)
- `Failed to send audio chunk` ❌ (已修复)

## 参考资料

- Google Gen AI SDK: https://github.com/googleapis/js-genai
- Gemini Live API 文档: https://ai.google.dev/api/live
- Context7 文档查询结果: `/googleapis/js-genai` 和 `/websites/ai_google_dev_api`
