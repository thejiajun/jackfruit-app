# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

这是一个 **monorepo** 项目,包含两个独立应用和共享的 Supabase 后端。

**当前分支**: `feature/pika-integration` - 从 Matrix 绿色主题过渡到 Pika 青蓝色美学
**重要变更**: LookGen 应用已从 monorepo 中移除 (commit 2cc9b4d)
**用户要求**: 永远使用云端远程 Supabase,不使用本地 Supabase

### 1. Character App (`/character-app`)
AI 虚拟角色交互系统:
- **Onboarding System**: Database-driven modular flow supporting both legacy 7-step and new 4-stage AI-native architectures
  - **4-Stage Architecture** (NEW): System Boot → Mirror Guide → Forging → Living Avatar
  - **Stage 2 (Mirror Guide)** recently refactored to support:
    - Real-time auto-frame analysis (every 2s via Gemini Vision)
    - Continuous AI conversation during camera feed
    - Background identity generation while conversation continues
    - Toggle between camera/captured photo/generated image views
  - Integrates Gemini Vision API, Gemini Live API, and FAL video generation
  - Camera/microphone access, real-time photo analysis, voice conversation
- View AI characters with dynamic moods/health/statuses
- Video-based character display with smooth clip transitions
- Real-time status changes based on mood selection
- Mobile-first TikTok-style vertical video UI
- Framer Motion animations for overlays
- Built with React (traditional web app, not React Native Web)

### 2. Admin Panel (`/admin-app`)
角色状态系统的管理界面:
- 创建和管理 AI 角色
- 配置角色状态(情绪、健康、动作)
- **Onboarding 配置**: 可视化编辑器用于配置引导流程(步骤、视觉主题、文案)
- 3 步 AI 内容生成工作流 (Gemini → FAL SeeDrawm → FAL SeeDance)
- 资产库管理(服饰、地点、道具)
- 系统提示词配置
- 拖放式视频播放列表排序
- 使用 React + Ant Design 构建

## Quick Commands

### Monorepo Commands (Root Level)
```bash
# Install all dependencies (root + workspaces)
npm install

# Run specific app from root
npm run dev:character     # Start Character App dev server (usually http://localhost:5173, may use 5174 if port conflicts)
npm run dev:admin         # Start Admin Panel dev server

# Build specific app
npm run build:character
npm run build:admin
```

### Character App
```bash
cd character-app
npm install
npm run dev              # Runs on different port than root app
npm run build
```

### Admin Panel
```bash
cd admin-app
npm install
npm run dev              # Runs on different port
npm run build
```

### Supabase (共享后端)

**重要**: 根据用户配置,永远使用远程 Supabase,不使用本地 Supabase。

```bash
# Database Migrations (远程)
supabase db push                        # 推送迁移到远程数据库
supabase migration list                 # 列出所有迁移
supabase migration new <name>           # 创建新迁移文件

# Edge Functions (远程)
supabase functions deploy <name>        # 部署特定 edge function
supabase functions deploy               # 部署所有 functions
supabase functions list                 # 列出所有 edge functions
supabase functions logs <name> --tail   # 实时查看 function 日志

# Utility Scripts
node scripts/query-looks.js             # 查询 prompt_items 表 (调试模板)

# 可用的 Edge Functions:
# - generate-text-content: Gemini 文本生成 (角色系统)
# - generate-starting-image: FAL SeeDrawm 图像生成 (角色系统)
# - generate-single-video: FAL SeeDance 视频生成 (角色系统)
# - batch-image-generation: 批量图像处理 (角色系统)
# - voice-chat: 语音聊天功能 (角色系统)
# - generate-tts-audio: 文本转语音生成 (角色系统)
```

## Architecture Overview

### Technology Stack by App

**Character App:**
- React 19 (traditional web app with HTML elements)
- Framer Motion 12 (animations)
- Vite 7.1 build tool
- No state management library (uses React hooks)
- Video playback with smooth transitions

**Admin Panel:**
- React 19 (traditional web app)
- Ant Design 5.28 (UI components)
- @dnd-kit (drag-and-drop for video ordering)
- React Router DOM 7.9

**Shared Backend (远程 Supabase):**
- Supabase (PostgreSQL, Storage, Edge Functions)
- AI APIs: FAL (图像/视频生成), Google Gemini (文本生成、视觉分析、实时语音)
- Storage buckets: photos, videos, cached_generations, onboarding-resources

### Important: Pika Theme Transition (Current Work)

**Active branch**: `feature/pika-integration`

The project is transitioning from Matrix green theme to Pika cyan/blue aesthetic:
- Primary color: `#22d3ee` (cyan) replacing Matrix green
- Background: Silver-gray gradient (`#cbd5e1` to `#64748b`)
- Typography: VT323 monospace font for terminal aesthetic
- Visual effects: Glitch art, CRT scanlines, chrome/metallic surfaces

**Key CSS files:**
- `character-app/src/pages/Onboarding/styles/onboarding.css` - Main Pika theme styles
- Utility classes: `.pika-silver-grid`, `.grid-overlay-pika`, `.noise-texture-pika`
- Component styles: `.mirror-container`, `.mirror-frame`, `.mirror-video`

**重要样式规则**:
- 使用内联样式或 CSS 类 (不要使用 Tailwind CSS - 本项目未安装)
- 使用 Framer Motion 做动画,不使用 CSS 动画(需要复杂时序时)
- Mirror 视频/图像元素始终使用 `position: absolute` + `object-fit: cover`
- 颜色方案:
  - 主色: `#22d3ee` (cyan)
  - 背景: `#cbd5e1` 到 `#64748b` (银灰渐变)
  - 强调色: `#06b6d4` (深青色)
  - 字体: VT323 (终端风格等宽字体)

### Project Structure
```
/ (Monorepo root)
├── character-app/                    # Main Character App
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Onboarding/          # Dual-architecture onboarding system
│   │   │   │   ├── OnboardingEngine.jsx  # State machine & step router
│   │   │   │   ├── stages/               # NEW: 4-Stage AI-Native flow
│   │   │   │   │   ├── Stage1Boot.jsx    # System boot + permissions
│   │   │   │   │   ├── Stage2Mirror.jsx  # Camera + Gemini Vision/Live + conversations
│   │   │   │   │   ├── Stage3Forging.jsx # Photo upload + script generation
│   │   │   │   │   └── Stage4Avatar.jsx  # Video reveal + naming + lip-sync
│   │   │   │   ├── steps/                # LEGACY: 7-step flow components
│   │   │   │   │   ├── Step1Splash.jsx
│   │   │   │   │   ├── Step2Guidance.jsx
│   │   │   │   │   ├── Step3Identity.jsx
│   │   │   │   │   ├── Step4Choice.jsx
│   │   │   │   │   ├── Step5Creation.jsx
│   │   │   │   │   ├── Step6Finalizing.jsx
│   │   │   │   │   └── Step7Entry.jsx
│   │   │   │   ├── hooks/                # Onboarding-specific hooks
│   │   │   │   │   ├── useOnboardingConfig.js
│   │   │   │   │   ├── useStepNavigation.js
│   │   │   │   │   └── useUserData.js
│   │   │   │   └── styles/
│   │   │   │       └── onboarding.css    # Pika theme + Onboarding styles
│   │   │   ├── CharacterList.jsx         # Character selection screen
│   │   │   └── CharacterView.jsx         # Main character interaction view
│   │   ├── components/
│   │   │   ├── character/
│   │   │   │   ├── VideoPlayer.jsx      # Video background with smooth transitions
│   │   │   │   ├── StatusIndicators.jsx # Left sidebar (NOW/HEALTH/MOOD buttons)
│   │   │   │   ├── StatusOverlays.jsx   # Overlay panels (mood selector, etc.)
│   │   │   │   ├── TopBar.jsx           # Top navigation
│   │   │   │   └── BottomSection.jsx    # Action suggestions + navigation
│   │   │   └── NovaOrbCanvas.jsx        # Particle visualization (Pika Entity)
│   │   ├── services/
│   │   │   ├── supabaseClient.js
│   │   │   ├── characterService.js       # Character CRUD operations
│   │   │   ├── onboardingService.js      # Onboarding config & session management
│   │   │   ├── geminiService.js          # Gemini Vision API (传统 REST)
│   │   │   ├── geminiLiveService.js      # 🔥 NEW: Gemini Live API (WebSocket 实时音视频)
│   │   │   ├── imageGenerationService.js # 🔥 NEW: FAL SeeDrawm v4 Edit (Stage2 身份生成)
│   │   │   ├── storageService.js         # 🔥 NEW: Supabase Storage upload helper
│   │   │   ├── templateService.js        # Template loading from Supabase
│   │   │   ├── videoGenerationService.js # Video generation workflow
│   │   │   ├── ttsService.js             # Text-to-speech integration
│   │   │   ├── elevenlabsService.js      # ElevenLabs TTS API
│   │   │   ├── voiceService.js           # Voice chat functionality
│   │   │   ├── audioService.js           # Audio playback
│   │   │   ├── audioCacheService.js      # IndexedDB audio caching
│   │   │   └── envService.js             # Environment variable management
│   │   ├── public/
│   │   │   └── audio/                    # Pre-recorded audio files (pika-boot.mp3, etc.)
│   │   └── vite.config.js
│
admin-app/ (Character Admin Panel)
├── src/
│   ├── pages/
│   │   ├── onboarding/
│   │   │   ├── OnboardingConfigManagement.jsx  # CRUD for onboarding_configs
│   │   │   └── OnboardingSessionsView.jsx      # View user onboarding sessions
│   │   ├── CharacterManagement.jsx    # CRUD for ai_characters
│   │   ├── StatusManagement.jsx       # CRUD for character_statuses
│   │   ├── AssetManagement.jsx        # CRUD for character_assets
│   │   └── SystemPromptsManagement.jsx # CRUD for system_prompts
│   ├── components/
│   │   └── (Ant Design-based UI components)
│   └── services/
│       ├── supabaseClient.js
│       ├── characterService.js
│       └── generationService.js       # Trigger AI generation workflows
│
supabase/ (Shared backend)
├── migrations/
│   ├── 20251105214351_initial_schema.sql
│   ├── 20251112_character_status_system.sql
│   ├── 20251118000000_create_onboarding_system.sql         # Onboarding tables & RLS
│   ├── 20251118120000_refactor_onboarding_architecture.sql # Onboarding optimization
│   ├── 20251119000000_add_4stage_support.sql               # NEW: 4-Stage architecture
│   └── (storage bucket configs)
└── functions/                     # Edge Functions
    ├── generate-text-content/     # Gemini prompt generation
    ├── generate-starting-image/   # FAL SeeDrawm image generation
    ├── generate-single-video/     # FAL SeeDance video generation
    ├── batch-image-generation/    # Batch processing
    ├── voice-chat/                # Voice chat functionality
    └── generate-tts-audio/        # Text-to-speech generation

scripts/ (Utility scripts)
└── query-looks.js                 # Query prompt_items table for 'looks' category
```

## Data Flow

### Character System: 3-Step Generation Workflow
```
Admin creates Status (draft) → character_statuses table
  ↓
Step 1: Generate Text Content
  Supabase Edge Function (generate-text-content) → Google Gemini API
  Returns: video_scenes[], overlays_content{}, suggestions_list[]
  ↓
Step 2: Generate Starting Image
  Supabase Edge Function (generate-starting-image) → FAL SeeDrawm API
  Input: selected assets + mood
  Returns: starting_image_url
  ↓
Step 3: Generate Video Clips
  Supabase Edge Function (generate-single-video) → FAL SeeDance API
  Input: starting_image_url + scene prompts (from Step 1)
  Returns: videos_playlist[] (array of video URLs)
  ↓
Status marked as 'completed'
  ↓
Character App displays: VideoPlayer with smooth transitions
```

### Onboarding System: Modular Flow Architecture
```
User visits Character App root (/) → onboardingService.getActiveConfig()
  ↓
Load onboarding_configs (active config) from Supabase
  ↓
OnboardingEngine reads config → routes to appropriate Step component
  ↓
Flow executes based on config:
  Step 1 (Splash): Welcome screen with visual theme
  Step 2 (Guidance): Assistant introduction (optional, config-driven)
  Step 3 (Identity): Name/photo/voice input (optional)
  Step 4 (Choice): "Keep self" vs "Become other" (optional)
  Step 5 (Creation): AI identity generation (optional)
  Step 6 (Finalizing): Confirmation & loading (optional)
  Step 7 (Entry): Final screen before entering main app
  ↓
Each step completion → onboarding_sessions table (progress tracking)
  ↓
Final step → redirect to /character/{target_character_id}
```

**Key Feature**: Steps 2-6 are optional and config-driven. Admin can create flows like:
- **Minimal**: Step 1 → Step 7 (immediate entry)
- **Philosophy**: Step 1 (epic splash) → Step 7
- **Tech**: Step 1 → Step 2 (assistant) → Step 3 (identity scan) → Step 4 (choice) → Step 7
- **Cyberpunk**: Step 1 → Step 4 → Step 5 (AI creation) → Step 6 (loading) → Step 7

### NEW: 4-Stage AI-Native Onboarding Flow (2025-01 Latest)
```
User visits Character App root (/) → onboardingService.getActiveConfig()
  ↓
Stage 1 (System Boot):
  Glitch art animation + Entity orb visual (粒子从 0 渐增到 260)
  → "BOOTING SYSTEM..." text sequence (打字机效果: 30ms/字符)
  → Greeting: "Hi, I'm PIKA. I am your guide for this experience." (50ms/字符)
  → Subtext: "You can give me commands or use the camera to let me see you."
  → "🔘 INITIATE" button (triggers camera/mic permission request)
  ↓
Stage 2 (Mirror Guide) 🔥 REFACTORED:
  INTRO Phase:
    → Camera activates (全屏镜像效果)
    → AI voice: "I am your guide." (TTS)
    → AI voice: "Please show me your form." (TTS)
    → Transition to CONVERSATION phase (最多 20 秒,超时强制进入)

  CONVERSATION Phase:
    → Gemini Live WebSocket 连接 (实时视频流 0.5 FPS)
    → AI "看到" 用户并提问 (基于视频流分析)
    → 用户可随时拍照 → REVIEWING sub-state
    → REVIEWING: RETAKE/CONFIRM 按钮
    → CONFIRM → GENERATING sub-state
    → Background generation (FAL SeeDrawm v4 Edit, ~10-30s, 对话继续)
    → Generation complete → Border flash + "Your digital form is ready" 通知
    → User clicks VIEW RESULT → SHOWING_RESULT sub-state
    → Toggle camera ↔ generated image
    → CONFIRM IDENTITY button → upload photos → onComplete()
  ↓
Stage 3 (Forging):
  "Feed me Memory Shards" prompt → User uploads 1-5 photos
  → Gemini Vision analyzes personality from photos
  → Script generation (Gemini) for character introduction
  → Trigger video generation (FAL SeeDance)
  → Progress animation ("CONSTRUCTING VESSEL 45%...")
  → Wait for video generation completion
  ↓
Stage 4 (Living Avatar):
  Reveal video plays (character opens eyes, "comes alive")
  → Lip-sync video with generated script (character introduces itself)
  → User enters character name
  → "ENTER WORLD" button → Transition video (wormhole effect)
  → Redirect to /character/{character_id}
```

**Field Mapping** (backward compatible with existing DB schema):
- Stage 1 (Boot) → Uses `step_1_splash` column
- Stage 2 (Mirror) → Uses `step_3_identity_input` column
- Stage 3 (Forging) → Uses `step_5_creation` column
- Stage 4 (Avatar) → Uses `step_7_entry` column

**Key Technologies**:
- **Gemini Vision API**: Photo analysis (传统 REST,用于静态照片分析)
- **Gemini Live API** 🔥: Real-time bidirectional audio+video streaming (WebSocket)
  - Model: `gemini-2.5-flash-native-audio-preview-09-2025`
  - Voice: `Achird` (Native Audio)
  - Modality: `AUDIO_TEXT` (返回音频 + 文本转录)
  - Frame rate: 0.5 FPS (每 2 秒一帧)
- **FAL SeeDrawm v4 Edit** 🔥: Identity image generation (Stage 2)
- **FAL SeeDance**: Video generation from starting image + prompts (Stage 3)
- **ElevenLabs**: Text-to-speech for character voice (fallback)
- **IndexedDB**: Audio caching via `audioCacheService.js`

See `character-app/New design.md` for detailed UX specs and wireframes.

## State Management

### Character App: React State Only

No global state management library. Uses React hooks:
- `useState` for local component state
- `useEffect` for data fetching
- Props drilling for component communication
- All data fetched from Supabase via `characterService.js`

### Admin Panel: React State + Ant Design

- Ant Design Form state management
- React hooks for CRUD operations
- No global state library needed

## Database Schema (远程 Supabase)

### Character System Tables
- `ai_characters` - Character profiles (name, avatar, description)
- `character_statuses` - Character states with mood/health/actions
  - Tracks generation workflow: step (0-3), status (draft/generating/completed/failed)
  - Stores AI-generated content: video_scenes[], overlays_content{}, suggestions_list[]
  - Stores media URLs: starting_image_url, videos_playlist[]
- `character_assets` - Asset library (服饰/地点/道具/其他)
- `system_prompts` - AI prompts for text/image/video generation
- `onboarding_configs` - Onboarding flow configurations (JSONB-based modular steps)
  - `flow_type`: 'fixed_character' | 'character_selection' | 'user_creation'
  - `step_1_splash` to `step_7_entry`: JSONB configs (visual, content, interaction)
  - `global_styles`: Theme customization (fonts, colors, animations)
- `onboarding_sessions` - User onboarding progress tracking
  - Stores: current_step, user_data (name, photo, choices), session timestamps

### Storage Buckets
- `photos` - 用户身份照片
- `videos` - 生成的视频片段 (角色系统)
- `cached_generations` - 预缓存图像 (演示模式)
- `onboarding-resources` - Onboarding 媒体资源 (背景视频、图像、音频)

## Important Code Patterns

### Character App: Smooth Video Transitions
```javascript
// VideoPlayer.jsx pattern
const [currentIndex, setCurrentIndex] = useState(0)
const [fade, setFade] = useState(true)

// Smooth fade between video clips
useEffect(() => {
  if (!videosPlaylist.length) return

  const timer = setInterval(() => {
    setFade(false)
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % videosPlaylist.length)
      setFade(true)
    }, 500) // Fade duration
  }, videoDuration * 1000)

  return () => clearInterval(timer)
}, [videosPlaylist])
```

### Character App: Framer Motion Overlays
```javascript
import { motion, AnimatePresence } from 'framer-motion'

<AnimatePresence>
  {activeOverlay === 'mood' && (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
    >
      <MoodSelector />
    </motion.div>
  )}
</AnimatePresence>
```

### Admin Panel: Drag-and-Drop Video Ordering
```javascript
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove } from '@dnd-kit/sortable'

const handleDragEnd = (event) => {
  const { active, old, over } = event
  if (old !== over) {
    setItems((items) => arrayMove(items, old, over))
  }
}
```

### Character App: Onboarding Engine (Config-Driven State Machine)
```javascript
// OnboardingEngine.jsx pattern
import useOnboardingConfig from '../../hooks/useOnboardingConfig'
import useStepNavigation from '../../hooks/useStepNavigation'

const OnboardingEngine = () => {
  const { config, loading, error } = useOnboardingConfig()
  const { currentStep, goToNextStep, goToPreviousStep } = useStepNavigation(config)

  // Dynamic step routing based on config
  const renderStep = () => {
    switch (currentStep) {
      case 1: return config.step_1_splash && <Step1Splash {...config.step_1_splash} />
      case 2: return config.step_2_guidance && <Step2Guidance {...config.step_2_guidance} />
      // ... steps 3-6 (optional)
      case 7: return config.step_7_entry && <Step7Entry {...config.step_7_entry} />
      default: return null
    }
  }

  return <div className="onboarding-container">{renderStep()}</div>
}
```

### Character App: Custom Hooks for Onboarding
```javascript
// useOnboardingConfig.js - Load config from Supabase
export default function useOnboardingConfig() {
  const [config, setConfig] = useState(null)

  useEffect(() => {
    const loadConfig = async () => {
      const activeConfig = await onboardingService.getActiveConfig()
      setConfig(activeConfig)
    }
    loadConfig()
  }, [])

  return { config, loading, error }
}

// useStepNavigation.js - Step transition logic with skip support
export default function useStepNavigation(config) {
  const [currentStep, setCurrentStep] = useState(1)

  const goToNextStep = () => {
    // Skip null steps (e.g., step 2-6 if not configured)
    let nextStep = currentStep + 1
    while (nextStep <= 7 && !config[`step_${nextStep}_*`]) {
      nextStep++
    }
    setCurrentStep(nextStep)
  }

  return { currentStep, goToNextStep, goToPreviousStep }
}
```

### Character App: 4-Stage Onboarding Implementation

**Stage 2 (Mirror Guide) - REFACTORED Architecture (2025-01):**

**重大架构变更**: Mirror 阶段已完全重构,使用 **Gemini Live API** 实现实时视频流对话:

```javascript
// Stage2Mirror.jsx - NEW architecture with Gemini Live integration
const Stage2Mirror = ({ config, onComplete }) => {
  // Main phase: 'INTRO' | 'CONVERSATION'
  const [phase, setPhase] = useState('INTRO')

  // Conversation sub-states: 'CAMERA' | 'REVIEWING' | 'GENERATING' | 'SHOWING_RESULT'
  const [conversationSubState, setConversationSubState] = useState('CAMERA')

  // Mirror display: 'camera' | 'captured_photo' | 'generated_image'
  const [mirrorDisplayMode, setMirrorDisplayMode] = useState('camera')

  // Generation status: 'idle' | 'generating' | 'completed' | 'failed'
  const [generationStatus, setGenerationStatus] = useState('idle')

  // 🔥 NEW: Gemini Live WebSocket connection
  const [geminiLive, setGeminiLive] = useState(null)
  const [geminiConnected, setGeminiConnected] = useState(false)

  // 🔥 Key Feature 1: Connect to Gemini Live API (Real-time bidirectional audio+video)
  useEffect(() => {
    const live = new GeminiLiveService(apiKey, {
      model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
      voiceName: 'Achird', // Native Audio 语音
      responseModality: 'AUDIO_TEXT', // 返回音频 + 文本转录
      onText: (text) => {
        setMessages(prev => [...prev, { role: 'ai', text }])
      },
      onConnected: () => setGeminiConnected(true)
    })
    live.connect()
    setGeminiLive(live)
    return () => live.close()
  }, [])

  // 🔥 Key Feature 2: Stream video frames to Gemini Live (0.5 FPS)
  // Replaces old auto-frame analysis - Gemini now "sees" continuously via video stream
  useEffect(() => {
    if (phase === 'CONVERSATION' && geminiLive && geminiConnected) {
      const interval = setInterval(async () => {
        // 🔥 Send video frame to Gemini Live (no separate Vision API call)
        await geminiLive.captureAndSendFrame(canvasRef.current, videoRef.current, 0.8)
      }, 2000) // Every 2 seconds (0.5 FPS)
      return () => clearInterval(interval)
    }
  }, [phase, geminiLive, geminiConnected])

  // 🔥 Key Feature 3: AI asks questions based on what it "sees" in real-time
  const generateAIQuestion = async () => {
    // Gemini already "sees" the user via video stream, just prompt it
    const prompt = "Based on what you see, ask ONE simple, gentle question. Under 10 words."
    await geminiLive.sendText(prompt)
    // Audio + text response handled automatically by callbacks
  }

  // Key Feature 4: User photo capture → Review → Confirm
  const handleConfirmPhoto = async () => {
    setConversationSubState('GENERATING')
    setMirrorDisplayMode('camera') // Keep showing camera during generation

    // Background generation starts (non-blocking, uses FAL SeeDrawm v4 Edit)
    triggerBackgroundGeneration()

    // Conversation continues while generating...
  }

  // Key Feature 5: Background generation with notification
  const triggerBackgroundGeneration = async () => {
    setGenerationStatus('generating')
    // 🔥 Uses imageGenerationService.js → generate-starting-image Edge Function
    const result = await generateWithRetry(capturedPhotoDataUrl, analysis, 3)
    setGeneratedImageUrl(result.imageUrl)
    setGenerationStatus('completed')

    // Notify user: border flash + "Your digital form is ready" button
    notifyGenerationComplete()
  }

  // Key Feature 6: Toggle view between camera and generated image
  const handleViewResult = () => {
    setMirrorDisplayMode('generated_image')
    setConversationSubState('SHOWING_RESULT')
    // Now shows CONFIRM IDENTITY button
  }

  return (/* UI with state-based rendering */)
}
```

**关键技术改进 (2025-01 重构):**
- 🔥 **Gemini Live WebSocket**: 替代传统 REST API,实现双向实时音频+视频通信
- 🔥 **视频流输入**: 每 2 秒发送一帧给 Gemini Live (0.5 FPS),AI 持续"看到"用户
- 🔥 **移除旧架构**: 不再使用 `analyzePhotoWithVision()` 每次单独分析帧
- 🔥 **Native Audio**: 使用 Gemini 2.5 Flash Native Audio model (Achird 语音)
- 🔥 **非阻塞生成**: 对话在 10-30 秒图像生成期间继续进行
- 🔥 **清晰状态机**: INTRO → CAMERA → REVIEWING → GENERATING → SHOWING_RESULT
- 🔥 **镜像切换**: camera ↔ captured_photo ↔ generated_image 灵活切换

**新增服务文件:**
- `geminiLiveService.js` - Gemini Live API WebSocket wrapper
- `imageGenerationService.js` - FAL SeeDrawm v4 Edit integration for identity generation

**Stage 3 (Forging) - Video Generation Workflow:**
```javascript
// Stage3Forging.jsx
import { triggerVideoGeneration } from '../../../services/videoGenerationService'

const Stage3Forging = ({ config, onComplete, userData }) => {
  const [uploadedPhotos, setUploadedPhotos] = useState([])
  const [generationStatus, setGenerationStatus] = useState('idle')
  // Status: idle | analyzing | crafting | forging | complete

  const handlePhotoUpload = async (files) => {
    // Upload to Supabase storage
    const urls = await uploadPhotosToStorage(files)
    setUploadedPhotos([...uploadedPhotos, ...urls])

    // Trigger Gemini Vision personality analysis
    if (uploadedPhotos.length >= 3) {
      analyzePersonality(uploadedPhotos)
    }
  }

  const analyzePersonality = async (photoUrls) => {
    setGenerationStatus('analyzing')
    // Gemini Vision analyzes multiple photos
    const personality = await geminiAnalyzePhotos(photoUrls)

    setGenerationStatus('crafting')
    // Generate script for character introduction
    const script = await geminiGenerateScript(personality, userData)

    setGenerationStatus('forging')
    // Trigger video generation (FAL SeeDance)
    const videoUrl = await triggerVideoGeneration(script, userData.template)

    setGenerationStatus('complete')
    onComplete({ videoUrl, script, personality })
  }

  return (/* UI with progress animation */)
}
```

**Utility Scripts:**
```bash
# Query template data from Supabase
node scripts/query-looks.js

# Output: Lists all prompt_items with category='looks' or 'looking'
# Useful for debugging template loading in Stage 2
```

## Environment Variables

所有应用共享相同的 `.env` 结构:
```env
# FAL API (图像/视频生成)
VITE_FAL_API_KEY=your_fal_api_key

# Supabase (远程云端)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # 管理员操作用

# Google Gemini (文本生成、视觉分析、实时语音)
VITE_GEMINI_API_KEY=your_gemini_api_key
```

**Supabase Edge Functions** 也需要环境变量:
```bash
# 在 Supabase Dashboard → Settings → Edge Functions → Secrets 中设置
FAL_API_KEY=your_fal_api_key
GEMINI_API_KEY=your_gemini_api_key
```

## Deployment

### Vercel (独立项目)

每个应用部署到独立的 Vercel 项目:

**1. Character App:**
```bash
cd character-app
# 有自己的 vercel.json
vercel --prod
# URL: https://character-app.vercel.app
```

**2. Admin Panel:**
```bash
cd admin-app
# 有自己的 vercel.json
vercel --prod
# URL: https://admin-panel.vercel.app
```

在每个 Vercel 项目仪表板中分别设置环境变量。

### Supabase Edge Functions (远程)
```bash
# 部署所有 functions
supabase functions deploy

# 或部署特定 function
supabase functions deploy generate-single-video

# 查看 function 日志
supabase functions logs generate-single-video --tail
```

## Debugging Tips

### Console Logging Prefixes
- **Character App:**
  - Core: `[CharacterView]`, `[VideoPlayer]`, `[characterService]`
  - Onboarding: `[OnboardingEngine]`, `[onboardingService]`, `[Stage1Boot]`, `[Stage2Mirror]`, `[Stage3Forging]`, `[Stage4Avatar]`
  - Services: `[geminiService]`, `[GeminiLive]` 🔥, `[imageGenerationService]` 🔥, `[templateService]`, `[videoGenerationService]`, `[ttsService]`, `[voiceService]`, `[audioCacheService]`
- **Admin Panel:** `[generationService]`, `[statusManagement]`, `[OnboardingConfigManagement]`
- **Edge Functions:** Check Supabase dashboard logs (`supabase functions logs <name> --tail`)

### Important Development Notes

**🔥 Gemini Live API 使用注意事项:**
- WebSocket 连接可能不稳定,需要处理重连逻辑
- 视频帧发送频率建议: 0.5 FPS (每 2 秒),避免超出 API 限制
- 音频响应是流式的,需要使用回调函数处理
- 文本转录可能有延迟,不要依赖同步响应
- 连接超时建议设置为 20 秒,超时后强制进入下一阶段

**🔥 Stage1Boot 音频处理:**
- 所有音频播放已移除,改用固定时间间隔控制打字机效果
- Boot 序列: 每字符 30ms
- Greeting/Subtext: 每字符 50ms
- 使用本地变量 `isGreetingComplete` 而非状态,避免异步闭包问题

**🔥 Stage2Mirror 状态管理:**
- 使用 3 层状态机: `phase` (INTRO/CONVERSATION) → `conversationSubState` (CAMERA/REVIEWING/GENERATING/SHOWING_RESULT) → `mirrorDisplayMode` (camera/captured_photo/generated_image)
- 关键: GENERATING 状态下保持 `mirrorDisplayMode='camera'`,让对话继续
- 生成完成后显示通知,用户点击 VIEW RESULT 才切换到生成的图像
- 使用 `isSubmitting` debounce 锁防止重复提交

**🔥 CSS 样式重要规则:**
- ❌ 项目未安装 Tailwind CSS - 不要使用 Tailwind 类名
- ✅ 使用内联样式或 `onboarding.css` 中定义的类
- ✅ Mirror 视频/图像必须使用: `position: absolute; top: 0; left: 0; object-fit: cover;`
- ✅ Pika 主题颜色: `#22d3ee` (cyan), `#cbd5e1` (银灰背景)
- ✅ 字体: VT323 (终端等宽字体)

### Common Issues

**Video not playing (Character App):**
- Check `videos_playlist` is not empty in character_statuses table
- Verify video URLs are accessible (try opening in browser)
- Check browser console for CORS errors
- Ensure video files are in Supabase storage `videos` bucket

**Generation workflow stuck:**
- 检查 character_statuses 表中的 `generation_step` 和 `generation_status`
- 查看 edge function 日志: `supabase functions logs <function-name> --tail`
- 在 Supabase Dashboard → Settings → Edge Functions → Secrets 中验证 FAL API key
- 检查 Gemini API 配额限制

**Smooth video transition not working:**
- Ensure `videoDuration` matches actual video length (character-app/src/components/character/VideoPlayer.jsx:30)
- Check fade animation CSS transition timing
- Verify `videos_playlist` array has multiple videos

**Onboarding not loading:**
- Check if there's an active config: `SELECT * FROM onboarding_configs WHERE is_active = true`
- Verify `target_character_id` exists in `ai_characters` table
- Check browser console for JSONB parsing errors
- Ensure at least `step_1_splash` and one other step are configured

**Onboarding stuck on a step:**
- Check `onboarding_sessions` table for session state
- Verify step config has valid `interaction.type` (e.g., "button", "any_click")
- Check if visual resources (videos/images) are loading correctly
- Review browser console for JavaScript errors in step components

**4-Stage Onboarding specific issues:**

**Stage 2 (Mirror) - Camera not working:**
- Ensure HTTPS or localhost (camera requires secure context)
- Check browser permissions for camera access
- Verify `getUserMedia` is supported in browser
- Check console for `[Stage2Mirror]` errors

**Stage 2 - Gemini Live connection failing:**
- Verify `VITE_GEMINI_API_KEY` is set in `.env`
- Check Gemini API quota/billing at ai.google.dev
- Ensure browser supports WebSocket (check console for WebSocket errors)
- Check `[GeminiLive]` and `[Stage2Mirror]` console logs for connection errors
- Verify model name: `models/gemini-2.5-flash-native-audio-preview-09-2025`
- Try refreshing page if connection drops (WebSocket may need reconnection)

**Stage 2 - Templates not loading:**
- Run `node scripts/query-looks.js` to verify data exists in Supabase
- Check that `prompt_items` table has rows with `category='looks'` or `category='looking'`
- Verify `enabled=true` and `deleted_at IS NULL` for template items
- Check `[templateService]` console logs

**Stage 3 (Forging) - Video generation stuck:**
- Check generation status in browser DevTools console
- Verify FAL API key is valid
- Video generation can take 30-60 seconds - ensure UI shows progress
- Check `[videoGenerationService]` logs for FAL API errors

**Stage 4 (Avatar) - Lip-sync video not playing:**
- Verify video URL is accessible (try opening in browser)
- Check Supabase storage bucket permissions
- Ensure video format is supported (MP4 recommended)
- Check browser console for video loading errors

## Key Architecture Decisions

### Why Monorepo?
- 所有应用共享 Supabase 后端
- 可重用的迁移脚本和 edge functions
- 一致的环境变量管理
- 每个前端独立部署

### Why No Global State in Character App?
- Simple data flow (fetch from Supabase → display)
- No complex client-side state mutations
- Character data is read-only in frontend (writes happen via Admin Panel)

### Character System: 3-Step Generation
- **Step 1 (文本):** Gemini 生成场景描述、覆盖层文本、建议
- **Step 2 (图像):** FAL SeeDrawm 从资产 + 情绪生成起始图像
- **Step 3 (视频):** FAL SeeDance 将图像 + 场景提示转换为视频片段
- 每步将结果保存到 `character_statuses` 表后再继续
- 如果任何步骤失败,允许恢复

### Onboarding System: JSONB-Based Configuration
- **数据库驱动**: 所有步骤配置作为 JSONB 存储在 `onboarding_configs` 表中
- **模块化**: 步骤 2-6 是可选的;管理员通过 null/非 null JSONB 启用/禁用
- **多主题支持**: 单一代码库服务不同视觉主题 (Philosophy, Tech, Cyberpunk, Pika)
- **无硬编码流程**: 步骤路由由配置存在性决定,而非代码条件判断
- **会话跟踪**: `onboarding_sessions` 允许恢复未完成的流程
- 灵感来自 "Second Life", "Pikabot", "Naomi" 参考流程 (见 character-app/New design.md)

### 4-Stage AI-Native Onboarding Architecture (Pika 主题)
- **双架构支持**: 代码库同时支持 7 步 (传统) 和 4 阶段 (新) 流程
- **向后兼容**: 4 阶段使用现有 DB 列 (`step_1_splash`, `step_3_identity_input`, 等)
- **AI 优先体验**: 深度集成 Gemini Vision, Gemini Live, FAL 视频生成
- **权限流程**: Stage 1 (Boot) 在交互阶段前处理相机/麦克风权限
- **延迟管理**: Stage 3 (Forging) 包含进度动画来管理 30-60 秒的视频生成等待
- **状态驱动 UI**: 每个阶段使用基于阶段的状态机 (例如: camera → analyzing → conversation → templates)
- **IndexedDB 缓存**: 通过 `audioCacheService.js` 本地缓存音频文件以减少 API 调用
- **设计理念**: "The app is alive" - 专注于沉浸感,而非传统表单填写
  - Boot 序列用故障艺术建立 "系统" 隐喻
  - Mirror 阶段让 AI "看到" 并 "与" 用户对话
  - Forging 阶段: "注入记忆碎片" 而非 "上传照片"
  - Avatar 阶段: 角色通过揭示 + 口型同步视频 "苏醒"
- 详见 `character-app/New design.md` 了解详细的 UX 原理和线框图
