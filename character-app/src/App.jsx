import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { OnboardingEngine } from './pages/Onboarding'
// import { CharacterList } from './pages/CharacterList'
// import { CharacterView } from './pages/CharacterView'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Onboarding 成为新首页 */}
        <Route path="/" element={<OnboardingEngine />} />

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
