import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TripProvider, useTrip } from './context/TripContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import MapPage from './pages/MapPage';
import ChatPage from './pages/ChatPage';
import BoardPage from './pages/BoardPage';
import DiaryPage from './pages/DiaryPage';
import AccountPage from './pages/AccountPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

function AppShell() {
  const { syncError, retrySync } = useTrip();
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {syncError && <div role="alert" className="shrink-0 flex items-center justify-between gap-3 bg-[#fff4ed] border-b border-line px-5 py-2 text-xs text-pin">
          <span>서버 저장 문제: {syncError}</span>
          <button type="button" onClick={retrySync} className="shrink-0 border-none bg-transparent text-pin underline cursor-pointer">
            {syncError.includes('다른 기기') ? '충돌 확인' : '다시 저장'}
          </button>
        </div>}
        <Routes>
          <Route path="/home" element={<HomePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/board/:boardId" element={<BoardPage />} />
          <Route path="/diary" element={<DiaryPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <TripProvider>
                  <AppShell />
                </TripProvider>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
