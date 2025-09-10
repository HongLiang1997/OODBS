import React, { useState, useEffect } from "react";
import "../../../styles/admin/servicemanager/admin-service-addition.css";

export default function ServiceAddition() {
  const user = JSON.parse(localStorage.getItem("user"));
  const orgId = user?.organization_id;

  const [buses, setBuses] = useState([]);
  const [pickupLocations, setPickupLocations] = useState([]);
  
  const [newService, setNewService] = useState({
    bus_id: "",
    pickup_id: "",
    service_date: "",
    isAmShift: false,
    isPmShift: false,
  });

  const [bulkFile, setBulkFile] = useState(null);

  // Fetch buses for this organization
  useEffect(() => {
    if (!orgId) return;
    
    fetch(`http://localhost:5000/buses/organization/${orgId}`)
      .then((res) => res.json())
      .then((data) => setBuses(data))
      .catch((err) => {
        console.error("Error fetching buses:", err);
        setBuses([]);
      });
  }, [orgId]);

  // Fetch pickup locations for this organization
  useEffect(() => {
    if (!orgId) return;
    
    fetch(`http://localhost:5000/pickup-locations/organization/${orgId}`)
      .then((res) => res.json())
      .then((data) => setPickupLocations(data))
      .catch((err) => {
        console.error("Error fetching pickup locations:", err);
        setPickupLocations([]);
      });
  }, [orgId]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewService((prev) => ({ 
      ...prev, 
      [name]: type === "checkbox" ? checked : value 
    }));
  };

  const handleNewServiceSubmit = async (e) => {
    e.preventDefault();

    if (
      !newService.bus_id ||
      !newService.pickup_id ||
      !newService.service_date ||
      (!newService.isAmShift && !newService.isPmShift)
    ) {
      alert("Please fill all fields and select at least one shift.");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newService),
      });
      if (res.ok) {
        alert("Service added successfully!");
        setNewService({
          bus_id: "",
          pickup_id: "",
          service_date: "",
          isAmShift: false,
          isPmShift: false,
        });
      } else {
        const data = await res.json();
        alert(`Error: ${data.error || "Failed to add service"}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleFileChange = (e) => {
    setBulkFile(e.target.files[0]);
  };

  const handleBulkUploadSubmit = async (e) => {
    e.preventDefault();
    if (!bulkFile) {
      alert("Please select a file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", bulkFile);
    formData.append("organization_id", user.organization_id);

    try {
      const res = await fetch("http://localhost:5000/services/bulk-upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        alert("Bulk upload successful!");
        setBulkFile(null);
        e.target.reset();
      } else {
        const data = await res.json();
        alert(`Upload error: ${data.error || "Failed to upload file"}`);
      }
    } catch (err) {
      alert(`Upload error: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="page-title">
        <h3>Service Addition</h3>
      </div>
      <div className="page-content add-service-content">
        <div className="dashboard-card add-service-card mb-4 d-flex flex-column">
          <h4 className="mb-3">Add New Service</h4>
          <form className="add-service-form" onSubmit={handleNewServiceSubmit}>
            <div className="row g-3">
              <div className="col-md-6">
                <label htmlFor="bus_id" className="form-label">
                  Select Bus
                </label>
                <select
                  id="bus_id"
                  name="bus_id"
                  className="form-control"
                  value={newService.bus_id}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select a bus...</option>
                  {buses.map((bus) => (
                    <option key={bus.bus_id} value={bus.bus_id}>
                      {bus.plate_number} - {bus.driver_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <label htmlFor="pickup_id" className="form-label">
                  Pick-up Location
                </label>
                <select
                  id="pickup_id"
                  name="pickup_id"
                  className="form-control"
                  value={newService.pickup_id}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select pickup location...</option>
                  {pickupLocations.map((location) => (
                    <option key={location.pickup_id} value={location.pickup_id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row g-3 mt-2">
              <div className="col-md-6">
                <label htmlFor="service_date" className="form-label">
                  Service Date
                </label>
                <input
                  type="datetime-local"
                  id="service_date"
                  name="service_date"
                  className="form-control"
                  value={newService.service_date}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Shifts</label>
                <div className="d-flex gap-4 align-items-center">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="isAmShift"
                      name="isAmShift"
                      checked={newService.isAmShift}
                      onChange={handleInputChange}
                    />
                    <label className="form-check-label" htmlFor="isAmShift">
                      AM Shift
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="isPmShift"
                      name="isPmShift"
                      checked={newService.isPmShift}
                      onChange={handleInputChange}
                    />
                    <label className="form-check-label" htmlFor="isPmShift">
                      PM Shift
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary mt-4">
              Add Service
            </button>
          </form>
        </div>

        {/* Bulk Upload */}
        <div className="dashboard-card add-service-card mb-4 d-flex flex-column">
          <h4 className="mb-3">Bulk Upload Services (CSV or XLSX)</h4>
          <form onSubmit={handleBulkUploadSubmit}>
            <div className="mb-3">
              <input
                type="file"
                accept=".csv, .xlsx"
                className="form-control"
                onChange={handleFileChange}
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              Upload File
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
