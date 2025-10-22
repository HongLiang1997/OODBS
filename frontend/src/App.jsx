import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PassengerLogin from "./pages/passenger/PassengerLogin";
import PassengerDashboard from "./pages/passenger/PassengerDashboard";

import DriverLogin from "./pages/driver/DriverLogin";
import DriverDashboard from "./pages/driver/DriverDashboard";

import AdminLogin from "./pages/admin/AdminLogin";
import RequireAuth from "./components/admin/RequireAuth";

import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import BusManagement from "./pages/admin/busmanager/BusManagement";
import BusAddition from "./pages/admin/busmanager/BusAddition";
import BusDetail from "./pages/admin/busmanager/BusDetails";

import ServiceManagement from "./pages/admin/servicemanager/ServiceManagement";
import ServiceAddition from "./pages/admin/servicemanager/ServiceAddition";

import DestinationManagement from "./pages/admin/destinationmanager/DestinationManagement";
import DestinationAddition from "./pages/admin/destinationmanager/DestinationAddition";

import PickupManagement from "./pages/admin/pickupmanager/PickupManagement";
import PickupAddition from "./pages/admin/pickupmanager/PickupAddition";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/passenger/login" replace />} />
        <Route path="/passenger/login" element={<PassengerLogin />} />
        <Route path="/passenger/dashboard" element={<PassengerDashboard />} />

        <Route path="/driver/login" element={<DriverLogin />} />
        <Route path="/driver/dashboard" element={<DriverDashboard />} />

        <Route path="/admin" element={<AdminLogin />} />
 
        {/* Protected admin pages */}
        <Route element={<RequireAuth />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="dashboard" element={<AdminDashboard />} />
            {/* Bus Related Pages */}
            <Route path="bus-management" element={<BusManagement />} />
            <Route path="bus-management/add" element={<BusAddition />} />
            <Route path="bus-management/bus-details/:bus_id" element={<BusDetail />} />

            {/* Add more nested admin pages here */}
            <Route path="service-management" element={<ServiceManagement />} />
            <Route path="service-management/add" element={<ServiceAddition />} />

            <Route path="destination-management" element={<DestinationManagement />} />
            <Route path="destination-management/add" element={<DestinationAddition />} />

            <Route path="pickup-management" element={<PickupManagement />} />
            <Route path="pickup-management/add" element={<PickupAddition />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
