import React, { useState, useEffect } from "react";
import ManagementTable from "../../../components/admin/AdminManagement";
import "../../../styles/admin/admin-management.css";
import "../../../styles/admin/pickupmanager/admin-pickup-manager.css";
import { FaMapMarkerAlt, FaTimes } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

export default function PickupManagement() {
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

  // Custom render for pickup location name (non-clickable)
  const renderPickupLocationName = (pickupLocation) => (
    <span className="pickup-location-name">
      {pickupLocation.name}
    </span>
  );

  // Custom render for pickup type
  const renderPickupType = (pickupLocation) => (
    <span className={`pickup-type-badge ${pickupLocation.type?.toLowerCase()}`}>
      {pickupLocation.type || 'Public'}
    </span>
  );

  // Custom render for map button
  const renderMapButton = (pickupLocation) => (
    <button
      className="btn pickup-view-map-btn"
      onClick={() => openMapModal(pickupLocation)}
      title={`View ${pickupLocation.name} on map`}
    >
      <FaMapMarkerAlt className="pickup-map-btn-icon" />
      View on Map
    </button>
  );

  const openMapModal = (pickupLocation) => {
    setSelectedLocation(pickupLocation);
    setShowMapModal(true);
  };

  const closeMapModal = () => {
    setShowMapModal(false);
    setSelectedLocation(null);
  };

  return (
    <>
      <ManagementTable
        fetchUrl={`http://localhost:5000/pickup-locations/organization/${orgId}`}
        updateUrl={(id) => `http://localhost:5000/pickup-locations/${id}`}
        deleteUrl={(id) => `http://localhost:5000/pickup-locations/${id}`}
        searchFields={[
          "name",
          "type",
          "latitude",
          "longitude",
        ]}
        statusOptions={[]}
        itemLabel="Pickup Location"
        itemKey="pickup_id"
        pageTitle="Pickup Location Management"
        columns={[
          {
            key: "name",
            label: "Pickup Location Name",
            editable: true,
            inputType: "text",
            render: renderPickupLocationName,
          },
          {
            key: "type",
            label: "Type",
            editable: true,
            inputType: "select",
            options: [
              { value: "Public", label: "Public" },
              { value: "Private", label: "Private" },
              { value: "School", label: "School" },
              { value: "Office", label: "Office" },
            ],
            render: renderPickupType,
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
        <div className="modal fade show pickup-map-modal">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FaMapMarkerAlt className="pickup-modal-header-icon" />
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
                <div className="pickup-coordinates">
                  <strong>Type:</strong> {selectedLocation.type || 'Public'} | <strong>Coordinates:</strong> {selectedLocation.latitude?.toFixed(6)}, {selectedLocation.longitude?.toFixed(6)}
                </div>
                <div 
                  id="leaflet-map" 
                  className="pickup-map-container"
                >
                  <div className="pickup-map-loading">
                    <div className="spinner-border pickup-map-spinner" role="status">
                      <span className="visually-hidden">Loading map...</span>
                    </div>
                  </div>
                </div>
                <div className="pickup-map-actions">
                  <div className="row">
                    <div className="col-md-6">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${selectedLocation.latitude}&mlon=${selectedLocation.longitude}&zoom=15`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pickup-external-map-btn openstreetmap"
                      >
                        <FaMapMarkerAlt className="pickup-map-btn-icon" />
                        Open in OpenStreetMap
                      </a>
                    </div>
                    <div className="col-md-6 text-end">
                      <a
                        href={`https://www.google.com/maps?q=${selectedLocation.latitude},${selectedLocation.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pickup-external-map-btn googlemaps"
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
