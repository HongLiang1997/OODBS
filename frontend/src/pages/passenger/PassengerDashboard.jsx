import React, { useState, useEffect } from "react";
import "../../styles/passenger/passenger-dashboard.css";
import PassengerNav from "../../components/passenger/PassengerNav";
import { FaBus, FaTicketAlt, FaMapMarkerAlt, FaClock, FaUser, FaPhone, FaRoute } from "react-icons/fa";

export default function PassengerDashboard() {
  const passenger = JSON.parse(localStorage.getItem("passenger"));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // State for dynamic data
  const [pickupLocations, setPickupLocations] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [pastRequests, setPastRequests] = useState([]);
  
  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  
  // State for booking form
  const [bookingForm, setBookingForm] = useState({
    pickup_id: '',
    location_id: ''
  });

  // State for personal information form
  const [personalInfo, setPersonalInfo] = useState({
    full_name: passenger?.full_name || '',
    email: passenger?.email || '',
    phone_num: passenger?.phone_num || ''
  });

  // State for request details modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestDetails, setRequestDetails] = useState({
    bus: null,
    schedule: null,
    routes: [],
    loading: false,
    error: null
  });

  // State for current trip status
  const [currentTrip, setCurrentTrip] = useState(null);
  const [loadingCurrentTrip, setLoadingCurrentTrip] = useState(false);

  // Fetch data on component mount
  useEffect(() => {
    fetchPickupLocations();
    fetchDestinations();
    
    // Pre-populate personal info and fetch past requests only once
    if (passenger?.user_id) {
      fetchPastRequests(passenger.user_id);
      fetchCurrentTrip(passenger.user_id);
      setPersonalInfo({
        full_name: passenger.full_name || '',
        email: passenger.email || '',
        phone_num: passenger.phone_num || ''
      });
    }
  }, []); // Empty dependency array to run only once on mount

  // Refresh current trip status every 30 seconds
  useEffect(() => {
    if (passenger?.user_id && currentTrip) {
      const interval = setInterval(() => {
        fetchCurrentTrip(passenger.user_id);
      }, 30000); // 30 seconds

      return () => clearInterval(interval);
    }
  }, [passenger?.user_id, currentTrip]);

  // API calls
  const fetchPickupLocations = async () => {
    try {
      const response = await fetch('http://localhost:5000/passenger/pickup-locations');
      const data = await response.json();
      setPickupLocations(data);
    } catch (error) {
      console.error('Error fetching pickup locations:', error);
    }
  };

  const fetchDestinations = async () => {
    try {
      const response = await fetch('http://localhost:5000/passenger/destinations');
      const data = await response.json();
      setDestinations(data);
    } catch (error) {
      console.error('Error fetching destinations:', error);
    }
  };

  const fetchPastRequests = async (userId) => {
    try {
      const response = await fetch(`http://localhost:5000/passenger/requests/${userId}`);
      const data = await response.json();
      
      // Check if response is successful and data is an array
      if (response.ok && Array.isArray(data)) {
        setPastRequests(data);
        setCurrentPage(1); // Reset to first page when new data is loaded
      } else {
        console.error('Invalid response:', data);
        setPastRequests([]); // Set empty array as fallback
        setCurrentPage(1);
      }
    } catch (error) {
      console.error('Error fetching past requests:', error);
      setPastRequests([]); // Set empty array as fallback
      setCurrentPage(1);
    }
  };

  const fetchCurrentTrip = async (userId) => {
    setLoadingCurrentTrip(true);
    try {
      console.log('Fetching current trip for user:', userId);
      const response = await fetch(`http://localhost:5000/passenger/current-trip/${userId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Current trip response:', data);
        setCurrentTrip(data.trip || null);
      } else {
        console.log('No current trip found or error:', response.status);
        setCurrentTrip(null);
      }
    } catch (error) {
      console.error('Error fetching current trip:', error);
      setCurrentTrip(null);
    } finally {
      setLoadingCurrentTrip(false);
    }
  };

  // Form handlers
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!passenger?.user_id) {
      alert('Please log in to submit a booking request');
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/passenger-requests/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          passenger_id: passenger.user_id,
          pickup_location_id: bookingForm.pickup_id,
          destination_id: bookingForm.location_id,
          passenger_count: 1, // Always 1 passenger
          requested_pickup_time: new Date().toISOString() // Use current time as requested time
        })
      });

      const result = await response.json();
      
      if (result.success) {
        alert('🎉 Booking confirmed! ' + result.message + 
              (result.bus_assignment ? `\nBus: ${result.bus_assignment.plate_number}` : ''));
        setBookingForm({
          pickup_id: '',
          location_id: ''
        });
        fetchPastRequests(passenger.user_id);
        fetchCurrentTrip(passenger.user_id); // Refresh current trip status
      } else {
        alert('ℹ️ ' + result.message + 
              (result.reason === 'THRESHOLD_EXCEEDED' ? '\n\n⚠️ Traffic analysis shows this route would cause significant delays for other passengers.' :
               result.reason === 'NO_AVAILABLE_BUS' ? '\n\nYour request has been added to the queue for admin review.' : ''));
      }
    } catch (error) {
      console.error('Error submitting booking:', error);
      alert('Error submitting booking request');
    }
  };

  const getStatusClass = (status) => {
    // status is boolean: true = approved, false = pending
    if (status === true || status === 1) return 'approved';
    if (status === false || status === 0) return 'pending';
    return 'pending';
  };

  const getStatusText = (status) => {
    // status is boolean: true = approved, false = pending
    if (status === true || status === 1) return 'Approved';
    if (status === false || status === 0) return 'Pending';
    return 'Pending';
  };

  // Handle request details view
  const handleViewRequest = async (request) => {
    setSelectedRequest(request);
    setRequestDetails({ bus: null, schedule: null, routes: [], loading: true, error: null });
    setShowRequestModal(true);

    try {
      // Fetch detailed request information including bus, schedule, and routes
      const response = await fetch(`http://localhost:5000/passenger/request-details/${request.request_id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch request details');
      }
      
      const data = await response.json();
      setRequestDetails({
        bus: data.bus,
        schedule: data.schedule,
        routes: data.routes || [],
        loading: false,
        error: null
      });
    } catch (error) {
      console.error('Error fetching request details:', error);
      setRequestDetails(prev => ({
        ...prev,
        loading: false,
        error: error.message
      }));
    }
  };

  // Handle personal info form submission
  const handlePersonalInfoSubmit = async (e) => {
    e.preventDefault();
    if (!passenger?.user_id) {
      alert('Please log in to update your information');
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/passenger/profile/${passenger.user_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(personalInfo)
      });

      if (response.ok) {
        alert('Personal information updated successfully!');
        // Update localStorage with new info
        const updatedPassenger = { ...passenger, ...personalInfo };
        localStorage.setItem('passenger', JSON.stringify(updatedPassenger));
      } else {
        const error = await response.json();
        alert('Error: ' + error.error);
      }
    } catch (error) {
      console.error('Error updating personal info:', error);
      alert('Error updating personal information');
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(pastRequests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentRequests = pastRequests.slice(startIndex, endIndex);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  return (
    <div className="passenger-dashboard">
      <PassengerNav sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      
      <div className="passenger-main-content">
        <div className="passenger-cards-container">
          {/* Conditional Booking/Trip Status Card */}
          <div className="passenger-dashboard-card">
            <div className="card-header">
              <div className="card-title">
                <FaBus className="card-icon" />
                <h3>{currentTrip ? 'Current Trip Status' : 'Book a Service'}</h3>
              </div>
            </div>
            <div className="card-content">
              {/* Debug info - remove in production */}
              {console.log('Rendering card content - currentTrip:', currentTrip, 'loadingCurrentTrip:', loadingCurrentTrip)}
              
              {loadingCurrentTrip ? (
                <div className="loading-status">
                  <p>Loading trip status...</p>
                </div>
              ) : currentTrip ? (
                // Trip Status Card - Shows when user has an active trip
                <div className="trip-status-container">
                  <div className="trip-status-header">
                    <div className="status-badges">
                      <div className={`trip-status-badge ${currentTrip.trip_status || 'pending'}`}>
                        <FaClock className="status-icon" />
                        <span>{(currentTrip.trip_status || 'PENDING').toUpperCase()}</span>
                      </div>
                      <div className="request-status">
                        <span className={`request-badge ${currentTrip.request_status ? 'approved' : 'pending'}`}>
                          {currentTrip.request_status ? 'APPROVED' : 'PENDING APPROVAL'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="trip-details">
                    <div className="trip-main-info">
                      {currentTrip.route && currentTrip.route.length > 0 ? (
                        <div className="route-stops">
                          <h4><FaRoute className="section-icon" /> Route Stops</h4>
                          <div className="simple-stops-list">
                            {currentTrip.route.map((stop, index) => {
                              const isCurrentUserPickup = stop.is_current_user && stop.stop_type === 'pickup';
                              const isCurrentUserDestination = stop.is_current_user_destination === true || (stop.is_current_user && stop.stop_type === 'destination');
                              const stopClasses = `simple-stop ${stop.is_current_user ? 'your-stop' : ''} ${isCurrentUserDestination ? 'your-destination' : ''}`;
                              
                              console.log('Stop data:', {
                                index,
                                stop_name: stop.stop_name,
                                stop_type: stop.stop_type,
                                is_current_user: stop.is_current_user,
                                is_current_user_destination: stop.is_current_user_destination,
                                isCurrentUserPickup,
                                isCurrentUserDestination,
                                stopClasses,
                                request_destination_id: stop.request_destination_id,
                                stop_destination_id: stop.stop_destination_id
                              });
                              
                              return (
                                <div key={stop.route_id || index} className={stopClasses}>
                                  <div className="stop-number">{stop.stop_order}</div>
                                  <div className="stop-content">
                                    <div className="stop-name">
                                      <FaMapMarkerAlt className={stop.stop_type === 'pickup' ? 'pickup-icon' : 'destination-icon'} />
                                      {stop.stop_name}
                                      {isCurrentUserPickup && <span className="you-tag">YOU</span>}
                                      {isCurrentUserDestination && <span className="destination-tag">YOUR DESTINATION</span>}
                                    </div>
                                    <div className="stop-info">
                                      {stop.passenger_name && !stop.is_current_user && <span>for {stop.passenger_name}</span>}
                                      {stop.eta && <span className="eta">ETA: {new Date(stop.eta).toLocaleTimeString()}</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="route-stops">
                          <h4><FaRoute className="section-icon" /> Your Trip</h4>
                          <div className="simple-route">
                            <div className="simple-stop your-stop">
                              <div className="stop-number">1</div>
                              <div className="stop-content">
                                <div className="stop-name">
                                  <FaMapMarkerAlt className="pickup-icon" />
                                  {currentTrip.pickup_name || 'Pickup Location'}
                                  <span className="you-tag">YOU</span>
                                </div>
                              </div>
                            </div>
                            <div className="simple-stop your-stop your-destination">
                              <div className="stop-number">2</div>
                              <div className="stop-content">
                                <div className="stop-name">
                                  <FaMapMarkerAlt className="destination-icon" />
                                  {currentTrip.destination_name || 'Destination'}
                                  <span className="destination-tag">YOUR DESTINATION</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    
                      {currentTrip.bus_id && currentTrip.plate_number && (
                        <div className="bus-assignment">
                          <h4><FaBus className="section-icon" /> Assigned Bus</h4>
                          <div className="bus-info-grid">
                            <div className="bus-detail">
                              <span className="detail-label">Bus:</span>
                              <span className="detail-value">{currentTrip.plate_number}</span>
                            </div>
                            {currentTrip.bus_company && (
                              <div className="bus-detail">
                                <span className="detail-label">Company:</span>
                                <span className="detail-value">{currentTrip.bus_company}</span>
                              </div>
                            )}
                            {currentTrip.driver_name && (
                              <div className="bus-detail">
                                <span className="detail-label">Driver:</span>
                                <span className="detail-value">{currentTrip.driver_name}</span>
                              </div>
                            )}
                            {currentTrip.driver_phone && (
                              <div className="bus-detail">
                                <span className="detail-label">Contact:</span>
                                <span className="detail-value">
                                  <FaPhone className="phone-icon" />
                                  {currentTrip.driver_phone}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {currentTrip.schedule_id && (
                      <div className="schedule-info">
                        <h4><FaClock className="section-icon" /> Schedule Information</h4>
                        <div className="schedule-details-grid">
                          <div className="schedule-item">
                            <span className="detail-label">Request ID:</span>
                            <span className="detail-value">#{currentTrip.request_id}</span>
                          </div>
                          <div className="schedule-item">
                            <span className="detail-label">Schedule ID:</span>
                            <span className="detail-value">#{currentTrip.schedule_id}</span>
                          </div>
                          {currentTrip.estimated_departure && (
                            <div className="schedule-item">
                              <span className="detail-label">Estimated Departure:</span>
                              <span className="detail-value">{new Date(currentTrip.estimated_departure).toLocaleString()}</span>
                            </div>
                          )}
                          {currentTrip.estimated_arrival && (
                            <div className="schedule-item">
                              <span className="detail-label">Estimated Arrival:</span>
                              <span className="detail-value">{new Date(currentTrip.estimated_arrival).toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="trip-status-message">
                      {!currentTrip.request_status && (
                        <div className="status-alert pending">
                          <FaClock className="alert-icon" />
                          <p>Your request is pending admin approval. You'll be notified once it's processed.</p>
                        </div>
                      )}
                      {currentTrip.request_status && (currentTrip.trip_status === 'booked' || !currentTrip.trip_status) && (
                        <div className="status-alert booked">
                          <FaTicketAlt className="alert-icon" />
                          <p>Your trip is confirmed and scheduled. Wait for the driver to start the route.</p>
                        </div>
                      )}
                      {currentTrip.trip_status === 'ongoing' && (
                        <div className="status-alert ongoing">
                          <FaRoute className="alert-icon" />
                          <p>Your trip is currently in progress. The driver is on route to pick you up.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                // Booking Form
                <form className="booking-form" onSubmit={handleBookingSubmit}>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="pickup-location" className="form-label">Pickup Location</label>
                      <select 
                        id="pickup-location" 
                        className="form-select" 
                        value={bookingForm.pickup_id}
                        onChange={(e) => setBookingForm({...bookingForm, pickup_id: e.target.value})}
                        required
                      >
                        <option value="">Select pickup location...</option>
                        {pickupLocations.map(location => (
                          <option key={location.pickup_id} value={location.pickup_id}>
                            {location.name} ({location.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="destination" className="form-label">Destination</label>
                      <select 
                        id="destination" 
                        className="form-select"
                        value={bookingForm.location_id}
                        onChange={(e) => setBookingForm({...bookingForm, location_id: e.target.value})}
                        required
                      >
                        <option value="">Select destination...</option>
                        {destinations.map(destination => (
                          <option key={destination.location_id} value={destination.location_id}>
                            {destination.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="booking-note">
                    <p>Our intelligent system will automatically find the best bus and optimal route for your journey.</p>
                  </div>
                  <button type="submit" className="submit-btn">
                    <FaBus className="btn-icon" />
                    Submit Booking Request
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Personal Information Card */}
          <div className="passenger-dashboard-card">
            <div className="card-header">
              <div className="card-title">
                <FaTicketAlt className="card-icon" />
                <h3>Personal Information</h3>
              </div>
            </div>
            <div className="card-content">
              <form className="personal-info-form" onSubmit={handlePersonalInfoSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="full-name" className="form-label">Full Name</label>
                    <input 
                      type="text" 
                      id="full-name" 
                      className="form-input" 
                      value={personalInfo.full_name}
                      onChange={(e) => setPersonalInfo({...personalInfo, full_name: e.target.value})}
                      placeholder="Enter your full name" 
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email" className="form-label">Email Address</label>
                    <input 
                      type="email" 
                      id="email" 
                      className="form-input" 
                      value={personalInfo.email}
                      onChange={(e) => setPersonalInfo({...personalInfo, email: e.target.value})}
                      placeholder="Enter your email" 
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="phone-number" className="form-label">Phone Number</label>
                    <input 
                      type="tel" 
                      id="phone-number" 
                      className="form-input" 
                      value={personalInfo.phone_num}
                      onChange={(e) => setPersonalInfo({...personalInfo, phone_num: e.target.value})}
                      placeholder="+65 XXXX XXXX" 
                    />
                  </div>
                </div>
                <button type="submit" className="submit-btn">
                  <FaTicketAlt className="btn-icon" />
                  Update Information
                </button>
              </form>
            </div>
          </div>

          {/* Past Requests Card */}
          <div className="passenger-dashboard-card">
            <div className="card-header">
              <div className="card-title">
                <FaMapMarkerAlt className="card-icon" />
                <h3>Past Requests</h3>
              </div>
            </div>
            <div className="card-content">
              <div className="requests-table-container">
                <table className="requests-table">
                  <thead>
                    <tr>
                      <th>Request ID</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Passengers</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastRequests.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="no-data">
                          No past requests found
                        </td>
                      </tr>
                    ) : (
                      currentRequests.map(request => (
                        <tr key={request.request_id}>
                          <td>#{request.request_id}</td>
                          <td>{request.pickup_name || 'N/A'}</td>
                          <td>{request.destination_name || 'N/A'}</td>
                          <td>{request.passenger_count}</td>
                          <td>
                            <span className={`status-badge ${getStatusClass(request.request_status)}`}>
                              {getStatusText(request.request_status)}
                            </span>
                          </td>
                          <td>
                            <button 
                              className="action-btn"
                              onClick={() => handleViewRequest(request)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {pastRequests.length > itemsPerPage && (
                <div className="pagination-container">
                  <div className="pagination-info">
                    Showing {startIndex + 1} to {Math.min(endIndex, pastRequests.length)} of {pastRequests.length} entries
                  </div>
                  <div className="pagination-controls">
                    <button 
                      className="pagination-btn"
                      onClick={handlePrevPage}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </button>
                    
                    {Array.from({ length: totalPages }, (_, index) => (
                      <button
                        key={index + 1}
                        className={`pagination-btn ${currentPage === index + 1 ? 'active' : ''}`}
                        onClick={() => handlePageChange(index + 1)}
                      >
                        {index + 1}
                      </button>
                    ))}
                    
                    <button 
                      className="pagination-btn"
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Request Details Modal */}
      {showRequestModal && (
        <div className="modal-overlay" onClick={() => setShowRequestModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Request Details #{selectedRequest?.request_id}</h4>
              <button 
                className="modal-close-btn"
                onClick={() => setShowRequestModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {requestDetails.loading ? (
                <div className="loading-state">
                  <p>Loading request details...</p>
                </div>
              ) : requestDetails.error ? (
                <div className="error-state">
                  <p className="text-danger">Error: {requestDetails.error}</p>
                </div>
              ) : (
                <div className="request-details-content">
                  {/* Request Summary */}
                  <div className="detail-section">
                    <h5>Request Summary</h5>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <strong>Pickup Location:</strong>
                        <span>{selectedRequest?.pickup_name || 'N/A'}</span>
                      </div>
                      <div className="summary-item">
                        <strong>Destination:</strong>
                        <span>{selectedRequest?.destination_name || 'N/A'}</span>
                      </div>
                      <div className="summary-item">
                        <strong>Passengers:</strong>
                        <span>{selectedRequest?.passenger_count}</span>
                      </div>
                      <div className="summary-item">
                        <strong>Status:</strong>
                        <span className={`status-badge ${getStatusClass(selectedRequest?.request_status)}`}>
                          {getStatusText(selectedRequest?.request_status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bus Information */}
                  {requestDetails.bus && (
                    <div className="detail-section">
                      <h5>Assigned Bus</h5>
                      <table className="details-table">
                        <tbody>
                          <tr>
                            <th>Plate Number</th>
                            <td>{requestDetails.bus.plate_number}</td>
                          </tr>
                          <tr>
                            <th>Driver Name</th>
                            <td>{requestDetails.bus.driver_name}</td>
                          </tr>
                          <tr>
                            <th>Driver Phone</th>
                            <td>{requestDetails.bus.driver_phone_num}</td>
                          </tr>
                          <tr>
                            <th>Capacity</th>
                            <td>{requestDetails.bus.capacity}</td>
                          </tr>
                          <tr>
                            <th>Company</th>
                            <td>{requestDetails.bus.company}</td>
                          </tr>
                          <tr>
                            <th>Status</th>
                            <td>
                              <span className={`bus-status-pill ${requestDetails.bus.status}`}>
                                {requestDetails.bus.status}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Schedule Information */}
                  {requestDetails.schedule && (
                    <div className="detail-section">
                      <h5>Schedule Information</h5>
                      <table className="details-table">
                        <tbody>
                          <tr>
                            <th>Departure Time</th>
                            <td>{new Date(requestDetails.schedule.departure_time).toLocaleString()}</td>
                          </tr>
                          <tr>
                            <th>Arrival Time</th>
                            <td>{new Date(requestDetails.schedule.arrival_time).toLocaleString()}</td>
                          </tr>
                          <tr>
                            <th>Service Date</th>
                            <td>{new Date(requestDetails.schedule.service_date).toLocaleDateString()}</td>
                          </tr>
                          <tr>
                            <th>Shifts</th>
                            <td>
                              {requestDetails.schedule.isAmShift && (
                                <span className="shift-badge am">AM</span>
                              )}
                              {requestDetails.schedule.isPmShift && (
                                <span className="shift-badge pm">PM</span>
                              )}
                              {!requestDetails.schedule.isAmShift && !requestDetails.schedule.isPmShift && (
                                <span className="text-muted">No shifts</span>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Route Details */}
                  {requestDetails.routes && requestDetails.routes.length > 0 && (
                    <div className="detail-section">
                      <h5>Route Details</h5>
                      <table className="routes-table">
                        <thead>
                          <tr>
                            <th>Stop Order</th>
                            <th>Destination</th>
                            <th>Passenger</th>
                            <th>Tier</th>
                            <th>ETA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {requestDetails.routes.map((route, idx) => (
                            <tr key={idx}>
                              <td className="stop-order">{route.stop_order}</td>
                              <td className="destination-name">{route.destination_name || 'N/A'}</td>
                              <td className="passenger-info">
                                {route.passenger_name || 'N/A'} ({route.total_passenger_count || 0})
                              </td>
                              <td className="tier-name">{route.tier_name || 'N/A'}</td>
                              <td className="eta-time">
                                {route.eta ? new Date(route.eta).toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                }) : 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* No additional info available */}
                  {!requestDetails.bus && !requestDetails.schedule && (!requestDetails.routes || requestDetails.routes.length === 0) && (
                    <div className="no-details-state">
                      <p className="text-muted">No additional details available for this request.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}