# OODBS

OODBS is a full-stack on-demand bus management system built for passengers, drivers, and administrators. The platform combines a Node.js/Express backend, a React/Vite frontend, and a MySQL-backed data layer to support bus operations, service management, route planning, and traffic-aware scheduling.

## What this project includes

- Passenger-facing login and dashboard experience
- Driver login and dashboard experience
- Admin dashboard for managing buses, services, destinations, and pickup locations
- Passenger request and routing workflows
- Traffic-aware analysis and optimization support for route planning
- MySQL database integration with schema files included in the repository

## Tech stack

- Backend: Node.js, Express, MySQL2, CORS, dotenv, multer, csv-parser, xlsx
- Frontend: React, Vite, React Router, Bootstrap, React Icons
- Documentation: project docs and traffic integration notes under the docs folder

## Project structure

```text
OODBS/
├── backend/              # Express API server and business logic
│   ├── routes/           # API endpoints (auth, buses, destination, driver, organizations, passenger, passengerRequests, pickuplocation, routing, schedule, services, traffic)
│   ├── services/         # Backend service implementations (passengerRequestService.js, routingService.js, trafficAwarenessService.js)
│   ├── traffic/          # Traffic data used by backend (e.g., trafficflow.json)
│   ├── uploads/          # Uploaded files (images, CSVs, etc.) used by backend
│   ├── index.js
│   ├── trip_status_final.js
│   └── package.json
├── services/             # Standalone analysis/service scripts (analytics, models)
├── frontend/             # React/Vite web application
│   ├── public/           # Static public assets
│   ├── src/              # Pages, components, layouts, styles (see src/ for details)
│   ├── package.json
│   └── vite.config.js
├── database_schema/      # SQL schema files for the database
├── docs/                 # Project documentation and analysis notes
├── traffic/              # Top-level traffic data and helpers (analysis scripts reference this)
├── uploads/              # Top-level uploaded files directory
└── README.md             # Project overview and setup guide
```

## Prerequisites

Before running the project, make sure you have:

- Node.js 18+ installed
- npm installed
- MySQL database available
- A local environment file configured for the backend

## Backend setup

1. Open a terminal and go to the backend folder:

```bash
cd backend
npm install
```

2. Create a `.env` file in the backend folder with your database and server settings:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=oodbs_db
PORT=5000
```

3. Start the backend server:

```bash
node index.js
```

The API server will run on port 5000 by default.

## Frontend setup

1. Open a second terminal and go to the frontend folder:

```bash
cd frontend
npm install
```

2. Start the Vite development server:

```bash
npm run dev
```

The frontend should be available through the Vite local URL shown in the terminal.

## Database setup

The repository includes SQL schema files in the database_schema folder. Import the latest schema into your MySQL database before running the application.

Recommended workflow:

- Create a database such as `oodbs_db`
- Import the latest schema file from `database_schema/`
- Confirm the connection details in the backend `.env` file

## Main features

### Admin features
- Manage buses
- Manage services
- Manage destinations
- Manage pickup locations
- Review system operations from the admin dashboard

### Passenger features
- Passenger login
- Passenger dashboard access
- Request-based bus workflow support

### Driver features
- Driver login
- Driver dashboard access

### Traffic-aware capabilities
- Traffic risk analysis for routes
- Congestion-aware suggestions
- Delay and route optimization support

## Documentation

The docs folder contains additional project documentation and analysis guides:

- docs/README.md
- docs/passenger-request-workflow.md
- docs/traffic-integration-guide.md

## Notes

- The backend initializes its traffic-related services during startup.
- The frontend uses client-side routing for passenger, driver, and admin experiences.
- The project is designed as a practical full-stack prototype and can be extended with more advanced scheduling and live transport integration.


