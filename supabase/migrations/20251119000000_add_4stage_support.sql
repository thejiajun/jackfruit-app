-- =============================================
-- 添加 4-Stage Onboarding 架构支持
-- =============================================

-- 说明：
-- 本迁移为可选迁移，用于支持新的 4-Stage AI-Native Onboarding 架构
-- 目前代码使用临时字段映射，所以这个迁移主要是添加注释和文档说明
--
-- 4-Stage 架构映射到现有字段：
-- Stage 1 (System Boot)    → step_1_splash (启动与世界观)
-- Stage 2 (Mirror Guide)   → step_3_identity_input (身份输入)
-- Stage 3 (Forging)        → step_5_creation (身份创造)
-- Stage 4 (Living Avatar)  → step_7_entry (进入世界)
--
-- 未来可以重命名字段为 stage_1_boot, stage_2_mirror, stage_3_forging, stage_4_avatar

-- 步骤 1: 添加表注释，说明 4-Stage 架构
COMMENT ON TABLE onboarding_theme IS '存储 Onboarding 流程的视觉样式主题配置

支持两种架构：
1. 原有 7-Step 架构：完整的 step_1 到 step_7 配置
2. 新的 4-Stage AI-Native 架构：
   - Stage 1 (System Boot): 故障艺术 + Entity 聚合 + 权限请求
   - Stage 2 (Mirror Guide): 摄像头拍照 + Gemini Vision 分析 + Gemini Live 对话 + 模板选择
   - Stage 3 (Forging): 上传照片 + 性格分析 + Script 生成 + 视频生成触发
   - Stage 4 (Living Avatar): Revealing 视频 + 命名 + Lip-Sync 视频 + Transition

临时字段映射（向后兼容）：
- Stage 1 → step_1_splash
- Stage 2 → step_3_identity_input
- Stage 3 → step_5_creation
- Stage 4 → step_7_entry';

-- 步骤 2: 更新各步骤字段的注释，说明 4-Stage 用途
COMMENT ON COLUMN onboarding_theme.step_1_splash IS
'Step 1: 启动与世界观 (7-Step) 或 Stage 1: System Boot (4-Stage)
4-Stage 配置示例：
{
  "visual": {
    "boot_sequence": ["BOOTING SYSTEM...", "LOADING ASSETS... OK"],
    "glitch_effect": true,
    "entity_orb": true
  },
  "content": {
    "entity_name": "Pika",
    "greeting": "Hey, I''m Pika. WELCOME.",
    "subtext": "I''m listening..."
  },
  "interaction": {
    "button_text": "🔘 INITIATE TALKING",
    "request_permissions": ["camera", "microphone"]
  }
}';

COMMENT ON COLUMN onboarding_theme.step_3_identity_input IS
'Step 3: 身份输入 (7-Step) 或 Stage 2: Mirror Guide (4-Stage)
4-Stage 配置示例：
{
  "visual": {
    "camera_overlay": "scan_lines",
    "rec_indicator": true
  },
  "content": {
    "prompt": "Let me see you...",
    "conversation_rounds": 2
  },
  "interaction": {
    "capture_button": "📸 CAPTURE",
    "gemini_vision_enabled": true,
    "gemini_live_enabled": true,
    "template_selection": true
  }
}';

COMMENT ON COLUMN onboarding_theme.step_5_creation IS
'Step 5: 身份创造 (7-Step) 或 Stage 3: Forging (4-Stage)
4-Stage 配置示例：
{
  "visual": {
    "particle_animation": true,
    "progress_bar": true
  },
  "content": {
    "upload_prompt": "Feed me Memory Shards to complete the mind.",
    "max_photos": 5,
    "status_messages": {
      "analyzing": "ANALYZING YOUR ESSENCE",
      "crafting": "CRAFTING YOUR STORY",
      "forging": "FORGING YOUR DIGITAL SHELL"
    }
  },
  "interaction": {
    "gemini_vision_analysis": true,
    "gemini_script_generation": true,
    "video_generation_trigger": true
  }
}';

COMMENT ON COLUMN onboarding_theme.step_7_entry IS
'Step 7: 进入世界 (7-Step) 或 Stage 4: Living Avatar (4-Stage)
4-Stage 配置示例：
{
  "visual": {
    "character_card": true,
    "fade_transitions": true
  },
  "content": {
    "name_prompt": "What do you want to call this character?",
    "placeholder": "Enter name..."
  },
  "videos": {
    "revealing_video": "auto_generated",
    "lipsync_video": "auto_generated",
    "transition_video": "/videos/transition-default.mp4"
  },
  "interaction": {
    "name_input": true,
    "auto_redirect": true
  }
}';

-- 步骤 3: 添加 onboarding_configs 表的新字段（可选）
-- 用于存储 4-Stage 特定的配置

-- 添加 API 配置字段（控制 Gemini 和 FAL API 的使用）
ALTER TABLE onboarding_configs
ADD COLUMN IF NOT EXISTS api_config JSONB DEFAULT '{
  "gemini_vision_enabled": true,
  "gemini_live_enabled": true,
  "fal_video_generation_enabled": true,
  "environment": "development"
}'::jsonb;

COMMENT ON COLUMN onboarding_configs.api_config IS
'API 配置：控制 Gemini Vision、Gemini Live、FAL 视频生成等 API 的启用状态
开发环境可设置为 mock 模式';

-- 添加视频生成配置字段
ALTER TABLE onboarding_configs
ADD COLUMN IF NOT EXISTS video_config JSONB DEFAULT '{
  "revealing_generation_trigger": "template_selection",
  "lipsync_generation_trigger": "photos_upload",
  "transition_video_url": "/videos/transition-default.mp4"
}'::jsonb;

COMMENT ON COLUMN onboarding_configs.video_config IS
'视频生成配置：定义何时触发视频生成，以及使用哪些预设视频';

-- 步骤 4: 创建 onboarding_sessions 表的额外字段（存储 4-Stage 特定数据）
ALTER TABLE onboarding_sessions
ADD COLUMN IF NOT EXISTS gemini_analysis JSONB;

COMMENT ON COLUMN onboarding_sessions.gemini_analysis IS
'Gemini Vision 分析结果：
- Stage 2 的照片分析结果
- Stage 3 的性格分析结果
- Gemini Live 对话记录';

ALTER TABLE onboarding_sessions
ADD COLUMN IF NOT EXISTS generated_videos JSONB;

COMMENT ON COLUMN onboarding_sessions.generated_videos IS
'生成的视频 URL：
- revealing_video_url
- lipsync_video_url
- transition_video_url';

-- 步骤 5: 创建视图，方便查询 4-Stage 配置
CREATE OR REPLACE VIEW onboarding_4stage_config AS
SELECT
  oc.config_id,
  oc.config_name,
  oc.is_active,
  oc.flow_type,
  oc.target_character_id,
  oc.api_config,
  oc.video_config,
  ot.theme_name,
  ot.global_styles,
  ot.step_1_splash AS stage_1_boot,
  ot.step_3_identity_input AS stage_2_mirror,
  ot.step_5_creation AS stage_3_forging,
  ot.step_7_entry AS stage_4_avatar
FROM onboarding_configs oc
LEFT JOIN onboarding_theme ot ON oc.theme_id = ot.theme_id;

COMMENT ON VIEW onboarding_4stage_config IS
'4-Stage Onboarding 配置视图：
提供字段重命名映射，方便前端使用
- stage_1_boot (原 step_1_splash)
- stage_2_mirror (原 step_3_identity_input)
- stage_3_forging (原 step_5_creation)
- stage_4_avatar (原 step_7_entry)';

-- 步骤 6: 添加 RLS 策略到视图（如果需要）
-- 视图继承基础表的 RLS 策略

-- 步骤 7: 插入默认 4-Stage 配置示例（可选）
-- 如果需要创建一个默认的 4-Stage 配置，取消下面的注释

-- DO $$
-- DECLARE
--   default_theme_id UUID;
--   new_config_id UUID;
-- BEGIN
--   -- 查找或创建默认主题
--   SELECT theme_id INTO default_theme_id
--   FROM onboarding_theme
--   WHERE theme_name = '4-Stage AI-Native Theme'
--   LIMIT 1;
--
--   IF NOT FOUND THEN
--     -- 创建新主题
--     INSERT INTO onboarding_theme (
--       theme_name,
--       global_styles,
--       step_1_splash,
--       step_3_identity_input,
--       step_5_creation,
--       step_7_entry
--     ) VALUES (
--       '4-Stage AI-Native Theme',
--       '{"font_family": "''VT323'', monospace", "primary_color": "#00FF41"}'::jsonb,
--       '{"visual": {"glitch_effect": true}, "content": {"entity_name": "Pika"}}'::jsonb,
--       '{"visual": {"camera_overlay": "scan_lines"}, "interaction": {"gemini_vision_enabled": true}}'::jsonb,
--       '{"visual": {"particle_animation": true}, "content": {"max_photos": 5}}'::jsonb,
--       '{"visual": {"character_card": true}, "videos": {"transition_video": "/videos/transition.mp4"}}'::jsonb
--     )
--     RETURNING theme_id INTO default_theme_id;
--   END IF;
--
--   -- 创建新配置
--   INSERT INTO onboarding_configs (
--     config_name,
--     theme_id,
--     is_active,
--     flow_type,
--     api_config
--   ) VALUES (
--     '4-Stage Development Config',
--     default_theme_id,
--     false, -- 不自动激活，需要手动激活
--     'fixed_character',
--     '{"environment": "development", "gemini_vision_enabled": false, "fal_video_generation_enabled": false}'::jsonb
--   )
--   RETURNING config_id INTO new_config_id;
--
--   RAISE NOTICE 'Created 4-Stage config with ID: %', new_config_id;
-- END $$;

-- 完成
