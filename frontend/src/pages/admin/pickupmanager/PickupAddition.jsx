import React, { useState, useEffect } from "react";
import "../../../styles/admin/busmanager/admin-bus-addition.css";
import "../../../styles/admin/pickupmanager/admin-pickup-addition.css";
import { FaMapMarkerAlt, FaSearch, FaEye, FaUpload, FaFileExcel } from "react-icons/fa";

export default function PickupAddition() {
  const user = JSON.parse(localStorage.getItem("user"));

  const [newPickupLocation, setNewPickupLocation] = useState({
    name: "",
    type: "Public",
    latitude: "",
    longitude: "",
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [bulkData, setBulkData] = useState([]);
  const [showBulkPreview, setShowBulkPreview] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewPickupLocation((prev) => ({ ...prev, [name]: value }));
  };

  // Geocoding function to search for location (Singapore only)
  const searchLocation = async () => {
    if (!searchQuery.trim()) {
      alert("Please enter a location name to search.");
      return;
    }

    setIsSearching(true);
    try {
      // Add Singapore constraint to the search query
      const searchQueryWithCountry = `${searchQuery}, Singapore`;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQueryWithCountry
        )}&countrycodes=sg&limit=1&addressdetails=1&bounded=1&viewbox=103.6,1.2,104.1,1.5`
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const location = data[0];
        setNewPickupLocation((prev) => ({
          ...prev,
          latitude: location.lat,
          longitude: location.lon,
        }));
        alert(`Found: ${location.display_name}`);
      } else {
        alert("Location not found. Please try a different search term.");
      }
    } catch (error) {
      alert("Error searching for location: " + error.message);
    } finally {
      setIsSearching(false);
    }
  };

  // Load Leaflet library dynamically
  const loadLeaflet = () => {
    return new Promise((resolve) => {
      if (window.L) {
        resolve();
        return;
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);

      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = resolve;
      document.head.appendChild(script);
    });
  };

  // Initialize map preview
  const initializeMap = async () => {
    if (!newPickupLocation.latitude || !newPickupLocation.longitude) {
      console.log('No coordinates available for map');
      return;
    }

    console.log('Loading Leaflet...');
    await loadLeaflet();
    
    const mapContainer = document.getElementById("previewMap");
    if (!mapContainer) {
      console.error('Map container not found');
      return;
    }

    console.log('Initializing map with coordinates:', newPickupLocation.latitude, newPickupLocation.longitude);
    
    // Clear any existing map
    if (mapContainer._leaflet_id) {
      mapContainer._leaflet_id = null;
    }
    mapContainer.innerHTML = "";

    try {
      const map = window.L.map("previewMap").setView(
        [parseFloat(newPickupLocation.latitude), parseFloat(newPickupLocation.longitude)], 
        15
      );

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      window.L.marker([parseFloat(newPickupLocation.latitude), parseFloat(newPickupLocation.longitude)])
        .addTo(map)
        .bindPopup(newPickupLocation.name || "Selected Location")
        .openPopup();

      setMapLoaded(true);
      console.log('Map initialized successfully');
    } catch (error) {
      console.error('Error initializing map:', error);
      mapContainer.innerHTML = '<div class="alert alert-danger">Error loading map. Please try again.</div>';
    }
  };

  // Show map preview
  const showMapPreview = async () => {
    if (!newPickupLocation.latitude || !newPickupLocation.longitude) {
      alert("Please set coordinates first.");
      return;
    }

    console.log('Opening map preview modal');
    setShowPreview(true);
    
    // Wait for modal to render, then initialize map
    setTimeout(() => {
      console.log('Initializing map after modal render');
      initializeMap();
    }, 200); // Increased delay to ensure modal is fully rendered
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
      name: null,
      type: null,
      latitude: null,
      longitude: null
    };

    headers.forEach((header, index) => {
      if (!header) return;
      
      const headerStr = header.toString().trim().toLowerCase();
      console.log(`Checking header "${header}" -> "${headerStr}" at index ${index}`);
      
      // Check for name column
      if ((headerStr.includes('name') || headerStr.includes('pickup') || headerStr.includes('location') || headerStr.includes('place')) && columnMap.name === null) {
        columnMap.name = index;
        console.log(`Name column found at index ${index}: "${header}"`);
      }
      
      // Check for type column
      if ((headerStr.includes('type') || headerStr.includes('category')) && columnMap.type === null) {
        columnMap.type = index;
        console.log(`Type column found at index ${index}: "${header}"`);
      }
      
      // Check for latitude column
      if ((headerStr === 'lat' || headerStr === 'latitude') && columnMap.latitude === null) {
        columnMap.latitude = index;
        console.log(`Latitude column found at index ${index}: "${header}"`);
      }
      
      // Check for longitude column
      if ((headerStr === 'lng' || headerStr === 'lon' || headerStr === 'long' || headerStr === 'longitude' || headerStr === 'longtitude') && columnMap.longitude === null) {
        columnMap.longitude = index;
        console.log(`Longitude column found at index ${index}: "${header}"`);
      }
    });

    console.log('Final column map:', columnMap);
    return columnMap;
  };

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/)) {
      alert("Please upload an Excel file (.xlsx or .xls)");
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

      if (columnMap.name === null || columnMap.latitude === null || columnMap.longitude === null) {
        alert(`Could not detect required columns. Please ensure your file has columns for:
        - Name (containing 'name', 'pickup', 'location', etc.)
        - Latitude (containing 'lat', 'latitude')
        - Longitude (containing 'lng', 'lon', 'long', 'longitude')
        - Type (optional - containing 'type', 'category')`);
        return;
      }

      const processedData = [];
      
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const name = row[columnMap.name];
        const type = columnMap.type !== null ? row[columnMap.type] : 'Public';
        const lat = parseFloat(row[columnMap.latitude]);
        const lng = parseFloat(row[columnMap.longitude]);

        // Skip empty rows
        if (!name || isNaN(lat) || isNaN(lng)) continue;

        // Validate Singapore coordinates
        if (lat < 1.2 || lat > 1.5 || lng < 103.6 || lng > 104.1) {
          console.warn(`Skipping ${name}: coordinates outside Singapore range`);
          continue;
        }

        processedData.push({
          name: name.toString(),
          type: type ? type.toString() : 'Public',
          latitude: lat,
          longitude: lng,
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
      const pickupLocation = bulkData[i];
      
      // Skip if already processed
      if (pickupLocation.status !== 'pending') continue;
      
      try {
        const payload = {
          name: pickupLocation.name,
          type: pickupLocation.type,
          latitude: pickupLocation.latitude,
          longitude: pickupLocation.longitude,
          organization_id: user.organization_id,
        };

        const res = await fetch("http://localhost:5000/pickup-locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          successCount++;
          setBulkData(prev => prev.map((item, index) => 
            index === i ? { ...item, status: 'success' } : item
          ));
        } else {
          errorCount++;
          const errorData = await res.json();
          setBulkData(prev => prev.map((item, index) => 
            index === i ? { ...item, status: 'error', error: errorData.error } : item
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

  const handleNewPickupLocationSubmit = async (e) => {
    e.preventDefault();

    if (
      !newPickupLocation.name ||
      !newPickupLocation.latitude ||
      !newPickupLocation.longitude
    ) {
      alert("Please fill all required fields.");
      return;
    }

    // Validate coordinates
    const lat = parseFloat(newPickupLocation.latitude);
    const lng = parseFloat(newPickupLocation.longitude);
    
    if (isNaN(lat) || isNaN(lng)) {
      alert("Please enter valid latitude and longitude values.");
      return;
    }

    if (lat < 1.2 || lat > 1.5) {
      alert("Latitude must be between 1.2 and 1.5 degrees (Singapore range).");
      return;
    }

    if (lng < 103.6 || lng > 104.1) {
      alert("Longitude must be between 103.6 and 104.1 degrees (Singapore range).");
      return;
    }

    const payload = {
      ...newPickupLocation,
      latitude: lat,
      longitude: lng,
      organization_id: user.organization_id,
    };

    try {
      const res = await fetch("http://localhost:5000/pickup-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert("Pickup location added successfully!");
        setNewPickupLocation({
          name: "",
          type: "Public",
          latitude: "",
          longitude: "",
        });
      } else {
        const data = await res.json();
        alert(`Error: ${data.error || "Failed to add pickup location"}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="page-title">
        <h3>Pickup Location Addition</h3>
      </div>
      <div className="page-content add-bus-content">
        <div className="dashboard-card add-bus-card mb-4 d-flex flex-column">
          <h4 className="mb-3">Add New Pickup Location</h4>
          <form className="add-bus-form" onSubmit={handleNewPickupLocationSubmit}>
            <div className="row g-3">
              <div className="col-md-8">
                <label htmlFor="name" className="form-label">
                  Pickup Location Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  className="form-control"
                  value={newPickupLocation.name}
                  onChange={handleInputChange}
                  placeholder="e.g., Changi Airport T3, Raffles Bus Stop"
                  required
                />
              </div>
              <div className="col-md-4">
                <label htmlFor="type" className="form-label">
                  Location Type
                </label>
                <select
                  id="type"
                  name="type"
                  className="form-control"
                  value={newPickupLocation.type}
                  onChange={handleInputChange}
                >
                  <option value="Public">Public</option>
                  <option value="Private">Private</option>
                  <option value="School">School</option>
                  <option value="Office">Office</option>
                </select>
              </div>
            </div>

            <div className="row g-3 mt-2">
              <div className="col-md-12">
                <label htmlFor="searchQuery" className="form-label">
                  Search Location by Name
                </label>
                <div className="input-group pickup-input-group">
                  <input
                    type="text"
                    id="searchQuery"
                    className="form-control"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g., Changi Airport, Marina Bay Sands, NUS"
                  />
                  <button
                    type="button"
                    className="btn btn-outline-primary pickup-search-btn"
                    onClick={searchLocation}
                    disabled={isSearching}
                  >
                    {isSearching ? (
                      <>
                        <span className="spinner-border pickup-loading-spinner" role="status" aria-hidden="true"></span>
                        Searching...
                      </>
                    ) : (
                      <>
                        <FaSearch className="pickup-btn-icon" />
                        Search
                      </>
                    )}
                  </button>
                </div>
                <small className="pickup-form-helper">
                  Search for any location in Singapore to automatically get coordinates
                </small>
              </div>
            </div>

            <div className="row g-3 mt-2">
              <div className="col-md-5">
                <label htmlFor="latitude" className="form-label">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  id="latitude"
                  name="latitude"
                  className="form-control"
                  value={newPickupLocation.latitude}
                  onChange={handleInputChange}
                  placeholder="e.g., 1.3644"
                  required
                />
              </div>
              <div className="col-md-5">
                <label htmlFor="longitude" className="form-label">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  id="longitude"
                  name="longitude"
                  className="form-control"
                  value={newPickupLocation.longitude}
                  onChange={handleInputChange}
                  placeholder="e.g., 103.9915"
                  required
                />
              </div>
              <div className="col-md-2 d-flex align-items-end">
                <button
                  type="button"
                  className="btn btn-outline-success pickup-preview-btn"
                  onClick={showMapPreview}
                  disabled={!newPickupLocation.latitude || !newPickupLocation.longitude}
                  title="Preview location on map"
                >
                  <FaEye className="pickup-btn-icon" />
                  Preview
                </button>
              </div>
            </div>

            {newPickupLocation.latitude && newPickupLocation.longitude && (
              <div className="row g-3 mt-2">
                <div className="col-12">
                  <div className="pickup-coordinates-preview">
                    <FaMapMarkerAlt className="pickup-icon" />
                    <strong>Preview:</strong> {newPickupLocation.name || "Pickup Location"} ({newPickupLocation.type}) will be located at{" "}
                    {parseFloat(newPickupLocation.latitude).toFixed(6)}, {parseFloat(newPickupLocation.longitude).toFixed(6)}
                  </div>
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-primary mt-4">
              Add Pickup Location
            </button>
          </form>
        </div>

        {/* Bulk Upload Card */}
        <div className="dashboard-card add-bus-card mb-4 d-flex flex-column">
          <h4 className="mb-3">
            <FaFileExcel className="pickup-btn-icon" />
            Bulk Upload from Excel
          </h4>
          
          <div className="row g-3">
            <div className="col-md-12">
              <label htmlFor="bulkFile" className="form-label">
                Upload Excel File (.xlsx, .xls)
              </label>
              <input
                type="file"
                id="bulkFile"
                className="form-control"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <small className="pickup-file-helper">
                File should contain columns for Name, Type (optional), Latitude, and Longitude
              </small>
            </div>
          </div>

          {isUploading && (
            <div className="pickup-upload-progress">
              <div className="spinner-border pickup-upload-spinner" role="status"></div>
              <span className="pickup-loading-text">Processing file...</span>
            </div>
          )}

          {bulkData.length > 0 && (
            <div className="pickup-ready-upload">
              <strong>Ready to upload:</strong> {bulkData.length} pickup locations found
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowBulkPreview(true)}
              >
                Preview Data
              </button>
            </div>
          )}
        </div>

        {/* Information Card */}
        <div className="dashboard-card add-bus-card mb-4 d-flex flex-column">
          <h4 className="mb-3">Pickup Location Guidelines</h4>
          <div className="pickup-guidelines-card">
            <h6 className="pickup-guidelines-title">How to find pickup locations in Singapore:</h6>
            <ul className="pickup-guidelines-list">
              <li>Search with specific Singapore locations (e.g., "Changi Airport T3", "Marina Bay Sands")</li>
              <li>Include MRT station names for better accuracy (e.g., "Raffles Place MRT")</li>
              <li>Search by postal codes (e.g., "018956" for Marina Bay Sands)</li>
              <li>Preview the location on the map to verify it's correct</li>
              <li>Choose appropriate type: Public, Private, School, or Office</li>
            </ul>
            <h6 className="pickup-guidelines-title">Singapore coordinate ranges:</h6>
            <ul className="pickup-guidelines-list">
              <li><strong>Latitude:</strong> 1.2° to 1.5° North</li>
              <li><strong>Longitude:</strong> 103.6° to 104.1° East</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Map Preview Modal */}
      {showPreview && (
        <div className="modal fade show pickup-addition-modal" tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FaMapMarkerAlt className="pickup-modal-icon" />
                  Location Preview: {newPickupLocation.name || "Selected Location"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowPreview(false)}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body">
                <div className="pickup-coordinates-display">
                  <strong>Type:</strong> {newPickupLocation.type} | <strong>Coordinates:</strong> {parseFloat(newPickupLocation.latitude).toFixed(6)}, {parseFloat(newPickupLocation.longitude).toFixed(6)}
                </div>
                <div id="previewMap" className="pickup-addition-map-container">
                  <div className="pickup-addition-map-loading">
                    <div className="spinner-border" role="status">
                      <span className="visually-hidden">Loading map...</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowPreview(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showPreview && <div className="modal-backdrop fade show pickup-addition-modal-backdrop"></div>}

      {/* Bulk Preview Modal */}
      {showBulkPreview && (
        <div className="modal fade show pickup-addition-modal" tabIndex="-1">
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FaFileExcel className="pickup-modal-icon" />
                  Bulk Upload Preview ({bulkData.length} pickup locations)
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowBulkPreview(false)}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body">
                <div className="pickup-bulk-table-container">
                  <table className="table table-striped table-hover pickup-bulk-table">
                    <thead className="table-dark sticky-top">
                      <tr>
                        <th>#</th>
                        <th>Pickup Location Name</th>
                        <th>Type</th>
                        <th>Latitude</th>
                        <th>Longitude</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkData.map((pickupLocation, index) => (
                        <tr key={index}>
                          <td>{index + 1}</td>
                          <td>{pickupLocation.name}</td>
                          <td>
                            <span className={`pickup-type-badge ${pickupLocation.type?.toLowerCase()}`}>
                              {pickupLocation.type}
                            </span>
                          </td>
                          <td>{pickupLocation.latitude.toFixed(6)}</td>
                          <td>{pickupLocation.longitude.toFixed(6)}</td>
                          <td>
                            {pickupLocation.status === 'pending' && (
                              <span className="badge pickup-status-badge pickup-status-pending">Pending</span>
                            )}
                            {pickupLocation.status === 'success' && (
                              <span className="badge pickup-status-badge pickup-status-success">Success</span>
                            )}
                            {pickupLocation.status === 'error' && (
                              <span className="badge pickup-status-badge pickup-status-error" title={pickupLocation.error}>
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
                  <div className="pickup-bulk-warning">
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
                        <span className="spinner-border pickup-loading-spinner"></span>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <FaUpload className="pickup-btn-icon" />
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
      {showBulkPreview && <div className="modal-backdrop fade show pickup-addition-modal-backdrop"></div>}
    </div>
  );
}
