import React, { useState } from 'react';
import "../styles/admin-nav.css";
import "../styles/admin-main.css";

import { Outlet } from 'react-router-dom';
import Nav from '../components/admin/AdminNav';

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <>
      <Nav sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <main className={`main-content${sidebarOpen ? ' shifted' : ''}`}>
        <Outlet />
      </main>
    </>
  );
}