import React from "react";
import AdminSidebar from "./AdminSidebar";
import { FaBus, FaBars, FaVideo, FaBell, FaTh } from "react-icons/fa";

const AdminNav = ({ sidebarOpen, setSidebarOpen }) => {
  // Read user from localStorage
  const user = JSON.parse(localStorage.getItem("user"));
  console.log("Parsed user from localStorage:", user);
  return (
    <>
      <AdminSidebar open={sidebarOpen} />
      <nav className="navbar fixed-top px-3 shadow-navbar">
        <div className="container-fluid d-flex align-items-center justify-content-between">
          <button
            className="btn p-0 me-3"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle sidebar"
          >
            <FaBars />
          </button>
          <ul className="navbar-nav d-flex flex-row align-items-center gap-3">
            <li>
              <FaVideo />
            </li>
            <li>
              <FaTh />
            </li>
            <li>
              <FaBell />
            </li>
            <li>
              <p className="name">{user?.full_name || "Admin"}</p>
            </li>
          </ul>
        </div>
      </nav>
    </>
  );
};

export default AdminNav;
