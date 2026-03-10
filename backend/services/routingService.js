class RoutingService {
  constructor() {
    // No file dependencies needed
    
    // ========================================
    // 🔧 ROUTING CONFIGURATION & THRESHOLDS
    // ========================================
    this.config = {
      // Speed and timing parameters
      AVERAGE_SPEED_KMH: 45,              // Average driving speed in km/h (city + highway mix)
      METERS_PER_MINUTE: 750,             // Calculated: 45 km/h = 750 meters/minute
      
      // Route constraints
      MAX_ROUTE_TIME_MINUTES: 90,         // Maximum total route time (1.5 hours)
      MAX_DETOUR_MINUTES: 20,             // Maximum additional time for new passenger
      
      // Passenger boarding/alighting
      BOARDING_TIME_MINUTES: 5,           // Time allowance per stop for passenger operations
      
      // Schedule timing
      DEPARTURE_PREP_MINUTES: 30,         // Buffer time before departure (if no scheduled time)
      
      // Capacity settings
      CAPACITY_BUFFER_PERCENT: 0,         // Reserve % of bus capacity (0 = use full capacity)
    };
  }

  /**
   * Calculate distance between two points using Haversine formula
   * @param {number} lat1 - Latitude of first point
   * @param {number} lon1 - Longitude of first point  
   * @param {number} lat2 - Latitude of second point
   * @param {number} lon2 - Longitude of second point
   * @returns {number} Distance in meters
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const earthRadiusMeters = 6371000; // Earth's radius in meters
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const deltaLatRad = (lat2 - lat1) * Math.PI / 180;
    const deltaLonRad = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaLatRad/2) * Math.sin(deltaLatRad/2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLonRad/2) * Math.sin(deltaLonRad/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return earthRadiusMeters * c; // Distance in meters
  }

  /**
   * Build distance matrix between pickup location and all destinations
   * @param {Object} pickupLocation - {lat, lng, name}
   * @param {Array} destinations - Array of {lat, lng, name, passenger_count, request_id}
   * @returns {Object} - Distance matrix and location data
   */
  buildDistanceMatrix(pickupLocation, destinations) {
    const locations = [pickupLocation, ...destinations];
    const n = locations.length;
    const distanceMatrix = [];

    // Build distance matrix
    for (let i = 0; i < n; i++) {
      distanceMatrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          distanceMatrix[i][j] = 0;
        } else {
          const distance = this.haversineDistance(
            locations[i].lat, locations[i].lng,
            locations[j].lat, locations[j].lng
          );
          distanceMatrix[i][j] = distance;
        }
      }
    }

    return {
      locations,
      distanceMatrix,
      startIndex: 0 // Pickup location is always first
    };
  }

  /**
   * Dijkstra's algorithm implementation
   * @param {Array} graph - Distance matrix
   * @param {number} start - Starting node index
   * @returns {Array} - Shortest distances from start to all nodes
   */
  dijkstra(graph, start) {
    const n = graph.length;
    const distances = new Array(n).fill(Infinity);
    const visited = new Array(n).fill(false);
    const previous = new Array(n).fill(null);
    
    distances[start] = 0;

    for (let i = 0; i < n; i++) {
      // Find unvisited node with minimum distance
      let minDistance = Infinity;
      let minIndex = -1;
      
      for (let j = 0; j < n; j++) {
        if (!visited[j] && distances[j] < minDistance) {
          minDistance = distances[j];
          minIndex = j;
        }
      }

      if (minIndex === -1) break;
      visited[minIndex] = true;

      // Update distances to neighbors
      for (let j = 0; j < n; j++) {
        if (!visited[j] && graph[minIndex][j] !== Infinity) {
          const newDistance = distances[minIndex] + graph[minIndex][j];
          if (newDistance < distances[j]) {
            distances[j] = newDistance;
            previous[j] = minIndex;
          }
        }
      }
    }

    return { distances, previous };
  }

  /**
   * Execute Dijkstra algorithm for route optimization
   * @param {Object} pickupLocation - Pickup location data
   * @param {Array} destinations - Array of destination data
   * @returns {Object} - Route optimization results
   */
  runDijkstra(pickupLocation, destinations) {
    const { locations, distanceMatrix, startIndex } = this.buildDistanceMatrix(pickupLocation, destinations);
    const { distances, previous } = this.dijkstra(distanceMatrix, startIndex);
    
    // Create optimal route order based on shortest distances
    const routeOrder = [];
    const unvisited = new Set();
    
    // Add all destinations to unvisited (skip pickup location at index 0)
    for (let i = 1; i < locations.length; i++) {
      unvisited.add(i);
    }
    
    let currentLocation = startIndex;
    let totalDistance = 0;
    
    // Greedy approach: always go to nearest unvisited destination
    while (unvisited.size > 0) {
      let nearestIndex = -1;
      let nearestDistance = Infinity;
      
      for (const index of unvisited) {
        const distance = distanceMatrix[currentLocation][index];
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }
      
      if (nearestIndex !== -1) {
        routeOrder.push({
          location: locations[nearestIndex],
          distance: nearestDistance,
          stopOrder: routeOrder.length + 1
        });
        totalDistance += nearestDistance;
        currentLocation = nearestIndex;
        unvisited.delete(nearestIndex);
      }
    }

    return {
      algorithm: 'dijkstra',
      success: true,
      pickupLocation,
      routeOrder,
      totalDistance,
      totalStops: routeOrder.length,
      summary: {
        algorithm: 'Dijkstra (Nearest Neighbor)',
        totalDistance: `${(totalDistance / 1000).toFixed(2)} km`,
        estimatedTime: `${Math.ceil(totalDistance / 500)} minutes` // Assume 30 km/h average speed
      }
    };
  }



  /**
   * Get current routing configuration
   * @returns {Object} - Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update routing configuration
   * @param {Object} updates - Configuration updates
   * @returns {Object} - Updated configuration
   */
  updateConfig(updates) {
    const changes = [];
    
    Object.keys(updates).forEach(key => {
      if (this.config.hasOwnProperty(key)) {
        const oldValue = this.config[key];
        this.config[key] = updates[key];
        
        // Recalculate METERS_PER_MINUTE if speed changed
        if (key === 'AVERAGE_SPEED_KMH') {
          this.config.METERS_PER_MINUTE = Math.round(updates[key] * 1000 / 60);
          changes.push(`METERS_PER_MINUTE: ${Math.round(oldValue * 1000 / 60)} → ${this.config.METERS_PER_MINUTE} (auto-calculated)`);
        }
        
        changes.push(`${key}: ${oldValue} → ${updates[key]}`);
      }
    });
    
    return {
      changes,
      newConfig: { ...this.config }
    };
  }

  /**
   * Get effective bus capacity with buffer
   * @param {number} totalCapacity - Total bus capacity
   * @returns {number} - Effective capacity after buffer
   */
  getEffectiveBusCapacity(totalCapacity) {
    const buffer = Math.floor(totalCapacity * this.config.CAPACITY_BUFFER_PERCENT / 100);
    return totalCapacity - buffer;
  }

  /**
   * Convert distance to time using configured speed
   * @param {number} distanceMeters - Distance in meters
   * @returns {number} - Time in minutes
   */
  distanceToTime(distanceMeters) {
    return Math.ceil(distanceMeters / this.config.METERS_PER_MINUTE);
  }



  /**
   * High-level wrapper methods for passengerRequestService integration
   */

  /**
   * Optimize route using Dijkstra's algorithm
   * @param {Object} startLocation - Starting location {lat, lng}
   * @param {Array} destinations - Array of destinations with location data
   * @returns {Promise<Array>} Optimized destination sequence
   */
  async optimizeRouteWithDijkstra(startLocation, destinations) {
    try {
      console.log(`🧭 RoutingService: Running Dijkstra optimization for ${destinations.length} destinations`);
      
      const result = this.runDijkstra(startLocation, destinations);
      
      if (result.success && result.optimizedSequence) {
        console.log(`✅ Dijkstra optimization successful: ${result.totalDistance.toFixed(2)}m total distance`);
        return result.optimizedSequence;
      } else {
        console.log(`❌ Dijkstra optimization failed: ${result.error || 'Unknown error'}`);
        return null;
      }
    } catch (error) {
      console.error('❌ Dijkstra optimization error:', error);
      return null;
    }
  }



  /**
   * Find optimal route considering traffic (integrated with passenger request service)
   * @param {number} pickupLocationId - Pickup location ID
   * @param {number} destinationId - Destination ID
   * @param {Array} availableRoutes - Available bus routes
   * @returns {Promise<Object>} Optimal route with traffic considerations
   */
  async findOptimalRoute(pickupLocationId, destinationId, availableRoutes) {
    try {
      console.log(`🚌 RoutingService: Finding optimal route from ${pickupLocationId} to ${destinationId}`);
      
      if (!availableRoutes || availableRoutes.length === 0) {
        return null;
      }

      // Sort routes by capacity and distance efficiency
      const sortedRoutes = availableRoutes.sort((a, b) => {
        const aCapacityScore = (b.max_capacity - a.current_capacity) / b.max_capacity;
        const bCapacityScore = (a.max_capacity - b.current_capacity) / a.max_capacity;
        
        // Prefer routes with more available capacity and shorter distances
        if (aCapacityScore !== bCapacityScore) {
          return bCapacityScore - aCapacityScore;
        }
        
        // If capacity is similar, prefer shorter pickup-to-destination distance
        const aDistance = Math.abs(a.dest_order - a.pickup_order);
        const bDistance = Math.abs(b.dest_order - b.pickup_order);
        return aDistance - bDistance;
      });

      const optimalRoute = sortedRoutes[0];
      
      console.log(`✅ Selected optimal route: Bus ${optimalRoute.bus_id} (${optimalRoute.bus_plate_number})`);
      console.log(`   Capacity: ${optimalRoute.current_capacity}/${optimalRoute.max_capacity}`);
      console.log(`   Route distance: ${Math.abs(optimalRoute.dest_order - optimalRoute.pickup_order)} stops`);
      
      return {
        bus_id: optimalRoute.bus_id,
        bus_plate_number: optimalRoute.bus_plate_number,
        route_name: optimalRoute.route_name,
        current_capacity: optimalRoute.current_capacity,
        max_capacity: optimalRoute.max_capacity,
        pickup_order: optimalRoute.pickup_order,
        dest_order: optimalRoute.dest_order,
        optimization_used: 'capacity_and_distance',
        route_efficiency: Math.max(0, 100 - Math.abs(optimalRoute.dest_order - optimalRoute.pickup_order) * 10)
      };
      
    } catch (error) {
      console.error('❌ Route optimization error:', error);
      return null;
    }
  }
}

module.exports = { RoutingService };