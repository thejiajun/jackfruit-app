import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { OnboardingEngine } from './pages/Onboarding'
// import { CharacterList } from './pages/CharacterList'
// import { CharacterView } from './pages/CharacterView'

import DebugGeminiLive from './pages/DebugGeminiLive'
import DebugContinuous from './pages/DebugContinuous'
import DebugSimple from './pages/DebugSimple'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Onboarding 成为新首页 */}
        <Route path="/" element={<OnboardingEngine />} />
        <Route path="/debug" element={<DebugGeminiLive />} />
        <Route path="/debug-continuous" element={<DebugContinuous />} />
        <Route path="/debug-simple" element={<DebugSimple />} />

        {/* 暂时禁用：缺少 characterService 依赖 */}
        {/* <Route path="/character/:characterId" element={<CharacterView />} /> */}
        {/* <Route path="/characters" element={<CharacterList />} /> */}

        {/* 已删除：VoiceChat 页面及相关依赖 */}
        {/* <Route path="/voice-chat" element={<VoiceChat />} /> */}
        {/* <Route path="/voice-chat/:characterId" element={<VoiceChat />} /> */}
      </Routes>
    </BrowserRouter>
  )
}

export default App
