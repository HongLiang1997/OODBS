import React from 'react';
import { Outlet } from 'react-router-dom';
import Nav from '../components/Nav';  // adjust path if needed

export default function AdminLayout() {
  return (
    <>
      <Nav />
      <main>
        <Outlet />
      </main>
    </>
  );
}
