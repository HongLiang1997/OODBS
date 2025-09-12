import React, { useState, useEffect } from "react";
import { FaBus, FaChartLine, FaSignOutAlt } from "react-icons/fa";
import { FaLocationDot } from "react-icons/fa6";
import { GrSchedules, GrOrganization } from "react-icons/gr";
import { useLocation, useNavigate } from "react-router-dom";

const AdminSidebar = ({ open }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [busDropdownOpen, setBusDropdownOpen] = useState(false);
  const [servicesDropdownOpen, setServicesDropdownOpen] = useState(false);
  const [destinationsDropdownOpen, setDestinationsDropdownOpen] = useState(false);
  const [pickupDropdownOpen, setPickupDropdownOpen] = useState(false);

  useEffect(() => {
    if (location.pathname.startsWith("/admin/bus-management")) {
      setBusDropdownOpen(true);
    } else {
      setBusDropdownOpen(false);
    }

    if (location.pathname.startsWith("/admin/service-management")) {
      setServicesDropdownOpen(true);
    } else {
      setServicesDropdownOpen(false);
    }

    if (location.pathname.startsWith("/admin/destination-management")) {
      setDestinationsDropdownOpen(true);
    } else {
      setDestinationsDropdownOpen(false);
    }

    if (location.pathname.startsWith("/admin/pickup-management")) {
      setPickupDropdownOpen(true);
    } else {
      setPickupDropdownOpen(false);
    }
  }, [location.pathname]);

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/admin");
  };

  return (
    <div id="sidenav-1" className={`sidenav${open ? " open" : ""}`}>
      <ul className="sidenav-menu">
        <li className="sidenav-item">
          <a
            className={`sidenav-link${
              isActive("/admin/dashboard") ? " active" : ""
            }`}
            href="/admin/dashboard"
          >
            <FaChartLine className="me-3" />
            Dashboard
          </a>
        </li>
        {/* Bus Services Dropdown */}
        <li className="sidenav-item">
          <div
            className={`sidenav-link${
              location.pathname.startsWith("/admin/service-management") ? " active" : ""
            }`}
            style={{
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onClick={() => setServicesDropdownOpen((open) => !open)}
          >
            <span>
              <GrSchedules className="me-3" />
              Bus Services
            </span>
            <span className="dropdown-arrow">
              {servicesDropdownOpen ? "▲" : "▼"}
            </span>
          </div>
          {servicesDropdownOpen && (
            <ul className="sidebar-submenu">
              <li>
                <a
                  className={`sidenav-link${
                    isActive("/admin/service-management") ? " active" : ""
                  }`}
                  href="/admin/service-management"
                >
                  Manage Service
                </a>
              </li>
              <li>
                <a
                  className={`sidenav-link${
                    isActive("/admin/service-management/add") ? " active" : ""
                  }`}
                  href="/admin/service-management/add"
                >
                  Add Service
                </a>
              </li>
            </ul>
          )}
        </li>

        {/* Bus Management Dropdown */}
        <li className="sidenav-item">
          <div
            className={`sidenav-link${
              location.pathname.startsWith("/admin/bus-management")
                ? " active"
                : ""
            }`}
            style={{
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onClick={() => setBusDropdownOpen((open) => !open)}
          >
            <span>
              <FaBus className="me-3" />
              Bus Management
            </span>
            <span className="dropdown-arrow">
              {busDropdownOpen ? "▲" : "▼"}
            </span>
          </div>
          {busDropdownOpen && (
            <ul className="sidebar-submenu">
              <li>
                <a
                  className={`sidenav-link${
                    isActive("/admin/bus-management") ? " active" : ""
                  }`}
                  href="/admin/bus-management"
                >
                  Manage Bus
                </a>
              </li>
              <li>
                <a
                  className={`sidenav-link${
                    isActive("/admin/bus-management/add") ? " active" : ""
                  }`}
                  href="/admin/bus-management/add"
                >
                  Add Bus
                </a>
              </li>
            </ul>
          )}
        </li>
        
        {/* Destinations Management Dropdown */}
        <li className="sidenav-item">
          <div
            className={`sidenav-link${
              location.pathname.startsWith("/admin/destination-management") ? " active" : ""
            }`}
            style={{
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onClick={() => setDestinationsDropdownOpen((open) => !open)}
          >
            <span>
              <GrOrganization className="me-3" />
              Destinations
            </span>
            <span className="dropdown-arrow">
              {destinationsDropdownOpen ? "▲" : "▼"}
            </span>
          </div>
          {destinationsDropdownOpen && (
            <ul className="sidebar-submenu">
              <li>
                <a
                  className={`sidenav-link${
                    isActive("/admin/destination-management") ? " active" : ""
                  }`}
                  href="/admin/destination-management"
                >
                  Manage Destinations
                </a>
              </li>
              <li>
                <a
                  className={`sidenav-link${
                    isActive("/admin/destination-management/add") ? " active" : ""
                  }`}
                  href="/admin/destination-management/add"
                >
                  Add Destination
                </a>
              </li>
            </ul>
          )}
        </li>
        
        {/* Pickup Locations Management Dropdown */}
        <li className="sidenav-item">
          <div
            className={`sidenav-link${
              location.pathname.startsWith("/admin/pickup-management") ? " active" : ""
            }`}
            style={{
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onClick={() => setPickupDropdownOpen((open) => !open)}
          >
            <span>
              <FaLocationDot className="me-3" />
              Pick-up Locations
            </span>
            <span className="dropdown-arrow">
              {pickupDropdownOpen ? "▲" : "▼"}
            </span>
          </div>
          {pickupDropdownOpen && (
            <ul className="sidebar-submenu">
              <li>
                <a
                  className={`sidenav-link${
                    isActive("/admin/pickup-management") ? " active" : ""
                  }`}
                  href="/admin/pickup-management"
                >
                  Manage Pick-up Locations
                </a>
              </li>
              <li>
                <a
                  className={`sidenav-link${
                    isActive("/admin/pickup-management/add") ? " active" : ""
                  }`}
                  href="/admin/pickup-management/add"
                >
                  Add Pick-up Location
                </a>
              </li>
            </ul>
          )}
        </li>
      </ul>
      <button className="sidebar-logout-btn" onClick={handleLogout}>
        <FaSignOutAlt className="me-2" />
        Logout
      </button>
    </div>
  );
};

export default AdminSidebar;
