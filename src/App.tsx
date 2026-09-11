import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PublicRoute, UserRoute, AuthRoute, AdminRoute } from './components/layout/RouteGuards';
import LandingPage from './routes/public/LandingPage';
import PricingPage from './routes/public/PricingPage';
import LoginPage from './routes/public/LoginPage';
import SignupPage from './routes/public/SignupPage';
import CollectionsPage from './routes/public/CollectionsPage';
import DownloadPage from './routes/public/DownloadPage';
import ActivatePage from './routes/public/ActivatePage';
import SupportPage from './routes/public/SupportPage';
import ProfilesPage from './routes/user/ProfilesPage';
import AddonsPage from './routes/user/AddonsPage';
import MyCollectionsPage from './routes/user/MyCollectionsPage';
import BillingPage from './routes/user/BillingPage';
import CatalogPage from './routes/admin/CatalogPage';
import HomePresetsPage from './routes/admin/HomePresetsPage';
import TemplatesPage from './routes/admin/TemplatesPage';
import UsersPage from './routes/admin/UsersPage';
import InvitesPage from './routes/admin/InvitesPage';
import SupportRequestsPage from './routes/admin/SupportRequestsPage';
import TabVisibilityPage from './routes/admin/TabVisibilityPage';
import CardGeneratorPage from './routes/tools/CardGeneratorPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PublicRoute><PricingPage /></PublicRoute>} />
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
          <Route path="/catalog" element={<CollectionsPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/activate" element={<ActivatePage />} />
          <Route path="/contact" element={<SupportPage />} />
          <Route path="/support" element={<SupportPage />} />

          {/* User */}
          <Route path="/profiles" element={<UserRoute><ProfilesPage /></UserRoute>} />
          <Route path="/addons" element={<UserRoute><AddonsPage /></UserRoute>} />
          <Route path="/my-collections" element={<UserRoute><MyCollectionsPage /></UserRoute>} />
          <Route path="/billing" element={<AuthRoute><BillingPage /></AuthRoute>} />

          {/* Admin */}
          {/* Home Layout was removed — its unprotected tab-visibility checkboxes let one
              widget end up shared across Home/Movies/Series. Widgets (below) replaces it. */}
          <Route path="/admin/home" element={<Navigate to="/admin/home-presets" replace />} />
          <Route path="/admin/home-presets" element={<AdminRoute><HomePresetsPage /></AdminRoute>} />
          <Route path="/admin/catalog" element={<AdminRoute><CatalogPage /></AdminRoute>} />
          <Route path="/admin/templates" element={<AdminRoute><TemplatesPage /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
          <Route path="/admin/invites" element={<AdminRoute><InvitesPage /></AdminRoute>} />
          <Route path="/admin/support" element={<AdminRoute><SupportRequestsPage /></AdminRoute>} />
          <Route path="/admin/tab-visibility" element={<AdminRoute><TabVisibilityPage /></AdminRoute>} />

          <Route path="/tools/card-generator" element={<CardGeneratorPage />} />
          <Route path="*" element={<div className="min-h-screen bg-bg flex items-center justify-center"><p className="text-muted">Page not found</p></div>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
