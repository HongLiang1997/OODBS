import React, { useState } from "react";
import "../../styles/login.css";
import { useNavigate } from "react-router-dom";

export default function DriverLogin() {
  const [plateNumber, setPlateNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:5000/auth/driver-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate_number: plateNumber, phone_number: phoneNumber }),
      });
      const data = await res.json();
      if (data.success) {
        // Store driver info in localStorage
        localStorage.setItem("driver", JSON.stringify(data.driver));
        navigate("/driver/dashboard");
      } else {
        alert(data.message || "Login failed");
      }
    } catch (err) {
      alert("Server error");
    }
  };

  return (
    <div className="login-wrapper">
      <section className="p-3 p-md-4 p-xl-5">
        <div className="container">
          <div className="card border-light-subtle shadow-sm">
            <div className="row g-0">
              <div className="col-12 col-md-6 driver-login">
                <div className="d-flex align-items-center justify-content-center h-100">
                  <div className="col-10 col-xl-8 py-3">
                    <hr className="border-primary-subtle mb-4" />
                    <h2 className="h1 mb-4">OODBS Driver Portal</h2>
                    <p className="lead m-0">
                      Access your bus routes and passenger information. 
                      Connecting drivers to efficient route management and scheduling.
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-12 col-md-6">
                <div className="card-body p-3 p-md-4 p-xl-5">
                  <div className="row">
                    <div className="col-12">
                      <div className="mb-5">
                        <h3>Bus Driver Login</h3>
                      </div>
                    </div>
                  </div>
                  <form onSubmit={handleSubmit}>
                    <div className="row gy-3 gy-md-4 overflow-hidden">
                      <div className="col-12">
                        <label htmlFor="plateNumber" className="form-label">
                          Bus Plate Number <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          name="plateNumber"
                          id="plateNumber"
                          placeholder="e.g., SBS1234A"
                          required
                          value={plateNumber}
                          onChange={(e) => setPlateNumber(e.target.value)}
                        />
                      </div>
                      <div className="col-12">
                        <label htmlFor="phoneNumber" className="form-label">
                          Phone Number <span className="text-danger">*</span>
                        </label>
                        <input
                          type="tel"
                          className="form-control"
                          name="phoneNumber"
                          id="phoneNumber"
                          placeholder="+65 XXXX XXXX"
                          required
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                        />
                      </div>
                      <div className="col-12">
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            value=""
                            name="remember_me"
                            id="remember_me"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                          />
                          <label
                            className="form-check-label text-secondary"
                            htmlFor="remember_me"
                          >
                            Keep me logged in
                          </label>
                        </div>
                      </div>
                      <div className="col-12">
                        <div className="d-grid">
                          <button
                            className="btn bsb-btn-xl btn-primary"
                            type="submit"
                          >
                            Log in now
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
