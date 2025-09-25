import React from "react";
import { FaBus, FaUser, FaBell, FaSignOutAlt } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

const PassengerNav = () => {
  const passenger = JSON.parse(localStorage.getItem("passenger"));
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("passenger");
    navigate("/passenger/login");
  };

  return (
    <nav className="passenger-navbar">
      <div className="passenger-nav-container">
        <div className="passenger-nav-brand">
          <FaBus className="passenger-nav-icon" />
          <span className="passenger-nav-title">OODBS Passenger</span>
        </div>
        <ul className="passenger-nav-menu">
          <li className="passenger-nav-item">
            <FaBell className="passenger-nav-icon-small" />
          </li>
          <li className="passenger-nav-item">
            <FaUser className="passenger-nav-icon-small" />
          </li>
          <li className="passenger-nav-item">
            <span className="passenger-nav-user">
              {passenger?.name || passenger?.email || "Passenger"}
            </span>
          </li>
          <li className="passenger-nav-item">
            <button 
              onClick={handleLogout}
              className="passenger-logout-btn"
            >
              <FaSignOutAlt className="passenger-logout-icon" />
              Logout
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default PassengerNav;
