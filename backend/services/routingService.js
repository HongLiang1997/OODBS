class RoutingService {
  constructor() {
    // No file dependencies needed
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
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
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
   * Bellman-Ford algorithm implementation
   * @param {Array} graph - Distance matrix
   * @param {number} start - Starting node index
   * @returns {Array} - Shortest distances from start to all nodes or null if negative cycle exists
   */
  bellmanFord(graph, start) {
    const n = graph.length;
    const distances = new Array(n).fill(Infinity);
    distances[start] = 0;

    // Relax edges repeatedly
    for (let i = 0; i < n - 1; i++) {
      for (let u = 0; u < n; u++) {
        for (let v = 0; v < n; v++) {
          if (distances[u] !== Infinity && graph[u][v] !== Infinity) {
            if (distances[u] + graph[u][v] < distances[v]) {
              distances[v] = distances[u] + graph[u][v];
            }
          }
        }
      }
    }

    // Check for negative cycles
    for (let u = 0; u < n; u++) {
      for (let v = 0; v < n; v++) {
        if (distances[u] !== Infinity && graph[u][v] !== Infinity) {
          if (distances[u] + graph[u][v] < distances[v]) {
            return null; // Negative cycle detected
          }
        }
      }
    }

    return distances;
  }

  /**
   * Execute Bellman-Ford algorithm for route optimization
   * @param {Object} pickupLocation - Pickup location data
   * @param {Array} destinations - Array of destination data
   * @returns {Object} - Route optimization results
   */
  runBellmanFord(pickupLocation, destinations) {
    const { locations, distanceMatrix, startIndex } = this.buildDistanceMatrix(pickupLocation, destinations);
    const distances = this.bellmanFord(distanceMatrix, startIndex);
    
    if (!distances) {
      return {
        algorithm: 'bellman_ford',
        success: false,
        error: 'Negative cycle detected in distance matrix'
      };
    }
    
    // Create optimal route order based on shortest distances
    const routeOrder = [];
    const destinationDistances = [];
    
    // Get distances to all destinations (skip pickup location at index 0)
    for (let i = 1; i < locations.length; i++) {
      destinationDistances.push({
        index: i,
        location: locations[i],
        distance: distances[i]
      });
    }
    
    // Sort destinations by distance
    destinationDistances.sort((a, b) => a.distance - b.distance);
    
    let totalDistance = 0;
    
    // Build route order
    for (let i = 0; i < destinationDistances.length; i++) {
      const dest = destinationDistances[i];
      routeOrder.push({
        location: dest.location,
        distance: dest.distance,
        stopOrder: i + 1
      });
      totalDistance += dest.distance;
    }

    return {
      algorithm: 'bellman_ford',
      success: true,
      pickupLocation,
      routeOrder,
      totalDistance,
      totalStops: routeOrder.length,
      summary: {
        algorithm: 'Bellman-Ford (Shortest Path)',
        totalDistance: `${(totalDistance / 1000).toFixed(2)} km`,
        estimatedTime: `${Math.ceil(totalDistance / 500)} minutes` // Assume 30 km/h average speed
      }
    };
  }

  /**
   * Compare both algorithms
   * @param {Object} pickupLocation - Pickup location data
   * @param {Array} destinations - Array of destination data
   * @returns {Object} - Comparison results
   */
  compareAlgorithms(pickupLocation, destinations) {
    const dijkstraResults = this.runDijkstra(pickupLocation, destinations);
    const bellmanFordResults = this.runBellmanFord(pickupLocation, destinations);

    return {
      comparison: {
        dijkstra: dijkstraResults,
        bellman_ford: bellmanFordResults
      },
      recommendation: this.getRecommendation(dijkstraResults, bellmanFordResults),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get algorithm recommendation
   * @param {Object} dijkstraResults - Dijkstra results
   * @param {Object} bellmanFordResults - Bellman-Ford results
   * @returns {Object} - Recommendation
   */
  getRecommendation(dijkstraResults, bellmanFordResults) {
    // Simple heuristic: recommend based on success and performance
    if (dijkstraResults.success && bellmanFordResults.success) {
      // Compare total distances
      if (dijkstraResults.totalDistance <= bellmanFordResults.totalDistance) {
        return {
          recommended: 'dijkstra',
          reason: `Dijkstra found a shorter route (${(dijkstraResults.totalDistance / 1000).toFixed(2)} km vs ${(bellmanFordResults.totalDistance / 1000).toFixed(2)} km)`
        };
      } else {
        return {
          recommended: 'bellman_ford',
          reason: `Bellman-Ford found a shorter route (${(bellmanFordResults.totalDistance / 1000).toFixed(2)} km vs ${(dijkstraResults.totalDistance / 1000).toFixed(2)} km)`
        };
      }
    } else if (dijkstraResults.success) {
      return {
        recommended: 'dijkstra',
        reason: 'Dijkstra succeeded while Bellman-Ford failed.'
      };
    } else if (bellmanFordResults.success) {
      return {
        recommended: 'bellman_ford',
        reason: 'Bellman-Ford succeeded while Dijkstra failed.'
      };
    } else {
      return {
        recommended: 'none',
        reason: 'Both algorithms failed to find optimal routes.'
      };
    }
  }
}

module.exports = RoutingService;