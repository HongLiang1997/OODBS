import React, { useState, useEffect } from "react";
import { FaBus, FaChartLine } from "react-icons/fa";
import { FaLocationDot } from "react-icons/fa6";
import { GrSchedules, GrOrganization } from "react-icons/gr";
import { useLocation } from "react-router-dom";

const AdminSidebar = ({ open }) => {
  const location = useLocation();
  const [busDropdownOpen, setBusDropdownOpen] = useState(false);

  // Expand/collapse Bus Management dropdown based on current route
  useEffect(() => {
    if (location.pathname.startsWith("/admin/bus-management")) {
      setBusDropdownOpen(true);
    } else {
      setBusDropdownOpen(false);
    }
  }, [location.pathname]);

  const isActive = (path) => location.pathname === path;

  return (
    <div id="sidenav-1" className={`sidenav${open ? " open" : ""}`}>
      <ul className="sidenav-menu">
        <li className="sidenav-item">
          <a
            className={`sidenav-link${isActive("/admin/dashboard") ? " active" : ""}`}
            href="/admin/dashboard"
          >
            <FaChartLine className="me-3" />
            Dashboard
          </a>
        </li>
        <li className="sidenav-item">
          <a
            className={`sidenav-link${isActive("/admin/services") ? " active" : ""}`}
            href="/admin/services"
          >
            <GrSchedules className="me-3" />
            Bus Services
          </a>
        </li>
        {/* Bus Management Dropdown */}
        <li className="sidenav-item">
          <div
            className={`sidenav-link${location.pathname.startsWith("/admin/bus-management") ? " active" : ""}`}
            style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            onClick={() => setBusDropdownOpen((open) => !open)}
          >
            <span>
              <FaBus className="me-3" />
              Bus Management
            </span>
            <span style={{ fontSize: "1.2em" }}>{busDropdownOpen ? "▲" : "▼"}</span>
          </div>
          {busDropdownOpen && (
            <ul className="sidebar-submenu">
              <li>
                <a
                  className={`sidenav-link${isActive("/admin/bus-management") ? " active" : ""}`}
                  href="/admin/bus-management"
                >
                  Manage Bus
                </a>
              </li>
              <li>
                <a
                  className={`sidenav-link${isActive("/admin/bus-management/add") ? " active" : ""}`}
                  href="/admin/bus-management/add"
                >
                  Add Bus
                </a>
              </li>
            </ul>
          )}
        </li>
        <li className="sidenav-item">
          <a
            className={`sidenav-link${isActive("/admin/destinations") ? " active" : ""}`}
            href="/admin/destinations"
          >
            <GrOrganization className="me-3" />
            Destinations
          </a>
        </li>
        <li className="sidenav-item">
          <a
            className={`sidenav-link${isActive("/admin/pickup-locations") ? " active" : ""}`}
            href="/admin/pickup-locations"
          >
            <FaLocationDot className="me-3" />
            Pick-up Locations
          </a>
        </li>
      </ul>
    </div>
  );
};

export default AdminSidebar;