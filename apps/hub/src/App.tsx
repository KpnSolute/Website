import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CallbackPage, SessionProvider } from '@kpn/app-runtime';
import { API_BASE_URL, AUTH_APP_ORIGIN, CLIENT_ID } from './env';
import { AboutPage } from './pages/AboutPage';
import { HomePage } from './pages/HomePage';
import { PrivacyPage, TermsPage } from './pages/LegalPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PartnersPage } from './pages/PartnersPage';
import { ProductsPage } from './pages/ProductsPage';

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
          <Route path="/about" element={<AboutPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/partners" element={<PartnersPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/auth/callback" element={<CallbackPage successPath="/" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
