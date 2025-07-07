import React, { useEffect, useState } from "react";

export default function AdminDashboard() {
  const user = JSON.parse(localStorage.getItem("user"));
  const [organization, setOrganization] = useState(null);

  useEffect(() => {
    if (user?.organization_id) {
      fetch(`http://localhost:5000/organizations/${user.organization_id}`)
        .then((res) => res.json())
        .then((data) => setOrganization(data))
        .catch((err) => setOrganization(null));
    }
    // eslint-disable-next-line
  }, []);

  return (
    <div style={{ padding: "1rem" }}>
      {organization ? (
        <div>
          <h1>Admin Dashboard - {organization.name}</h1>
          <p>
            Welcome, {user?.full_name || "admin"}! Here you can manage the
            system.
          </p>
          {/* Add more fields as needed */}
        </div>
      ) : (
        <p>Loading organization info...</p>
      )}
    </div>
  );
}
