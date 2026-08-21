import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CallbackPage, SessionProvider } from '@kpn/app-runtime';
import { API_BASE_URL, AUTH_APP_ORIGIN, CLIENT_ID } from './env';
import { HomePage } from './pages/HomePage';

export function App() {
  const config = {
    apiBaseUrl: API_BASE_URL,
    authAppOrigin: AUTH_APP_ORIGIN,
    clientId: CLIENT_ID,
    redirectUri: `${window.location.origin}/auth/callback`,
  };

  return (
    <SessionProvider config={config}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth/callback" element={<CallbackPage successPath="/" />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
