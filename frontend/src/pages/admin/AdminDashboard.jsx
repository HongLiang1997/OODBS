import React, { useEffect, useState } from "react";
import "../../styles/admin/admin-dashboard.css";

const BUS_STATUSES = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "enroute", label: "Enroute" },
  { key: "on-break", label: "On Break" },
  { key: "inactive", label: "Inactive" },
];

const SERVICE_TYPES = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

export default function AdminDashboard() {
  const user = JSON.parse(localStorage.getItem("user"));
  const [organization, setOrganization] = useState(null);
  const [buses, setBuses] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedServiceType, setSelectedServiceType] = useState("upcoming");

  useEffect(() => {
    if (user?.organization_id) {
      fetch(`http://localhost:5000/organizations/${user.organization_id}`)
        .then((res) => res.json())
        .then((data) => setOrganization(data))
        .catch(() => setOrganization(null));

      fetch(`http://localhost:5000/buses/organization/${user.organization_id}`)
        .then((res) => res.json())
        .then((data) => setBuses(data))
        .catch(() => setBuses([]));

      fetch(`http://localhost:5000/services/organization/${user.organization_id}`)
        .then((res) => res.json())
        .then((data) => setServices(data))
        .catch(() => setServices([]));
    }
    // eslint-disable-next-line
  }, []);

  // Filter buses by selected status
  const filteredBuses =
    selectedStatus === "all"
      ? buses
      : buses.filter((bus) => bus.status === selectedStatus);

  const busOverview = filteredBuses.slice(0, 6);

  // Filter services by type (upcoming or past)
  const filteredServices = services.filter((service) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const serviceDate = new Date(service.service_date);
    serviceDate.setHours(0, 0, 0, 0);
    
    if (selectedServiceType === "upcoming") {
      return serviceDate >= today;
    } else {
      return serviceDate < today;
    }
  });

  const serviceOverview = filteredServices.slice(0, 6);

  // Format date to DD/MM/YYYY
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Format shifts
  const formatShifts = (service) => {
    if (service.isAmShift && service.isPmShift) return "AM, PM";
    if (service.isAmShift) return "AM";
    if (service.isPmShift) return "PM";
    return "None";
  };

  return (
    <div>
      {organization ? (
        <>
          <div className="page-title">
            <h3>Admin Dashboard - {organization.name}</h3>
          </div>
          <div className="page-content">
            <div className="row">
              {/* Bus Overview Card */}
              <div className="col-md-6">
                <div className="dashboard-card bus-overview-card">
                  <div className="bus-overview-header">
                    <h4>Bus Overview</h4>
                    <a
                      href="/admin/bus-management"
                      className="bus-overview-link"
                    >
                      View All
                    </a>
                  </div>
                  {/* Status Tabs */}
                  <div className="bus-status-tabs">
                    {BUS_STATUSES.map((status) => (
                      <button
                        key={status.key}
                        className={`bus-status-tab${
                          selectedStatus === status.key ? " active" : ""
                        }`}
                        onClick={() => setSelectedStatus(status.key)}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                  <div className="bus-overview-subtitle">
                    {selectedStatus === "all"
                      ? `Showing up to 6 buses (All Statuses)`
                      : `Showing up to 6 buses (${BUS_STATUSES.find(s => s.key === selectedStatus)?.label})`}
                  </div>
                  <div className="bus-overview-list">
                    {busOverview.length === 0 ? (
                      <div className="bus-overview-empty">No buses found.</div>
                    ) : (
                      busOverview.map((bus) => (
                        <div className="bus-overview-item" key={bus.bus_id}>
                          <div>
                            <strong>{bus.plate_number}</strong>
                            <span className="bus-status">({bus.status})</span>
                            <div className="bus-overview-meta">
                              Driver: {bus.driver_name} | Phone: {bus.driver_phone_num}
                            </div>
                          </div>
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
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              {/* Other dashboard cards */}
              <div className="col-md-6">
                <div className="dashboard-card bus-overview-card">
                  <div className="bus-overview-header">
                    <h4>Services Overview</h4>
                    <a
                      href="/admin/service-management"
                      className="bus-overview-link"
                    >
                      View All
                    </a>
                  </div>
                  {/* Service Type Tabs */}
                  <div className="bus-status-tabs">
                    {SERVICE_TYPES.map((type) => (
                      <button
                        key={type.key}
                        className={`bus-status-tab${
                          selectedServiceType === type.key ? " active" : ""
                        }`}
                        onClick={() => setSelectedServiceType(type.key)}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                  <div className="bus-overview-subtitle">
                    {`Showing up to 6 services (${SERVICE_TYPES.find(t => t.key === selectedServiceType)?.label})`}
                  </div>
                  <div className="bus-overview-list">
                    {serviceOverview.length === 0 ? (
                      <div className="bus-overview-empty">No {selectedServiceType} services found.</div>
                    ) : (
                      serviceOverview.map((service) => (
                        <div className="bus-overview-item" key={service.service_id}>
                          <div>
                            <strong>{service.plate_number}</strong>
                            <span className="bus-status">({formatDate(service.service_date)})</span>
                            <div className="bus-overview-meta">
                              Location: {service.location_name} | Shifts: {formatShifts(service)}
                            </div>
                          </div>
                          <span
                            className={`bus-status-pill ${
                              selectedServiceType === "upcoming" ? "active" : "inactive"
                            }`}
                          >
                            {selectedServiceType}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="dashboard-card">Card 3</div>
              </div>
              <div className="col-md-6">
                <div className="dashboard-card">Card 4</div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <p>Loading organization info...</p>
      )}
    </div>
  );
}