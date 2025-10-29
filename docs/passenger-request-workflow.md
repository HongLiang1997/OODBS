# Passenger Request Processing Workflow

## System Overview

```
Request Submission → Bus Availability Check → Schedule Integration → Route Optimization → Traffic Analysis → Threshold Validation → Booking Confirmation/Rejection
```

This document details the complete passenger request processing system, including traffic-aware routing and intelligent decision-making algorithms.

## Processing Steps

### Step 1: Request Submission
```http
POST /api/passenger-requests/process
{
  "passenger_id": 123,
  "pickup_location_id": 5,
  "destination_id": 12,
  "requested_pickup_time": "2025-10-29T08:30:00Z",
  "passenger_count": 1,
  "special_requirements": null
}
```

### Step 2: Bus Availability Analysis
- Query buses serving the requested pickup location
- Verify capacity against current passenger load
- Filter by operational status and schedule availability

### Step 3: Schedule Integration Simulation
- Retrieve current schedules for available buses
- Create provisional schedule entries for new passenger
- Generate combined passenger manifest for route analysis

### Step 4: Route Optimization
- Calculate optimized routing with all passengers included
- Determine total distance and estimated travel duration
- Generate pickup and drop-off sequence

### Step 5: Traffic Impact Analysis
- Apply Singapore public transport data for traffic prediction
- Analyze route segments for congestion patterns
- Calculate expected delays and assign risk levels
- Apply time-based multipliers for peak hours (7-9 AM, 6-8 PM = 2.5x)

### Step 6: Overall Route Assessment
- Calculate efficiency score based on distance, delay, and capacity utilization
- Verify route meets system acceptance thresholds
- Generate passenger recommendations and alternatives

### Step 7: Threshold Validation
The system checks against configurable thresholds:
```javascript
acceptanceThresholds: {
    maxDelay: 30,           // Max 30 minutes delay acceptable
    maxRiskLevel: 'HIGH',   // Won't accept SEVERE risk routes
    maxDetourFactor: 1.5,   // Route can't be 50%+ longer
    minEfficiencyScore: 60  // Minimum efficiency threshold
}
```

### Step 8: Final Decision
- **CONFIRMATION**: Optimal bus assignment meeting all system thresholds
- **REJECTION**: No available options meeting delay, risk, or efficiency requirements

## API Implementation

### Primary Booking Endpoint
```http
POST /api/passenger-requests/process
```
**Response (Success):**
```json
{
  "success": true,
  "status": "CONFIRMED",
  "message": "Your booking has been confirmed",
  "data": {
    "schedule": {
      "schedule_id": 456,
      "service_id": 12,
      "bus_id": 8,
      "pickup_time": "2025-10-29T08:30:00Z"
    },
    "bus_info": {
      "registration": "SBS123X",
      "service_name": "Route A"
    },
    "impact_analysis": {
      "efficiencyScore": 78,
      "totalDelay": 12,
      "riskLevel": "MEDIUM",
      "estimatedDuration": 45
    },
    "traffic_analysis": {
      "risk_level": "MEDIUM",
      "expected_delay": 12,
      "recommendations": [
        "Add 10-15 minutes buffer time",
        "Peak hour detected - expect increased delays"
      ]
    }
  }
}
```

**Response (Rejection):**
```json
{
  "success": false,
  "status": "REJECTED",
  "reason": "THRESHOLD_EXCEEDED",
  "message": "Request would cause unacceptable delays or route changes",
  "analysis_summary": {
    "buses_analyzed": 3,
    "threshold_failures": [
      {
        "bus_id": 8,
        "failed_checks": ["delay_threshold_exceeded", "efficiency_threshold_exceeded"]
      }
    ]
  }
}
```

### **Preview Mode (Check Before Booking)**
```http
POST /api/passenger-requests/check-availability
```
Shows available options without actually booking.

### **Real-time Booking Status**
```http
GET /api/passenger-requests/my-bookings/:passenger_id
```
Returns bookings with **live traffic updates**.

## ⚙️ **Integration with Existing Components**

### **Database Tables Used:**
- **`schedules`** - Store confirmed passenger bookings
- **`services`** - Link buses to routes and pickup locations  
- **`buses`** - Bus capacity and availability
- **`pickup_locations`** - Coordinates for traffic analysis
- **`destinations`** - Destination coordinates for routing

### **Services Integration:**
- **`trafficAwarenessService.js`** - Provides traffic analysis
- **`passengerRequestService.js`** - Orchestrates the workflow
- **Existing routing logic** - Integrated via `runRoutingAlgorithm()`

### **Traffic Data Sources:**
- **5,166 Singapore bus stops** - Real location data
- **5.8M+ trip records** - Actual traffic patterns
- **Hourly variations** - Time-aware analysis
- **Peak hour detection** - Rush hour multipliers

## 📊 **Traffic Analysis Features**

### **Risk Level Assessment:**
- **MINIMAL** (< 100 trips/day) - Very low traffic
- **LOW** (100-543 trips/day) - Below median traffic
- **MEDIUM** (543-1340 trips/day) - Moderate traffic
- **HIGH** (1340-2618 trips/day) - Heavy traffic  
- **SEVERE** (> 2618 trips/day) - Extreme congestion

### **Delay Prediction:**
- **Base calculation** from traffic volume
- **Peak hour multipliers** (2.5x during rush hours)
- **Weekday vs weekend** patterns
- **Route-specific analysis** for each segment

### **Recommendations Generated:**
- Buffer time suggestions based on delays
- Alternative departure times for peak hours
- Route-specific traffic warnings
- Shared ride efficiency notifications

## 🔧 **Configuration & Thresholds**

### **Acceptance Thresholds (Configurable):**
```javascript
{
  maxDelay: 30,           // Maximum minutes of traffic delay
  maxRiskLevel: 'HIGH',   // Highest acceptable risk level
  maxDetourFactor: 1.5,   // Maximum route length increase
  minEfficiencyScore: 60  // Minimum overall efficiency
}
```

### **Traffic Service Thresholds (Data-Driven):**
```javascript
{
  minimal: 100,     // Bottom tier
  low: 543,         // 50th percentile of Singapore data
  medium: 1340,     // 75th percentile  
  high: 2618        // 90th percentile
}
```

## 🚀 **System Benefits**

1. **Intelligent Rejections** - Prevents bookings that would cause excessive delays
2. **Passenger Transparency** - Shows expected delays and risks upfront  
3. **Route Optimization** - Considers traffic when adding passengers
4. **Real-time Updates** - Live traffic analysis for existing bookings
5. **Data-Driven Decisions** - Based on actual Singapore transport patterns
6. **Scalable Thresholds** - Easily adjustable business rules

## 📱 **Frontend Integration Examples**

### **Booking Form Enhancement:**
```javascript
// Before confirming booking, show traffic analysis
const checkAvailability = async (bookingData) => {
  const response = await fetch('/api/passenger-requests/check-availability', {
    method: 'POST',
    body: JSON.stringify(bookingData)
  });
  
  const result = await response.json();
  
  if (result.available) {
    // Show recommended option with traffic info
    displayTrafficWarnings(result.recommended_option);
  } else {
    // Show alternatives or rejection reasons
    displayAlternatives(result.alternatives);
  }
};
```

### **Real-time Dashboard:**
```javascript
// Display live traffic updates for confirmed bookings
const updateBookingStatus = async (passengerId) => {
  const bookings = await fetch(`/api/passenger-requests/my-bookings/${passengerId}`);
  const data = await bookings.json();
  
  data.bookings.forEach(booking => {
    if (booking.current_traffic.risk_level === 'SEVERE') {
      showDelayAlert(booking);
    }
  });
};
```

## 🎉 **Workflow Complete!**

The system now provides:
- ✅ **Complete passenger request processing**
- ✅ **Intelligent bus assignment** with traffic consideration
- ✅ **Real-time traffic impact analysis**
- ✅ **Configurable acceptance thresholds**  
- ✅ **Transparent delay predictions**
- ✅ **Route optimization with congestion awareness**

All components work together to create a smart, traffic-aware bus booking system that prevents problematic bookings while keeping passengers informed of expected conditions.