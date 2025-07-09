import React, { useState, useEffect } from "react";
import "../../../styles/admin/admin-bus-addition.css";

export default function BusInsertAndBulkUpload() {
  const user = JSON.parse(localStorage.getItem("user"));

  const [newBus, setNewBus] = useState({
    plate_number: "",
    driver_name: "",
    driver_phone_num: "",
    capacity: "",
    company: "",
  });

  const [bulkFile, setBulkFile] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewBus((prev) => ({ ...prev, [name]: value }));
  };

  const handleNewBusSubmit = async (e) => {
    e.preventDefault();

    if (
      !newBus.plate_number ||
      !newBus.driver_name ||
      !newBus.driver_phone_num ||
      !newBus.capacity ||
      !newBus.company
    ) {
      alert("Please fill all fields.");
      return;
    }

    const payload = {
      ...newBus,
      organization_id: user.organization_id,
      status: "inactive", // default
    };

    try {
      const res = await fetch("http://localhost:5000/buses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert("Bus added successfully!");
        setNewBus({
          plate_number: "",
          driver_name: "",
          driver_phone_num: "",
          capacity: "",
          company: "",
        });
      } else {
        const data = await res.json();
        alert(`Error: ${data.error || "Failed to add bus"}`);
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
    formData.append("organization_id", user.organization_id); // pass org ID with upload

    try {
      const res = await fetch("http://localhost:5000/buses/bulk-upload", {
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
        <h3>Bus Addition</h3>
      </div>
      <div className="dashboard-card bus-management-card mb-4">
        <h4 className="mb-3">Add New Bus</h4>
        <form className="add-bus-form" onSubmit={handleNewBusSubmit}>
          <div className="row g-3">
            <div className="col-md-6">
              <label htmlFor="plate_number" className="form-label">
                Plate Number
              </label>
              <input
                type="text"
                id="plate_number"
                name="plate_number"
                className="form-control"
                value={newBus.plate_number}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="col-md-6">
              <label htmlFor="driver_name" className="form-label">
                Driver Name
              </label>
              <input
                type="text"
                id="driver_name"
                name="driver_name"
                className="form-control"
                value={newBus.driver_name}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className="row g-3 mt-2">
            <div className="col-md-6">
              <label htmlFor="driver_phone_num" className="form-label">
                Driver Phone Number
              </label>
              <input
                type="tel"
                id="driver_phone_num"
                name="driver_phone_num"
                className="form-control"
                value={newBus.driver_phone_num}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="col-md-3">
              <label htmlFor="capacity" className="form-label">
                Capacity
              </label>
              <input
                type="number"
                id="capacity"
                name="capacity"
                className="form-control"
                value={newBus.capacity}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="col-md-3">
              <label htmlFor="company" className="form-label">
                Company
              </label>
              <input
                type="text"
                id="company"
                name="company"
                className="form-control"
                value={newBus.company}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary mt-4">
            Add Bus
          </button>
        </form>
      </div>

      {/* Bulk Upload */}
      <div className="dashboard-card bus-management-card">
        <h4 className="mb-3">Bulk Upload Buses (CSV or XLSX)</h4>
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
  );
}
