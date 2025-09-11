import React, { useState, useEffect } from "react";
import "../../../styles/admin/busmanager/admin-bus-addition.css";
import { FaMapMarkerAlt, FaSearch, FaEye, FaUpload, FaFileExcel } from "react-icons/fa";

export default function DestinationAddition() {
  const user = JSON.parse(localStorage.getItem("user"));

  const [newDestination, setNewDestination] = useState({
    name: "",
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
    setNewDestination((prev) => ({ ...prev, [name]: value }));
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
        setNewDestination((prev) => ({
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
    if (!newDestination.latitude || !newDestination.longitude) return;

    await loadLeaflet();
    
    const mapContainer = document.getElementById("previewMap");
    if (mapContainer._leaflet_id) {
      mapContainer._leaflet_id = null;
    }
    mapContainer.innerHTML = "";

    const map = window.L.map("previewMap").setView(
      [parseFloat(newDestination.latitude), parseFloat(newDestination.longitude)], 
      15
    );

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    window.L.marker([parseFloat(newDestination.latitude), parseFloat(newDestination.longitude)])
      .addTo(map)
      .bindPopup(newDestination.name || "Selected Location")
      .openPopup();

    setMapLoaded(true);
  };

  // Show map preview
  const showMapPreview = async () => {
    if (!newDestination.latitude || !newDestination.longitude) {
      alert("Please set coordinates first.");
      return;
    }
    setShowPreview(true);
    setTimeout(initializeMap, 100); // Small delay to ensure modal is rendered
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
    console.log('Headers received:', headers); // Debug log
    console.log('Headers length:', headers.length); // Debug log
    
    const columnMap = {
      name: null,
      latitude: null,
      longitude: null
    };

    headers.forEach((header, index) => {
      if (!header) return; // Skip empty headers
      
      const headerStr = header.toString().trim().toLowerCase();
      console.log(`Checking header "${header}" -> "${headerStr}" at index ${index}`); // Debug log
      
      // Check for name column (more flexible)
      if ((headerStr.includes('name') || headerStr.includes('hotel') || headerStr.includes('destination') || headerStr.includes('location') || headerStr.includes('place')) && columnMap.name === null) {
        columnMap.name = index;
        console.log(`Name column found at index ${index}: "${header}"`);
      }
      
      // Check for latitude column
      if ((headerStr === 'lat' || headerStr === 'latitude') && columnMap.latitude === null) {
        columnMap.latitude = index;
        console.log(`Latitude column found at index ${index}: "${header}"`);
      }
      
      // Check for longitude column (including common typos)
      if ((headerStr === 'lng' || headerStr === 'lon' || headerStr === 'long' || headerStr === 'longitude' || headerStr === 'longtitude') && columnMap.longitude === null) {
        columnMap.longitude = index;
        console.log(`Longitude column found at index ${index}: "${header}"`);
      }
    });

    console.log('Final column map:', columnMap); // Debug log
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
        - Name (containing 'name', 'hotel', 'destination', etc.)
        - Latitude (containing 'lat', 'latitude')
        - Longitude (containing 'lng', 'lon', 'long', 'longitude')`);
        return;
      }

      const processedData = [];
      
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const name = row[columnMap.name];
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
      const destination = bulkData[i];
      
      // Skip if already processed
      if (destination.status !== 'pending') continue;
      
      try {
        const payload = {
          name: destination.name,
          latitude: destination.latitude,
          longitude: destination.longitude,
          organization_id: user.organization_id,
        };

        const res = await fetch("http://localhost:5000/destinations", {
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

  const handleNewDestinationSubmit = async (e) => {
    e.preventDefault();

    if (
      !newDestination.name ||
      !newDestination.latitude ||
      !newDestination.longitude
    ) {
      alert("Please fill all fields.");
      return;
    }

    // Validate coordinates
    const lat = parseFloat(newDestination.latitude);
    const lng = parseFloat(newDestination.longitude);
    
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
      ...newDestination,
      latitude: lat,
      longitude: lng,
      organization_id: user.organization_id,
    };

    try {
      const res = await fetch("http://localhost:5000/destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert("Destination added successfully!");
        setNewDestination({
          name: "",
          latitude: "",
          longitude: "",
        });
      } else {
        const data = await res.json();
        alert(`Error: ${data.error || "Failed to add destination"}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  // Function to get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setNewDestination((prev) => ({
            ...prev,
            latitude: position.coords.latitude.toString(),
            longitude: position.coords.longitude.toString(),
          }));
        },
        (error) => {
          alert("Error getting location: " + error.message);
        }
      );
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  };

  return (
    <div>
      <div className="page-title">
        <h3>Destination Addition</h3>
      </div>
      <div className="page-content add-bus-content">
        <div className="dashboard-card add-bus-card mb-4 d-flex flex-column">
          <h4 className="mb-3">Add New Destination</h4>
          <form className="add-bus-form" onSubmit={handleNewDestinationSubmit}>
            <div className="row g-3">
              <div className="col-md-12">
                <label htmlFor="name" className="form-label">
                  Destination Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  className="form-control"
                  value={newDestination.name}
                  onChange={handleInputChange}
                  placeholder="e.g., Main Campus, Library, Sports Complex"
                  required
                />
              </div>
            </div>

            <div className="row g-3 mt-2">
              <div className="col-md-12">
                <label htmlFor="searchQuery" className="form-label">
                  Search Location by Name
                </label>
                <div className="input-group">
                  <input
                    type="text"
                    id="searchQuery"
                    className="form-control"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g., Orchard Road, Marina Bay Sands, NUS"
                  />
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={searchLocation}
                    disabled={isSearching}
                  >
                    {isSearching ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                        Searching...
                      </>
                    ) : (
                      <>
                        <FaSearch className="me-1" />
                        Search
                      </>
                    )}
                  </button>
                </div>
                <small className="form-text text-muted">
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
                  value={newDestination.latitude}
                  onChange={handleInputChange}
                  placeholder="e.g., 3.1390"
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
                  value={newDestination.longitude}
                  onChange={handleInputChange}
                  placeholder="e.g., 101.6869"
                  required
                />
              </div>
              <div className="col-md-2 d-flex align-items-end">
                <button
                  type="button"
                  className="btn btn-outline-success w-100"
                  onClick={showMapPreview}
                  disabled={!newDestination.latitude || !newDestination.longitude}
                  title="Preview location on map"
                >
                  <FaEye className="me-1" />
                  Preview
                </button>
              </div>
            </div>

            {newDestination.latitude && newDestination.longitude && (
              <div className="row g-3 mt-2">
                <div className="col-12">
                  <div className="alert alert-info">
                    <FaMapMarkerAlt className="me-2" />
                    <strong>Preview:</strong> {newDestination.name || "Destination"} will be located at{" "}
                    {parseFloat(newDestination.latitude).toFixed(6)}, {parseFloat(newDestination.longitude).toFixed(6)}
                  </div>
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-primary mt-4">
              Add Destination
            </button>
          </form>
        </div>

        {/* Bulk Upload Card */}
        <div className="dashboard-card add-bus-card mb-4 d-flex flex-column">
          <h4 className="mb-3">
            <FaFileExcel className="me-2" />
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
              <small className="form-text text-muted">
                File should contain columns for Name, Latitude, and Longitude
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
                <strong>Ready to upload:</strong> {bulkData.length} destinations found
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

        {/* Information Card */}
        <div className="dashboard-card add-bus-card mb-4 d-flex flex-column">
          <h4 className="mb-3">Location Search Guidelines</h4>
          <div className="alert alert-light">
            <h6>How to find your destination in Singapore:</h6>
            <ul className="mb-2">
              <li>Search with specific Singapore locations (e.g., "Marina Bay Sands", "Orchard Road")</li>
              <li>Include MRT station names for better accuracy (e.g., "Raffles Place MRT")</li>
              <li>Search by postal codes (e.g., "018956" for Marina Bay Sands)</li>
              <li>Preview the location on the map to verify it's correct</li>
              <li>You can manually adjust coordinates if needed</li>
            </ul>
            <h6>Singapore coordinate ranges:</h6>
            <ul className="mb-0">
              <li><strong>Latitude:</strong> 1.2° to 1.5° North</li>
              <li><strong>Longitude:</strong> 103.6° to 104.1° East</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Map Preview Modal */}
      {showPreview && (
        <div className="modal fade show" style={{ display: "block" }} tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FaMapMarkerAlt className="me-2" />
                  Location Preview: {newDestination.name || "Selected Location"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowPreview(false)}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <strong>Coordinates:</strong> {parseFloat(newDestination.latitude).toFixed(6)}, {parseFloat(newDestination.longitude).toFixed(6)}
                </div>
                <div id="previewMap" style={{ height: "400px", width: "100%" }}>
                  <div className="d-flex justify-content-center align-items-center h-100">
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
      {showPreview && <div className="modal-backdrop fade show"></div>}

      {/* Bulk Preview Modal */}
      {showBulkPreview && (
        <div className="modal fade show" style={{ display: "block" }} tabIndex="-1">
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FaFileExcel className="me-2" />
                  Bulk Upload Preview ({bulkData.length} destinations)
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
                        <th>Destination Name</th>
                        <th>Latitude</th>
                        <th>Longitude</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkData.map((destination, index) => (
                        <tr key={index}>
                          <td>{index + 1}</td>
                          <td>{destination.name}</td>
                          <td>{destination.latitude.toFixed(6)}</td>
                          <td>{destination.longitude.toFixed(6)}</td>
                          <td>
                            {destination.status === 'pending' && (
                              <span className="badge bg-warning">Pending</span>
                            )}
                            {destination.status === 'success' && (
                              <span className="badge bg-success">Success</span>
                            )}
                            {destination.status === 'error' && (
                              <span className="badge bg-danger" title={destination.error}>
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
