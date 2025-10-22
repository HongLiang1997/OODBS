import React from "react";
import { useNavigate } from "react-router-dom";
import { 
  FaBars, 
  FaTimes, 
  FaTachometerAlt, 
  FaRoute,
  FaSignOutAlt,
  FaUser,
  FaBus
} from "react-icons/fa";
import "../../styles/driver/driver-nav.css";

export default function DriverNav({ sidebarOpen, setSidebarOpen }) {
  const navigate = useNavigate();
  const driver = JSON.parse(localStorage.getItem("driver"));

  const handleLogout = () => {
    localStorage.removeItem("driver");
    navigate("/driver-login");
  };

  const menuItems = [
    {
      icon: <FaTachometerAlt />,
      label: "Dashboard",
      path: "/driver-dashboard",
      active: true
    },
    {
      icon: <FaRoute />,
      label: "My Routes",
      path: "/driver-routes"
    },
    {
      icon: <FaBus />,
      label: "Bus Status",
      path: "/driver-bus-status"
    },
    {
      icon: <FaUser />,
      label: "Profile",
      path: "/driver-profile"
    }
  ];

  return (
    <>
      {/* Mobile Header */}
      <div className="driver-mobile-header">
        <button 
          className="menu-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <FaTimes /> : <FaBars />}
        </button>
        <div className="mobile-logo">
          <FaBus />
          <span>Driver Portal</span>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`driver-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <FaBus className="logo-icon" />
            <span className="logo-text">Driver Portal</span>
          </div>
          <button 
            className="close-btn desktop-hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <FaTimes />
          </button>
        </div>

        <div className="driver-profile">
          <div className="profile-avatar">
            <FaUser />
          </div>
          <div className="profile-info">
            <h3>{driver?.full_name || "Driver"}</h3>
            <p>Driver ID: {driver?.user_id || "N/A"}</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item, index) => (
            <button
              key={index}
              className={`nav-item ${item.active ? 'active' : ''}`}
              onClick={() => {
                navigate(item.path);
                setSidebarOpen(false);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <FaSignOutAlt />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </>
  );
}