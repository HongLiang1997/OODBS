import React, { useState, useEffect, useRef } from "react";
import "../../styles/driver/driver-dashboard.css";
import { FaRoute, FaMapMarkedAlt, FaClock, FaUsers, FaPlay, FaPause, FaStop, FaSignOutAlt, FaChevronUp } from "react-icons/fa";

// Google Maps API Key - Replace with your own key
const GOOGLE_MAPS_API_KEY = 'AIzaSyA8-KzovI2Gee5QfsCN1QrCrgvo9ai092s';

export default function DriverDashboard() {
  const driver = JSON.parse(localStorage.getItem("driver"));
  
  // Status mapping: database value → display name
  const statusMapping = {
    'active': 'Active',
    'inactive': 'Inactive', 
    'on-route': 'On-Route',
    'break': 'Break'
  };
  
  // Reverse mapping: display name → database value
  const reverseStatusMapping = {
    'Active': 'active',
    'Inactive': 'inactive',
    'On-Route': 'on-route', 
    'Break': 'break'
  };
  
  const [bottomNavOpen, setBottomNavOpen] = useState(false);
  const [driverStatus, setDriverStatus] = useState('inactive');
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
      fetchDriverStatus();
    }
  }, [map]);

  const initializeTracking = (mapInstance, googleMaps) => {
    console.log('Starting GPS tracking...');
    
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported by browser');
      setGpsLoading(false);
      return;
    }

    // Show skip button after 3 seconds if GPS is taking too long
    const skipTimer = setTimeout(() => {
      setShowSkipButton(true);
    }, 3000);

    // Try getting position with progressive timeout approach
    const tryGetPosition = (attempt = 1, maxAttempts = 3) => {
      console.log(`GPS attempt ${attempt}/${maxAttempts}`);
      
      const timeoutForAttempt = attempt === 1 ? 8000 : attempt === 2 ? 15000 : 25000;
      const accuracyForAttempt = attempt === 1 ? true : attempt === 2 ? true : false;
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log(`GPS success on attempt ${attempt}:`, position.coords);
          clearTimeout(skipTimer);
          
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
              {
                enableHighAccuracy: true,
                maximumAge: 5000, // More frequent updates for driving
                timeout: 10000
              }
            );
            setWatchId(id);
            setIsTracking(true);
          }, 2000); // Wait 2 seconds before starting continuous tracking
        },
        (error) => {
          console.error(`GPS attempt ${attempt} failed:`, error);
          
          if (attempt < maxAttempts) {
            console.log(`Retrying GPS... attempt ${attempt + 1}`);
            setTimeout(() => tryGetPosition(attempt + 1, maxAttempts), 1000);
          } else {
            clearTimeout(skipTimer);
            
            let errorMsg = 'Could not get your location';
            
            switch(error.code) {
              case error.PERMISSION_DENIED:
                errorMsg = 'Location access denied. Please enable location access in your browser settings.';
                break;
              case error.POSITION_UNAVAILABLE:
                errorMsg = 'GPS unavailable. Try moving to an area with better GPS signal.';
                break;
              case error.TIMEOUT:
                errorMsg = 'GPS timeout. This may be due to poor GPS signal or being indoors.';
                break;
            }
            
            setLocationError(errorMsg);
            setGpsLoading(false);
            setShowSkipButton(true); // Always show skip button on final failure
            setIsTracking(false);
          }
        },
        {
          enableHighAccuracy: accuracyForAttempt,
          timeout: timeoutForAttempt,
          maximumAge: attempt === 1 ? 30000 : 60000 // Allow older cached positions for retries
        }
      );
    };

    // Start the progressive GPS attempts
    tryGetPosition();
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
    console.log('Skipping GPS location, using Singapore default coordinates');
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
      const defaultLat = 1.3521; // Singapore default
      const defaultLng = 103.8198;
      
      // Update current location state
      setCurrentLocation([defaultLat, defaultLng]);
      
      map.setCenter({ lat: defaultLat, lng: defaultLng });
      
      // Update the existing marker instead of adding a new one
      if (currentLocationMarker) {
        currentLocationMarker.setPosition({ lat: defaultLat, lng: defaultLng });
      }
      
      // If there's a pending schedule, draw the route now with default location
      if (pendingScheduleRef.current) {
        console.log('GPS skipped - Drawing route with default location for schedule:', pendingScheduleRef.current);
        const scheduleToFetch = pendingScheduleRef.current;
        pendingScheduleRef.current = null; // Clear pending route
        // Use default Singapore coordinates
        fetchRouteData(scheduleToFetch, [defaultLat, defaultLng]);
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

  const fetchDriverStatus = async () => {
    try {
      console.log('Fetching driver status for user_id:', driver.user_id);
      const response = await fetch(`http://localhost:5000/driver/info/${driver.user_id}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Driver status response:', data);
        if (data.bus && data.bus.status) {
          console.log('Setting driver status to database value:', data.bus.status, 'which displays as:', statusMapping[data.bus.status]);
          setDriverStatus(data.bus.status); // Store database value (single letter)
        }
      } else {
        console.error('Failed to fetch driver status:', response.status);
      }
    } catch (error) {
      console.error('Error fetching driver status:', error);
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
        const pickupLocation = data.pickup_location || null;
        
        if (map && stops.length > 0) {
          await createNavigationRoute(stops, actualGpsLocation, pickupLocation);
        }
        
        setSelectedRoute({
          stops,
          pickupLocation,
          isRouted: true
        });
      }
    } catch (error) {
      console.error('Error fetching route data:', error);
    }
  };

  const createNavigationRoute = async (stops, actualGpsLocation = null, pickupLocation = null) => {
    if (!map || !directionsService || !directionsRenderer) return;
    
    console.log('=== SIMPLE ROUTE DEBUGGING ===');
    console.log('Raw route data from database:', stops);
    console.log('Pickup location:', pickupLocation);
    setRoutingService('Driver Navigation');
    
    // Use actual GPS location if provided, otherwise fall back to current state
    const startLocation = actualGpsLocation || currentLocation;
    
    // Clear any existing routes
    clearAllRoutes();
    
    // Just sort by stop_order - that's it!
    const sortedStops = [...stops].sort((a, b) => a.stop_order - b.stop_order);
    console.log('Stops in order:', sortedStops.map(s => `${s.stop_order}: ${s.location_name} (${s.passenger_name})`));
    
    if (pickupLocation && pickupLocation.latitude && pickupLocation.longitude) {
      // Phase 1: Driver location → Pickup location (YELLOW route)
      console.log('Drawing YELLOW route from driver to pickup');
      drawDriverToPickupRoute(startLocation, pickupLocation);
      
      // Add pickup location marker
      addPickupMarker(pickupLocation);
      
      // Phase 2: Pickup location → All destinations (BLUE route) in stop_order
      if (sortedStops.length > 0) {
        console.log('Drawing BLUE route through destinations in stop_order');
        
        if (sortedStops.length === 1) {
          // Single destination
          drawPickupToDestinationsRoute(pickupLocation, sortedStops[0], []);
        } else {
          // Multiple destinations - pickup → stop 1 → stop 2 → ... → final stop
          const finalDestination = sortedStops[sortedStops.length - 1];
          const waypoints = sortedStops.slice(0, -1);
          drawPickupToDestinationsRoute(pickupLocation, finalDestination, waypoints);
        }
      }
    }
    
    // Add destination markers with their stop_order numbers
    addDestinationMarkers(sortedStops);
    
    // Zoom to driver location
    map.setCenter({ lat: startLocation[0], lng: startLocation[1] });
    map.setZoom(17);
    console.log('=== ROUTE DEBUGGING END ===');
  };
  
  const drawDriverToPickupRoute = (driverLocation, pickupLocation) => {
    // YELLOW route: Driver current location → Pickup location
    if (!directionsService) return;
    
    console.log('Drawing YELLOW route from driver to pickup location');
    
    // Clear any existing driver-to-pickup renderer
    if (window.driverToPickupRenderer) {
      window.driverToPickupRenderer.setMap(null);
    }
    
    const driverToPickupRenderer = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: {
        strokeColor: '#FFD700', // YELLOW/Gold for driver → pickup
        strokeOpacity: 0.9,
        strokeWeight: 6,
        zIndex: 3 // Top priority
      }
    });
    
    driverToPickupRenderer.setMap(map);
    window.driverToPickupRenderer = driverToPickupRenderer;
    
    const driverToPickupRequest = {
      origin: { lat: driverLocation[0], lng: driverLocation[1] },
      destination: { lat: pickupLocation.latitude, lng: pickupLocation.longitude },
      travelMode: window.google.maps.TravelMode.DRIVING,
      avoidHighways: false,
      avoidTolls: false
    };
    
    directionsService.route(driverToPickupRequest, (result, status) => {
      if (status === 'OK') {
        driverToPickupRenderer.setDirections(result);
        console.log('✅ YELLOW driver-to-pickup route drawn successfully');
      } else {
        console.error('❌ Driver-to-pickup route failed:', status);
        // Fallback: draw straight line
        drawStraightLine(driverLocation, pickupLocation, '#FFD700', 6);
      }
    });
  };

  const drawPickupToDestinationsRoute = (pickupLocation, finalDestination, waypoints) => {
    // BLUE route: Pickup location → All destinations in stop order
    if (!directionsService) return;
    
    console.log('Drawing BLUE route from pickup to destinations in correct order');
    console.log('Pickup location:', pickupLocation);
    console.log('Waypoints (in stop_order):', waypoints.map(w => `${w.stop_order}: ${w.location_name}`));
    console.log('Final destination:', `${finalDestination.stop_order}: ${finalDestination.location_name}`);
    
    // Clear any existing pickup-to-destinations renderer
    if (window.pickupToDestinationsRenderer) {
      window.pickupToDestinationsRenderer.setMap(null);
    }
    
    const pickupToDestinationsRenderer = new window.google.maps.DirectionsRenderer({
      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: {
        strokeColor: '#007bff', // BLUE for pickup → destinations
        strokeOpacity: 0.8,
        strokeWeight: 4,
        zIndex: 2
      }
    });
    
    pickupToDestinationsRenderer.setMap(map);
    window.pickupToDestinationsRenderer = pickupToDestinationsRenderer;
    
    // Convert waypoints to Google Maps format, maintaining stop_order
    const routeWaypoints = waypoints.map(stop => ({
      location: { lat: stop.latitude, lng: stop.longitude },
      stopover: true
    }));
    
    console.log(`Route: Pickup → ${waypoints.length} waypoints → Final destination`);
    
    const pickupToDestinationsRequest = {
      origin: { lat: pickupLocation.latitude, lng: pickupLocation.longitude },
      destination: { lat: finalDestination.latitude, lng: finalDestination.longitude },
      waypoints: routeWaypoints,
      travelMode: window.google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false, // Keep original order - do NOT optimize
      avoidHighways: false,
      avoidTolls: false
    };
    
    directionsService.route(pickupToDestinationsRequest, (result, status) => {
      if (status === 'OK') {
        pickupToDestinationsRenderer.setDirections(result);
        console.log('✅ BLUE pickup-to-destinations route drawn successfully following stop_order');
        
        // Log the route sequence for verification
        const route = result.routes[0];
        if (route && route.legs) {
          console.log(`Route has ${route.legs.length} legs (segments between stops)`);
          route.legs.forEach((leg, index) => {
            console.log(`  Leg ${index + 1}: ${leg.start_address} → ${leg.end_address}`);
          });
        }
      } else {
        console.error('❌ Pickup-to-destinations route failed:', status);
        // Fallback: draw straight lines between stops in correct order
        const allStops = [pickupLocation, ...waypoints, finalDestination];
        console.log('Fallback: Drawing straight lines in order:', allStops.map((stop, i) => 
          i === 0 ? 'Pickup' : `${stop.stop_order}: ${stop.location_name}`
        ));
        
        for (let i = 0; i < allStops.length - 1; i++) {
          drawStraightLine(
            [allStops[i].latitude, allStops[i].longitude],
            [allStops[i + 1].latitude, allStops[i + 1].longitude],
            '#007bff',
            4
          );
        }
      }
    });
  };

  const drawStraightLine = (startLocation, endLocation, color, weight) => {
    if (!window.routePolylines) window.routePolylines = [];
    
    const polyline = new window.google.maps.Polyline({
      path: [
        { lat: startLocation[0], lng: startLocation[1] },
        { lat: endLocation[0], lng: endLocation[1] }
      ],
      geodesic: true,
      strokeColor: color,
      strokeOpacity: 0.9,
      strokeWeight: weight,
      map: map,
      zIndex: weight === 6 ? 3 : 2
    });
    
    window.routePolylines.push(polyline);
  };

  const clearAllRoutes = () => {
    // Clear main directions renderer
    if (directionsRenderer) {
      directionsRenderer.setDirections({routes: []});
    }
    
    // Clear driver-to-pickup renderer
    if (window.driverToPickupRenderer) {
      window.driverToPickupRenderer.setMap(null);
      window.driverToPickupRenderer = null;
    }
    
    // Clear pickup-to-destinations renderer
    if (window.pickupToDestinationsRenderer) {
      window.pickupToDestinationsRenderer.setMap(null);
      window.pickupToDestinationsRenderer = null;
    }
    
    // Clear any polylines
    if (window.routePolylines) {
      window.routePolylines.forEach(polyline => polyline.setMap(null));
      window.routePolylines = [];
    }
    
    console.log('🧹 Cleared all existing routes');
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
  
  const addPickupMarker = (pickupLocation) => {
    // Clear existing pickup marker
    if (window.pickupMarker) {
      window.pickupMarker.setMap(null);
    }
    
    // Add pickup location marker (different style)
    const pickupMarker = new window.google.maps.Marker({
      position: { lat: pickupLocation.latitude, lng: pickupLocation.longitude },
      map: map,
      label: {
        text: 'P',
        color: 'white',
        fontWeight: 'bold'
      },
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 18,
        fillColor: '#FF6B00', // Orange for pickup
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3
      },
      title: `Pickup: ${pickupLocation.name}`
    });
    
    const pickupInfoWindow = new window.google.maps.InfoWindow({
      content: `
        <div style="padding: 10px; text-align: center;">
          <strong>🚌 Pickup Location</strong><br/>
          <span style="color: #FF6B00; font-weight: bold;">${pickupLocation.name}</span>
        </div>
      `
    });
    
    pickupMarker.addListener('click', () => {
      pickupInfoWindow.open(map, pickupMarker);
    });
    
    window.pickupMarker = pickupMarker;
  };

  const addStopMarkers = (stops, pickupLocation = null) => {
    // Clear existing markers
    if (window.stopMarkers) {
      window.stopMarkers.forEach(marker => marker.setMap(null));
    }
    window.stopMarkers = [];
    
    // Add destination markers (renumbered from 1)
    let destinationNumber = 1;
    stops.forEach((stop) => {
      if (stop.latitude && stop.longitude) {
        const marker = new window.google.maps.Marker({
          position: { lat: stop.latitude, lng: stop.longitude },
          map: map,
          label: {
            text: destinationNumber.toString(),
            color: 'white',
            fontWeight: 'bold'
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 15,
            fillColor: '#007bff', // Blue for destinations
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          },
          title: `Destination ${destinationNumber}: ${stop.location_name || 'Destination'}`
        });
        
        // Enhanced popup with passenger info and destination name
        const passengerInfo = stop.passenger_name ? 
          `<div style="margin-top: 5px; font-size: 0.9em; color: #666;">👤 ${stop.passenger_name}</div>` : '';
        
        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="padding: 8px; text-align: center;">
              <strong style="color: #007bff;">📍 ${stop.location_name || 'Destination'}</strong>
              ${passengerInfo}
            </div>
          `
        });
        
        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });
        
        window.stopMarkers.push(marker);
        destinationNumber++;
      }
    });
    
    console.log(`Added ${destinationNumber - 1} destination markers`);
  };

  const addDestinationMarkers = (stops) => {
    // Clear existing markers
    if (window.stopMarkers) {
      window.stopMarkers.forEach(marker => marker.setMap(null));
    }
    window.stopMarkers = [];
    
    // Add destination markers using stop_order from database
    stops.forEach((stop) => {
      if (stop.latitude && stop.longitude) {
        const marker = new window.google.maps.Marker({
          position: { lat: stop.latitude, lng: stop.longitude },
          map: map,
          label: {
            text: stop.stop_order.toString(),
            color: 'white',
            fontWeight: 'bold'
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 15,
            fillColor: '#007bff',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          },
          title: `Stop ${stop.stop_order}: ${stop.location_name}`
        });
        
        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="padding: 8px; text-align: center;">
              <strong style="color: #007bff;">📍 ${stop.location_name}</strong>
              <div style="margin-top: 5px; font-size: 0.9em; color: #666;">👤 ${stop.passenger_name}</div>
            </div>
          `
        });
        
        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });
        
        window.stopMarkers.push(marker);
      }
    });
    
    console.log(`✅ Added ${stops.length} destination markers:`, stops.map(s => `${s.stop_order}: ${s.location_name}`));
  };

  const updateDriverStatus = async (displayStatus) => {
    try {
      const dbStatus = reverseStatusMapping[displayStatus];
      console.log('Updating driver status from display:', displayStatus, 'to database:', dbStatus, 'for user_id:', driver.user_id);
      
      const response = await fetch(`http://localhost:5000/driver/status/${driver.user_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: dbStatus }),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Status update result:', result);
        setDriverStatus(dbStatus); // Store database value in state
      } else {
        console.error('Failed to update status:', response.status);
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
            <span className="status-text">{statusMapping[driverStatus]?.toUpperCase() || 'INACTIVE'}</span>
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
          <>
            <style>
              {`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
                @keyframes pulse {
                  0%, 100% { opacity: 0.8; }
                  50% { opacity: 1; }
                }
              `}
            </style>
            <div className="gps-loading-overlay" style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(0,0,0,0.85)',
              color: 'white',
              padding: '12px 16px',
              borderRadius: '10px',
              fontSize: '0.9em',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              minWidth: '200px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="spinner" style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid #ffffff40',
                  borderTop: '2px solid #ffffff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <span style={{ animation: 'pulse 2s ease-in-out infinite' }}>📍 Getting GPS location...</span>
              </div>
              
              {!locationError && (
                <div style={{ fontSize: '0.75em', color: '#ccc', textAlign: 'center' }}>
                  This may take a moment if you're indoors
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                {/* Skip button */}
                {showSkipButton && (
                  <button 
                    onClick={skipLocationAndContinue}
                    style={{
                      padding: '6px 12px',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.8em',
                      fontWeight: 'bold'
                    }}
                  >
                    Skip GPS
                  </button>
                )}
                
                {locationError && (
                  <button 
                    onClick={() => {
                      setLocationError(null);
                      setShowSkipButton(false);
                      setGpsLoading(true);
                      if (map && window.google && window.google.maps) {
                        initializeTracking(map, window.google.maps);
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.8em'
                    }}
                  >
                    🔄 Retry
                  </button>
                )}
              </div>
              
              {locationError && (
                <div style={{ 
                  fontSize: '0.75em', 
                  color: '#ff6b6b', 
                  textAlign: 'center', 
                  marginTop: '4px',
                  padding: '4px',
                  background: 'rgba(255, 107, 107, 0.1)',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 107, 107, 0.3)'
                }}>
                  ⚠️ {locationError}
                </div>
              )}
            </div>
          </>
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
                className={`status-btn status-active ${driverStatus === 'active' ? 'active' : ''}`}
                onClick={() => updateDriverStatus('Active')}
              >
                <FaPlay /> Active
              </button>
              <button 
                className={`status-btn status-onroute ${driverStatus === 'on-route' ? 'active' : ''}`}
                onClick={() => updateDriverStatus('On-Route')}
              >
                <FaClock /> On Route
              </button>
              <button 
                className={`status-btn status-break ${driverStatus === 'break' ? 'active' : ''}`}
                onClick={() => updateDriverStatus('Break')}
              >
                <FaPause /> Break
              </button>
              <button 
                className={`status-btn status-inactive ${driverStatus === 'inactive' ? 'active' : ''}`}
                onClick={() => updateDriverStatus('Inactive')}
              >
                <FaStop /> Inactive
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}