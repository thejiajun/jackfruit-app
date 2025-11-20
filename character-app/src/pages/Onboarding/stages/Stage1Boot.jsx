import { useState, useEffect, useRef } from 'react'
import { NovaOrbCanvas } from '../../../components/NovaOrbCanvas'
import '../../Onboarding/styles/onboarding.css'

/**
 * Stage 1: System Boot
 *
 * 故障艺术 + Entity 聚合动画
 * 用户点击 [INITIATE TALKING] 后请求摄像头/麦克风权限
 */
// 启动序列（静态数据，组件外定义避免重新创建）
const BOOT_SEQUENCE = [
  '> BOOTING SYSTEM...',
  '> REFLECTION System v2.1 ONLINE',
  "> Entity::Pika initialized"
]

const Stage1Boot = ({ config, globalStyles, onComplete, currentStep, userData }) => {
  const [showButton, setShowButton] = useState(false)
  const [isBooting, setIsBooting] = useState(true)
  const [bootSequenceDimmed, setBootSequenceDimmed] = useState(false) // 控制启动序列是否变暗

  // 启动序列打字机状态
  const [bootLines, setBootLines] = useState(['', '', '']) // 三行的打字机文本
  const [currentBootLine, setCurrentBootLine] = useState(0) // 当前正在打字的行

  // 打字机效果状态
  const [greetingText, setGreetingText] = useState('')
  const [subtextText, setSubtextText] = useState('')
  const [showGreeting, setShowGreeting] = useState(false)
  const [showSubtext, setShowSubtext] = useState(false)

  // 粒子动画状态
  const [activeParticleCount, setActiveParticleCount] = useState(0)
  const [enableRotation, setEnableRotation] = useState(false)

  const fullGreeting = "Hey, I'm Pika. WELCOME."
  const fullSubtext = "I'm listening..."

  // 启动序列打字机效果
  useEffect(() => {
    console.log('[Stage1Boot] Mounted', { config, globalStyles })

    let lineIndex = 0
    let charIndex = 0

    const typeNextChar = () => {
      if (lineIndex >= BOOT_SEQUENCE.length) {
        // 所有行完成
        setIsBooting(false)
        setTimeout(() => {
          setBootSequenceDimmed(true) // 启动序列变暗
          setTimeout(() => {
            setShowGreeting(true)
          }, 300)
        }, 500)
        return
      }

      const currentLine = BOOT_SEQUENCE[lineIndex]

      if (charIndex < currentLine.length) {
        // 继续打当前行
        setBootLines(prev => {
          const newLines = [...prev]
          newLines[lineIndex] = currentLine.substring(0, charIndex + 1)
          return newLines
        })
        charIndex++
        setTimeout(typeNextChar, 30) // 每个字符 30ms
      } else {
        // 当前行完成，准备下一行
        lineIndex++
        charIndex = 0
        setCurrentBootLine(lineIndex)
        setTimeout(typeNextChar, 400) // 行间隔 400ms
      }
    }

    typeNextChar()
  }, [])

  // 粒子渐进动画 - 从开始到 "I'm listening..." 完成
  useEffect(() => {
    console.log('[Stage1Boot] Starting particle animation from 0 to 260')
    // 粒子从 0 渐进到 260
    // 启动序列打字: ~2.5s (3行 × 30ms/字符 + 行间隔)
    // + 变暗等待: 0.8s
    // + WELCOME打字: 1.5s (25字符 × 60ms)
    // + 副标题打字: 1.2s (15字符 × 80ms)
    // 总计约 6s，粒子应该在 6-7s 内完成
    let count = 0
    const particleInterval = setInterval(() => {
      if (count < 260) {
        count += 1 // 每 50ms 增加 1 个粒子（减慢速度）
        setActiveParticleCount(count)
        if (count % 20 === 0) {
          console.log('[Stage1Boot] Particle count:', count)
        }
      } else {
        setActiveParticleCount(260) // 确保最终值准确
        console.log('[Stage1Boot] Particle animation complete: 260')
        clearInterval(particleInterval)
      }
    }, 50) // 50ms * 260 次 = 13s (比文字流程慢，确保文字结束前粒子还在增加)

    return () => {
      console.log('[Stage1Boot] Cleaning up particle animation')
      clearInterval(particleInterval)
    }
  }, [])

  // 问候语打字机效果
  useEffect(() => {
    if (!showGreeting) return

    let index = 0
    const typingInterval = setInterval(() => {
      if (index < fullGreeting.length) {
        setGreetingText(fullGreeting.substring(0, index + 1))
        index++
      } else {
        clearInterval(typingInterval)
        // 问候语完成后,延迟显示副标题
        setTimeout(() => setShowSubtext(true), 500)
      }
    }, 60) // 60ms 每个字符,约 1.5s 完成

    return () => clearInterval(typingInterval)
  }, [showGreeting, fullGreeting])

  // 副标题打字机效果
  useEffect(() => {
    if (!showSubtext) return

    let index = 0
    const typingInterval = setInterval(() => {
      if (index < fullSubtext.length) {
        setSubtextText(fullSubtext.substring(0, index + 1))
        index++
      } else {
        clearInterval(typingInterval)
        // 副标题完成后，启动旋转并延迟显示按钮
        console.log('[Stage1Boot] Subtext complete, enabling rotation and showing button')
        setEnableRotation(true) // "I'm listening..." 完成后开始旋转
        setTimeout(() => {
          console.log('[Stage1Boot] Setting showButton to true')
          setShowButton(true)
        }, 500)
      }
    }, 80) // 80ms 每个字符,约 1.2s 完成

    return () => clearInterval(typingInterval)
  }, [showSubtext, fullSubtext])

  const handleInitiate = async () => {
    console.log('[Stage1Boot] Initiating... requesting permissions')

    try {
      // 请求摄像头和麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })

      // 立即停止流（只是为了获取权限）
      stream.getTracks().forEach(track => track.stop())

      console.log('[Stage1Boot] Permissions granted')

      // 进入下一步
      onComplete({
        permissions_granted: true,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('[Stage1Boot] Permission denied:', error)
      alert('需要摄像头和麦克风权限才能继续。请允许权限后重试。')
    }
  }

  console.log('[Stage1Boot] Rendering, showButton:', showButton)

  return (
    <div className="onboarding-step stage1-boot">
      {/* 背景层：故障艺术效果 */}
      <div className="background-layer">
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
                color: '#00FF41',
                textShadow: '0 0 10px rgba(0, 255, 65, 0.5)',
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
            energy={0.3}
            particleCount={260}
            activeParticleCount={activeParticleCount}
            enableRotation={enableRotation}
            size={{ width: '100%', height: '100%' }}
          />
        </div>

        {/* CTA 按钮 */}
        {showButton && (
          <div
            className="initiate-section fade-in"
            style={{
              textAlign: 'center',
              marginTop: '40px',
              position: 'fixed',
              bottom: '60px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1 // 在粒子(z-index: 2)下方
            }}
          >
            {/* 权限说明文字 */}
            <p
              style={{
                fontFamily: 'VT323, monospace',
                fontSize: '14px',
                color: '#00FF41',
                opacity: 0.6,
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
                color: '#00FF41',
                cursor: 'pointer',
                letterSpacing: '2px'
              }}
            >
              [ INITIATE ]
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Stage1Boot
