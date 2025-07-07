import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PassengerLogin from './pages/PassengerLogin';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminLayout from './layouts/AdminLayout';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<PassengerLogin />} />

        <Route path="/admin" element={<AdminLogin />} />

        {/* Admin layout wraps all admin pages */}
        <Route path="/admin/dashboard" element={<AdminLayout />}>
          {/* Nested route renders inside AdminLayout's Outlet */}
          // <Route index element={<AdminDashboard />} />
          {/* Add more nested admin pages here, e.g.:
            <Route path="settings" element={<AdminSettings />} />
          */}
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;