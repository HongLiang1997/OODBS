import React, { useState, useEffect, useRef } from "react";
import "../../styles/driver/driver-dashboard.css";
import { FaRoute, FaMapMarkedAlt, FaClock, FaUsers, FaPlay, FaPause, FaStop, FaSignOutAlt, FaChevronUp } from "react-icons/fa";

// Google Maps API Key - Replace with your own key
const GOOGLE_MAPS_API_KEY = 'AIzaSyA8-KzovI2Gee5QfsCN1QrCrgvo9ai092s';

export default function DriverDashboard() {
  const driver = JSON.parse(localStorage.getItem("driver"));
  const [bottomNavOpen, setBottomNavOpen] = useState(false);
  const [driverStatus, setDriverStatus] = useState('off-duty');
  const [currentLocation, setCurrentLocation] = useState([1.3521, 103.8198]); // Singapore default
  const [gpsLoading, setGpsLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [routingService, setRoutingService] = useState(null);
  const [map, setMap] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [directionsService, setDirectionsService] = useState(null);
  const [directionsRenderer, setDirectionsRenderer] = useState(null);
  const [currentLocationMarker, setCurrentLocationMarker] = useState(null);
  const pendingScheduleRef = useRef(null);
  const mapContainer = useRef(null);

  // Load Google Maps API and initialize map
  useEffect(() => {
    const loadGoogleMaps = () => {
      return new Promise((resolve) => {
        if (window.google && window.google.maps) {
          resolve(window.google.maps);
          return;
        }
        
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          console.log('Google Maps API loaded successfully');
          resolve(window.google.maps);
        };
        script.onerror = (error) => {
          console.error('Google Maps API failed to load:', error);
          setLocationError('Failed to load Google Maps API - check your API key');
        };
        document.head.appendChild(script);
      });
    };

    if (mapContainer.current && !map) {
      loadGoogleMaps().then((googleMaps) => {
        try {
          console.log('Initializing Google Maps...');
          
          const mapInstance = new googleMaps.Map(mapContainer.current, {
            center: { lat: currentLocation[0], lng: currentLocation[1] },
            zoom: 18, // Closer zoom for driving
            tilt: 45, // 3D tilted view for driving
            heading: 0, // Will be updated with GPS heading
            mapTypeId: googleMaps.MapTypeId.ROADMAP,
            gestureHandling: 'greedy',
            zoomControl: true,
            zoomControlOptions: {
              position: googleMaps.ControlPosition.LEFT_CENTER
            },
            mapTypeControl: false,
            scaleControl: false, // Remove scale for cleaner driving view
            streetViewControl: false,
            rotateControl: false, // Disable manual rotation for driving mode
            fullscreenControl: false,
            styles: [
              {
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }] // Hide POI labels for cleaner view
              }
            ]
          });

          // Initialize directions service for actual driving routes
          const dirService = new googleMaps.DirectionsService();
          const dirRenderer = new googleMaps.DirectionsRenderer({
            suppressMarkers: true, // Hide A,B,C labels but keep route lines
            preserveViewport: true, // Don't auto-fit route to viewport
            polylineOptions: {
              strokeColor: '#007bff',
              strokeWeight: 4,
              strokeOpacity: 0.8
            }
          });
          
          dirRenderer.setMap(mapInstance);
          setDirectionsService(dirService);
          setDirectionsRenderer(dirRenderer);
          
          setMap(mapInstance);
          
          // Add default marker at Singapore (no GPS tracking yet)
          addCurrentLocationMarker(mapInstance, googleMaps, currentLocation[0], currentLocation[1]);
          
          console.log('Map ready - GPS will start when schedule is selected');
          
          console.log('Google Maps loaded successfully');
        } catch (error) {
          console.error('Map initialization error:', error);
          setLocationError('Failed to initialize map');
        }
      }).catch((error) => {
        console.error('Google Maps loading error:', error);
        setLocationError('Failed to load Google Maps');
      });
    }
  }, []);

  // Fetch driver schedules after map loads
  useEffect(() => {
    if (driver?.user_id && map) {
      fetchDriverSchedules();
    }
  }, [map]);

  const initializeTracking = (mapInstance, googleMaps) => {
    console.log('Starting GPS tracking...');
    
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported by browser');
      setGpsLoading(false);
      return;
    }

    // Get current position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('Got initial position:', position.coords);
        const { latitude, longitude } = position.coords;
        const newLocation = [latitude, longitude];
        setCurrentLocation(newLocation);
        setLocationError(null);
        setGpsLoading(false);
        setShowSkipButton(false);
        
        // Center map on actual location
        mapInstance.setCenter({ lat: latitude, lng: longitude });
        
        // Update marker position
        if (currentLocationMarker) {
          currentLocationMarker.setPosition({ lat: latitude, lng: longitude });
        }
        
        // Now that we have GPS location, draw the route if there's a pending schedule
        console.log('GPS success - Checking for pending schedule. Current pendingScheduleId:', pendingScheduleRef.current);
        if (pendingScheduleRef.current) {
          console.log('GPS location obtained - Drawing route now for schedule:', pendingScheduleRef.current);
          console.log('Using actual GPS coordinates:', latitude, longitude);
          const scheduleToFetch = pendingScheduleRef.current;
          pendingScheduleRef.current = null; // Clear pending route
          // Pass the actual GPS coordinates to route creation
          fetchRouteData(scheduleToFetch, [latitude, longitude]);
        } else {
          console.log('No pending schedule found after GPS success');
        }
        
        // Start continuous tracking with heading for driving navigation (after a delay)
        setTimeout(() => {
          const id = navigator.geolocation.watchPosition(
            (position) => {
              const { latitude, longitude, heading } = position.coords;
              setCurrentLocation([latitude, longitude]);
              
              // Only pan if we're actively tracking (don't interfere with initial zoom)
              if (isTracking) {
                mapInstance.panTo({ lat: latitude, lng: longitude });
              }
              
              // Update map heading if available (face the direction of travel)
              if (heading !== null && heading !== undefined) {
                mapInstance.setHeading(heading);
              }
              
              // Update marker with heading
              updateCurrentLocationMarker(latitude, longitude, heading);
            },
          (error) => {
            console.error('GPS tracking error:', error);
            setLocationError('GPS tracking unavailable');
            },
            (error) => {
              console.error('GPS tracking error:', error);
              setLocationError('GPS tracking unavailable');
            },
            {
              enableHighAccuracy: true,
              maximumAge: 2000, // More frequent updates for driving
              timeout: 8000
            }
          );
          setWatchId(id);
          setIsTracking(true);
        }, 2000); // Wait 2 seconds before starting continuous tracking
      },
      (error) => {
        console.error('Initial location error:', error);
        let errorMsg = 'Could not get your location';
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location access denied. Please allow location access.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Your location is currently unavailable.';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out.';
            break;
        }
        
        setLocationError(errorMsg);
        setGpsLoading(false);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000
      }
    );
  };

  const addCurrentLocationMarker = (mapInstance, googleMaps, lat, lng) => {
    const marker = new googleMaps.Marker({
      position: { lat, lng },
      map: mapInstance,
      icon: {
        path: 'M 0,-24 L 8,0 L 0,6 L -8,0 Z', // Arrow shape pointing forward
        scale: 1.5,
        fillColor: '#FF0000', // Red arrow for current location
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        rotation: 0 // Will be updated with GPS heading
      },
      title: 'Your Location - Driving Mode',
      zIndex: 1000
    });
    
    const infoWindow = new googleMaps.InfoWindow({
      content: `
        <div style="padding: 10px;">
          <strong>📍 Your Location</strong><br/>
          ${isTracking ? '<p style="color: green; margin: 5px 0;">🟢 GPS Tracking Active</p>' : ''}
          ${routingService ? `<p style="margin: 5px 0;">🗺️ ${routingService}</p>` : ''}
        </div>
      `
    });
    
    marker.addListener('click', () => {
      infoWindow.open(mapInstance, marker);
    });
    
    setCurrentLocationMarker(marker);
  };
  
  const updateCurrentLocationMarker = (lat, lng, heading = null) => {
    if (currentLocationMarker) {
      currentLocationMarker.setPosition({ lat, lng });
      
      // Update marker rotation to show driving direction
      if (heading !== null && heading !== undefined) {
        const icon = currentLocationMarker.getIcon();
        icon.rotation = heading;
        currentLocationMarker.setIcon(icon);
      }
    }
  };

  // Skip location and use default
  const skipLocationAndContinue = () => {
    console.log('Skipping location, using default');
    setLocationError(null);
    setShowSkipButton(false);
    setGpsLoading(false);
    setIsTracking(false);
    
    // Stop any ongoing location requests
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    
    if (map && window.google && window.google.maps) {
      const lat = 1.3521;
      const lng = 103.8198;
      map.setCenter({ lat, lng });
      // Update the existing marker instead of adding a new one
      if (currentLocationMarker) {
        currentLocationMarker.setPosition({ lat, lng });
      }
    }
  };

  // Cleanup tracking on unmount
  useEffect(() => {
    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  const fetchDriverSchedules = async () => {
    try {
      const response = await fetch(`http://localhost:5000/driver/schedules/${driver.user_id}`);
      if (response.ok) {
        const data = await response.json();
        setSchedules(data);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  };

  const fetchRouteData = async (scheduleId, actualGpsLocation = null) => {
    console.log('fetchRouteData called with scheduleId:', scheduleId);
    console.log('Actual GPS location provided:', actualGpsLocation);
    try {
      const response = await fetch(`http://localhost:5000/driver/route/${scheduleId}`);
      console.log('Route data response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('Route data received:', data);
        const stops = data.routes || [];
        
        if (map && stops.length > 0) {
          await createNavigationRoute(stops, actualGpsLocation);
        }
        
        setSelectedRoute({
          stops,
          isRouted: true
        });
      }
    } catch (error) {
      console.error('Error fetching route data:', error);
    }
  };

  const createNavigationRoute = async (stops, actualGpsLocation = null) => {
    if (!map || !directionsService || !directionsRenderer) return;
    
    console.log('Creating route with stops:', stops.length);
    console.log('Using GPS location:', actualGpsLocation || currentLocation);
    setRoutingService('Driving Navigation');
    
    // Use actual GPS location if provided, otherwise fall back to current state
    const startLocation = actualGpsLocation || currentLocation;
    
    // Add numbered stop markers first
    addStopMarkers(stops);
    
    if (stops.length > 0) {
      const validStops = stops.filter(stop => stop.latitude && stop.longitude);
      
      if (validStops.length > 0) {
        // Create waypoints from your pre-calculated sequence (maintain order)
        const waypoints = validStops.slice(0, -1).map(stop => ({
          location: { lat: stop.latitude, lng: stop.longitude },
          stopover: true
        }));
        
        const destination = validStops[validStops.length - 1];
        
        // Draw yellow route from current location to first stop (on roads)
        const firstStop = validStops[0];
        drawStartingRoute(startLocation, [firstStop.latitude, firstStop.longitude]);
        
        // Create route from first stop to destination (excluding starting point)
        const routeWaypoints = validStops.slice(1, -1).map(stop => ({
          location: { lat: stop.latitude, lng: stop.longitude },
          stopover: true
        }));
        
        const request = {
          origin: { lat: firstStop.latitude, lng: firstStop.longitude }, // Start from first stop
          destination: { lat: destination.latitude, lng: destination.longitude },
          waypoints: routeWaypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
          optimizeWaypoints: false, // Keep your pre-calculated sequence
          avoidHighways: false,
          avoidTolls: false
        };
        
        directionsService.route(request, (result, status) => {
          if (status === 'OK') {
            directionsRenderer.setDirections(result);
            console.log('Driving route created successfully');
            
            // Zoom to user's actual GPS location when route is loaded
            console.log('Zooming to actual GPS location:', startLocation);
            map.setCenter({ lat: startLocation[0], lng: startLocation[1] });
            map.setZoom(19); // Close zoom for driving navigation
          } else {
            console.error('Directions request failed:', status);
            // Fallback: Draw yellow route to first stop, then simple polyline for rest
            const firstStop = validStops[0];
            drawStartingRoute(startLocation, [firstStop.latitude, firstStop.longitude]);
            createSimplePolyline(validStops.slice(1)); // Route from first stop onward
            
            // Still zoom to user's actual location on fallback
            console.log('Fallback: Zooming to actual GPS location:', startLocation);
            map.setCenter({ lat: startLocation[0], lng: startLocation[1] });
            map.setZoom(19);
          }
        });
      }
    }
  };
  
  const drawStartingRoute = (startLocation, firstStopLocation) => {
    // Use Google Directions API for yellow route on actual roads
    if (!directionsService) return;
    
    console.log('Drawing yellow starting route on roads from GPS to first stop');
    
    // Create a separate DirectionsRenderer for the yellow starting route
    const startingRouteRenderer = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true, // Hide A,B markers
      preserveViewport: true, // Don't change zoom
      polylineOptions: {
        strokeColor: '#FFD700', // Yellow/Gold color
        strokeOpacity: 0.9,
        strokeWeight: 5, // Thicker than main route
        zIndex: 1 // Below main route
      }
    });
    
    startingRouteRenderer.setMap(map);
    
    const startingRequest = {
      origin: { lat: startLocation[0], lng: startLocation[1] },
      destination: { lat: firstStopLocation[0], lng: firstStopLocation[1] },
      travelMode: window.google.maps.TravelMode.DRIVING,
      avoidHighways: false,
      avoidTolls: false
    };
    
    directionsService.route(startingRequest, (result, status) => {
      if (status === 'OK') {
        startingRouteRenderer.setDirections(result);
        console.log('Yellow starting route drawn successfully on roads');
      } else {
        console.error('Starting route request failed:', status);
        // Fallback to straight line if directions fail
        new window.google.maps.Polyline({
          path: [
            { lat: startLocation[0], lng: startLocation[1] },
            { lat: firstStopLocation[0], lng: firstStopLocation[1] }
          ],
          geodesic: true,
          strokeColor: '#FFD700',
          strokeOpacity: 0.9,
          strokeWeight: 5,
          map: map,
          zIndex: 1
        });
      }
    });
  };
  
  const createSimplePolyline = (stops) => {
    const path = [
      { lat: currentLocation[0], lng: currentLocation[1] },
      ...stops.map(stop => ({ lat: stop.latitude, lng: stop.longitude }))
    ];
    
    new window.google.maps.Polyline({
      path: path,
      geodesic: true,
      strokeColor: '#007bff',
      strokeOpacity: 0.8,
      strokeWeight: 4,
      map: map
    });
  };
  
  const addStopMarkers = (stops) => {
    // Clear existing markers
    if (window.stopMarkers) {
      window.stopMarkers.forEach(marker => marker.setMap(null));
    }
    window.stopMarkers = [];
    
    // Add new markers
    stops.forEach((stop, index) => {
      if (stop.latitude && stop.longitude) {
        const marker = new window.google.maps.Marker({
          position: { lat: stop.latitude, lng: stop.longitude },
          map: map,
          label: {
            text: (index + 1).toString(),
            color: 'white',
            fontWeight: 'bold'
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 15,
            fillColor: '#28a745',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          },
          title: `Stop ${index + 1}: ${stop.location_name || 'Destination'}`
        });
        
        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="padding: 10px;">
              <strong>🚏 Stop ${index + 1}</strong><br/>
              📍 ${stop.location_name || 'Destination'}<br/>
              ${stop.passenger_name ? `👤 ${stop.passenger_name}` : ''}
            </div>
          `
        });
        
        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });
        
        window.stopMarkers.push(marker);
      }
    });
  };

  const updateDriverStatus = async (status) => {
    try {
      const response = await fetch(`http://localhost:5000/driver/status/${driver.user_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      
      if (response.ok) {
        setDriverStatus(status);
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("driver");
    window.location.href = "/driver/login";
  };

  const toggleBottomNav = () => {
    setBottomNavOpen(!bottomNavOpen);
  };

  const handleScheduleSelect = (schedule) => {
    setSelectedSchedule(schedule);
    
    // Store the schedule ID to draw route after GPS success
    console.log('Setting pending schedule ID:', schedule.schedule_id);
    pendingScheduleRef.current = schedule.schedule_id;
    
    // Start GPS tracking when schedule is selected
    console.log('Schedule selected - Starting GPS calibration...');
    setGpsLoading(true);
    if (map && window.google && window.google.maps) {
      initializeTracking(map, window.google.maps);
    }
    
    console.log('Route will be drawn after GPS location is obtained...');
  };

  return (
    <div className="driver-dashboard">
      {/* Top Header with Logout */}
      <div className="top-header">
        <div className="driver-info">
          <h2>Welcome, {driver?.full_name || 'Driver'}</h2>
          <div className="status-display">
            <span className={`status-indicator ${driverStatus}`}></span>
            <span className="status-text">{driverStatus.replace('-', ' ').toUpperCase()}</span>
            {locationError && (
              <button 
                className="refresh-location-btn" 
                onClick={() => {
                  setLocationError(null);
                  setGpsLoading(true);
                  if (map && window.google && window.google.maps) {
                    initializeTracking(map, window.google.maps);
                  } else {
                    window.location.reload();
                  }
                }}
                title="Retry location"
              >
                📍
              </button>
            )}
          </div>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          <FaSignOutAlt /> Logout
        </button>
      </div>

      {/* Map Container - Google Maps */}
      <div className="map-container">
        <div 
          ref={mapContainer} 
          className="google-map"
          style={{ width: '100%', height: '100%' }}
        />
        
        {/* GPS Loading Overlay - only show when getting GPS */}
        {gpsLoading && (
          <div className="gps-loading-overlay" style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '10px 15px',
            borderRadius: '8px',
            fontSize: '0.9em',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <div className="spinner" style={{
              width: '16px',
              height: '16px',
              border: '2px solid #ffffff40',
              borderTop: '2px solid #ffffff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <span>📍 Getting GPS...</span>
            
            {/* Skip button */}
            {showSkipButton && (
              <button 
                onClick={skipLocationAndContinue}
                style={{
                  marginLeft: '8px',
                  padding: '4px 8px',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8em'
                }}
              >
                Skip
              </button>
            )}
            
            {locationError && (
              <div style={{marginLeft: '8px'}}>
                <span style={{color: '#ff6b6b', fontSize: '0.8em'}}>⚠️ {locationError}</span>
                <button 
                  onClick={() => {
                    setLocationError(null);
                    setGpsLoading(true);
                    if (map && window.google && window.google.maps) {
                      initializeTracking(map, window.google.maps);
                    }
                  }}
                  style={{
                    marginLeft: '6px',
                    padding: '2px 6px',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '0.7em'
                  }}
                >
                  🔄
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Navigation Status */}
        {isTracking && (
          <div className="navigation-status">
            <div className="status-item">
              <span className="status-dot tracking"></span>
              <span>GPS Tracking Active</span>
            </div>
            {routingService && (
              <div className="status-item">
                <span>🗺️ {routingService}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className={`bottom-navigation ${bottomNavOpen ? 'open' : ''}`}>
        <div className="nav-toggle" onClick={toggleBottomNav}>
          <FaChevronUp className={`chevron ${bottomNavOpen ? 'rotated' : ''}`} />
          <span>Controls</span>
        </div>
        
        <div className="nav-content">
          {/* Schedule Selection */}
          <div className="nav-section">
            <h3><FaClock /> Select Schedule</h3>
            <div className="schedule-selector">
              {schedules.length === 0 ? (
                <p>No schedules available</p>
              ) : (
                schedules.map(schedule => (
                  <div 
                    key={schedule.schedule_id} 
                    className={`schedule-option ${selectedSchedule?.schedule_id === schedule.schedule_id ? 'selected' : ''}`}
                    onClick={() => handleScheduleSelect(schedule)}
                  >
                    <div className="schedule-time">
                      <span>{schedule.departure_time}</span>
                      <span>→ {schedule.arrival_time}</span>
                    </div>
                    <div className="schedule-route">
                      <strong>{schedule.route_name || 'Route'}</strong>
                      <p>{schedule.start_location} → {schedule.end_location}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Status Controls */}
          <div className="nav-section">
            <h3><FaMapMarkedAlt /> Driver Status</h3>
            <div className="status-controls">
              <button 
                className={`status-btn ${driverStatus === 'available' ? 'active' : ''}`}
                onClick={() => updateDriverStatus('available')}
              >
                <FaPlay /> Available
              </button>
              <button 
                className={`status-btn ${driverStatus === 'on-route' ? 'active' : ''}`}
                onClick={() => updateDriverStatus('on-route')}
              >
                <FaClock /> On Route
              </button>
              <button 
                className={`status-btn ${driverStatus === 'off-duty' ? 'active' : ''}`}
                onClick={() => updateDriverStatus('off-duty')}
              >
                <FaStop /> Off Duty
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}