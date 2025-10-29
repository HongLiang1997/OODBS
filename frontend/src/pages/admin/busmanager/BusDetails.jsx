import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "../../../styles/admin/busmanager/admin-bus-details.css";

export default function BusDetailPage() {
  const { bus_id } = useParams();
  const [bus, setBus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [services, setServices] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [showUpcomingSchedule, setShowUpcomingSchedule] = useState(true);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [routes, setRoutes] = useState([]);

  // Filter services based on current date
  const getFilteredServices = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
    
    return services.filter((service) => {
      const serviceDate = new Date(service.service_date);
      serviceDate.setHours(0, 0, 0, 0);
      
      if (showUpcoming) {
        return serviceDate >= today; // Today and future dates
      } else {
        return serviceDate < today; // Past dates
      }
    });
  };

  // Filter schedules based on current date
  const getFilteredSchedules = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return schedules.filter((schedule) => {
      const scheduleDate = new Date(schedule.service_date);
      scheduleDate.setHours(0, 0, 0, 0);
      
      if (showUpcomingSchedule) {
        return scheduleDate >= today;
      } else {
        return scheduleDate < today;
      }
    });
  };

  // Handle schedule click to show routes
  const handleScheduleClick = async (schedule) => {
    try {
      const response = await fetch(`http://localhost:5000/schedule/${schedule.schedule_id}/routes`);
      const routeData = await response.json();
      setRoutes(routeData);
      setSelectedSchedule(schedule);
      setShowRouteModal(true);
    } catch (error) {
      console.error("Error fetching routes:", error);
    }
  };

  useEffect(() => {
    if (!bus_id) return;
    fetch(`http://localhost:5000/services/bus/${bus_id}`)
      .then((res) => res.json())
      .then((data) => setServices(data))
      .catch(() => setServices([]));

    // Fetch schedules
    fetch(`http://localhost:5000/schedule/bus/${bus_id}`)
      .then((res) => res.json())
      .then((data) => setSchedules(data))
      .catch(() => setSchedules([]));
  }, [bus_id]);

  useEffect(() => {
    if (!bus_id) return;

    setLoading(true);
    fetch(`http://localhost:5000/buses/${bus_id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Bus not found");
        }
        return res.json();
      })
      .then((data) => {
        setBus(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [bus_id]);

  if (loading) return <p>Loading bus data...</p>;
  if (error) return <p className="text-danger">Error: {error}</p>;
  if (!bus) return <p>No bus data available.</p>;

  return (
    <div>
      <div className="page-title mb-4">
        <h3>Bus Details</h3>
      </div>
      <div className="page-content">
        {/* Bus Information Card */}
        <div className="dashboard-card mb-4 d-flex flex-column">
          <h4 className="mb-3">Bus Information</h4>
          <table className="bus-details-table">
            <tbody>
              <tr>
                <th>Plate Number</th>
                <td>{bus.plate_number}</td>
              </tr>
              <tr>
                <th>Driver Name</th>
                <td>{bus.driver_name}</td>
              </tr>
              <tr>
                <th>Driver Phone</th>
                <td>{bus.driver_phone_num}</td>
              </tr>
              <tr>
                <th>Capacity</th>
                <td>{bus.capacity}</td>
              </tr>
              <tr>
                <th>Company</th>
                <td>{bus.company}</td>
              </tr>
              <tr>
                <th>Status</th>
                <td>
                  <span
                    className={`bus-status-pill ${
                      bus.status === "active"
                        ? "active"
                        : bus.status === "on-break"
                        ? "on-break"
                        : bus.status === "enroute"
                        ? "enroute"
                        : "inactive"
                    }`}
                  >
                    {bus.status}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bottom Cards */}
        <div className="row">
          <div className="col-md-6 mb-4">
            <div className="dashboard-card d-flex flex-column">
              <h5 className="mb-3">Services Shift</h5>
              <div className="services-toggle mb-3" role="group">
                <button
                  type="button"
                  className={`btn ${
                    showUpcoming ? "btn-primary" : "btn-outline-primary"
                  }`}
                  onClick={() => setShowUpcoming(true)}
                >
                  Upcoming
                </button>
                <button
                  type="button"
                  className={`btn ${
                    !showUpcoming ? "btn-primary" : "btn-outline-primary"
                  }`}
                  onClick={() => setShowUpcoming(false)}
                >
                  Past
                </button>
              </div>
              <div className="simple-table-wrapper">
                {(() => {
                  const filteredServices = getFilteredServices();
                  return filteredServices.length === 0 ? (
                    <div className="no-data-message">
                      {showUpcoming 
                        ? "No upcoming services found." 
                        : "No past services found."
                      }
                    </div>
                  ) : (
                    <div className="simple-table services-list">
                      <div className="table-header">
                        <div className="header-cell location">Pick Up Location</div>
                        <div className="header-cell date">Date</div>
                        <div className="header-cell shifts">Shifts</div>
                      </div>
                      <div className="table-body">
                        {filteredServices
                          .sort((a, b) => {
                            const dateA = new Date(a.service_date);
                            const dateB = new Date(b.service_date);
                            return showUpcoming ? dateA - dateB : dateB - dateA;
                          })
                          .map((svc, idx) => (
                            <div key={idx} className="table-row">
                              <div className="table-cell location">{svc.location_name}</div>
                              <div className="table-cell date">
                                {new Date(svc.service_date).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                              <div className="table-cell shifts">
                                {(svc.isAmShift === 1 || svc.isAmShift === true || svc.isamshift === 1 || svc.isamshift === true) && (
                                  <span className="new-shift-badge am">AM</span>
                                )}
                                {(svc.isPmShift === 1 || svc.isPmShift === true || svc.ispmshift === 1 || svc.ispmshift === true) && (
                                  <span className="new-shift-badge pm">PM</span>
                                )}
                                {!(svc.isAmShift === 1 || svc.isAmShift === true || svc.isamshift === 1 || svc.isamshift === true || 
                                   svc.isPmShift === 1 || svc.isPmShift === true || svc.ispmshift === 1 || svc.ispmshift === true) && (
                                  <span className="no-shifts">No shifts</span>
                                )}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="col-md-6 mb-4">
            <div className="dashboard-card d-flex flex-column">
              <h5 className="mb-3">Schedule</h5>
              <p className="mb-3 text-muted" style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>
                Click on any schedule row to view route details
              </p>
              <div className="services-toggle mb-3" role="group">
                <button
                  type="button"
                  className={`btn ${
                    showUpcomingSchedule ? "btn-primary" : "btn-outline-primary"
                  }`}
                  onClick={() => setShowUpcomingSchedule(true)}
                >
                  Upcoming
                </button>
                <button
                  type="button"
                  className={`btn ${
                    !showUpcomingSchedule ? "btn-primary" : "btn-outline-primary"
                  }`}
                  onClick={() => setShowUpcomingSchedule(false)}
                >
                  Past
                </button>
              </div>
              <div className="simple-table-wrapper">
                {(() => {
                  const filteredSchedules = getFilteredSchedules();
                  return filteredSchedules.length === 0 ? (
                    <div className="no-data-message">
                      {showUpcomingSchedule 
                        ? "No upcoming schedules found." 
                        : "No past schedules found."
                      }
                    </div>
                  ) : (
                    <div className="simple-table schedule-list">
                      <div className="table-header">
                        <div className="header-cell location">Pickup Location</div>
                        <div className="header-cell departure">Departure</div>
                        <div className="header-cell arrival">Arrival</div>
                        <div className="header-cell shifts">Shifts</div>
                      </div>
                      <div className="table-body">
                        {filteredSchedules
                          .sort((a, b) => {
                            const dateA = new Date(a.departure_time);
                            const dateB = new Date(b.departure_time);
                            return showUpcomingSchedule ? dateA - dateB : dateB - dateA;
                          })
                          .map((schedule, idx) => (
                            <div 
                              key={idx} 
                              className="table-row clickable"
                              onClick={() => handleScheduleClick(schedule)}
                            >
                              <div className="table-cell location">{schedule.pickup_location_name}</div>
                              <div className="table-cell departure">
                                {new Date(schedule.departure_time).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              <div className="table-cell arrival">
                                {new Date(schedule.arrival_time).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              <div className="table-cell shifts">
                                {(schedule.isAmShift === 1 || schedule.isAmShift === true) && (
                                  <span className="new-shift-badge am">AM</span>
                                )}
                                {(schedule.isPmShift === 1 || schedule.isPmShift === true) && (
                                  <span className="new-shift-badge pm">PM</span>
                                )}
                                {!(schedule.isAmShift === 1 || schedule.isAmShift === true || 
                                   schedule.isPmShift === 1 || schedule.isPmShift === true) && (
                                  <span className="no-shifts">No shifts</span>
                                )}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Route Details Modal */}
      {showRouteModal && (
        <div className="modal-overlay" onClick={() => setShowRouteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Route Details</h4>
              <button 
                className="modal-close-btn"
                onClick={() => setShowRouteModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {selectedSchedule && (
                <div className="schedule-info mb-3">
                  <p><strong>Pickup Location:</strong> {selectedSchedule.pickup_location_name}</p>
                  <p><strong>Departure:</strong> {new Date(selectedSchedule.departure_time).toLocaleString()}</p>
                  <p><strong>Arrival:</strong> {new Date(selectedSchedule.arrival_time).toLocaleString()}</p>
                </div>
              )}
              <table className="routes-table">
                <thead>
                  <tr>
                    <th>Stop Order</th>
                    <th>Destination</th>
                    <th>Passenger (Count)</th>
                    <th>Tier</th>
                    <th>ETA</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty-state">
                        No routes found for this schedule.
                      </td>
                    </tr>
                  ) : (
                    routes.map((route, idx) => (
                      <tr key={idx}>
                        <td className="stop-order">{route.stop_order}</td>
                        <td className="destination-name">{route.destination_name || 'N/A'}</td>
                        <td className="passenger-info">
                          {route.passenger_name || 'N/A'}
                          {route.passenger_count && ` (${route.passenger_count})`}
                        </td>
                        <td className="tier-name">{route.tier_name || 'N/A'}</td>
                        <td className="eta-time">
                          {route.eta ? new Date(route.eta).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : 'N/A'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
