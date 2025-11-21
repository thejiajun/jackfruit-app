import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { NovaOrbCanvas } from '../../../components/NovaOrbCanvas'
import '../../Onboarding/styles/onboarding.css'

/**
 * 【产品模块】第一阶段:系统启动引导页
 *
 * 产品目标:
 * 1. 营造"APP 是活的"沉浸感 - 通过故障艺术和终端启动动画建立科幻感
 * 2. 平滑获取权限 - 用"INITIATE"按钮包装摄像头/麦克风权限请求,降低用户心理抵触
 * 3. 建立品牌调性 - 引入 Pika Entity(数字实体),用打字机效果营造神秘感
 *
 * 用户体验流程:
 * → 进入页面,看到终端启动文字逐字显示(模拟系统加载)
 * → Pika Entity 粒子球从无到有聚合(视觉惊喜)
 * → Pika 自我介绍:"Hi, I'm PIKA. I am your guide..."
 * → 显示"INITIATE"按钮,引导用户点击
 * → 点击后弹出浏览器权限请求(摄像头+麦克风)
 * → 权限通过后进入下一阶段(Stage 2: Mirror)
 */

// 【UI 文案】启动序列的 3 行终端文本(静态数据,组件外定义避免重复创建)
const BOOT_SEQUENCE = [
  '> BOOTING System...',          // 第 1 行:系统启动中
  '> REFLECTION v2.1, ONLINE',    // 第 2 行:REFLECTION 系统上线
  "> Entity:Pika initialized"     // 第 3 行:Pika 实体初始化完成
]

const Stage1Boot = ({ config, globalStyles, onComplete, currentStep, userData }) => {
  // === 核心交互状态 ===
  const [showButton, setShowButton] = useState(false)                  // 控制"INITIATE"按钮显示(所有文字播放完才显示)
  const [isBooting, setIsBooting] = useState(true)                     // 是否处于启动序列播放中
  const [bootSequenceDimmed, setBootSequenceDimmed] = useState(false)  // 启动序列是否变暗(播放完后变灰,突出后续文字)
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)  // 防止用户重复点击"INITIATE"按钮

  // === 打字机效果状态(模拟终端逐字输出) ===
  const [bootLines, setBootLines] = useState(['', '', ''])  // 启动序列 3 行文字的当前显示内容
  const [currentBootLine, setCurrentBootLine] = useState(0) // 当前正在打字的是第几行(0/1/2)

  // === Pika 问候语打字机状态 ===
  const [greetingText, setGreetingText] = useState('')      // 问候语当前显示的文字
  const [subtextText, setSubtextText] = useState('')        // 副标题当前显示的文字
  const [showGreeting, setShowGreeting] = useState(false)   // 是否开始显示问候语
  const [showSubtext, setShowSubtext] = useState(false)     // 是否开始显示副标题

  // === Pika Entity 粒子动画状态 ===
  const [activeParticleCount, setActiveParticleCount] = useState(0)  // 当前激活的粒子数量(从 0 渐增到 260)
  const [enableRotation, setEnableRotation] = useState(false)        // 是否启用粒子球旋转(所有文字播放完后开启)

  // 【UI 文案】Pika 的完整问候语和副标题
  const fullGreeting = "Hi, I'm PIKA. I am your guide for this experience."
  const fullSubtext = "You can give me commands\nor use the camera to let me see you."

  // ============================================================
  // 【动画逻辑 1】启动序列打字机效果
  // 产品需求:模拟终端启动,逐字显示 3 行启动文本,营造"系统正在加载"的科技感
  // 技术实现:使用固定时间间隔(30ms/字符),不依赖音频同步(已移除音频)
  // ============================================================
  useEffect(() => {
    const startBootSequenceTyping = () => {
      const charDelay = 30 // 每个字符显示间隔 30ms(太快会看不清,太慢会显得卡顿)
      let lineIndex = 0    // 当前打字的行索引(0-2)
      let charIndex = 0    // 当前打字的字符索引

      const typeNextChar = () => {
        // 检查是否所有行都打完了
        if (lineIndex >= BOOT_SEQUENCE.length) {
          // 所有启动文本播放完成,执行收尾动作
          setIsBooting(false)          // 标记启动序列结束
          setBootSequenceDimmed(true)  // 将启动文字变暗(突出后续的 Pika 问候语)

          // 等待 800ms 后开始显示 Pika 问候语(给用户一个视觉停顿,避免信息过载)
          setTimeout(() => {
            setShowGreeting(true)
          }, 800)
          return
        }

        const currentLine = BOOT_SEQUENCE[lineIndex]  // 当前要打字的完整行文本

        if (charIndex < currentLine.length) {
          // 当前行还没打完,继续逐字显示
          setBootLines(prev => {
            const newLines = [...prev]
            newLines[lineIndex] = currentLine.substring(0, charIndex + 1)  // 截取到当前字符位置
            return newLines
          })
          charIndex++
          setTimeout(typeNextChar, charDelay)  // 30ms 后打下一个字符
        } else {
          // 当前行打完了,准备下一行
          lineIndex++
          charIndex = 0
          setCurrentBootLine(lineIndex)        // 更新当前行索引(用于显示光标)
          setTimeout(typeNextChar, 400)        // 行与行之间停顿 400ms(让用户看清换行)
        }
      }

      typeNextChar()  // 开始第一个字符的打字
    }

    // 组件加载后立即开始启动序列打字机动画
    startBootSequenceTyping()
  }, [])

  // ============================================================
  // 【动画逻辑 2】Pika Entity 粒子聚合动画
  // 产品需求:粒子从 0 逐渐增加到 260,营造"数字实体正在聚合"的视觉效果
  // 用户感知:一个发光的数据球从无到有慢慢成型,给人"这个 AI 正在苏醒"的感觉
  // 技术实现:每 50ms 增加 2 个粒子,总计 6.5 秒完成聚合
  // ============================================================
  useEffect(() => {
    let count = 0
    const particleInterval = setInterval(() => {
      if (count < 260) {
        count += 2  // 每次增加 2 个粒子(太快会显得突兀,太慢会让用户等待过久)
        setActiveParticleCount(count)
      } else {
        setActiveParticleCount(260)  // 最终固定在 260 个粒子
        clearInterval(particleInterval)
      }
    }, 50)  // 50ms 执行一次,总计 130 次 = 6.5 秒

    // 组件卸载时清理定时器,避免内存泄漏
    return () => {
      clearInterval(particleInterval)
    }
  }, [])

  // ============================================================
  // 【动画逻辑 3】Pika 问候语和副标题打字机效果
  // 产品需求:在启动序列播放完后,Pika 逐字介绍自己,最后显示"INITIATE"按钮
  // 用户感知:"Pika 在跟我说话",比直接弹出按钮更有沉浸感和仪式感
  // 技术实现:使用本地变量 isGreetingComplete 而非状态,避免异步闭包 bug
  // ============================================================
  useEffect(() => {
    if (!showGreeting) return  // 等待启动序列播放完才开始

    const charDelay = 50  // 每个字符 50ms(比启动序列稍慢,让用户有阅读的时间)
    let greetingIndex = 0
    let subtextIndex = 0
    let isGreetingComplete = false  // 【关键】用标志变量而非状态,避免 React 闭包问题

    const typeNextChar = () => {
      // 第一阶段:打问候语 "Hi, I'm PIKA..."
      if (greetingIndex < fullGreeting.length) {
        setGreetingText(fullGreeting.substring(0, greetingIndex + 1))
        greetingIndex++
        setTimeout(typeNextChar, charDelay)
      }
      // 第二阶段:问候语打完,准备副标题
      else if (!isGreetingComplete) {
        isGreetingComplete = true
        setShowSubtext(true)      // 触发副标题显示
        setTimeout(typeNextChar, 200)  // 等待 200ms 再开始打副标题(给用户一个呼吸感)
      }
      // 第三阶段:打副标题 "You can give me commands..."
      else if (subtextIndex < fullSubtext.length) {
        setSubtextText(fullSubtext.substring(0, subtextIndex + 1))
        subtextIndex++
        setTimeout(typeNextChar, charDelay)
      }
      // 第四阶段:全部文字播放完成,显示按钮
      else {
        setEnableRotation(true)  // 启用粒子球旋转动画(让粒子球"活"起来)
        setTimeout(() => {
          setShowButton(true)    // 500ms 后显示"INITIATE"按钮(最终 CTA)
        }, 500)
      }
    }

    typeNextChar()  // 开始第一个字符的打字
  }, [showGreeting, fullGreeting, fullSubtext])

  // ============================================================
  // 【核心交互】用户点击"INITIATE"按钮,请求摄像头和麦克风权限
  // 产品需求:获取权限后进入 Stage 2(Mirror 镜像引导),开始实时对话
  // 用户体验:点击按钮 → 浏览器弹出权限请求 → 允许后自动进入下一步
  // 技术实现:使用 debounce 锁防止重复点击,失败时允许重试,成功后不解锁
  // ============================================================
  const handleInitiate = async () => {
    // 防止用户连续点击多次(可能导致多次权限请求或重复提交)
    if (isRequestingPermission) {
      return
    }

    setIsRequestingPermission(true)  // 加锁,禁用按钮

    try {
      // 【关键】请求浏览器摄像头和麦克风权限
      // 这会触发浏览器原生的权限弹窗
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,   // 请求摄像头(Stage 2 需要实时拍照)
        audio: true    // 请求麦克风(Stage 2 需要语音对话)
      })

      // 立即停止媒体流(我们只是为了获取权限,不是真的要在这里使用摄像头)
      // Stage 2 会重新开启摄像头
      stream.getTracks().forEach(track => track.stop())


      // 【关键】调用 onComplete 回调,通知父组件进入下一阶段
      // 传递权限状态和时间戳,用于数据追踪
      onComplete({
        permissions_granted: true,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      // 用户拒绝权限或浏览器不支持 getUserMedia
      console.error('[Stage1Boot] ❌ 权限获取失败:', error)
      alert('需要摄像头和麦克风权限才能继续。请允许权限后重试。')
      setIsRequestingPermission(false)  // 失败时解锁,允许用户重新点击
    }
    // 注意:成功时不解锁,避免用户在跳转过程中重复点击
  }


  return (
    <div className="onboarding-step stage1-boot">
      {/* 背景层：Pika 银色方格背景 + 故障艺术效果 */}
      <div className="background-layer pika-silver-grid">
        {/* 方格网格叠加层 */}
        <div className="grid-overlay-pika" />

        {/* 噪点纹理 */}
        <div className="noise-texture-pika" />

        {/* 故障艺术效果 */}
        <div className="glitch-container">
          {/* CRT 扫描线 */}
          <div className="crt-scanlines" />

          {/* CRT 屏幕曲面效果 */}
          <div className="crt-curve" />

          {/* 电视静噪效果 */}
          <div className="tv-static" />
        </div>
      </div>

      {/* 内容层 */}
      <div className="content-layer">
        {/* 启动序列文本 + 问候语（连贯的终端输出流） */}
        <div className="boot-sequence">
          {/* 启动序列打字机效果 */}
          {bootLines.map((lineText, index) => (
            <p
              key={index}
              style={{
                fontFamily: 'VT323, monospace',
                fontSize: '18px',
                color: '#22d3ee', // 统一为 cyan
                textShadow: '0 0 10px rgba(34, 211, 238, 0.5)',
                margin: '8px 0',
                opacity: bootSequenceDimmed ? 0.3 : 1,
                transition: 'opacity 0.5s ease-out'
              }}
            >
              {lineText}
              {/* 当前正在打字的行显示光标 */}
              {index === currentBootLine && lineText.length < BOOT_SEQUENCE[index].length && (
                <span className="cursor-blink">|</span>
              )}
            </p>
          ))}

          {/* 问候语 - 打字机效果，紧跟在启动序列后 */}
          {showGreeting && (
            <h1 className="entity-greeting typewriter-text">
              {greetingText}
              {greetingText.length < fullGreeting.length && (
                <span className="cursor-blink">|</span>
              )}
            </h1>
          )}

          {/* 副标题 - 打字机效果，继续跟随 */}
          {showSubtext && (
            <p className="entity-subtext typewriter-text">
              {subtextText}
              {subtextText.length < fullSubtext.length && (
                <span className="cursor-blink">|</span>
              )}
            </p>
          )}
        </div>

        {/* Entity 可视化区域 - 从一开始就显示，粒子逐渐增加 */}
        <div className="entity-visual">
          <NovaOrbCanvas
            mode="IDLE"
            energy={0.5}
            particleCount={260}
            activeParticleCount={activeParticleCount}
            enableRotation={enableRotation}
            size={{ width: '100%', height: '100%' }}
          />
        </div>

        {/* CTA 按钮 */}
        {showButton && (
          <motion.div
            className="initiate-section"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            style={{
              textAlign: 'center',
              marginTop: '40px',
              position: 'fixed',
              bottom: '120px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1
            }}
          >
            {/* 权限说明文字 */}
            <p
              style={{
                fontFamily: 'VT323, monospace',
                fontSize: '14px',
                color: '#64748b',
                opacity: 0.8,
                marginBottom: '16px',
                lineHeight: 1.5,
                maxWidth: '320px',
                margin: '0 auto 16px'
              }}
            >
              Camera & mic access needed
            </p>

            <button
              className="initiate-btn terminal-btn glitch-border"
              onClick={handleInitiate}
              style={{
                fontFamily: 'VT323, monospace',
                fontSize: '24px',
                padding: '16px 48px',
                background: 'transparent',
                color: '#22d3ee',
                cursor: 'pointer',
                letterSpacing: '2px'
              }}
            >
              [ INITIATE ]
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default Stage1Boot
