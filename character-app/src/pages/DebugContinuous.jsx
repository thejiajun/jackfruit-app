import React, { useState, useRef, useEffect } from 'react'
import GeminiLiveContinuous from '../services/geminiLiveService.continuous'

const DebugContinuous = () => {
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
    }

    const handleConnect = async () => {
        if (!apiKey) {
            addLog('❌ API Key is missing', 'error')
            return
        }

        try {
            addLog('Connecting to Gemini Live API...')

            geminiRef.current = new GeminiLiveContinuous(apiKey, {
                model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
                voiceName: 'Achird',
                enableVideo: true,
                videoFPS: 0.5,
                onLog: (msg) => addLog(msg, 'debug'),
                onConnected: () => {
                    setIsConnected(true)
                    addLog('✅ Connected successfully', 'success')
                },
                onDisconnected: (event) => {
                    setIsConnected(false)
                    setIsStreaming(false)
                    addLog(`🔌 Disconnected: ${event.reason || 'Unknown'}`, 'warning')
                },
                onError: (error) => {
                    addLog(`❌ Error: ${error.message}`, 'error')
                },
                onAudioReceived: (data, mimeType) => {
                    addLog(`🔊 Audio chunk (${mimeType})`, 'success')
                },
                onTextReceived: (text) => {
                    addLog(`💬 AI: ${text}`, 'success')
                }
            })

            await geminiRef.current.connect()

        } catch (error) {
            addLog(`❌ Connection failed: ${error.message}`, 'error')
            setIsConnected(false)
        }
    }

    const handleDisconnect = () => {
        if (geminiRef.current) {
            geminiRef.current.close()
            geminiRef.current = null
        }
        setIsConnected(false)
        setIsStreaming(false)
        addLog('🔌 Disconnected', 'warning')
    }

    const handleStartStream = async () => {
        if (!geminiRef.current || !isConnected) return

        try {
            addLog('🎬 Starting audio+video stream...')
            await geminiRef.current.startStream(videoRef.current)
            setIsStreaming(true)
            addLog('✅ Stream started - AI is listening and watching!', 'success')
        } catch (error) {
            addLog(`❌ Failed to start stream: ${error.message}`, 'error')
            setIsStreaming(false)
        }
    }

    const handleStopStream = async () => {
        if (!geminiRef.current) return

        try {
            addLog('⏹️ Stopping stream...')
            await geminiRef.current.stopStream()
            setIsStreaming(false)
            addLog('✅ Stream stopped', 'success')
        } catch (error) {
            addLog(`❌ Failed to stop stream: ${error.message}`, 'error')
        }
    }

    return (
        <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '1200px', margin: '0 auto' }}>
            <h1>Gemini Live - 持续音视频流测试</h1>
            <p style={{ color: '#666', marginBottom: '20px' }}>
                持续连接模式 - AI 自动检测语音活动 (无需按住按钮)
            </p>

            {/* 配置区 */}
            <div style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '15px', borderRadius: '5px' }}>
                <h3>1. 配置</h3>
                <div style={{ marginBottom: '10px' }}>
                    <label>API Key: </label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        style={{ width: '400px', padding: '5px' }}
                        disabled={isConnected}
                    />
                </div>
                <div>
                    {!isConnected ? (
                        <button
                            onClick={handleConnect}
                            style={{
                                padding: '10px 20px',
                                backgroundColor: '#4CAF50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                fontSize: '16px'
                            }}
                        >
                            连接
                        </button>
                    ) : (
                        <button
                            onClick={handleDisconnect}
                            style={{
                                padding: '10px 20px',
                                backgroundColor: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                fontSize: '16px'
                            }}
                        >
                            断开
                        </button>
                    )}
                </div>
            </div>

            {/* 流控制区 */}
            <div style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '15px', borderRadius: '5px' }}>
                <h3>2. 音视频流控制</h3>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    {!isStreaming ? (
                        <button
                            onClick={handleStartStream}
                            disabled={!isConnected}
                            style={{
                                padding: '15px 30px',
                                backgroundColor: isConnected ? '#2196F3' : '#ccc',
                                color: 'white',
                                border: 'none',
                                borderRadius: '5px',
                                cursor: isConnected ? 'pointer' : 'not-allowed',
                                fontSize: '18px',
                                fontWeight: 'bold'
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
                                borderRadius: '5px',
                                cursor: 'pointer',
                                fontSize: '18px',
                                fontWeight: 'bold'
                            }}
                        >
                            ⏹️ 停止流
                        </button>
                    )}
                </div>

                {/* 视频预览 */}
                <div style={{
                    backgroundColor: '#000',
                    borderRadius: '5px',
                    overflow: 'hidden',
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
                    <p style={{ marginTop: '10px', color: '#4CAF50', fontWeight: 'bold' }}>
                        🔴 正在直播 - AI 正在听和看,随时可以说话!
                    </p>
                )}
            </div>

            {/* 日志区 */}
            <div style={{ border: '1px solid #333', borderRadius: '5px', height: '400px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px', borderBottom: '1px solid #333', backgroundColor: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>日志</strong>
                    <button
                        onClick={() => setLogs([])}
                        style={{
                            fontSize: '12px',
                            padding: '5px 10px',
                            backgroundColor: '#666',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }}
                    >
                        清空
                    </button>
                </div>
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '10px',
                    backgroundColor: '#1e1e1e',
                    color: '#00ff00',
                    fontSize: '13px'
                }}>
                    {logs.map((log, index) => (
                        <div
                            key={index}
                            style={{
                                marginBottom: '5px',
                                color: log.type === 'error' ? '#ff5252' : (log.type === 'success' ? '#69f0ae' : '#00ff00')
                            }}
                        >
                            <span style={{ color: '#888', marginRight: '10px' }}>[{log.time}]</span>
                            {log.message}
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
            </div>

            {/* 说明 */}
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '5px', fontSize: '14px' }}>
                <h4 style={{ marginTop: 0 }}>使用说明:</h4>
                <ol style={{ marginBottom: 0 }}>
                    <li>输入 API Key 并点击"连接"</li>
                    <li>点击"开始流"启动音视频流</li>
                    <li>允许浏览器访问摄像头和麦克风</li>
                    <li>直接对着麦克风说话 - AI 会自动检测并回复!</li>
                    <li>AI 同时能"看到"你的视频画面</li>
                    <li>完成后点击"停止流"</li>
                </ol>
                <p style={{ marginTop: '10px', color: '#1976d2', fontWeight: 'bold' }}>
                    💡 提示: 无需按住按钮,AI 会自动检测你何时开始和停止说话!
                </p>
            </div>
        </div>
    )
}

export default DebugContinuous
