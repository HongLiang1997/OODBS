import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "../../../styles/admin/busmanager/admin-bus-details.css";

export default function BusDetailPage() {
  const { bus_id } = useParams();
  const [bus, setBus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [services, setServices] = useState([]);

  useEffect(() => {
    if (!bus_id) return;
    fetch(`http://localhost:5000/services/bus/${bus_id}`)
      .then((res) => res.json())
      .then((data) => setServices(data))
      .catch(() => setServices([]));
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
              <div>
                <table className="bus-shift-table">
                  <thead>
                    <tr>
                      <th>Pick Up Location</th>
                      <th>Date</th>
                      <th>Shifts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center">
                          No services found.
                        </td>
                      </tr>
                    ) : (
                      services.map((svc, idx) => (
                        <tr key={idx}>
                          <td>{svc.location_name}</td>
                          <td>
                            {new Date(svc.service_date).toLocaleDateString()}
                          </td>
                          <td>
                            {svc.isAmShift || svc.isamshift ? "Am" : ""}
                            {(svc.isAmShift || svc.isamshift) &&
                            (svc.isPmShift || svc.ispmshift)
                              ? ", "
                              : ""}
                            {svc.isPmShift || svc.ispmshift ? "Pm" : ""}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="col-md-6 mb-4">
            <div className="dashboard-card d-flex flex-column">
              <h5 className="mb-3">Schedule</h5>
              <div>
                <p>Put your content here.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
