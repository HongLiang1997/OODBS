import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaInfoCircle } from "react-icons/fa";
import "../../../styles/admin/admin-bus.css";

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
  const [currentPage, setCurrentPage] = useState(1);
  const [deletionList, setDeletionList] = useState([]);
  const navigate = useNavigate();
  // State for edit form popup
  const [busBeingEdited, setBusBeingEdited] = useState(null);
  const [editFormData, setEditFormData] = useState({
    plate_number: "",
    driver_name: "",
    driver_phone_num: "",
    driver_email: "",
    driver_password: "",
    capacity: "",
    company: "",
    status: "inactive",
  });

  const ITEMS_PER_PAGE = 5;

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
    setBusBeingEdited(bus);
    setEditFormData({
      plate_number: bus.plate_number,
      driver_name: bus.driver_name,
      driver_phone_num: bus.driver_phone_num,
      driver_email: bus.driver_email || "",
      driver_password: "", // Don't pre-fill password for security
      capacity: bus.capacity,
      company: bus.company,
      status: bus.status,
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle form submission
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(
        `http://localhost:5000/buses/${busBeingEdited.bus_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editFormData),
        }
      );
      if (res.ok) {
        // Update local bus list
        setBuses((prev) =>
          prev.map((b) =>
            b.bus_id === busBeingEdited.bus_id ? { ...b, ...editFormData } : b
          )
        );
        setBusBeingEdited(null);
      } else {
        alert("Failed to update bus");
      }
    } catch (err) {
      alert("Error updating bus: " + err.message);
    }
  };

  // Cancel editing
  const handleEditCancel = () => {
    setBusBeingEdited(null);
  };

  // Redirect to bus details page (adjust route as needed)
  const goToBusDetails = (bus_id) => {
    navigate(`/admin/bus-management/bus-details/${bus_id}`);
  };

  const handleAddToDeleteList = (bus) => {
    if (!deletionList.some((b) => b.bus_id === bus.bus_id)) {
      setDeletionList((prev) => [...prev, bus]);
    }
  };

  const handleDeleteMultiple = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${deletionList.length} bus(es)?`
      )
    ) {
      Promise.all(
        deletionList.map((bus) =>
          fetch(`http://localhost:5000/buses/${bus.bus_id}`, {
            method: "DELETE",
          })
        )
      ).then(() => {
        // Update bus list and clear cart
        setBuses((prev) =>
          prev.filter(
            (bus) => !deletionList.some((d) => d.bus_id === bus.bus_id)
          )
        );
        setDeletionList([]);
      });
    }
  };

  // Filter and search
  let filtered = buses.filter((bus) => {
    const matchesStatus = statusFilter === "all" || bus.status === statusFilter;
    const searchLower = search.toLowerCase();
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

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedBuses = filtered.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  const goToPage = (page) => {
    if (page < 1) page = 1;
    else if (page > totalPages) page = totalPages;
    setCurrentPage(page);
  };

  return (
    <div>
      {organization ? (
        <>
          <div className="page-title">
            <h3>Bus Management - {organization.name}</h3>
          </div>

          {/* Edit Form Modal */}
          {busBeingEdited && (
            <div
              className="modal show d-block"
              tabIndex="-1"
              role="dialog"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            >
              <div className="modal-dialog" role="document">
                <div className="modal-content">
                  <form onSubmit={handleEditSubmit}>
                    <div className="modal-header">
                      <h5 className="modal-title">Edit Bus - {busBeingEdited.plate_number}</h5>
                      <button
                        type="button"
                        className="btn-close"
                        onClick={handleEditCancel}
                        aria-label="Close"
                      />
                    </div>
                    <div className="modal-body">
                      {/* Inputs */}
                      <div className="mb-3">
                        <label className="form-label">Plate Number</label>
                        <input
                          type="text"
                          className="form-control"
                          name="plate_number"
                          value={editFormData.plate_number}
                          onChange={handleEditChange}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Driver Name</label>
                        <input
                          type="text"
                          className="form-control"
                          name="driver_name"
                          value={editFormData.driver_name}
                          onChange={handleEditChange}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Driver Phone</label>
                        <input
                          type="text"
                          className="form-control"
                          name="driver_phone_num"
                          value={editFormData.driver_phone_num}
                          onChange={handleEditChange}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Driver Email</label>
                        <input
                          type="email"
                          className="form-control"
                          name="driver_email"
                          value={editFormData.driver_email}
                          onChange={handleEditChange}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Driver Password</label>
                        <input
                          type="password"
                          className="form-control"
                          name="driver_password"
                          value={editFormData.driver_password}
                          onChange={handleEditChange}
                          placeholder="Leave empty to keep current password"
                          minLength="6"
                        />
                        <small className="form-text text-muted">
                          Leave empty to keep the current password, or enter a new password (min 6 characters)
                        </small>
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Capacity</label>
                        <input
                          type="number"
                          className="form-control"
                          name="capacity"
                          value={editFormData.capacity}
                          onChange={handleEditChange}
                          required
                          min={1}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Company</label>
                        <input
                          type="text"
                          className="form-control"
                          name="company"
                          value={editFormData.company}
                          onChange={handleEditChange}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Status</label>
                        <select
                          className="form-select"
                          name="status"
                          value={editFormData.status}
                          onChange={handleEditChange}
                          required
                        >
                          {BUS_STATUSES.filter(s => s.key !== "all").map((status) => (
                            <option key={status.key} value={status.key}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button type="submit" className="btn btn-primary">
                        Save Changes
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleEditCancel}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Main Bus Management Card */}
          <div className="dashboard-card bus-management-card">
            <div className="bus-management-controls">
              <input
                type="text"
                className="bus-search"
                placeholder="Search by plate, driver, or company..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1); // reset page when searching
                }}
              />
              <select
                className="bus-status-filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1); // reset page when filtering
                }}
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
              {paginatedBuses.length === 0 ? (
                <div className="bus-management-empty">No buses found.</div>
              ) : (
                paginatedBuses.map((bus) => (
                  <div className="bus-management-row" key={bus.bus_id}>
                    <div className="d-flex align-items-center gap-2">
                      {bus.plate_number}
                      <button
                        type="button"
                        onClick={() => goToBusDetails(bus.bus_id)}
                        className="btn btn-link p-0"
                        title="View Bus Details"
                        aria-label={`View details for ${bus.plate_number}`}
                      >
                        <FaInfoCircle size={18} />
                      </button>
                    </div>
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
                      {bus.status === "inactive" ? (
                        <button
                          className="bus-action-btn add-delete"
                          onClick={() => handleAddToDeleteList(bus)}
                          disabled={deletionList.some(
                            (b) => b.bus_id === bus.bus_id
                          )}
                        >
                          {deletionList.some((b) => b.bus_id === bus.bus_id)
                            ? "Added"
                            : "Add to Delete"}
                        </button>
                      ) : (
                        <button
                          className="bus-action-btn add-delete disabled"
                          disabled
                        >
                          Only for Inactive
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <nav className="bus-pagination" aria-label="Bus list pagination">
                <ul className="pagination justify-content-center">
                  <li
                    className={`page-item ${
                      currentPage === 1 ? "disabled" : ""
                    }`}
                  >
                    <button
                      className="page-link"
                      onClick={() => goToPage(currentPage - 1)}
                      aria-label="Previous"
                      disabled={currentPage === 1}
                    >
                      &laquo;
                    </button>
                  </li>

                  {[...Array(totalPages)].map((_, i) => {
                    const page = i + 1;
                    return (
                      <li
                        key={page}
                        className={`page-item ${
                          currentPage === page ? "active" : ""
                        }`}
                      >
                        <button
                          className="page-link"
                          onClick={() => goToPage(page)}
                        >
                          {page}
                        </button>
                      </li>
                    );
                  })}

                  <li
                    className={`page-item ${
                      currentPage === totalPages ? "disabled" : ""
                    }`}
                  >
                    <button
                      className="page-link"
                      onClick={() => goToPage(currentPage + 1)}
                      aria-label="Next"
                      disabled={currentPage === totalPages}
                    >
                      &raquo;
                    </button>
                  </li>
                </ul>
              </nav>
            )}

            {deletionList.length > 0 && (
              <div className="card border-danger mt-4">
                <div className="card-header bg-danger text-white">
                  Pending Deletion
                </div>
                <ul className="list-group list-group-flush">
                  {deletionList.map((bus) => (
                    <li
                      key={bus.bus_id}
                      className="list-group-item d-flex justify-content-between align-items-center"
                    >
                      {bus.plate_number} - {bus.driver_name}
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() =>
                          setDeletionList((prev) =>
                            prev.filter((b) => b.bus_id !== bus.bus_id)
                          )
                        }
                        aria-label={`Remove ${bus.plate_number} from deletion list`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="card-footer text-end">
                  <button
                    className="btn btn-danger"
                    onClick={handleDeleteMultiple}
                    aria-label={`Delete ${deletionList.length} bus${
                      deletionList.length > 1 ? "es" : ""
                    }`}
                  >
                    Delete {deletionList.length} Bus
                    {deletionList.length > 1 ? "es" : ""}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <p>Loading organization info...</p>
      )}
    </div>
  );
}
