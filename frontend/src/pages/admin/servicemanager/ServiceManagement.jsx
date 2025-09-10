import React, { useState, useEffect } from "react";
import ManagementTable from "../../../components/admin/AdminManagement";
import "../../../styles/admin/admin-management.css";
import "../../../styles/admin/servicemanager/admin-service-management.css";
import { FaInfoCircle } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

export default function ServiceManagement() {
  const user = JSON.parse(localStorage.getItem("user"));
  const orgId = user?.organization_id;
  const navigate = useNavigate();
  const [pickupLocations, setPickupLocations] = useState([]);

  // Fetch pickup locations for the organization
  useEffect(() => {
    if (!orgId) return;

    fetch(`http://localhost:5000/pickup-locations/organization/${orgId}`)
      .then((res) => res.json())
      .then((data) => setPickupLocations(data))
      .catch((err) => {
        console.error("Error fetching pickup locations:", err);
        setPickupLocations([]);
      });
  }, [orgId]);

  // Custom render for service date with DD/MM/YYYY format
  const renderServiceDate = (service) => {
    const date = new Date(service.service_date);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return <span>{`${day}/${month}/${year}`}</span>;
  };

  // Custom render for plate_number column
  const renderPlateNumber = (service) => (
    <span
      style={{
        cursor: "pointer",
        color: "#007bff",
        textDecoration: "underline",
      }}
      onClick={() =>
        navigate(`/admin/bus-management/bus-details/${service.bus_id}`)
      }
      title={`View details for ${service.plate_number}`}
      role="button"
      tabIndex={0}
      className="d-inline-flex align-items-center gap-2"
    >
      {service.plate_number}
      <FaInfoCircle style={{ marginLeft: 4 }} />
    </span>
  );

  // Custom render for shifts - display combined shifts
  const renderShifts = (service) => {
    if (service.isAmShift && service.isPmShift) return "AM, PM";
    if (service.isAmShift) return "AM";
    if (service.isPmShift) return "PM";
    return "None";
  };

  // Get shift value for editing (combines isAmShift and isPmShift into one value)
  const getShiftValue = (service) => {
    if (service.isAmShift && service.isPmShift) return "both";
    if (service.isAmShift) return "am";
    if (service.isPmShift) return "pm";
    return "none";
  };

  // Filter function to show only future services
  const filterFutureServices = (services) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return services.filter((service) => {
      const serviceDate = new Date(service.service_date);
      serviceDate.setHours(0, 0, 0, 0);
      return serviceDate >= today;
    });
  };

  // Filter function to show only past services
  const filterPastServices = (services) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return services.filter((service) => {
      const serviceDate = new Date(service.service_date);
      serviceDate.setHours(0, 0, 0, 0);
      return serviceDate < today;
    });
  };

  // Transform pickup locations for dropdown options
  const pickupLocationOptions = pickupLocations.map((location) => ({
    key: location.pickup_id,
    label: location.name,
  }));

  // Shift options for dropdown
  const shiftOptions = [
    { key: "am", label: "AM Only" },
    { key: "pm", label: "PM Only" },
    { key: "both", label: "AM, PM" },
    { key: "none", label: "None" },
  ];

  // Shared columns configuration
  const serviceColumns = [
    {
      key: "plate_number",
      label: "Bus No",
      editable: false,
      render: renderPlateNumber,
    },
    {
      key: "pickup_id",
      label: "Pick-up Location",
      editable: true,
      inputType: "select",
      options: pickupLocationOptions,
      render: (service) => service.location_name,
    },
    {
      key: "service_date",
      label: "Date",
      editable: true,
      inputType: "date",
      render: renderServiceDate,
    },
    {
      key: "shifts",
      label: "Shift",
      editable: true,
      inputType: "select",
      options: shiftOptions,
      render: renderShifts,
      getValue: getShiftValue,
    },
  ];

  // Past services columns (read-only)
  const pastServiceColumns = [
    {
      key: "plate_number",
      label: "Bus No",
      editable: false,
      render: renderPlateNumber,
    },
    {
      key: "pickup_id",
      label: "Pick-up Location",
      editable: false,
      render: (service) => service.location_name,
    },
    {
      key: "service_date",
      label: "Date",
      editable: false,
      render: renderServiceDate,
    },
    {
      key: "shifts",
      label: "Shift",
      editable: false,
      render: renderShifts,
    },
  ];

  return (
    <div>
      <div className="service-management-container">
        {/* Upcoming Services Card */}
        <ManagementTable
          fetchUrl={`http://localhost:5000/services/organization/${orgId}`}
          updateUrl={(id) => `http://localhost:5000/services/${id}`}
          deleteUrl={(id) => `http://localhost:5000/services/${id}`}
          searchFields={["plate_number", "location_name", "service_date"]}
          statusOptions={[]}
          itemLabel="Service"
          itemKey="service_id"
          pageTitle="Service Management"
          cardTitle="Upcoming Services"
          dataFilter={filterFutureServices}
          columns={serviceColumns}
        />

        {/* Past Services Card */}

        <ManagementTable
          fetchUrl={`http://localhost:5000/services/organization/${orgId}`}
          updateUrl={(id) => `http://localhost:5000/services/${id}`}
          deleteUrl={(id) => `http://localhost:5000/services/${id}`}
          searchFields={["plate_number", "location_name", "service_date"]}
          statusOptions={[]}
          itemLabel="Service"
          itemKey="service_id"
          pageTitle=" "
          cardTitle="Past Services"
          dataFilter={filterPastServices}
          columns={pastServiceColumns}
          disableActions={true}
        />
      </div>
    </div>
  );
}
