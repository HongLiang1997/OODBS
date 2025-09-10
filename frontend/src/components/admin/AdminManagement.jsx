import React, { useEffect, useState } from "react";
import EditModal from "./AdminEditModal";
import SearchFilter from "./AdminSearchFilter";

export default function ManagementTable({
  fetchUrl,
  updateUrl,
  deleteUrl,
  searchFields = [],
  statusOptions = [],
  columns = [],
  itemKey = "id",
  itemLabel = "Item",
  organization = {},
  pageTitle = " ",
  cardTitle = " ",
  entriesPerPage = 5,
  dataFilter = null, // ADD THIS LINE
  disableActions = false, // ADD THIS LINE
}) {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [editItem, setEditItem] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [deletionList, setDeletionList] = useState([]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error("Failed to fetch data");
        let fetchedData = await response.json();

        // Apply data filter if provided
        if (dataFilter && typeof dataFilter === "function") {
          fetchedData = dataFilter(fetchedData);
        }

        setData(fetchedData);
        setCurrentPage(1);
      } catch (err) {
        console.error("Error fetching data:", err);
        setData([]);
      }
    };

    if (fetchUrl) {
      fetchData();
    }
  }, [fetchUrl, dataFilter]);

  // Filter data
  useEffect(() => {
    const searchLower = search.toLowerCase();
    const filtered = data.filter((item) => {
      const statusMatch =
        statusFilter === "all" || item.status === statusFilter;
      const searchMatch = searchFields.some((field) =>
        String(item[field] ?? "")
          .toLowerCase()
          .includes(searchLower)
      );
      return statusMatch && searchMatch;
    });
    setFilteredData(filtered);
    setCurrentPage(1);
  }, [data, search, statusFilter, searchFields]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / entriesPerPage);
  const startIndex = (currentPage - 1) * entriesPerPage;
  const currentPageData = filteredData.slice(
    startIndex,
    startIndex + entriesPerPage
  );

  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // Edit Handlers
  const handleEdit = (item) => {
    const formData = { ...item };

    // Handle custom getValue functions for columns
    columns.forEach((col) => {
      if (col.getValue && typeof col.getValue === "function") {
        formData[col.key] = col.getValue(item);
      }
    });

    setEditItem(item);
    setEditFormData(formData);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEditSubmit = async () => {
    setSaving(true);
    try {
      const submitData = { ...editFormData };

      // Convert shift dropdown value back to isAmShift/isPmShift
      if (submitData.shifts !== undefined) {
        switch (submitData.shifts) {
          case "am":
            submitData.isAmShift = true;
            submitData.isPmShift = false;
            break;
          case "pm":
            submitData.isAmShift = false;
            submitData.isPmShift = true;
            break;
          case "both":
            submitData.isAmShift = true;
            submitData.isPmShift = true;
            break;
          case "none":
          default:
            submitData.isAmShift = false;
            submitData.isPmShift = false;
            break;
        }
        delete submitData.shifts; // Remove the combined shift field
      }

      const res = await fetch(updateUrl(editItem[itemKey]), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submitData),
      });

      if (!res.ok) throw new Error("Failed to update");

      // Refresh data and close modal
      fetchData();
      setEditItem(null);
      setEditFormData({});
    } catch (err) {
      console.error("Error saving edit:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMultiple = async () => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${deletionList.length} ${itemLabel}${
        deletionList.length > 1 ? "s" : ""
      }?`
    );
    if (!confirmDelete) return;

    try {
      const deletedItems = [];
      const failedItems = [];

      for (const item of deletionList) {
        try {
          const response = await fetch(deleteUrl(item[itemKey]), {
            method: "DELETE",
          });
          
          if (response.ok) {
            deletedItems.push(item);
          } else {
            const errorData = await response.json();
            console.error(`Failed to delete ${itemLabel} ${item[itemKey]}:`, errorData);
            failedItems.push(item);
          }
        } catch (err) {
          console.error(`Error deleting ${itemLabel} ${item[itemKey]}:`, err);
          failedItems.push(item);
        }
      }

      // Update data by removing successfully deleted items
      if (deletedItems.length > 0) {
        setData((prev) =>
          prev.filter(
            (item) => !deletedItems.some((d) => d[itemKey] === item[itemKey])
          )
        );
      }

      // Clear deletion list or keep failed items
      if (failedItems.length === 0) {
        setDeletionList([]);
      } else {
        setDeletionList(failedItems);
        alert(`${failedItems.length} ${itemLabel}${failedItems.length > 1 ? 's' : ''} could not be deleted. Check console for details.`);
      }

      if (deletedItems.length > 0) {
        alert(`Successfully deleted ${deletedItems.length} ${itemLabel}${deletedItems.length > 1 ? 's' : ''}.`);
      }

    } catch (err) {
      console.error("Error during bulk deletion:", err);
      alert("An error occurred during deletion. Check console for details.");
    }
  };

  return (
    <>
      {/* Only render page title container if pageTitle has content */}
      {pageTitle && pageTitle.trim() && (
        <div className="page-title mb-3">
          <h3>{pageTitle}</h3>
        </div>
      )}

      <div className="page-content">
        <div className="management-card">
          <h3>{cardTitle}</h3>
          <SearchFilter
            searchValue={search}
            onSearchChange={(e) => setSearch(e.target.value)}
            filterValue={statusFilter}
            onFilterChange={(e) => setStatusFilter(e.target.value)}
            filterOptions={statusOptions}
            filterAllLabel="All"
            searchPlaceholder={`Search ${itemLabel.toLowerCase()}s...`}
          />

          <div className="management-list">
            <div className="management-header" data-columns={columns.length}>
              {columns.map(({ key, label }) => (
                <div
                  key={key}
                  className={`management-col management-col-${key}`}
                >
                  {label}
                </div>
              ))}
              <div className="management-col actions-col">Actions</div>
            </div>

            {currentPageData.length === 0 ? (
              <div className="management-empty">No records found.</div>
            ) : (
              currentPageData.map((item) => (
                <div
                  className="management-row"
                  key={item[itemKey]}
                  data-columns={columns.length}
                >
                  {columns.map(({ key, render }) => (
                    <div
                      key={key}
                      className={`management-col management-col-${key}`}
                    >
                      {render ? render(item) : item[key]}
                    </div>
                  ))}
                  <div className="management-col actions-col">
                    <button
                      className={`btn btn-sm me-2 ${
                        disableActions 
                          ? "btn-outline-secondary" 
                          : "btn-primary"
                      }`}
                      onClick={() => handleEdit(item)}
                      disabled={disableActions}
                      style={{
                        opacity: disableActions ? 0.5 : 1,
                        cursor: disableActions ? "not-allowed" : "pointer"
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className={`btn btn-sm ${
                        disableActions
                          ? "btn-outline-secondary"
                          : deletionList.some((d) => d[itemKey] === item[itemKey])
                          ? "btn-outline-secondary"
                          : "btn-danger"
                      }`}
                      disabled={
                        disableActions ||
                        deletionList.some((d) => d[itemKey] === item[itemKey])
                      }
                      style={{
                        opacity: disableActions ? 0.5 : 1,
                        cursor: disableActions ? "not-allowed" : "pointer"
                      }}
                      onClick={() => {
                        if (
                          !disableActions &&
                          !deletionList.some(
                            (d) => d[itemKey] === item[itemKey]
                          )
                        ) {
                          setDeletionList((prev) => [...prev, item]);
                        }
                      }}
                    >
                      {deletionList.some((d) => d[itemKey] === item[itemKey])
                        ? "Added"
                        : "Delete"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="mt-3">
              <ul className="pagination justify-content-center">
                <li
                  className={`page-item ${currentPage === 1 ? "disabled" : ""}`}
                >
                  <button
                    className="page-link"
                    onClick={() => goToPage(currentPage - 1)}
                  >
                    Previous
                  </button>
                </li>
                {[...Array(totalPages)].map((_, i) => (
                  <li
                    key={i + 1}
                    className={`page-item ${
                      currentPage === i + 1 ? "active" : ""
                    }`}
                  >
                    <button
                      className="page-link"
                      onClick={() => goToPage(i + 1)}
                    >
                      {i + 1}
                    </button>
                  </li>
                ))}
                <li
                  className={`page-item ${
                    currentPage === totalPages ? "disabled" : ""
                  }`}
                >
                  <button
                    className="page-link"
                    onClick={() => goToPage(currentPage + 1)}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          )}

          {/* Deletion List */}
          {deletionList.length > 0 && (
            <div className="card border-danger mt-4">
              <div className="card-header bg-danger text-white">
                Pending Deletion
              </div>
              <ul className="list-group list-group-flush">
                {deletionList.map((item) => (
                  <li
                    key={item[itemKey]}
                    className="list-group-item d-flex justify-content-between align-items-center"
                  >
                    {columns
                      .map((col) => item[col.key])
                      .filter(Boolean)
                      .join(" - ")}
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() =>
                        setDeletionList((prev) =>
                          prev.filter((d) => d[itemKey] !== item[itemKey])
                        )
                      }
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
                >
                  Delete {deletionList.length} {itemLabel}
                  {deletionList.length > 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {/* Edit Modal */}
          {editItem && (
            <EditModal
              title={`Edit ${itemLabel}`}
              data={editFormData}
              columns={columns}
              onChange={handleEditChange}
              onClose={() => setEditItem(null)}
              onSave={handleEditSubmit}
              saving={saving}
            />
          )}
        </div>
      </div>
    </>
  );
}
