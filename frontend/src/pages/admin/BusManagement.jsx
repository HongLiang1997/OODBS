import React, { useEffect, useState } from "react";
import "../../styles/admin-bus.css";

const BUS_STATUSES = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "enroute", label: "Enroute" },
  { key: "on-break", label: "On Break" },
  { key: "inactive", label: "Inactive" },
];

export default function BusManagement() {
  const user = JSON.parse(localStorage.getItem("user"));
  const [organization, setOrganization] = useState(null);
  const [buses, setBuses] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortAsc, setSortAsc] = useState(true);

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

  const handleEdit = (bus) => {
    alert(`Edit bus: ${bus.plate_number}`);
  };

  const handleDelete = (bus) => {
    if (
      window.confirm(`Are you sure you want to delete bus ${bus.plate_number}?`)
    ) {
      fetch(`http://localhost:5000/buses/${bus.bus_id}`, {
        method: "DELETE",
      }).then((res) => {
        if (res.ok) setBuses(buses.filter((b) => b.bus_id !== bus.bus_id));
      });
    }
  };

  // Filter and search
  let filtered = buses.filter((bus) => {
    const matchesStatus = statusFilter === "all" || bus.status === statusFilter;
    const searchLower = search.toLowerCase(); // <-- Add this line
    const matchesSearch =
      bus.plate_number.toLowerCase().includes(searchLower) ||
      bus.driver_name.toLowerCase().includes(searchLower) ||
      bus.company.toLowerCase().includes(searchLower) ||
      bus.status.toLowerCase().includes(searchLower) ||
      String(bus.driver_phone_num).includes(searchLower) ||
      String(bus.capacity).includes(searchLower);
    return matchesStatus && matchesSearch;
  });

  // Sort by status
  filtered = filtered.sort((a, b) => {
    if (a.status === b.status) return 0;
    return sortAsc
      ? a.status.localeCompare(b.status)
      : b.status.localeCompare(a.status);
  });

  return (
    <div>
      {organization ? (
        <>
          <div className="page-title">
            <h3>Bus Management - {organization.name}</h3>
          </div>
          <div className="dashboard-card bus-management-card">
            <div className="bus-management-controls">
              <input
                type="text"
                className="bus-search"
                placeholder="Search by plate, driver, or company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="bus-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {BUS_STATUSES.map((status) => (
                  <option key={status.key} value={status.key}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="bus-management-list">
              <div className="bus-management-header">
                <div>Plate Number</div>
                <div>Driver Name</div>
                <div>Driver Phone</div>
                <div>Capacity</div>
                <div>Company</div>
                <div
                  className="sortable-status"
                  onClick={() => setSortAsc((asc) => !asc)}
                  style={{
                    cursor: "pointer",
                    userSelect: "none",
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Sort by status"
                >
                  Status
                  <span style={{ marginLeft: 4 }}>{sortAsc ? "▲" : "▼"}</span>
                </div>
                <div>Actions</div>
              </div>
              {filtered.length === 0 ? (
                <div className="bus-management-empty">No buses found.</div>
              ) : (
                filtered.map((bus) => (
                  <div className="bus-management-row" key={bus.bus_id}>
                    <div>{bus.plate_number}</div>
                    <div>{bus.driver_name}</div>
                    <div>{bus.driver_phone_num}</div>
                    <div>{bus.capacity}</div>
                    <div>{bus.company}</div>
                    <div>
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
                    <div>
                      <button
                        className="bus-action-btn edit"
                        onClick={() => handleEdit(bus)}
                      >
                        Edit
                      </button>
                      <button
                        className="bus-action-btn delete"
                        onClick={() => handleDelete(bus)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        <p>Loading organization info...</p>
      )}
    </div>
  );
}
