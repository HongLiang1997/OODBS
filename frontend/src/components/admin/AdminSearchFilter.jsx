import React from "react";

export default function SearchFilter({
  searchValue,
  onSearchChange,
  filterValue,
  onFilterChange,
  filterOptions = [],
  filterAllLabel = "All",
  searchPlaceholder = "Search...",
}) {
  return (
    <div className="management-controls horizontal-search-filter">
      <input
        type="text"
        className="search-input"
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={onSearchChange}
      />
      <select
        className="filter-select"
        value={filterValue}
        onChange={onFilterChange}
      >
        <option value="all">{filterAllLabel}</option>
        {filterOptions.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
