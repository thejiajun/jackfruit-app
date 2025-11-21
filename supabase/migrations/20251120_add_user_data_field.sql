-- =============================================
-- 添加 user_data JSONB 字段到 onboarding_sessions
-- =============================================
--
-- 问题：代码中使用 user_data JSONB 字段存储所有用户数据，
--      但数据库表中只有单独的字段（user_name, user_photo_url 等）
--
-- 解决方案：添加 user_data JSONB 字段，并将现有数据迁移
--
-- 创建时间：2025-11-20
-- =============================================

-- 步骤 1：添加 user_data JSONB 字段
ALTER TABLE onboarding_sessions
ADD COLUMN IF NOT EXISTS user_data JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN onboarding_sessions.user_data IS
'所有用户数据存储在此 JSONB 字段中，包括：
- name: 用户名称
- photo_url: 用户照片 URL
- voice_url: 用户语音 URL
- choice: 用户选择（保留自我/成为他人）
- creation_prompt: 创建提示
- captured_photo_url: Stage 2 拍摄的照片
- generated_image_url: Stage 2 生成的图片
- analysis: Gemini 分析结果
- conversation_history: 对话历史
- uploaded_photos: Stage 3 上传的照片数组
- personality: 性格分析结果
- script: 生成的脚本
- generated_video_url: 生成的视频 URL
- final_character_name: 最终角色名称';

-- 步骤 2：迁移现有数据到 user_data 字段
UPDATE onboarding_sessions
SET user_data = jsonb_build_object(
  'name', COALESCE(user_name, ''),
  'photo_url', COALESCE(user_photo_url, ''),
  'voice_url', COALESCE(user_voice_url, ''),
  'choice', COALESCE(user_choice, ''),
  'creation_prompt', COALESCE(user_creation_prompt, '')
)
WHERE user_data IS NULL OR user_data = '{}'::jsonb;

-- 步骤 3：可选 - 保留旧字段以便向后兼容
-- 如果需要完全删除旧字段，取消下面的注释
-- ALTER TABLE onboarding_sessions
--   DROP COLUMN IF EXISTS user_name,
--   DROP COLUMN IF EXISTS user_photo_url,
--   DROP COLUMN IF EXISTS user_voice_url,
--   DROP COLUMN IF EXISTS user_choice,
--   DROP COLUMN IF EXISTS user_creation_prompt;

-- 步骤 4：验证数据迁移
-- 执行完毕后，可以运行以下查询验证迁移是否成功：
-- SELECT session_id, user_data FROM onboarding_sessions LIMIT 5;

-- =============================================
-- 完整的 onboarding_sessions 表结构（更新后）
-- =============================================
-- session_id UUID PRIMARY KEY
-- config_id UUID REFERENCES onboarding_configs(config_id)
-- current_step INTEGER (1-7)
-- user_data JSONB (新增：所有用户数据)
-- user_name TEXT (已废弃，但保留向后兼容)
-- user_photo_url TEXT (已废弃)
-- user_voice_url TEXT (已废弃)
-- user_choice TEXT (已废弃)
-- user_creation_prompt TEXT (已废弃)
-- gemini_analysis JSONB (Gemini 分析结果)
-- generated_videos JSONB (生成的视频 URL)
-- completed BOOLEAN
-- ip_address TEXT
-- user_agent TEXT
-- created_at TIMESTAMPTZ
-- completed_at TIMESTAMPTZ
-- =============================================
