import React, { useState, useEffect } from "react";
import ManagementTable from "../../../components/admin/AdminManagement";
import "../../../styles/admin/admin-management.css";
import { FaMapMarkerAlt, FaTimes } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

export default function DestinationManagement() {
  const user = JSON.parse(localStorage.getItem("user"));
  const orgId = user?.organization_id;
  const navigate = useNavigate();
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);

  // Load Leaflet CSS and JS when modal opens
  useEffect(() => {
    if (showMapModal && selectedLocation) {
      // Load Leaflet CSS
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      cssLink.crossOrigin = '';
      document.head.appendChild(cssLink);

      // Load Leaflet JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';
      
      script.onload = () => {
        // Initialize map after Leaflet loads
        setTimeout(() => {
          initializeMap();
        }, 100);
      };
      
      document.head.appendChild(script);

      // Cleanup function
      return () => {
        document.head.removeChild(cssLink);
        document.head.removeChild(script);
      };
    }
  }, [showMapModal, selectedLocation]);

  const initializeMap = () => {
    if (!selectedLocation || !window.L) return;

    const mapContainer = document.getElementById('leaflet-map');
    if (!mapContainer) return;

    // Clear any existing map
    mapContainer.innerHTML = '';

    try {
      // Create map
      const map = window.L.map('leaflet-map').setView(
        [selectedLocation.latitude, selectedLocation.longitude], 
        15
      );

      // Add OpenStreetMap tiles
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Add marker
      const marker = window.L.marker([selectedLocation.latitude, selectedLocation.longitude])
        .addTo(map)
        .bindPopup(`<b>${selectedLocation.name}</b><br>Lat: ${selectedLocation.latitude?.toFixed(6)}<br>Lng: ${selectedLocation.longitude?.toFixed(6)}`)
        .openPopup();

    } catch (error) {
      console.error('Error initializing map:', error);
      document.getElementById('leaflet-map').innerHTML = '<div class="alert alert-warning">Map failed to load. Please try again.</div>';
    }
  };

  // Custom render for destination name (non-clickable)
  const renderDestinationName = (destination) => (
    <span className="destination-name">
      {destination.name}
    </span>
  );

  // Custom render for map button
  const renderMapButton = (destination) => (
    <button
      className="btn btn-sm btn-outline-primary"
      onClick={() => openMapModal(destination)}
      title={`View ${destination.name} on map`}
    >
      <FaMapMarkerAlt className="me-1" />
      View on Map
    </button>
  );

  const openMapModal = (destination) => {
    setSelectedLocation(destination);
    setShowMapModal(true);
  };

  const closeMapModal = () => {
    setShowMapModal(false);
    setSelectedLocation(null);
  };

  return (
    <>
      <ManagementTable
        fetchUrl={`http://localhost:5000/destinations/organization/${orgId}`}
        updateUrl={(id) => `http://localhost:5000/destinations/${id}`}
        deleteUrl={(id) => `http://localhost:5000/destinations/${id}`}
        searchFields={[
          "name",
          "latitude",
          "longitude",
        ]}
        statusOptions={[]}
        itemLabel="Destination"
        itemKey="location_id"
        pageTitle="Destination Management"
        columns={[
          {
            key: "name",
            label: "Destination Name",
            editable: true,
            inputType: "text",
            render: renderDestinationName,
          },
          {
            key: "latitude",
            label: "Latitude",
            editable: true,
            inputType: "number",
            step: "any",
          },
          {
            key: "longitude",
            label: "Longitude",
            editable: true,
            inputType: "number",
            step: "any",
          },
          {
            key: "map_view",
            label: "Location",
            editable: false,
            render: renderMapButton,
          },
        ]}
      />

      {/* Map Modal */}
      {showMapModal && selectedLocation && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FaMapMarkerAlt className="me-2" />
                  {selectedLocation.name} - Location Map
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closeMapModal}
                  aria-label="Close"
                >
                </button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <strong>Coordinates:</strong> {selectedLocation.latitude?.toFixed(6)}, {selectedLocation.longitude?.toFixed(6)}
                </div>
                <div 
                  id="leaflet-map" 
                  style={{ 
                    height: '400px', 
                    width: '100%', 
                    borderRadius: '8px',
                    border: '1px solid #ddd'
                  }}
                >
                  <div className="d-flex justify-content-center align-items-center" style={{ height: '100%' }}>
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Loading map...</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="row">
                    <div className="col-md-6">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${selectedLocation.latitude}&mlon=${selectedLocation.longitude}&zoom=15`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary btn-sm"
                      >
                        <FaMapMarkerAlt className="me-1" />
                        Open in OpenStreetMap
                      </a>
                    </div>
                    <div className="col-md-6 text-end">
                      <a
                        href={`https://www.google.com/maps?q=${selectedLocation.latitude},${selectedLocation.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        Open in Google Maps
                      </a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeMapModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
