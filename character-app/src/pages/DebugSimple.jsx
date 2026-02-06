import React, { useState, useRef, useEffect } from 'react'
import GeminiLiveContinuous from '../services/geminiLiveService.continuous'

const DebugSimple = () => {
    const [logs, setLogs] = useState([])
    const [isConnected, setIsConnected] = useState(false)
    const [isStreaming, setIsStreaming] = useState(false)
    const [apiKey, setApiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || '')

    const geminiRef = useRef(null)
    const videoRef = useRef(null)
    const logsEndRef = useRef(null)

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [logs])

    const addLog = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString()
        setLogs(prev => [...prev, { time: timestamp, message, type }])
        console.log(`[${timestamp}] ${message}`)
    }

    const handleConnect = async () => {
        if (!apiKey) {
            addLog('❌ 请输入 API Key', 'error')
            return
        }

        try {
            addLog('连接中...')

            geminiRef.current = new GeminiLiveContinuous(apiKey, {
                model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
                voiceName: 'Achird',
                enableVideo: true,
                videoFPS: 0.5,
                onLog: (msg) => addLog(msg, 'debug'),
                onConnected: () => {
                    setIsConnected(true)
                    addLog('✅ 连接成功', 'success')
                },
                onDisconnected: () => {
                    setIsConnected(false)
                    setIsStreaming(false)
                    addLog('🔌 已断开', 'warning')
                },
                onError: (error) => {
                    addLog(`❌ 错误: ${error.message}`, 'error')
                },
                onTextReceived: (text) => {
                    addLog(`💬 AI: ${text}`, 'success')
                }
            })

            await geminiRef.current.connect()

        } catch (error) {
            addLog(`❌ 连接失败: ${error.message}`, 'error')
            setIsConnected(false)
        }
    }

    const handleStartStream = async () => {
        if (!geminiRef.current || !isConnected) {
            addLog('❌ 请先连接', 'error')
            return
        }

        try {
            addLog('🎬 启动流...')
            await geminiRef.current.startStream(videoRef.current)
            setIsStreaming(true)
            addLog('✅ 流已启动 - 可以说话了!', 'success')
        } catch (error) {
            addLog(`❌ 启动失败: ${error.message}`, 'error')
            setIsStreaming(false)
        }
    }

    const handleStopStream = async () => {
        if (!geminiRef.current) return

        try {
            addLog('⏹️ 停止流...')
            await geminiRef.current.stopStream()
            setIsStreaming(false)
            addLog('✅ 流已停止', 'success')
        } catch (error) {
            addLog(`❌ 停止失败: ${error.message}`, 'error')
        }
    }

    const handleDisconnect = () => {
        if (geminiRef.current) {
            geminiRef.current.close()
            geminiRef.current = null
        }
        setIsConnected(false)
        setIsStreaming(false)
        addLog('🔌 已断开连接', 'warning')
    }

    return (
        <div style={{
            padding: '20px',
            fontFamily: 'Arial, sans-serif',
            maxWidth: '1000px',
            margin: '0 auto',
            backgroundColor: '#f5f5f5',
            minHeight: '100vh'
        }}>
            <h1 style={{ color: '#333', marginBottom: '10px' }}>Gemini Live - 简化测试</h1>
            <p style={{ color: '#666', marginBottom: '30px' }}>
                持续音视频流 - 自动语音检测
            </p>

            {/* 配置 */}
            <div style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                marginBottom: '20px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <h3 style={{ marginTop: 0, color: '#333' }}>配置</h3>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        API Key:
                    </label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        disabled={isConnected}
                        style={{
                            width: '100%',
                            padding: '10px',
                            fontSize: '14px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                        }}
                        placeholder="输入你的 Gemini API Key"
                    />
                </div>

                {!isConnected ? (
                    <button
                        onClick={handleConnect}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: 'bold'
                        }}
                    >
                        连接
                    </button>
                ) : (
                    <button
                        onClick={handleDisconnect}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: '#f44336',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: 'bold'
                        }}
                    >
                        断开
                    </button>
                )}
            </div>

            {/* 流控制 */}
            <div style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                marginBottom: '20px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <h3 style={{ marginTop: 0, color: '#333' }}>流控制</h3>

                {!isStreaming ? (
                    <button
                        onClick={handleStartStream}
                        disabled={!isConnected}
                        style={{
                            padding: '15px 30px',
                            backgroundColor: isConnected ? '#2196F3' : '#ccc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isConnected ? 'pointer' : 'not-allowed',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            marginBottom: '15px'
                        }}
                    >
                        🎬 开始流
                    </button>
                ) : (
                    <button
                        onClick={handleStopStream}
                        style={{
                            padding: '15px 30px',
                            backgroundColor: '#ff9800',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            marginBottom: '15px'
                        }}
                    >
                        ⏹️ 停止流
                    </button>
                )}

                {/* 视频预览 */}
                <div style={{
                    backgroundColor: '#000',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    width: '100%',
                    maxWidth: '640px'
                }}>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block'
                        }}
                    />
                </div>

                {isStreaming && (
                    <div style={{
                        marginTop: '15px',
                        padding: '10px',
                        backgroundColor: '#e8f5e9',
                        borderRadius: '4px',
                        color: '#2e7d32',
                        fontWeight: 'bold'
                    }}>
                        🔴 正在直播 - AI 正在听和看,随时可以说话!
                    </div>
                )}
            </div>

            {/* 日志 */}
            <div style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <div style={{
                    padding: '15px',
                    backgroundColor: '#f5f5f5',
                    borderBottom: '1px solid #ddd',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <strong style={{ color: '#333' }}>日志</strong>
                    <button
                        onClick={() => setLogs([])}
                        style={{
                            padding: '5px 10px',
                            backgroundColor: '#666',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        清空
                    </button>
                </div>
                <div style={{
                    height: '300px',
                    overflowY: 'auto',
                    padding: '15px',
                    backgroundColor: '#1e1e1e',
                    fontFamily: 'monospace',
                    fontSize: '13px'
                }}>
                    {logs.map((log, index) => (
                        <div
                            key={index}
                            style={{
                                marginBottom: '8px',
                                color: log.type === 'error' ? '#ff5252' :
                                       log.type === 'success' ? '#69f0ae' :
                                       log.type === 'warning' ? '#ffa726' : '#00ff00'
                            }}
                        >
                            <span style={{ color: '#888' }}>[{log.time}]</span> {log.message}
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
            </div>

            {/* 说明 */}
            <div style={{
                marginTop: '20px',
                padding: '20px',
                backgroundColor: '#e3f2fd',
                borderRadius: '8px',
                fontSize: '14px',
                lineHeight: '1.6'
            }}>
                <h4 style={{ marginTop: 0, color: '#1976d2' }}>使用说明:</h4>
                <ol style={{ marginBottom: 0, paddingLeft: '20px' }}>
                    <li>输入 API Key 并点击"连接"</li>
                    <li>点击"开始流"启动音视频流</li>
                    <li>允许浏览器访问摄像头和麦克风</li>
                    <li>直接对着麦克风说话 - AI 会自动检测并回复!</li>
                    <li>AI 同时能"看到"你的视频画面</li>
                    <li>完成后点击"停止流"</li>
                </ol>
                <p style={{ marginTop: '15px', marginBottom: 0, color: '#1976d2', fontWeight: 'bold' }}>
                    💡 提示: 无需按住按钮,AI 会自动检测你何时开始和停止说话!
                </p>
            </div>
        </div>
    )
}

export default DebugSimple
