import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PassengerLogin from "./pages/PassengerLogin";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import BusManagement from "./pages/admin/BusManagement";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<PassengerLogin />} />
        <Route path="/admin" element={<AdminLogin />} />

        {/* All admin pages share AdminLayout */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="bus-management" element={<BusManagement />} />
          {/* Add more nested admin pages here */}
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;