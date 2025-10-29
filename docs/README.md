# OODBS Documentation

This directory contains technical documentation, analysis tools, visualizations, and development archives for the On-Demand Bus System (OODBS) project.

## Directory Structure

```
docs/
├── README.md                           # This file
├── PASSENGER_REQUEST_WORKFLOW.md       # Complete workflow documentation
├── TRAFFIC_INTEGRATION_GUIDE.md       # Traffic service integration guide
├── visualizations/                     # Generated charts and analysis outputs
│   ├── traffic_threshold_visualization.html  # Interactive traffic analysis charts
│   └── traffic_output.txt             # Console output from analysis runs
├── analysis-scripts/                  # Development and analysis tools
│   ├── thresholdVisualization.js      # Box plot generator for thresholds
│   └── trafficAnalysisModel.js        # Original standalone analysis script
└── archive/                           # Archived development files
    ├── onDemandTrafficImpact.js        # Original traffic impact model (moved to services)
    └── oodbsTrafficModel.js            # Alternative model approach
```

## Documentation Files

### Core Documentation
- **`PASSENGER_REQUEST_WORKFLOW.md`** - End-to-end passenger request processing workflow
- **`TRAFFIC_INTEGRATION_GUIDE.md`** - Traffic service integration and implementation guide

### Documented Features
- Passenger request processing flow
- Traffic-aware bus assignment algorithm
- Configurable acceptance thresholds
- API endpoints and implementation examples
- Database integration patterns
- Real-time traffic analysis system  

## Visualizations

### Interactive Charts
- **`traffic_threshold_visualization.html`** - Browser-based traffic analysis dashboard
  - Traffic volume distribution box plots
  - Probability density violin plots
  - Risk level threshold markers (MINIMAL to SEVERE)
  - Interactive data exploration with zoom and hover

### Analysis Output Files
- **`traffic_output.txt`** - Traffic analysis processing logs
  - Singapore transport data processing results (5.8M+ records)
  - Statistical threshold calculations
  - Risk distribution analysis across bus stops

## Analysis Scripts

### Development Tools
- **`thresholdVisualization.js`** - Statistical analysis generator for Singapore transport data
  - Box plot and histogram generation
  - Percentile-based threshold calculations
  - ASCII and HTML visualization outputs

- **`trafficAnalysisModel.js`** - Standalone traffic analysis implementation
  - Traffic modeling proof-of-concept
  - Test data generation utilities
  - Route network analysis functions

## Archived Files

### Development History
- **`onDemandTrafficImpact.js`** - Original traffic impact implementation
  - Status: Migrated to `backend/services/trafficAwarenessService.js`
  - Purpose: Development reference and version history

- **`oodbsTrafficModel.js`** - Alternative traffic modeling approach
  - Status: Internal data-only implementation variant
  - Purpose: Alternative implementation strategy reference

## Production System Components

### Active System Files
- **`backend/services/trafficAwarenessService.js`** - Production traffic analysis service
- **`backend/services/passengerRequestService.js`** - Request processing workflow
- **`backend/routes/traffic.js`** - Traffic analysis API routes
- **`backend/routes/passengerRequests.js`** - Passenger booking API routes

## Data Sources and Analysis

### Singapore Public Transport Dataset
- **5,166 bus stops** with GPS coordinates and planning area classifications
- **5.8M+ origin-destination trip records** from August 2025
- **24-hour traffic patterns** covering all operational hours
- **Day-type variations** with weekday/weekend scaling factors

### Statistical Risk Thresholds
| Risk Level | Threshold | Percentile | Usage |
|---|---|---|---|
| **MINIMAL** | < 100 trips/day | Bottom tier | Very low traffic areas |
| **LOW** | 100-543 trips/day | Bottom 50% | Below median traffic |
| **MEDIUM** | 543-1340 trips/day | 50th-75th %ile | Moderate traffic |
| **HIGH** | 1340-2618 trips/day | 75th-90th %ile | Heavy traffic zones |
| **SEVERE** | > 2618 trips/day | Top 10% | Extreme congestion |

## Analysis Results

### Traffic Distribution Analysis
- **Average daily traffic**: 1,333 trips per stop
- **Median traffic volume**: 543 trips/day (50th percentile)
- **High-volume locations**: Major transport interchanges (Boon Lay: 118,977 trips/day)
- **Risk category distribution**: 32.3% of stops classified as SEVERE risk

### System Operating Thresholds
- **Maximum acceptable delay**: 30 minutes
- **Maximum risk level**: HIGH (SEVERE routes rejected)
- **Maximum detour factor**: 1.5x original route length
- **Minimum efficiency score**: 60/100

## Usage Instructions

### Viewing Visualizations
1. Open `visualizations/traffic_threshold_visualization.html` in a web browser
2. Use interactive box plots and violin charts for data exploration
3. Hover over elements for detailed traffic statistics

### Running Analysis Scripts
```bash
cd docs/analysis-scripts/
node thresholdVisualization.js    # Generate traffic visualizations
node trafficAnalysisModel.js      # Execute traffic analysis
```

### Documentation Reading Order
- Begin with `PASSENGER_REQUEST_WORKFLOW.md` for system overview
- Reference `TRAFFIC_INTEGRATION_GUIDE.md` for technical implementation

## Version History

- **v1.0** - Initial traffic awareness system
- **v1.1** - Statistical visualization and threshold analysis
- **v1.2** - Integrated passenger request workflow
- **v1.3** - Production architecture and API implementation

---

## Project Status

Documentation, analysis tools, and visualizations are organized for production use while maintaining development reference materials and system history.