import React from "react";
import ManagementTable from "../../../components/admin/AdminManagement";
import "../../../styles/admin/admin-management.css";
import { FaInfoCircle } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

const BUS_STATUSES = [
  { key: "active", label: "Active" },
  { key: "enroute", label: "Enroute" },
  { key: "on-break", label: "On Break" },
  { key: "inactive", label: "Inactive" },
];

export default function BusManagement() {
  const user = JSON.parse(localStorage.getItem("user"));
  const orgId = user?.organization_id;
  const navigate = useNavigate();

  // Custom render for plate_number column
  const renderPlateNumber = (bus) => (
    <span
      style={{
        cursor: "pointer",
        color: "#007bff",
        textDecoration: "underline",
      }}
      onClick={() =>
        navigate(`/admin/bus-management/bus-details/${bus.bus_id}`)
      }
      title={`View details for ${bus.plate_number}`}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          navigate(`/admin/bus-management/bus-details/${bus.bus_id}`);
        }
      }}
      className="d-inline-flex align-items-center gap-2"
    >
      {bus.plate_number}
      <FaInfoCircle style={{ marginLeft: 4 }} />
    </span>
  );

  // Custom render for status column
  const renderStatus = (bus) => (
    <span className={`bus-status-pill ${bus.status}`}>{bus.status}</span>
  );

  return (
    <ManagementTable
      fetchUrl={`http://localhost:5000/buses/organization/${orgId}`}
      updateUrl={(id) => `http://localhost:5000/buses/${id}`}
      deleteUrl={(id) => `http://localhost:5000/buses/${id}`}
      searchFields={[
        "plate_number",
        "driver_name",
        "driver_phone_num",
        "company",
        "status",
      ]}
      statusOptions={BUS_STATUSES}
      itemLabel="Bus"
      itemKey="bus_id"
      pageTitle="Bus Management"
      columns={[
        {
          key: "plate_number",
          label: "Plate Number",
          editable: true,
          inputType: "text",
          render: renderPlateNumber, // <-- Custom render
        },
        {
          key: "driver_name",
          label: "Driver",
          editable: true,
          inputType: "text",
        },
        {
          key: "driver_phone_num",
          label: "Phone",
          editable: true,
          inputType: "text",
        },
        {
          key: "capacity",
          label: "Capacity",
          editable: true,
          inputType: "number",
        },
        {
          key: "company",
          label: "Company",
          editable: true,
          inputType: "text",
        },
        {
          key: "status",
          label: "Status",
          editable: true,
          inputType: "select",
          options: BUS_STATUSES,
          render: renderStatus, // <-- Custom render
        },
      ]}
    />
  );
}
