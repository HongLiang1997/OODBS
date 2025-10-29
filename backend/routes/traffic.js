const express = require('express');
const router = express.Router();
const { trafficAwarenessService } = require('../services/trafficAwarenessService');

/**
 * Traffic Awareness API Routes
 * Integrates traffic impact analysis with OODBS routing system
 */

/**
 * Initialize traffic service (call on app startup)
 */
router.post('/initialize', async (req, res) => {
    try {
        await trafficAwarenessService.initialize();
        res.json({ 
            success: true, 
            message: 'Traffic Awareness Service initialized successfully',
            status: trafficAwarenessService.getServiceStatus()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * Analyze route traffic impact
 * POST /api/traffic/analyze-route
 */
router.post('/analyze-route', async (req, res) => {
    try {
        const { 
            originLat, 
            originLng, 
            destLat, 
            destLng, 
            departureTime, 
            dayType = 'WEEKDAY' 
        } = req.body;

        // Validate input
        if (!originLat || !originLng || !destLat || !destLng) {
            return res.status(400).json({
                success: false,
                error: 'Missing required coordinates (originLat, originLng, destLat, destLng)'
            });
        }

        const routeData = {
            originLat: parseFloat(originLat),
            originLng: parseFloat(originLng), 
            destLat: parseFloat(destLat),
            destLng: parseFloat(destLng),
            departureTime: departureTime || new Date().toISOString(),
            dayType: dayType.toUpperCase()
        };

        const analysis = trafficAwarenessService.analyzeRouteImpact(routeData);

        res.json({
            success: true,
            data: {
                route: routeData,
                trafficAnalysis: analysis,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get planning area risk assessment
 * GET /api/traffic/planning-area/:areaName
 */
router.get('/planning-area/:areaName', (req, res) => {
    try {
        const { areaName } = req.params;
        const areaRisk = trafficAwarenessService.getPlanningAreaRisk(areaName.toUpperCase());
        
        res.json({
            success: true,
            data: areaRisk
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get top congestion zones
 * GET /api/traffic/congestion-zones?limit=10
 */
router.get('/congestion-zones', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const zones = trafficAwarenessService.getTopCongestionZones(limit);
        
        res.json({
            success: true,
            data: {
                zones,
                total: zones.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get service status and health check
 * GET /api/traffic/status
 */
router.get('/status', (req, res) => {
    try {
        const status = trafficAwarenessService.getServiceStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Enhanced route optimization with traffic awareness
 * POST /api/traffic/optimize-route
 */
router.post('/optimize-route', async (req, res) => {
    try {
        const { routes, departureTime, dayType = 'WEEKDAY' } = req.body;

        if (!routes || !Array.isArray(routes)) {
            return res.status(400).json({
                success: false,
                error: 'Routes array is required'
            });
        }

        // Analyze each route option
        const routeAnalyses = routes.map((route, index) => {
            const analysis = trafficAwarenessService.analyzeRouteImpact({
                ...route,
                departureTime,
                dayType
            });

            return {
                routeIndex: index,
                route: route,
                analysis: analysis,
                score: calculateRouteScore(analysis) // Custom scoring function
            };
        });

        // Sort by best score (lowest risk, least delay)
        const optimizedRoutes = routeAnalyses.sort((a, b) => b.score - a.score);

        res.json({
            success: true,
            data: {
                recommendedRoute: optimizedRoutes[0],
                allRoutes: optimizedRoutes,
                metadata: {
                    totalRoutes: routes.length,
                    departureTime,
                    dayType,
                    timestamp: new Date().toISOString()
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Calculate route score for optimization
 * Higher score = better route (lower risk, less delay)
 */
function calculateRouteScore(analysis) {
    let score = 100; // Base score

    // Penalize based on risk level
    const riskPenalties = {
        'MINIMAL': 0,
        'LOW': -5,
        'MEDIUM': -15,
        'HIGH': -30,
        'SEVERE': -50
    };
    score += riskPenalties[analysis.riskLevel] || 0;

    // Penalize based on expected delay
    score -= analysis.expectedDelay * 0.5;

    // Bonus for off-peak travel
    if (analysis.peakFactor === 1.0) {
        score += 10; // Off-peak bonus
    }

    return Math.max(score, 0);
}

module.exports = router;