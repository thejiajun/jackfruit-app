 **典型的** **AI-Native（AI 原生）产品的 Onboarding 流程**。

  **与传统 APP 填表单不同，你设计的核心在于**“沉浸感”**和**“对话式交互”**。用户不是在“设置”一个账户，而是在“孵化”一个数字分身。**

## 2. 详细流程与线框图 (Wireframes & Script)

### 📟 Stage 1: System Boot

建立"这个APP是活的"的心智，并平滑地获取麦克风和摄像头的权限。
当用户点击 INITIATE TALKING 之后，开始相机、麦克风权限弹窗

```
+--------------------------------------------------+
|  > BOOTING SYSTEM...                             |
|  > LOADING ASSETS... OK                          |
|  > REFLECTION System v2.1 ONLINE                 |
|                                                  |
|      ( 视觉实体 Entity: 这是一个不断变化的数据球 )   |
|      ( 伴随着电流声和机械呼吸音效 )                   |
|                                                  |
|       "Hey, I'm Pika. WELCOME."                  |
|       "I'm listening..."                         |
|                                                  |
|                                                  |
|                                                  |
|       [ 🔘 INITIATE TALKING ]                    |
|      ( 按钮闪烁引导点击 )                          |
|                                                  |
+--------------------------------------------------+
```

### 🪞 Stage 2: The Mirror Guide (和镜子对话)

**这是数据收集阶段，但包装成了"聊天"。**

**交互逻辑：**

* **Intro:** **开启摄像头，Entity 悬浮。**
* **Scanning:** **AI 视觉分析用户外貌、服装、环境**
* **Analysis:** **输出环境判断。**
* **Chat:** **追问 2 个问题 -> 结束 -> 推荐形象的视觉模板。**

+--------------------------------------------------+
|  [ < ]                        [ REC ● ]          |
|                                                  |
|  +--------------------------------------------+  |
|  |                                            |  |
|  |           ( 用户全屏摄像头画面 )             |  |
|  |                                            ｜ ｜
|  |                                            |  |
|  +--------------------------------------------+  |
|                                                  |
|  (Entity 语音播放):                               |
|  "I AM YOUR GUIDE IN THIS REALM."                |
|  "I WILL HELP YOU DISCOVER YOUR TRUE SELF."      |
|                                                  |
|  (Scanning 动画结束，AI 说话):                     |
|  "I see you're in the office. Busy day?"         |
|                                                  |
|  +--------------------------------------------+  |
|  | User: "还行，刚开完会，外面下雨了有点烦。"      |  |
|  +--------------------------------------------+  |
|                                                  |
|  (AI 追问 - 轮次 1/2):                            |
|  "Rainy days are good for focus though.          |
|   Do you prefer the quiet or the chaos?"         |
|                                                  |
|      [ 🎙️ (自动检测语音 / 点击打断) ]               |
|                                                  |
+--------------------------------------------------+

```

**(对话结束后的转场脚本)**：

> **AI:** **"Interesting soul you have. (停顿) You look sharp in reality, but here..."**
> AI (打趣 tone): **"We can twist reality a bit. Want to keep your look, or try something wild?"**
> (弹出风格模板供选择)

### 🧩 Stage 3: Forging & Memory Shards (角色锻造与记忆导入)

**文案优化：** **将"给我照片"改为"注入灵魂/记忆"，完善人设**
**同时后台在图片+视频生成，需要处理等待时间的焦虑（Latency Management）。**


+--------------------------------------------------+
|                                                  |
|   STATUS: ⚡️ CONSTRUCTING VESSEL (45%)...       |
|                                                  |
|   (背景：模糊的生成过程，时不时闪过代码)              |
|                                                  |
|   Entity:                                        |
|   "While I weave your digital shell...           |
|    Give it a soul."                              |
|   "Feed me Memory Shards to complete the mind."  |
|                                                  |
|   +------------------------------------------+   |
|   | [ ➕ Upload Photo ]  [ ➕ Upload Photo ] |   |
|   +------------------------------------------+   |
|      (每上传一张，进度条猛增，并伴随'吸收'特效)       |
|                                                  |
|   (当后台视频生成完毕，按钮出现):                    |
|                                                  |
|          [  👁️  SHOW ME  ]                       |
|      (按钮如同一只睁开的眼睛，非常醒目)              |
|                                                  |
+--------------------------------------------------+
```

### 🗣️ Stage 4: The Living Avatar (角色展示)

**"尤里卡时刻"（Aha Moment），用户第一次看到活生生的角色的视频，从闭眼到睁眼活过来的。**

然后用自己的声音开始进行自我介绍（lipsync 模型)，给用户Character 的活人感
让用户自己给这个角色命名，给造物主感觉

+--------------------------------------------------+
|                                                  |
|      ( 全屏视频：你的新角色 )                       |
|      ( 关键：口型与语音完美同步 )                    |
|                                                  |
|   Avatar Speaking:                               |
|   "So, this is me. Or... this is YOU."           |
|   "A Cyberpunk warrior with a taste for rain."   |
|   "I'm ready when you are."                      |
|                                                  |
|   ( 屏幕下方显示角色卡片信息，并提示让用户取名字 )      |
|   Name: ENTER USER NAME                          |
|                                                  |
|          [ 🚀 ENTER WORLD ]                      |
|                                                  |
+--------------------------------------------------+

**点击后的转场效果：首尾帧视频生成**
点击 "ENTER WORLD" -> 镜头急速推向 Avatar ，转身跑过一个虫洞效果 -> 出现 Pika World 的主界面。

## 3. 交互脚本逻辑细节 (Logic & Scripting)

 **为了保证开发落地，我们需要明确 Stage 2 的** **对话状态机 (Dialogue State Machine)**：

* **State A: Scanning (开场)**
* **Input:** **摄像头画面。**
* **Process:** **Vision API 提取标签 (Location: Office, Weather: Rain hint, Clothes: Suit)。**
* **Output:** **"I AM YOUR GUIDE..." (固定台词) + "I see you're in [Location]. [Comment]?" (动态台词)。**
* **State B: Chatting (闲聊 - 限制 2 轮)**

  * **Turn 1:** **用户回答 -> AI 根据回答 + 环境标签，问一个关于“性格/Mood”的问题。**
  * **Turn 2:** **用户回答 -> AI 确认 ("I see.", "Understood.")。**
  * **Exit:** **AI 触发结束语 ("You have a distinct vibe...") -> 调起模板 UI。**
* **State C: Forging (等待)**

  * **如果生成时间 > 10秒，AI 需要有补充语音：“These memories are complex... almost there.” (安抚用户)。**
