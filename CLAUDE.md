# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **monorepo** containing three separate applications:

### 1. LookGen (Root Directory `/`)
Social media app for AI-powered photo transformations:
- Upload identity photos
- Apply 5 transformation types (better-looking, Japanese style, more male/female, fair skin)
- Choose from style templates
- Create multi-photo carousel posts
- Browse social feeds with likes/comments
- Built with React Native Web (cross-platform: web, iOS, Android)

### 2. Character App (`/character-app`)
AI virtual character interaction system:
- **Onboarding System**: Supports both 7-step and new 4-stage AI-native flows (database-driven)
  - **4-Stage Architecture**: System Boot → Mirror Guide → Forging → Living Avatar
  - Integrates Gemini Vision API, Gemini Live API, and video generation
  - Camera/microphone access, real-time photo analysis, voice conversation
- View AI characters with dynamic moods/health/statuses
- Video-based character display with smooth clip transitions
- Real-time status changes based on mood selection
- Mobile-first TikTok-style vertical video UI
- Framer Motion animations for overlays
- Built with React (traditional web app, not React Native Web)

### 3. Admin Panel (`/admin-app`)
Management interface for Character Status system:
- Create and manage AI characters
- Configure character statuses (mood, health, actions)
- **Onboarding Configuration**: Visual editor for onboarding flows (steps, visual themes, copy)
- 3-step AI content generation workflow (Gemini → FAL SeeDrawm → FAL SeeDance)
- Asset library management (clothing, locations, props)
- System prompt configuration
- Drag-and-drop video playlist ordering
- Built with React + Ant Design

## Quick Commands

### Monorepo Commands (Root Level)
```bash
# Install all dependencies (root + workspaces)
npm install

# Run specific app from root
npm run dev:character     # Start Character App dev server
npm run dev:admin         # Start Admin Panel dev server

# Build specific app
npm run build:character
npm run build:admin
```

### LookGen (Root App)
```bash
npm install              # Install dependencies
npm run dev              # Start dev server (http://localhost:5173)
npm run build            # Build for production
npm run lint             # Run ESLint
npm run preview          # Preview production build
npm run clear-cache      # Clear cached transformation results
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

### Supabase (Shared Backend)
```bash
# Local Development
supabase start                          # Start local Supabase (postgres, studio, edge functions)
supabase stop                           # Stop local Supabase
supabase status                         # Check status and get service URLs

# Database Migrations
supabase db push                        # Push migrations to remote
supabase db reset                       # Reset local database (WARNING: destroys data)
supabase migration list                 # List all migrations
supabase migration new <name>           # Create new migration file

# Edge Functions
supabase functions deploy <name>        # Deploy specific edge function
supabase functions deploy               # Deploy all functions
supabase functions list                 # List all edge functions
supabase functions logs <name> --tail   # Tail function logs in real-time
supabase functions serve <name>         # Serve function locally for testing

# Utility Scripts
node scripts/query-looks.js             # Query prompt_items table (debugging templates)

# Edge functions:
# - transform-image: Single image transformation (LookGen)
# - batch-transform: Batch image transformation (LookGen)
# - generate-text-content: Gemini text generation (Character system)
# - generate-starting-image: FAL SeeDrawm image generation (Character system)
# - generate-single-video: FAL SeeDance video generation (Character system)
# - batch-image-generation: Batch image processing (Character system)
# - voice-chat: Voice chat functionality (Character system)
# - generate-tts-audio: Text-to-speech audio generation (Character system)
```

## Architecture Overview

### Technology Stack by App

**LookGen (Root):**
- React 19 + **React Native Web 0.21** (NOT traditional HTML/React)
- Zustand 5.0 (state + localStorage persistence)
- Vite 7.1 build tool
- Tamagui (UI component library, optional)
- Cross-platform: web, iOS, Android

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

**Shared Backend:**
- Supabase (PostgreSQL, Storage, Edge Functions)
- AI APIs: FAL (image/video generation), Google Gemini (text generation)
- Storage buckets: photos, videos, cached_generations

### Critical Distinction: LookGen Uses React Native Web

**LookGen ONLY**: Code uses React Native components (`View`, `Text`, `TouchableOpacity`, `StyleSheet`) instead of HTML DOM elements.

```javascript
// ✅ LookGen (React Native Web)
import { View, Text, TouchableOpacity } from 'react-native'

// ✅ Character App & Admin Panel (Traditional React)
<div>, <button>, <h1>, className, etc.
```

**When working on LookGen**, you MUST use React Native components. Character App and Admin Panel use normal HTML/React patterns.

### Project Structure
```
/ (LookGen root app)
├── src/
│   ├── pages/               # React Native Web pages
│   │   ├── Landing.jsx
│   │   ├── IdentityUpload.jsx
│   │   ├── EditLook.jsx
│   │   ├── Templates.jsx
│   │   ├── CreatePost.jsx
│   │   ├── Feed.jsx
│   │   └── Profile.jsx
│   ├── stores/appStore.js   # Zustand global state
│   ├── services/            # API services
│   │   ├── supabaseClient.js
│   │   ├── supabaseApi.js
│   │   ├── falApi.js
│   │   └── configService.js
│   └── config/              # JSON config files
│       ├── style_templates.json
│       └── transformation_prompts.json
│
character-app/ (AI Character Viewer)
├── src/
│   ├── pages/
│   │   ├── Onboarding/          # Dual-architecture onboarding system
│   │   │   ├── OnboardingEngine.jsx  # State machine & step router
│   │   │   ├── stages/               # NEW: 4-Stage AI-Native flow
│   │   │   │   ├── Stage1Boot.jsx    # System boot + permissions
│   │   │   │   ├── Stage2Mirror.jsx  # Camera + Gemini Vision/Live + templates
│   │   │   │   ├── Stage3Forging.jsx # Photo upload + script generation
│   │   │   │   └── Stage4Avatar.jsx  # Video reveal + naming + lip-sync
│   │   │   ├── Step1Splash.jsx       # LEGACY: 7-step flow components
│   │   │   ├── Step2Guidance.jsx
│   │   │   ├── Step3Identity.jsx
│   │   │   ├── Step4Choice.jsx
│   │   │   ├── Step5Creation.jsx
│   │   │   ├── Step6Finalizing.jsx
│   │   │   └── Step7Entry.jsx
│   │   ├── CharacterList.jsx    # Character selection screen
│   │   └── CharacterView.jsx    # Main character interaction view
│   ├── components/character/
│   │   ├── VideoPlayer.jsx      # Video background with smooth transitions
│   │   ├── StatusIndicators.jsx # Left sidebar (NOW/HEALTH/MOOD buttons)
│   │   ├── StatusOverlays.jsx   # Overlay panels (mood selector, etc.)
│   │   ├── TopBar.jsx           # Top navigation
│   │   └── BottomSection.jsx    # Action suggestions + navigation
│   ├── hooks/
│   │   ├── useOnboardingConfig.js    # Load config from Supabase
│   │   ├── useStepNavigation.js      # Step transition logic
│   │   └── useUserData.js            # User data persistence
│   └── services/
│       ├── supabaseClient.js
│       ├── characterService.js       # Character CRUD operations
│       ├── onboardingService.js      # Onboarding config & session management
│       ├── geminiService.js          # Gemini Vision & Live API integration
│       ├── templateService.js        # Template loading from Supabase
│       ├── videoGenerationService.js # Video generation workflow
│       ├── envService.js             # Environment variable management
│       ├── ttsService.js             # Text-to-speech integration
│       ├── elevenlabsService.js      # ElevenLabs TTS API
│       ├── voiceService.js           # Voice chat functionality
│       ├── audioService.js           # Audio playback
│       └── audioCacheService.js      # IndexedDB audio caching
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
└── functions/
    ├── transform-image/           # LookGen: FAL image transformation
    ├── batch-transform/           # LookGen: Batch transformations
    ├── generate-text-content/     # Character: Gemini prompt generation
    ├── generate-starting-image/   # Character: FAL SeeDrawm image gen
    ├── generate-single-video/     # Character: FAL SeeDance video gen
    ├── batch-image-generation/    # Character: Batch processing
    ├── voice-chat/                # Character: Voice chat
    └── generate-tts-audio/        # Character: Text-to-speech

scripts/ (Utility scripts)
└── query-looks.js                 # Query prompt_items table for 'looks' category
```

## Data Flow

### LookGen: Photo Transformation Flow
```
User uploads photo → Zustand Store → Supabase Storage (photos bucket)
  ↓
Supabase Edge Function (transform-image) → FAL API
  ↓
Transformed image saved to Supabase Storage
  ↓
Display in UI / Store in Zustand
  ↓
Create Post → Supabase Database (posts table)
  ↓
Feed displays posts
```

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

### NEW: 4-Stage AI-Native Onboarding Flow
```
User visits Character App root (/) → onboardingService.getActiveConfig()
  ↓
Stage 1 (System Boot):
  Glitch art animation + Entity orb visual
  → "BOOTING SYSTEM..." text sequence
  → "🔘 INITIATE TALKING" button (triggers camera/mic permission request)
  ↓
Stage 2 (Mirror Guide):
  Camera activation (full-screen) → User captures photo
  → Gemini Vision API analyzes photo (location, clothing, mood)
  → Gemini Live API: 2-round voice conversation
  → AI recommends templates based on analysis
  → User selects template from carousel
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
- **Gemini Vision API**: Photo analysis (environment, clothing, mood detection)
- **Gemini Live API**: Real-time voice conversation (2 rounds max)
- **FAL SeeDance**: Video generation from starting image + prompts
- **ElevenLabs**: Text-to-speech for character voice
- **IndexedDB**: Audio caching via `audioCacheService.js`

See `character-app/New design.md` for detailed UX specs and wireframes.

## State Management

### LookGen: Zustand Store (appStore.js)

Global state with localStorage persistence:
- `identityPhoto` - User's uploaded photo
- `selectedTransformation` - Transformation type (e.g., 'better_looking')
- `selectedTemplate` - Style template ID ('T1'-'T5')
- `generatedPhotos` - AI-transformed results array
- `posts` - Social feed posts
- `currentUser` - User profile data
- `cacheMode` - Demo cache toggle (uses cached images instead of FAL API)
- `transformationPrompts` - Config from Supabase/JSON fallback
- `styleTemplates` - Templates from Supabase/JSON fallback

Key methods:
- `loadConfigFromSupabase()` - Loads config with JSON fallback
- `refreshConfig()` - Refresh after admin updates
- `setCacheMode()` - Toggle demo cache

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

## Database Schema (Supabase)

### LookGen Tables
- `identity_photos` - User-uploaded photos
- `posts` - Social feed posts
- `prompt_configs` - Transformation prompts configuration
- `app_settings` - Global settings (cache mode)
- `cached_generations` - Pre-generated images for demo mode

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
- `photos` - User identity photos (LookGen)
- `videos` - Generated video clips (Character system)
- `cached_generations` - Pre-cached images (demo mode)
- `onboarding-resources` - Onboarding media (background videos, images, audio)

## Configuration System (LookGen Only)

**Hierarchical loading:**
1. Try Supabase `prompt_configs` table
2. Fallback to local JSON files (`src/config/*.json`)
3. Console logs errors if both fail

**Config files:**
- `transformation_prompts.json` - 5 transformation types with AI prompts
- `style_templates.json` - Style templates with metadata

**Cache Mode (Demo Feature):**
- Toggle in `app_settings` table, synced to appStore
- When enabled: Uses `cached_generations` table instead of FAL API
- Real-time sync via Supabase subscription (settingsService.js)

## Important Code Patterns

### LookGen: Using Zustand Store
```javascript
import useAppStore from '../stores/appStore';

const Component = () => {
  const identityPhoto = useAppStore((state) => state.identityPhoto);
  const setIdentityPhoto = useAppStore((state) => state.setIdentityPhoto);
  return (...);
};
```

### LookGen: React Native Web Components (NOT HTML!)
```javascript
// ✅ CORRECT for LookGen
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const MyComponent = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Hello</Text>
    <TouchableOpacity style={styles.button}>
      <Text>Click me</Text>
    </TouchableOpacity>
  </View>
);

// ❌ WRONG for LookGen (but OK for Character App/Admin Panel)
const MyComponent = () => (
  <div className="container">
    <h1>Hello</h1>
    <button>Click me</button>
  </div>
);
```

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

**Stage 2 (Mirror Guide) - Gemini Integration Pattern:**
```javascript
// Stage2Mirror.jsx
import { analyzePhotoWithVision } from '../../../services/geminiService'
import { loadLookingTemplates } from '../../../services/templateService'

const Stage2Mirror = ({ config, onComplete }) => {
  const [phase, setPhase] = useState('camera')
  // Phases: camera | captured | analyzing | conversation | templates

  // 1. Camera capture
  const capturePhoto = () => {
    const canvas = canvasRef.current
    const video = videoRef.current
    canvas.getContext('2d').drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg')
    setPhotoDataUrl(dataUrl)
    setPhase('analyzing')
    analyzePhoto(dataUrl)
  }

  // 2. Gemini Vision analysis
  const analyzePhoto = async (photoDataUrl) => {
    const result = await analyzePhotoWithVision(photoDataUrl)
    // Result: { location, clothing, mood, recommendation }
    setAnalysisResult(result)
    setPhase('conversation') // → Transition to Gemini Live
  }

  // 3. Gemini Live voice conversation (2 rounds)
  // TODO: Implement Gemini Live API integration

  // 4. Template selection
  const loadTemplates = async () => {
    const templates = await loadLookingTemplates()
    setTemplates(templates)
    setPhase('templates')
  }

  return (/* UI with phase-based rendering */)
}
```

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

All apps share the same `.env` structure:
```env
# FAL API (image/video generation)
VITE_FAL_API_KEY=your_fal_api_key

# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # For admin operations

# Google Gemini (text generation, vision, live voice)
VITE_GEMINI_API_KEY=your_gemini_api_key
```

**Supabase Edge Functions** also need environment variables:
```bash
# In supabase/functions/.env
FAL_API_KEY=your_fal_api_key
GEMINI_API_KEY=your_gemini_api_key
```

## Deployment

### Vercel (Separate Projects)

Each app deploys to a separate Vercel project:

**1. LookGen (Root App):**
```bash
# Root directory has vercel.json
vercel --prod
# URL: https://lookgen.vercel.app
```

**2. Character App:**
```bash
cd character-app
# Has its own vercel.json
vercel --prod
# URL: https://character-app.vercel.app
```

**3. Admin Panel:**
```bash
cd admin-app
# Has its own vercel.json
vercel --prod
# URL: https://admin-panel.vercel.app
```

Set environment variables in each Vercel project dashboard separately.

### Supabase Edge Functions
```bash
# Deploy all functions
supabase functions deploy

# Or deploy specific function
supabase functions deploy generate-single-video

# View function logs
supabase functions logs generate-single-video --tail
```

## Debugging Tips

### Console Logging Prefixes
- **LookGen:** `[appStore]`, `[supabaseApi]`, `[falApi]`
- **Character App:**
  - Core: `[CharacterView]`, `[VideoPlayer]`, `[characterService]`
  - Onboarding: `[OnboardingEngine]`, `[onboardingService]`, `[Stage1Boot]`, `[Stage2Mirror]`, `[Stage3Forging]`, `[Stage4Avatar]`
  - Services: `[geminiService]`, `[templateService]`, `[videoGenerationService]`, `[ttsService]`, `[voiceService]`, `[audioCacheService]`
- **Admin Panel:** `[generationService]`, `[statusManagement]`, `[OnboardingConfigManagement]`
- **Edge Functions:** Check Supabase dashboard logs (`supabase functions logs <name> --tail`)

### Common Issues

**Video not playing (Character App):**
- Check `videos_playlist` is not empty in character_statuses table
- Verify video URLs are accessible (try opening in browser)
- Check browser console for CORS errors
- Ensure video files are in Supabase storage `videos` bucket

**Generation workflow stuck:**
- Check `generation_step` and `generation_status` in character_statuses table
- View edge function logs: `supabase functions logs <function-name> --tail`
- Verify FAL API key is set in Supabase edge function secrets
- Check Gemini API quota limits

**LookGen state persistence issues:**
- DevTools → Application → LocalStorage → Check `appStore` keys
- If cache mode not working, check `app_settings` table in Supabase
- Use React DevTools to inspect Zustand store

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

**Stage 2 - Gemini Vision analysis failing:**
- Verify `VITE_GEMINI_API_KEY` is set in `.env`
- Check Gemini API quota/billing at ai.google.dev
- Ensure photo is properly converted to base64 data URL
- Check `[geminiService]` console logs for API errors

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
- Shared Supabase backend across all apps
- Reusable migration scripts and edge functions
- Consistent environment variable management
- Independent deployment for each frontend

### Why React Native Web for LookGen Only?
- LookGen designed for future iOS/Android native apps
- Character App and Admin Panel are web-only, no need for cross-platform overhead

### Why No Global State in Character App?
- Simple data flow (fetch from Supabase → display)
- No complex client-side state mutations
- Character data is read-only in frontend (writes happen via Admin Panel)

### Character System: 3-Step Generation
- **Step 1 (Text):** Gemini generates scene descriptions, overlay text, suggestions
- **Step 2 (Image):** FAL SeeDrawm generates starting image from assets + mood
- **Step 3 (Video):** FAL SeeDance converts image + scene prompts → video clips
- Each step saves results to `character_statuses` table before proceeding
- Allows resuming if any step fails

### Onboarding System: JSONB-Based Configuration
- **Database-driven**: All step configs stored in `onboarding_configs` table as JSONB
- **Modular**: Steps 2-6 are optional; admin enables/disables via null/non-null JSONB
- **Multi-theme support**: Single codebase serves different visual themes (Philosophy, Tech, Cyberpunk)
- **No hardcoded flows**: Step routing determined by config presence, not code conditionals
- **Session tracking**: `onboarding_sessions` allows resuming incomplete flows
- Inspired by "Second Life", "Pikabot", "Naomi" reference flows (see character-app/Onboarding SPEC.md)

### 4-Stage AI-Native Onboarding Architecture
- **Dual architecture support**: Codebase supports both 7-step (legacy) and 4-stage (new) flows
- **Backward compatible**: 4-stage uses existing DB columns (`step_1_splash`, `step_3_identity_input`, etc.)
- **AI-first experience**: Heavy integration with Gemini Vision, Gemini Live, FAL video generation
- **Permission flow**: Stage 1 (Boot) handles camera/mic permissions before interactive stages
- **Latency management**: Stage 3 (Forging) includes progress animations to manage 30-60s video generation wait
- **State-driven UI**: Each stage uses phase-based state machines (e.g., camera → analyzing → conversation → templates)
- **IndexedDB caching**: Audio files cached locally via `audioCacheService.js` to reduce API calls
- **Design philosophy**: "The app is alive" - focus on immersion, not traditional form-filling
  - Boot sequence with glitch art establishes "system" metaphor
  - Mirror stage feels like AI is "seeing" and "talking" to user
  - Forging stage: "Feeding Memory Shards" instead of "Upload Photos"
  - Avatar stage: Character "comes alive" with reveal + lip-sync videos
- See `character-app/New design.md` for detailed UX rationale and wireframes
