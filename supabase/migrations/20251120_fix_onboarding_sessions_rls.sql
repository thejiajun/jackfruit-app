-- ============================================
-- Fix onboarding_sessions RLS Policies
-- 修复 onboarding_sessions 表的行级安全策略
-- ============================================
--
-- 问题：onboarding_sessions 表的 RLS 策略导致匿名用户无法创建和更新会话
-- 解决：添加允许匿名用户 INSERT/SELECT/UPDATE 的策略
--
-- 创建时间：2025-11-20
-- ============================================

-- 1. 启用 RLS（如果尚未启用）
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

-- 2. 删除可能存在的旧策略（避免冲突）
DROP POLICY IF EXISTS "Allow anonymous insert" ON onboarding_sessions;
DROP POLICY IF EXISTS "Allow anonymous select" ON onboarding_sessions;
DROP POLICY IF EXISTS "Allow anonymous update" ON onboarding_sessions;
DROP POLICY IF EXISTS "Allow anonymous delete" ON onboarding_sessions;

-- 3. 创建新的策略：允许匿名用户插入会话记录
CREATE POLICY "Allow anonymous insert"
ON onboarding_sessions
FOR INSERT
TO anon
WITH CHECK (true);

-- 4. 创建新的策略：允许匿名用户查询会话记录
CREATE POLICY "Allow anonymous select"
ON onboarding_sessions
FOR SELECT
TO anon
USING (true);

-- 5. 创建新的策略：允许匿名用户更新会话记录
CREATE POLICY "Allow anonymous update"
ON onboarding_sessions
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- 6. 可选：允许匿名用户删除会话记录（用于清理测试数据）
CREATE POLICY "Allow anonymous delete"
ON onboarding_sessions
FOR DELETE
TO anon
USING (true);

-- ============================================
-- 验证策略
-- ============================================
-- 执行完毕后，可以运行以下查询验证策略是否生效：
--
-- SELECT * FROM pg_policies WHERE tablename = 'onboarding_sessions';
--
-- 应该看到 4 条策略记录：
-- 1. Allow anonymous insert (INSERT)
-- 2. Allow anonymous select (SELECT)
-- 3. Allow anonymous update (UPDATE)
-- 4. Allow anonymous delete (DELETE)
-- ============================================
