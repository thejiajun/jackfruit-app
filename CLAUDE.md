# jackfruit

Monorepo：`character-app`（AI 虚拟角色，React 19 + Vite，移动端竖屏视频 UI）+ `admin-app`（Ant Design 管理台，配角色状态和 onboarding 流程），共用一个 Supabase 后端。

- **永远用远程 Supabase，不用本地**
- **没装 Tailwind，别写 Tailwind 类名**。用内联样式或 `onboarding.css` 里的类
- Pika 主题：`#22d3ee` cyan + `#cbd5e1` 银灰底 + VT323 终端字体
- Onboarding 是**数据库驱动**的：步骤配置以 JSONB 存在 `onboarding_configs`，路由由配置存在与否决定，不是代码里的 if。加流程改数据不改代码
- 生成分三步（Gemini 文本 → FAL SeeDrawm 图 → FAL SeeDance 视频），每步写回 `character_statuses` 再继续，失败可从中断处恢复
- 视频生成要 30–60 秒，UI 必须有进度，不能看起来像卡死
- 部署：两个 app 各自独立的 Vercel 项目（各有 vercel.json），edge function 走 `supabase functions deploy`，密钥在 Supabase Dashboard → Edge Functions → Secrets
- UX 原理和线框图在 `character-app/New design.md`
