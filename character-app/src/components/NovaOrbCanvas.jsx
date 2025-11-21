import { useEffect, useRef } from 'react'

/**
 * NOVA AI Core - 精简版 3D 粒子球体可视化组件
 *
 * 核心特性：
 * - 260 粒子 3D 球体系统（球坐标 + 透视投影）
 * - 五种状态：IDLE（待机）、LISTENING（监听）、HEARING（听到声音）、THINKING（思考）、SPEAKING（说话）
 * - 平滑能量过渡（LERP damping=0.05）
 * - 明确的模式行为：IDLE 呼吸、LISTENING 收缩、HEARING 强收缩、THINKING 旋转、SPEAKING 扩散
 * - 清爽流畅的视觉效果
 */
export const NovaOrbCanvas = ({
  mode = 'IDLE',           // 状态：'IDLE' | 'LISTENING' | 'HEARING' | 'THINKING' | 'SPEAKING'
  energy = 0,              // 音频能量 (0.0 - 1.0)
  particleCount = 260,     // 粒子数量
  activeParticleCount = 260,  // 当前显示的粒子数量（用于渐进动画）
  enableRotation = true,   // 是否启用旋转
  colors = null,           // 自定义颜色主题
  size = { width: '100%', height: '100%' }  // 容器尺寸
}) => {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const animationFrameRef = useRef(null)

  // 配置参数
  const CFG = useRef({
    particleCount: 260,
    baseRadius: 110,       // 基础球体大小
    rotationSpeed: 0.0008, // 更慢的自转速度（从 0.003 降到 0.0008）
    damping: 0.05,         // 阻尼系数：越小动作越平滑

    // 颜色配置 (Pika 青色主题)
    colorIdle: 'rgba(203, 213, 225, 0.7)',      // 银色 (Slate 300)
    colorListening: 'rgba(34, 211, 238, 0.6)',  // 青色 (Cyan 400)
    colorHearing: 'rgba(34, 211, 238, 0.9)',    // 亮青色
    colorThinking: 'rgba(6, 182, 212, 0.8)',    // 深青色 (Cyan 500)
    colorSpeaking: 'rgba(34, 211, 238, 1.0)',   // 纯青色
  })

  // 内部状态
  const stateRef = useRef({
    mode: 'IDLE',
    energy: 0,
    targetEnergy: 0,
    time: 0,
    particles: [],
    width: 0,
    height: 0,
    cx: 0,
    cy: 0,
    activeParticleCount: 0,  // 从 0 开始，通过 props 逐渐增加
    enableRotation: false     // 初始不旋转，等待 props 激活
  })

  // 初始化粒子系统
  const initParticles = () => {
    const particles = []
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        theta: Math.random() * Math.PI * 2,          // 水平角度
        phi: Math.acos((Math.random() * 2) - 1),     // 垂直角度（均匀分布）
        size: Math.random() * 1.5 + 0.5,             // 粒子大小
        phase: Math.random() * Math.PI * 2,          // 独立呼吸相位
        birthTime: -1                                // 粒子出生时间（用于淡入动画）
      })
    }
    stateRef.current.particles = particles
    // console.log(`[NovaOrbCanvas] Initialized ${particleCount} particles`)
  }

  // 调整 Canvas 分辨率
  const resizeCanvas = () => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const width = container.clientWidth
    const height = container.clientHeight

    canvas.width = width
    canvas.height = height

    stateRef.current.width = width
    stateRef.current.height = height
    stateRef.current.cx = width / 2
    stateRef.current.cy = height / 2

    // console.log(`[NovaOrbCanvas] Canvas resized: ${width}x${height}`)
  }

  // 渲染帧
  const renderFrame = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const { width, height, cx, cy, mode, energy, particles, time, activeParticleCount, enableRotation } = stateRef.current
    const cfg = CFG.current

    // 1. 清空画布（透明背景，可叠加在视频上）
    ctx.clearRect(0, 0, width, height)

    // 2. 时间推进
    stateRef.current.time += 0.01

    // 3. 平滑能量过渡 (LERP)
    stateRef.current.energy += (stateRef.current.targetEnergy - energy) * cfg.damping

    // 4. 绘制粒子
    ctx.globalCompositeOperation = 'lighter' // 发光叠加模式

    particles.slice(0, activeParticleCount).forEach((p, index) => {
      // 记录粒子出生时间（首次激活时）
      if (p.birthTime === -1) {
        p.birthTime = time
      }

      // 计算淡入进度（0.5 秒内从 0 到 1）
      const fadeInDuration = 0.5 // 淡入持续时间（秒）
      const age = time - p.birthTime
      const fadeIn = Math.min(age / fadeInDuration, 1)

      // 如果粒子还在淡入阶段，跳过太小的透明度
      if (fadeIn < 0.01) return

      // A. 旋转逻辑 (基础自转)
      if (enableRotation) {
        p.theta += cfg.rotationSpeed
      }

      // B. 坐标转换 (球坐标 -> 笛卡尔坐标)
      let r = cfg.baseRadius

      // C. 状态行为逻辑
      // 基础呼吸 - 更有律动感（更慢 + 大幅度）
      const breathingPhase = time * 0.8 + p.phase // 进一步降低频率 (从 1.2 到 0.8)
      const breathing = Math.sin(breathingPhase) * 10 // 增加幅度 (从 8 到 10)

      if (mode === 'IDLE') {
        // 待机：白色，轻微随音频跳动
        r += breathing + (energy * 15)
      } else if (mode === 'LISTENING' || mode === 'LISTEN') {
        // 监听：向内轻度收缩
        r = r * 0.8 + breathing - (energy * 20)
      } else if (mode === 'HEARING') {
        // 听到声音：向内强烈收缩 + 脉冲
        r = r * 0.7 + breathing - (energy * 40)
      } else if (mode === 'THINKING') {
        // 思考：中等大小 + 旋转加速 + 螺旋效果
        r = r * 0.9
        if (enableRotation) {
          p.theta += cfg.rotationSpeed * 2  // 旋转速度加倍
        }
        const spiral = Math.sin(time * 3 + p.phase) * 10
        r += spiral
      } else if (mode === 'SPEAKING' || mode === 'SPEAK') {
        // 说话：向外扩散 (Expansion)
        r += breathing + (energy * 60)
      }

      // 计算 3D 坐标
      const x3d = r * Math.sin(p.phi) * Math.cos(p.theta)
      const y3d = r * Math.sin(p.phi) * Math.sin(p.theta)
      const z3d = r * Math.cos(p.phi)

      // D. 投影 (3D -> 2D)
      const fov = 400
      const scale = fov / (fov - z3d)
      const x2d = cx + x3d * scale
      const y2d = cy + y3d * scale

      // E. 绘制点
      // 深度透明度 - 更离散的明暗对比
      let alpha = (z3d + r) / (2 * r)
      // 使用非线性映射增强对比度
      alpha = Math.pow(alpha, 1.8) // 指数增强：暗的更暗，亮的更亮
      alpha = alpha * 0.9 + 0.1 // 最小透明度 0.1，避免完全消失

      if (scale > 0) {
        // 颜色动态切换
        let baseColor
        let glowIntensity = alpha * 0.8 // 辉光强度

        if (mode === 'IDLE') {
          baseColor = { r: 255, g: 255, b: 255 }
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9 * fadeIn})` // 应用淡入效果
        } else if (mode === 'LISTENING' || mode === 'LISTEN') {
          baseColor = { r: 0, g: 150, b: 255 }
          ctx.fillStyle = `rgba(0, 150, 255, ${alpha * 0.6 * fadeIn})` // 应用淡入效果
        } else if (mode === 'HEARING') {
          const pulse = Math.sin(time * 5) * 0.2 + 0.8
          baseColor = { r: 0, g: 180, b: 255 }
          ctx.fillStyle = `rgba(0, 180, 255, ${alpha * pulse * fadeIn})` // 应用淡入效果
          glowIntensity = alpha * pulse * 1.2 * fadeIn
        } else if (mode === 'THINKING') {
          const thinkAlpha = 0.3 + Math.sin(time * 4 + p.phase) * 0.3
          baseColor = { r: 150, g: 0, b: 255 }
          ctx.fillStyle = `rgba(150, 0, 255, ${alpha * thinkAlpha * fadeIn})` // 应用淡入效果
        } else if (mode === 'SPEAKING' || mode === 'SPEAK') {
          baseColor = { r: 0, g: 243, b: 255 }
          ctx.fillStyle = `rgba(0, 243, 255, ${alpha * fadeIn})` // 应用淡入效果
          glowIntensity = alpha * 1.2 * fadeIn
        }

        // 绘制辉光（外层光晕）- 增强亮度
        if (glowIntensity > 0.3) { // 降低阈值，让更多粒子有辉光
          ctx.shadowBlur = 12 * glowIntensity // 增加模糊半径
          ctx.shadowColor = ctx.fillStyle
        }

        ctx.beginPath()
        ctx.arc(x2d, y2d, p.size * scale, 0, Math.PI * 2)
        ctx.fill()

        // 重置阴影
        ctx.shadowBlur = 0

        // 仅在说话时增加连线，增强表现力
        if ((mode === 'SPEAKING' || mode === 'SPEAK') && energy > 0.3 && Math.random() > 0.98) {
          ctx.strokeStyle = `rgba(0, 243, 255, ${alpha * 0.2})`
          ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(x2d, y2d)
          ctx.lineTo(cx, cy) // 连向核心
          ctx.stroke()
        }

        // THINKING 状态的连线效果（紫色螺旋）
        if (mode === 'THINKING' && Math.random() > 0.99) {
          ctx.strokeStyle = `rgba(150, 0, 255, ${alpha * 0.15})`
          ctx.lineWidth = 0.3
          ctx.beginPath()
          ctx.moveTo(x2d, y2d)
          const angle = time * 2
          const spiralX = cx + Math.cos(angle) * 50
          const spiralY = cy + Math.sin(angle) * 50
          ctx.lineTo(spiralX, spiralY)
          ctx.stroke()
        }
      }
    })

    ctx.globalCompositeOperation = 'source-over'

    // 持续渲染
    animationFrameRef.current = requestAnimationFrame(renderFrame)
  }

  // 初始化 & 启动渲染循环
  useEffect(() => {
    initParticles()
    resizeCanvas()
    renderFrame()

    // 窗口尺寸变化监听
    const handleResize = () => resizeCanvas()
    window.addEventListener('resize', handleResize)

    // console.log('[NovaOrbCanvas] Started rendering loop')

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      window.removeEventListener('resize', handleResize)
      // console.log('[NovaOrbCanvas] Stopped rendering loop')
    }
  }, [particleCount])

  // 同步 props 到内部状态（避免重新初始化）
  useEffect(() => {
    stateRef.current.mode = mode
  }, [mode])

  useEffect(() => {
    stateRef.current.targetEnergy = energy
  }, [energy])

  useEffect(() => {
    if (colors) {
      if (colors.idle) CFG.current.colorIdle = colors.idle
      if (colors.listen) CFG.current.colorListen = colors.listen
      if (colors.speak) CFG.current.colorSpeak = colors.speak
    }
  }, [colors])

  // 同步 activeParticleCount 和 enableRotation
  useEffect(() => {
    stateRef.current.activeParticleCount = activeParticleCount
    // console.log('[NovaOrbCanvas] activeParticleCount updated to:', activeParticleCount)
  }, [activeParticleCount])

  useEffect(() => {
    stateRef.current.enableRotation = enableRotation
    // console.log('[NovaOrbCanvas] enableRotation updated to:', enableRotation)
  }, [enableRotation])

  return (
    <div
      ref={containerRef}
      style={{
        width: size.width,
        height: size.height,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Canvas 渲染层 */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
    </div>
  )
}

export default NovaOrbCanvas
