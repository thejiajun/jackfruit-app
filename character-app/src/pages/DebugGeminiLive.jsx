import React, { useState, useRef, useEffect } from 'react'
import GeminiLiveService from '../services/geminiLiveService.v2'

const DebugGeminiLive = () => {
    const [logs, setLogs] = useState([])
    const [isConnected, setIsConnected] = useState(false)
    const [isRecording, setIsRecording] = useState(false)
    const [apiKey, setApiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || '')
    const geminiLiveRef = useRef(null)
    const logsEndRef = useRef(null)

    // 自动滚动日志
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [logs])

    const addLog = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString()
        setLogs(prev => [...prev, { time: timestamp, message, type }])
        console.log(`[Debug] ${message}`)
    }

    const handleConnect = async () => {
        if (!apiKey) {
            addLog('❌ API Key is missing', 'error')
            return
        }

        try {
            addLog('Connecting to Gemini Live...')

            geminiLiveRef.current = new GeminiLiveService(apiKey, {
                model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
                voiceName: 'Achird',
                onLog: (msg) => addLog(msg, 'debug'),
                onConnected: () => {
                    setIsConnected(true)
                    addLog('✅ Connected successfully (ready to record)', 'success')
                },
                onError: (error) => {
                    addLog(`❌ Error: ${error.message}`, 'error')
                },
                onClosed: (event) => {
                    setIsConnected(false)
                    addLog(`🔌 Connection closed: ${event.reason || 'Unknown'}`, 'warning')
                },
                onAudio: (data, mimeType) => {
                    addLog(`🔊 Audio chunk received (${mimeType})`, 'success')
                },
                onText: (text) => {
                    addLog(`💬 AI: ${text}`, 'success')
                }
            })

            await geminiLiveRef.current.connect()

        } catch (error) {
            addLog(`❌ Connection failed: ${error.message}`, 'error')
            setIsConnected(false)
        }
    }

    const handleDisconnect = () => {
        if (geminiLiveRef.current) {
            geminiLiveRef.current.close()
            geminiLiveRef.current = null
        }
        setIsConnected(false)
        addLog('🔌 Disconnected', 'warning')
    }

    const handleStartRecording = async () => {
        if (!geminiLiveRef.current || !isConnected) return
        try {
            setIsRecording(true)
            addLog('🎤 Starting recording...', 'info')
            await geminiLiveRef.current.startRecording()
        } catch (e) {
            addLog(`❌ Start recording failed: ${e.message}`, 'error')
            setIsRecording(false)
        }
    }

    const handleStopRecording = async () => {
        if (!geminiLiveRef.current || !isConnected) return
        try {
            setIsRecording(false)
            addLog('⏹️ Stopping recording...', 'info')
            await geminiLiveRef.current.stopRecording()
        } catch (e) {
            addLog(`❌ Stop recording failed: ${e.message}`, 'error')
        }
    }

    return (
        <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '800px', margin: '0 auto' }}>
            <h1>Gemini Live Debugger</h1>

            <div style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px', borderRadius: '5px' }}>
                <h3>Configuration</h3>
                <div style={{ marginBottom: '10px' }}>
                    <label>API Key: </label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        style={{ width: '300px' }}
                    />
                </div>
                <div>
                    {!isConnected ? (
                        <button
                            onClick={handleConnect}
                            style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                        >
                            Connect
                        </button>
                    ) : (
                        <button
                            onClick={handleDisconnect}
                            style={{ padding: '10px 20px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                        >
                            Disconnect
                        </button>
                    )}
                </div>
            </div>

            <div style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '20px', borderRadius: '5px', textAlign: 'center' }}>
                <h3>Interaction</h3>
                <button
                    onMouseDown={handleStartRecording}
                    onMouseUp={handleStopRecording}
                    onMouseLeave={handleStopRecording}
                    onTouchStart={handleStartRecording}
                    onTouchEnd={handleStopRecording}
                    disabled={!isConnected}
                    style={{
                        padding: '20px 40px',
                        fontSize: '18px',
                        backgroundColor: isRecording ? '#ff9800' : (isConnected ? '#2196F3' : '#ccc'),
                        color: 'white',
                        border: 'none',
                        borderRadius: '50px',
                        cursor: isConnected ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s'
                    }}
                >
                    {isRecording ? '🔴 Release to Send' : '🎤 Hold to Talk'}
                </button>
                <p style={{ marginTop: '10px', color: '#666' }}>
                    {isRecording ? 'Recording & Streaming...' : 'Press and hold to speak'}
                </p>
            </div>

            <div style={{ border: '1px solid #333', borderRadius: '5px', height: '400px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px', borderBottom: '1px solid #333', backgroundColor: '#f5f5f5' }}>
                    <strong>Logs</strong>
                    <button onClick={() => setLogs([])} style={{ float: 'right', fontSize: '12px' }}>Clear</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px', backgroundColor: '#1e1e1e', color: '#00ff00' }}>
                    {logs.map((log, index) => (
                        <div key={index} style={{ marginBottom: '5px', color: log.type === 'error' ? '#ff5252' : (log.type === 'success' ? '#69f0ae' : '#00ff00') }}>
                            <span style={{ color: '#888', marginRight: '10px' }}>[{log.time}]</span>
                            {log.message}
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
            </div>
        </div>
    )
}

export default DebugGeminiLive
