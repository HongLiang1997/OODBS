import React, { useEffect, useState } from "react";
import "../../styles/admin-dashboard.css";

const BUS_STATUSES = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "enroute", label: "Enroute" },
  { key: "on-break", label: "On Break" },
  { key: "inactive", label: "Inactive" },
];

export default function AdminDashboard() {
  const user = JSON.parse(localStorage.getItem("user"));
  const [organization, setOrganization] = useState(null);
  const [buses, setBuses] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState("all");

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
    }
    // eslint-disable-next-line
  }, []);

  // Filter buses by selected status
  const filteredBuses =
    selectedStatus === "all"
      ? buses
      : buses.filter((bus) => bus.status === selectedStatus);

  const busOverview = filteredBuses.slice(0, 6);

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
              <div className="col-md-6 mb-4">
                <div className="dashboard-card bus-overview-card">
                  <div className="bus-overview-header">
                    <h3>Bus Overview</h3>
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
              <div className="col-md-6 mb-4">
                <div className="dashboard-card">Card 2</div>
              </div>
              <div className="col-md-6 mb-4">
                <div className="dashboard-card">Card 3</div>
              </div>
              <div className="col-md-6 mb-4">
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