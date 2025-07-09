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
  pageTitle = "Management",
  entriesPerPage = 5,
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
    fetch(fetchUrl)
      .then((res) => res.json())
      .then((items) => {
        setData(items);
        setCurrentPage(1);
      })
      .catch(() => setData([]));
  }, [fetchUrl]);

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
    setEditItem(item);
    setEditFormData({ ...item });
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
      const res = await fetch(updateUrl(editItem[itemKey]), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editFormData),
      });

      if (!res.ok) throw new Error("Failed to update");

      const updatedItem = { ...editItem, ...editFormData };

      setData((prev) =>
        prev.map((item) =>
          item[itemKey] === updatedItem[itemKey] ? updatedItem : item
        )
      );
      setEditItem(null);
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
      for (const item of deletionList) {
        await fetch(deleteUrl(item[itemKey]), {
          method: "DELETE",
        });
      }

      setData((prev) =>
        prev.filter(
          (item) => !deletionList.some((d) => d[itemKey] === item[itemKey])
        )
      );
      setDeletionList([]);
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  return (
    <>
      <div className="page-title mb-3">
        <h3>{pageTitle}</h3>
      </div>

      <div className="page-content">
        <div className="management-card">
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
            <div className="management-header">
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
                <div className="management-row" key={item[itemKey]}>
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
                      className="btn btn-sm btn-primary me-2"
                      onClick={() => handleEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      className={`btn btn-sm ${
                        deletionList.some((d) => d[itemKey] === item[itemKey])
                          ? "btn-outline-secondary"
                          : "btn-danger"
                      }`}
                      disabled={
                        item.status !== "inactive" ||
                        deletionList.some((d) => d[itemKey] === item[itemKey])
                      }
                      onClick={() => {
                        if (
                          item.status === "inactive" &&
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
