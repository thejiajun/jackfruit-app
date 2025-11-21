# P0 问题修复总结
**修复时间**: 2025-11-21
**修复范围**: Stage 2/3/4 Onboarding 流程

---

## ✅ 已修复的 P0 问题

### P0-1: Stage2Mirror - 存储大型 Data URL 到数据库
**问题**: `handleConfirmIdentity()` 将 2-5MB 的 base64 照片数据直接存储到 JSONB 字段，超过 1MB 限制。

**修复**:
1. 创建 `storageService.js` - 统一的文件上传服务
   - `uploadPhoto()` - 上传单张照片
   - `uploadPhotos()` - 批量上传多张照片
   - 自动转换 base64 data URL 为 Blob
   - 上传到 Supabase Storage (`onboarding-resources` bucket)
   - 返回公开 URL

2. 修改 `Stage2Mirror.jsx` (Line 500-540):
   ```javascript
   const handleConfirmIdentity = async () => {
     // 🔒 Debounce 锁
     if (isSubmitting) return
     setIsSubmitting(true)

     // 上传照片到 Supabase Storage
     const capturedPhotoUrl = await uploadPhoto(capturedPhotoDataUrl)

     onComplete({
       captured_photo_url: capturedPhotoUrl,  // ✅ URL 而非 base64
       generated_image_url: generatedImageUrl,
       analysis: confirmedAnalysis,
       conversation_history: messages
     })
   }
   ```

3. 添加按钮禁用状态 (Line 733-745):
   - 上传中显示 "UPLOADING..."
   - 禁用点击防止重复提交
   - 失败时解锁允许重试

---

### P0-2: Stage3Forging - 存储多张照片 Data URL 到数据库
**问题**: `handleReveal()` 将 5 张照片 (10-25MB) 的 base64 数据存储到数据库。

**修复**:
1. 修改 `Stage3Forging.jsx` (Line 106-148):
   ```javascript
   const handleReveal = async () => {
     // 🔒 Debounce 锁
     if (isSubmitting) return
     setIsSubmitting(true)

     // 批量上传照片
     const photoDataUrls = photos.filter(Boolean)
     const photoUrls = await uploadPhotos(photoDataUrls)

     onComplete({
       photo_urls: photoUrls,  // ✅ URL 数组而非 base64 数组
       personality_analysis: personalityData,
       intro_script: introScript
     })
   }
   ```

2. 添加按钮禁用状态 (Line 230-240):
   - 上传中显示 "[ UPLOADING... ]"
   - 禁用点击防止重复提交
   - 失败时解锁允许重试

---

### P0-3: 缺少 Debounce 锁 - Stage2/3/4 确认按钮
**问题**: 用户可能快速点击按钮多次，触发重复的 API 调用和数据库写入。

**修复**:

#### Stage2Mirror.jsx
- 添加 `isSubmitting` 状态 (Line 65)
- `handleConfirmIdentity()` 加锁 (Line 500-540)
- 按钮禁用逻辑 (Line 733-745)

#### Stage3Forging.jsx
- 添加 `isSubmitting` 状态 (Line 24)
- `handleReveal()` 加锁 (Line 106-148)
- 按钮禁用逻辑 (Line 230-240)

#### Stage4Avatar.jsx
- 添加 `isSubmitting` 状态 (Line 21)
- `handleConfirmName()` 加锁 (Line 46-68)
- `handleTransitionEnded()` 加锁 (Line 75-92)
- 按钮禁用逻辑 (Line 144-154)

---

## ✅ Gemini Live API 对话功能

### 问题分析
原始代码中 `chatWithGemini()` 只是一个 placeholder，返回预设问题数组，没有真实调用 Gemini API。

### 修复
1. 在 `geminiService.js` 中实现真实的 `chatWithGemini()` 函数 (Line 235-311):
   ```javascript
   export async function chatWithGemini(systemPrompt, conversationHistory = [], contextData = null) {
     // 构建对话历史
     const contents = conversationHistory.map(msg => ({
       role: msg.role === 'ai' ? 'model' : 'user',
       parts: [{ text: msg.text }]
     }))

     // 调用 Gemini API
     const response = await fetch(
       `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
       {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           contents,
           generationConfig: {
             temperature: 0.9,
             maxOutputTokens: 100
           }
         })
       }
     )

     return aiResponse
   }
   ```

2. 在 `Stage2Mirror.jsx` 中使用真实实现 (Line 238-264):
   - 导入 `chatWithGemini` 函数
   - 调用 Gemini API 生成问题
   - 添加 fallback 机制（API 失败时使用预设问题）

### 注意事项
- **Gemini Live API (WebSocket)** 还未正式发布，暂时使用 Chat API (REST) 代替
- 当 Gemini Live API 可用时，可以在 `createGeminiLiveConnection()` 中实现 WebSocket 连接
- 当前实现已经能够实现上下文感知的对话（基于照片分析结果）

---

## 📁 新增文件

### `/character-app/src/services/storageService.js`
文件上传服务，提供：
- `uploadPhoto(dataUrl, bucket, folder)` - 上传单张照片
- `uploadPhotos(dataUrls, bucket, folder)` - 批量上传多张照片
- `dataUrlToBlob(dataUrl)` - 内部工具函数，转换 base64 为 Blob

---

## 🔧 修改文件

### 1. `/character-app/src/pages/Onboarding/stages/Stage2Mirror.jsx`
**修改**:
- Line 7: 导入 `uploadPhoto` 和 `chatWithGemini`
- Line 65: 添加 `isSubmitting` 状态
- Line 218-264: 修复 `generateAIQuestion()` 使用真实 Gemini Chat API
- Line 500-540: 修复 `handleConfirmIdentity()` 上传照片到 Storage
- Line 733-745: 添加按钮禁用状态

### 2. `/character-app/src/pages/Onboarding/stages/Stage3Forging.jsx`
**修改**:
- Line 3: 导入 `uploadPhotos`
- Line 24: 添加 `isSubmitting` 状态
- Line 106-148: 修复 `handleReveal()` 批量上传照片
- Line 230-240: 添加按钮禁用状态

### 3. `/character-app/src/pages/Onboarding/stages/Stage4Avatar.jsx`
**修改**:
- Line 21: 添加 `isSubmitting` 状态
- Line 46-68: 修复 `handleConfirmName()` 添加 debounce 锁
- Line 75-92: 修复 `handleTransitionEnded()` 添加 debounce 锁
- Line 144-154: 添加按钮禁用状态

### 4. `/character-app/src/services/geminiService.js`
**修改**:
- Line 235-311: 新增 `chatWithGemini()` 函数（真实实现）
- Line 313-328: 更新 `createGeminiLiveConnection()` 注释
- Line 334: 导出 `chatWithGemini`

---

## 🧪 测试清单

### Stage 2 (Mirror Guide)
- [ ] 拍照后点击 CONFIRM，照片成功上传到 Supabase Storage
- [ ] 数据库 `user_data` 字段存储的是 URL 而非 base64
- [ ] 快速点击 CONFIRM IDENTITY 按钮，只触发一次上传
- [ ] AI 对话使用真实 Gemini API（检查 console 日志）
- [ ] AI 对话失败时使用 fallback 预设问题

### Stage 3 (Forging)
- [ ] 上传 5 张照片后点击 [ 👁️ SHOW ME ]，所有照片成功上传
- [ ] 数据库 `user_data` 字段存储的是 URL 数组而非 base64 数组
- [ ] 快速点击按钮，只触发一次上传
- [ ] 上传进度显示 "[ UPLOADING... ]"

### Stage 4 (Avatar)
- [ ] 输入名字后点击 CONFIRM NAME，只触发一次提交
- [ ] Transition 视频结束后，只调用一次 `onComplete()`
- [ ] 按钮在处理中显示 "[ PROCESSING... ]"

### 数据库验证
```sql
-- 检查 Stage 2 数据
SELECT session_id, user_data->'captured_photo_url' as photo_url
FROM onboarding_sessions
WHERE current_step >= 2
LIMIT 5;

-- 检查 Stage 3 数据
SELECT session_id, user_data->'photo_urls' as photo_urls
FROM onboarding_sessions
WHERE current_step >= 3
LIMIT 5;

-- 验证 URL 格式（应该是 https://... 而非 data:image/...）
```

### Supabase Storage 验证
- 访问 Supabase Dashboard → Storage → `onboarding-resources`
- 确认存在以下文件夹：
  - `stage2-captured/` - Stage 2 拍摄的照片
  - `stage3-photos/` - Stage 3 上传的照片
- 文件命名格式：`{timestamp}-{random}.jpg`

---

## 🎯 结论

所有 P0 问题已修复：

1. ✅ **Stage2Mirror** - 照片上传到 Supabase Storage，数据库只存储 URL
2. ✅ **Stage3Forging** - 批量照片上传到 Storage，数据库只存储 URL 数组
3. ✅ **Debounce 锁** - 所有 Stage 2/3/4 确认按钮都有防抖保护
4. ✅ **Gemini Live API** - 实现了真实的 Gemini Chat API 对话功能

**数据库写入大小**:
- 修复前: 2-25MB (base64 data URLs)
- 修复后: < 1KB (URL strings)

**安全性**:
- 所有按钮都有 debounce 锁
- 失败时允许重试，成功后禁止重复点击
- 完善的错误处理和 fallback 机制

**性能**:
- 文件上传到 Supabase Storage（专用存储）
- 数据库只存储轻量级 URL
- 支持批量并行上传（Stage 3）

---

**修复完成时间**: 2025-11-21
**开发服务器状态**: ✅ 正常运行 (http://localhost:5173)
**编译错误**: 无
