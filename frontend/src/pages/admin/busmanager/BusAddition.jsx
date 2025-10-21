import React, { useState, useEffect } from "react";
import "../../../styles/admin/busmanager/admin-bus-addition.css";
import { FaUpload, FaFileExcel, FaEye } from "react-icons/fa";

export default function BusInsertAndBulkUpload() {
  const user = JSON.parse(localStorage.getItem("user"));

  const [newBus, setNewBus] = useState({
    plate_number: "",
    driver_name: "",
    driver_phone_num: "",
    driver_email: "",
    driver_password: "",
    capacity: "",
    company: "",
  });

  const [bulkFile, setBulkFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [bulkData, setBulkData] = useState([]);
  const [showBulkPreview, setShowBulkPreview] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewBus((prev) => ({ ...prev, [name]: value }));
  };

  // Load XLSX library dynamically
  const loadXLSX = () => {
    return new Promise((resolve) => {
      if (window.XLSX) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      script.onload = resolve;
      document.head.appendChild(script);
    });
  };

  // Dynamic column detection function
  const detectColumns = (headers) => {
    console.log('Headers received:', headers);
    
    const columnMap = {
      plate_number: null,
      driver_name: null,
      driver_phone_num: null,
      driver_email: null,
      driver_password: null,
      capacity: null,
      company: null
    };

    headers.forEach((header, index) => {
      if (!header) return;
      
      const headerStr = header.toString().trim().toLowerCase();
      console.log(`Checking header "${header}" -> "${headerStr}" at index ${index}`);
      
      // Check for plate number column
      if ((headerStr.includes('plate') || headerStr.includes('number') || headerStr.includes('registration')) && columnMap.plate_number === null) {
        columnMap.plate_number = index;
        console.log(`Plate number column found at index ${index}: "${header}"`);
      }
      
      // Check for driver name column
      if ((headerStr.includes('driver') && headerStr.includes('name')) || headerStr.includes('drivername') && columnMap.driver_name === null) {
        columnMap.driver_name = index;
        console.log(`Driver name column found at index ${index}: "${header}"`);
      }
      
      // Check for driver phone column
      if ((headerStr.includes('phone') || headerStr.includes('contact') || headerStr.includes('mobile')) && columnMap.driver_phone_num === null) {
        columnMap.driver_phone_num = index;
        console.log(`Driver phone column found at index ${index}: "${header}"`);
      }
      
      // Check for driver email column
      if ((headerStr.includes('email') || headerStr.includes('mail')) && columnMap.driver_email === null) {
        columnMap.driver_email = index;
        console.log(`Driver email column found at index ${index}: "${header}"`);
      }
      
      // Check for driver password column
      if ((headerStr.includes('password') || headerStr.includes('pass')) && columnMap.driver_password === null) {
        columnMap.driver_password = index;
        console.log(`Driver password column found at index ${index}: "${header}"`);
      }
      
      // Check for capacity column
      if ((headerStr.includes('capacity') || headerStr.includes('seats') || headerStr.includes('passenger')) && columnMap.capacity === null) {
        columnMap.capacity = index;
        console.log(`Capacity column found at index ${index}: "${header}"`);
      }
      
      // Check for company column
      if ((headerStr.includes('company') || headerStr.includes('operator') || headerStr.includes('vendor')) && columnMap.company === null) {
        columnMap.company = index;
        console.log(`Company column found at index ${index}: "${header}"`);
      }
    });

    console.log('Final column map:', columnMap);
    return columnMap;
  };

  const handleNewBusSubmit = async (e) => {
    e.preventDefault();

    if (
      !newBus.plate_number ||
      !newBus.driver_name ||
      !newBus.driver_phone_num ||
      !newBus.driver_email ||
      !newBus.driver_password ||
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
      
      const data = await res.json();
      
      if (res.ok && !data.error) {
        alert("Bus added successfully!");
        setNewBus({
          plate_number: "",
          driver_name: "",
          driver_phone_num: "",
          driver_email: "",
          driver_password: "",
          capacity: "",
          company: "",
        });
      } else {
        const errorMessage = data.error || "Failed to add bus";
        alert(`Error: ${errorMessage}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleFileChange = (e) => {
    setBulkFile(e.target.files[0]);
  };

  // Handle file upload with Excel processing
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls|csv)$/)) {
      alert("Please upload an Excel file (.xlsx, .xls) or CSV file");
      return;
    }

    setBulkFile(file);
    setIsUploading(true);

    try {
      await loadXLSX();
      
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        alert("File must contain at least a header row and one data row");
        return;
      }

      const headers = jsonData[0];
      const columnMap = detectColumns(headers);

      if (columnMap.plate_number === null || columnMap.driver_name === null || 
          columnMap.driver_phone_num === null || columnMap.driver_email === null ||
          columnMap.driver_password === null || columnMap.capacity === null || 
          columnMap.company === null) {
        alert(`Could not detect required columns. Please ensure your file has columns for:
        - Plate Number (containing 'plate', 'number', 'registration')
        - Driver Name (containing 'driver name' or 'drivername')
        - Driver Phone (containing 'phone', 'contact', 'mobile')
        - Driver Email (containing 'email', 'mail')
        - Driver Password (containing 'password', 'pass')
        - Capacity (containing 'capacity', 'seats', 'passenger')
        - Company (containing 'company', 'operator', 'vendor')`);
        return;
      }

      const processedData = [];
      const plateNumberMap = new Map(); // Track plate numbers within this batch
      
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const plate_number = row[columnMap.plate_number];
        const driver_name = row[columnMap.driver_name];
        const driver_phone_num = row[columnMap.driver_phone_num];
        const driver_email = row[columnMap.driver_email];
        const driver_password = row[columnMap.driver_password];
        const capacity = parseInt(row[columnMap.capacity]);
        const company = row[columnMap.company];

        // Skip empty rows
        if (!plate_number || !driver_name || !driver_phone_num || !driver_email || !driver_password || isNaN(capacity) || !company) {
          console.warn(`Skipping incomplete row ${i + 1}`);
          continue;
        }

        const plateKey = plate_number.toString().trim().toUpperCase(); // Normalize plate number
        
        // Check for duplicates within this batch
        if (plateNumberMap.has(plateKey)) {
          console.warn(`Skipping ${plate_number}: duplicate plate number within file`);
          continue;
        }
        
        // Add to plate number tracking
        plateNumberMap.set(plateKey, plate_number);

        processedData.push({
          plate_number: plate_number.toString().trim(),
          driver_name: driver_name.toString().trim(),
          driver_phone_num: driver_phone_num.toString().trim(),
          driver_email: driver_email.toString().trim(),
          driver_password: driver_password.toString().trim(),
          capacity: capacity,
          company: company.toString().trim(),
          status: 'pending'
        });
      }

      if (processedData.length === 0) {
        alert("No valid data found in the file");
        return;
      }

      setBulkData(processedData);
      setShowBulkPreview(true);

    } catch (error) {
      alert("Error reading file: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Process bulk upload
  const processBulkUpload = async () => {
    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < bulkData.length; i++) {
      const bus = bulkData[i];
      
      // Skip if already processed
      if (bus.status !== 'pending') continue;
      
      try {
        const payload = {
          ...bus,
          organization_id: user.organization_id,
          status: "inactive", // default
        };
        
        // Remove the status field from the bus data before sending
        delete payload.status;

        const res = await fetch("http://localhost:5000/buses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const responseData = await res.json();

        if (res.ok && !responseData.error) {
          successCount++;
          setBulkData(prev => prev.map((item, index) => 
            index === i ? { ...item, status: 'success' } : item
          ));
        } else {
          errorCount++;
          const errorMessage = responseData.error || "Failed to add bus";
          setBulkData(prev => prev.map((item, index) => 
            index === i ? { ...item, status: 'error', error: errorMessage } : item
          ));
        }
      } catch (error) {
        errorCount++;
        setBulkData(prev => prev.map((item, index) => 
          index === i ? { ...item, status: 'error', error: error.message } : item
        ));
      }
    }

    setIsUploading(false);
    alert(`Upload completed!\nSuccess: ${successCount}\nErrors: ${errorCount}`);
  };

  return (
    <div>
      <div className="page-title">
        <h3>Bus Addition</h3>
      </div>
      <div className="page-content add-bus-content">
        <div className="dashboard-card add-bus-card mb-4 d-flex flex-column">
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
              <div className="col-md-6">
                <label htmlFor="driver_email" className="form-label">
                  Driver Email
                </label>
                <input
                  type="email"
                  id="driver_email"
                  name="driver_email"
                  className="form-control"
                  value={newBus.driver_email}
                  onChange={handleInputChange}
                  required
                  autocomplete="new-email"
                  placeholder="Enter driver email"
                />
              </div>
            </div>

            <div className="row g-3 mt-2">
              <div className="col-md-6">
                <label htmlFor="driver_password" className="form-label">
                  Driver Password
                </label>
                <input
                  type="password"
                  id="driver_password"
                  name="driver_password"
                  className="form-control"
                  value={newBus.driver_password}
                  onChange={handleInputChange}
                  required
                  minLength="6"
                  placeholder="Minimum 6 characters"
                  autocomplete="new-password"
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
        <div className="dashboard-card add-bus-card mb-4 d-flex flex-column">
          <h4 className="mb-3">
            <FaFileExcel className="me-2" />
            Bulk Upload from Excel
          </h4>
          
          <div className="row g-3">
            <div className="col-md-12">
              <label htmlFor="bulkFile" className="form-label">
                Upload Excel/CSV File (.xlsx, .xls, .csv)
              </label>
              <input
                type="file"
                id="bulkFile"
                className="form-control"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <small className="form-text text-muted">
                File should contain columns for Plate Number, Driver Name, Driver Phone, Driver Email, Driver Password, Capacity, and Company
              </small>
            </div>
          </div>

          {isUploading && (
            <div className="mt-3">
              <div className="d-flex align-items-center">
                <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                <span>Processing file...</span>
              </div>
            </div>
          )}

          {bulkData.length > 0 && (
            <div className="mt-3">
              <div className="alert alert-info">
                <strong>Ready to upload:</strong> {bulkData.length} buses found
                <button
                  className="btn btn-primary btn-sm ms-3"
                  onClick={() => setShowBulkPreview(true)}
                >
                  Preview Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Preview Modal */}
      {showBulkPreview && (
        <div className="modal fade show" style={{ display: "block" }} tabIndex="-1">
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FaFileExcel className="me-2" />
                  Bulk Upload Preview ({bulkData.length} buses)
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowBulkPreview(false)}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body">
                <div className="table-responsive" style={{ maxHeight: "400px", overflowY: "auto" }}>
                  <table className="table table-striped table-hover">
                    <thead className="table-dark sticky-top">
                      <tr>
                        <th>#</th>
                        <th>Plate Number</th>
                        <th>Driver Name</th>
                        <th>Driver Phone</th>
                        <th>Driver Email</th>
                        <th>Password</th>
                        <th>Capacity</th>
                        <th>Company</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkData.map((bus, index) => (
                        <tr key={index}>
                          <td>{index + 1}</td>
                          <td>{bus.plate_number}</td>
                          <td>{bus.driver_name}</td>
                          <td>{bus.driver_phone_num}</td>
                          <td>{bus.driver_email}</td>
                          <td>{'*'.repeat(bus.driver_password.length)}</td>
                          <td>{bus.capacity}</td>
                          <td>{bus.company}</td>
                          <td>
                            {bus.status === 'pending' && (
                              <span className="badge bg-warning">Pending</span>
                            )}
                            {bus.status === 'success' && (
                              <span className="badge bg-success">Success</span>
                            )}
                            {bus.status === 'error' && (
                              <span className="badge bg-danger" title={bus.error}>
                                Error
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {bulkData.some(item => item.status === 'error') && (
                  <div className="alert alert-warning mt-3">
                    <strong>Note:</strong> Some items have errors. Hover over error badges to see details.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowBulkPreview(false)}
                >
                  Close
                </button>
                {bulkData.some(item => item.status === 'pending') && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={processBulkUpload}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1"></span>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <FaUpload className="me-1" />
                        Upload All ({bulkData.filter(item => item.status === 'pending').length})
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {showBulkPreview && <div className="modal-backdrop fade show"></div>}
    </div>
  );
}
