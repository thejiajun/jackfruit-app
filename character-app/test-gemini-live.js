/**
 * Gemini Live API 配置测试脚本
 * 测试不同配置组合，找出导致 "Request contains an invalid argument" 的原因
 */

import { GoogleGenAI, Modality, MediaResolution } from '@google/genai'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// 加载环境变量
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
config({ path: join(__dirname, '.env') })

const API_KEY = process.env.VITE_GEMINI_API_KEY

if (!API_KEY) {
  console.error('❌ 未找到 VITE_GEMINI_API_KEY 环境变量')
  process.exit(1)
}

console.log('🔑 API Key:', API_KEY.substring(0, 10) + '...')
console.log('🧪 开始测试不同配置组合\n')

// 等待函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// 测试函数
async function testConfig(testName, configBuilder) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🧪 ${testName}`)
  console.log('='.repeat(60))

  try {
    const client = new GoogleGenAI({ apiKey: API_KEY })

    // 监听连接事件
    let connected = false
    let closed = false
    let closeReason = null

    // 构建配置
    const fullConfig = configBuilder()
    const sendInitialMessage = fullConfig._sendInitialMessage
    delete fullConfig._sendInitialMessage // 移除这个属性，不要传给 API

    console.log('  📋 配置:')
    console.log('    - responseModalities:', fullConfig.responseModalities)
    console.log('    - systemInstruction:', fullConfig.systemInstruction ? '✓' : '✗')
    console.log('    - sendInitialMessage:', sendInitialMessage || false)

    // 连接并创建 session
    console.log('  🔌 正在连接...')
    const session = await client.live.connect({
      model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
      config: fullConfig,
      callbacks: {
        onopen: () => {
          connected = true
          console.log('  ✅ Connected')
        },
        onclose: (event) => {
          closed = true
          closeReason = event.reason || 'Unknown reason'
          console.log(`  ❌ Closed: ${closeReason}`)
        },
        onerror: (error) => {
          console.log(`  ⚠️  Error: ${error.message || error}`)
        },
        onmessage: (message) => {
          console.log('  📨 Message received:', JSON.stringify(message).substring(0, 100))
        }
      }
    })

    console.log('  ✅ Session created')

    // 如果需要发送初始消息
    if (sendInitialMessage) {
      console.log('  📤 发送初始消息...')
      await session.send({
        text: 'Hi'
      })
      console.log('  ✅ 初始消息已发送')
    }

    // 等待 3 秒观察
    console.log('  ⏱️  等待 3 秒观察是否关闭...')
    await sleep(3000)

    // 检查状态
    if (closed) {
      console.log(`  ❌ 测试失败: ${closeReason}`)
      return { success: false, reason: closeReason }
    } else {
      console.log('  ✅ 测试成功: 连接保持稳定')
      await session.close()
      return { success: true }
    }

  } catch (error) {
    console.log(`  ❌ 测试失败 (异常): ${error.message}`)
    return { success: false, reason: error.message }
  }
}

// 测试用例
const tests = [
  {
    name: 'Test 1: [AUDIO] + systemInstruction',
    config: () => ({
      responseModalities: [Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Achird'
          }
        }
      },
      contextWindowCompression: {
        triggerTokens: '25600',
        slidingWindow: { targetTokens: '12800' }
      },
      systemInstruction: {
        parts: [{
          text: "You are a helpful voice assistant named Pika."
        }]
      }
    })
  },
  {
    name: 'Test 2: [TEXT] + systemInstruction',
    config: () => ({
      responseModalities: [Modality.TEXT],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      contextWindowCompression: {
        triggerTokens: '25600',
        slidingWindow: { targetTokens: '12800' }
      },
      systemInstruction: {
        parts: [{
          text: "You are a helpful assistant named Pika."
        }]
      }
    })
  },
  {
    name: 'Test 3: [AUDIO, TEXT] + systemInstruction',
    config: () => ({
      responseModalities: [Modality.AUDIO, Modality.TEXT],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Achird'
          }
        }
      },
      contextWindowCompression: {
        triggerTokens: '25600',
        slidingWindow: { targetTokens: '12800' }
      },
      systemInstruction: {
        parts: [{
          text: "You are a helpful assistant named Pika."
        }]
      }
    })
  },
  {
    name: 'Test 4: [AUDIO] 无 systemInstruction',
    config: () => ({
      responseModalities: [Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Achird'
          }
        }
      },
      contextWindowCompression: {
        triggerTokens: '25600',
        slidingWindow: { targetTokens: '12800' }
      }
    })
  },
  {
    name: 'Test 5: [AUDIO] + systemInstruction + 初始消息',
    config: () => ({
      responseModalities: [Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Achird'
          }
        }
      },
      contextWindowCompression: {
        triggerTokens: '25600',
        slidingWindow: { targetTokens: '12800' }
      },
      systemInstruction: {
        parts: [{
          text: "You are a helpful voice assistant named Pika."
        }]
      },
      _sendInitialMessage: true
    })
  }
]

// 运行所有测试
async function runAllTests() {
  const results = []

  for (const test of tests) {
    const result = await testConfig(test.name, test.config)
    results.push({ name: test.name, ...result })
    await sleep(1000) // 测试间隔
  }

  // 输出汇总
  console.log('\n\n' + '='.repeat(60))
  console.log('📊 测试结果汇总')
  console.log('='.repeat(60))

  results.forEach(result => {
    const status = result.success ? '✅ 成功' : '❌ 失败'
    const reason = result.reason ? ` (${result.reason})` : ''
    console.log(`${status} - ${result.name}${reason}`)
  })

  console.log('\n✅ 成功的配置:')
  results.filter(r => r.success).forEach(r => console.log(`  - ${r.name}`))

  console.log('\n❌ 失败的配置:')
  results.filter(r => !r.success).forEach(r => console.log(`  - ${r.name}: ${r.reason}`))
}

// 执行
runAllTests().catch(console.error)
