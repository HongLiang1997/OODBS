const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

/**
 * Data Visualization for Traffic Threshold Analysis
 * Creates a plot showing how risk level thresholds are determined from actual Singapore bus data
 */
class ThresholdVisualizationGenerator {
    constructor() {
        this.publicBusStops = new Map();
        this.trafficVolumes = [];
        this.thresholds = {
            minimal: 100,
            low: 543,      // 50th percentile
            medium: 1340,  // 75th percentile  
            high: 2618,    // 90th percentile
            severe: 4105   // 95th percentile (we'll show this too)
        };
    }

    /**
     * Load bus stops data
     */
    async loadBusStops() {
        const busStopsPath = path.join(__dirname, '../traffic/bus-stop-dictionary-v1.csv');
        console.log('📍 Loading bus stops data for visualization...');
        
        return new Promise((resolve, reject) => {
            const busStops = new Map();
            
            fs.createReadStream(busStopsPath)
                .pipe(csv())
                .on('data', (row) => {
                    const stopCode = row.BusStopCode?.trim();
                    if (stopCode) {
                        busStops.set(stopCode, {
                            code: stopCode,
                            name: row.Description || 'Unknown',
                            roadName: row.RoadName || '',
                            latitude: parseFloat(row.Latitude) || 0,
                            longitude: parseFloat(row.Longitude) || 0,
                            planningArea: row.PlanningArea || 'Unknown',
                            trafficVolume: 0
                        });
                    }
                })
                .on('end', () => {
                    this.publicBusStops = busStops;
                    console.log(`✅ Loaded ${busStops.size} bus stops for analysis`);
                    resolve();
                })
                .on('error', reject);
        });
    }

    /**
     * Load and process actual OD traffic data
     */
    async loadTrafficData() {
        const odDataPath = path.join(__dirname, '../traffic/origin_destination_bus_202508.csv');
        console.log('📊 Loading actual Singapore public bus traffic data...');
        
        let recordCount = 0;
        
        return new Promise((resolve, reject) => {
            fs.createReadStream(odDataPath)
                .pipe(csv())
                .on('data', (row) => {
                    recordCount++;
                    
                    const originCode = row.ORIGIN_PT_CODE?.trim();
                    const destCode = row.DESTINATION_PT_CODE?.trim();
                    const totalTrips = parseInt(row.TOTAL_TRIPS) || 0;
                    const dayType = row.DAY_TYPE?.trim();
                    
                    if (originCode && destCode && totalTrips > 0) {
                        // Apply day type division factor
                        const adjustedTrips = dayType === 'WEEKDAY' ? 
                            Math.round(totalTrips / 20) : Math.round(totalTrips / 8);
                        
                        // Add traffic to origin stop
                        if (this.publicBusStops.has(originCode)) {
                            this.publicBusStops.get(originCode).trafficVolume += adjustedTrips;
                        }
                        
                        // Add traffic to destination stop  
                        if (this.publicBusStops.has(destCode)) {
                            this.publicBusStops.get(destCode).trafficVolume += adjustedTrips;
                        }
                    }
                    
                    if (recordCount % 500000 === 0) {
                        console.log(`📈 Processed ${recordCount} traffic records...`);
                    }
                })
                .on('end', () => {
                    console.log(`✅ Processed ${recordCount} total traffic records`);
                    
                    // Collect all traffic volumes for analysis
                    for (const stop of this.publicBusStops.values()) {
                        if (stop.trafficVolume > 0) {
                            this.trafficVolumes.push(stop.trafficVolume);
                        }
                    }
                    
                    this.trafficVolumes.sort((a, b) => a - b);
                    console.log(`📊 Found ${this.trafficVolumes.length} stops with traffic data`);
                    resolve();
                })
                .on('error', reject);
        });
    }

    /**
     * Calculate percentiles for threshold determination
     */
    calculatePercentiles() {
        const percentiles = {};
        const positions = [50, 75, 90, 95, 99];
        
        positions.forEach(p => {
            const index = (p / 100) * (this.trafficVolumes.length - 1);
            const lower = Math.floor(index);
            const upper = Math.ceil(index);
            const weight = index % 1;
            
            if (upper >= this.trafficVolumes.length) {
                percentiles[p] = this.trafficVolumes[this.trafficVolumes.length - 1];
            } else {
                percentiles[p] = Math.round(
                    this.trafficVolumes[lower] * (1 - weight) + 
                    this.trafficVolumes[upper] * weight
                );
            }
        });
        
        return percentiles;
    }

    /**
     * Create histogram bins for visualization
     */
    createHistogramBins(maxValue, binCount = 50) {
        const binSize = Math.ceil(maxValue / binCount);
        const bins = [];
        
        for (let i = 0; i < binCount; i++) {
            bins.push({
                start: i * binSize,
                end: (i + 1) * binSize,
                count: 0,
                riskLevel: this.getRiskLevel(i * binSize + binSize/2)
            });
        }
        
        // Count data points in each bin
        this.trafficVolumes.forEach(volume => {
            const binIndex = Math.min(Math.floor(volume / binSize), binCount - 1);
            bins[binIndex].count++;
        });
        
        return bins;
    }

    /**
     * Determine risk level for a given traffic volume
     */
    getRiskLevel(volume) {
        if (volume > this.thresholds.high) return 'SEVERE';
        if (volume > this.thresholds.medium) return 'HIGH';  
        if (volume > this.thresholds.low) return 'MEDIUM';
        if (volume > this.thresholds.minimal) return 'LOW';
        return 'MINIMAL';
    }

    /**
     * Generate ASCII Box Plot visualization
     */
    generateASCIIHistogram() {
        const percentiles = this.calculatePercentiles();
        const min = Math.min(...this.trafficVolumes);
        const max = Math.max(...this.trafficVolumes);
        const mean = Math.round(this.trafficVolumes.reduce((a, b) => a + b, 0) / this.trafficVolumes.length);
        
        console.log('\n📊 ========== TRAFFIC VOLUME BOX PLOT VISUALIZATION ==========\n');
        console.log('Distribution of Singapore Public Bus Stop Traffic (Daily Trips)');
        console.log(`Total Stops: ${this.trafficVolumes.length} | Range: ${min} - ${max} trips/day\n`);
        
        // Print risk level thresholds
        console.log('🎯 RISK LEVEL THRESHOLDS (Percentile-Based):');
        console.log(`   MINIMAL: < ${this.thresholds.minimal} trips/day`);
        console.log(`   LOW:     ${this.thresholds.minimal} - ${this.thresholds.low} trips/day (bottom 50%)`);
        console.log(`   MEDIUM:  ${this.thresholds.low} - ${this.thresholds.medium} trips/day (50th-75th %ile)`);
        console.log(`   HIGH:    ${this.thresholds.medium} - ${this.thresholds.high} trips/day (75th-90th %ile)`); 
        console.log(`   SEVERE:  > ${this.thresholds.high} trips/day (top 10%)\n`);
        
        // ASCII Box Plot representation
        console.log('📦 BOX PLOT REPRESENTATION:');
        console.log('   Key Statistics and Threshold Placement');
        console.log('   ─────────────────────────────────────────────────────────────────────────────');
        
        // Scale for visualization (focus on main distribution, cap outliers)
        const displayMax = Math.min(8000, percentiles[95]);
        const scale = 60 / displayMax;
        
        // Calculate positions
        const positions = {
            min: Math.round(min * scale),
            q1: Math.round(percentiles[25] * scale),
            median: Math.round(percentiles[50] * scale), 
            q3: Math.round(percentiles[75] * scale),
            max: Math.round(Math.min(displayMax, max) * scale),
            low_thresh: Math.round(this.thresholds.low * scale),
            med_thresh: Math.round(this.thresholds.medium * scale),
            high_thresh: Math.round(this.thresholds.high * scale)
        };
        
        // Create box plot line
        const boxLine = ' '.repeat(70);
        const boxArray = boxLine.split('');
        
        // Mark whiskers and box
        boxArray[positions.min] = '├';
        boxArray[positions.q1] = '┤';
        boxArray[positions.median] = '│';
        boxArray[positions.q3] = '├'; 
        boxArray[positions.max] = '┤';
        
        // Fill the box (IQR)
        for (let i = positions.q1 + 1; i < positions.q3; i++) {
            if (boxArray[i] === ' ') boxArray[i] = '─';
        }
        
        // Mark threshold lines
        if (positions.low_thresh < 70) boxArray[positions.low_thresh] = '🟢';
        if (positions.med_thresh < 70) boxArray[positions.med_thresh] = '🟡';
        if (positions.high_thresh < 70) boxArray[positions.high_thresh] = '🟠';
        
        console.log('\n   Box Plot:');
        console.log('   ' + boxArray.join(''));
        console.log('   0' + ' '.repeat(55) + displayMax + '+');
        
        // Legend
        console.log('\n   📊 Box Plot Elements:');
        console.log('      ├─┤   = Whiskers (Min/Max within 1.5×IQR)');
        console.log('      ┤──├  = Box (Q1 to Q3, Interquartile Range)');
        console.log('      │     = Median (50th percentile)');
        console.log('      🟢    = LOW Threshold (50th percentile)');
        console.log('      🟡    = MEDIUM Threshold (75th percentile)');
        console.log('      🟠    = HIGH Threshold (90th percentile)');
        
        // Key statistics positioned
        console.log('\n   📈 Key Statistics:');
        console.log(`      Min: ${min} | Q1: ${percentiles[25]} | Median: ${percentiles[50]} | Q3: ${percentiles[75]} | Max: ${max}`);
        console.log(`      Mean: ${mean} | Std Dev: ${Math.round(this.calculateStandardDeviation())}`);
        
        // Risk zone distribution
        console.log('\n   🎯 Threshold Placement on Distribution:');
        console.log(`      ${this.thresholds.low.toString().padStart(4)} ←─🟢 LOW (50th %ile, splits bottom/top half)`);
        console.log(`      ${this.thresholds.medium.toString().padStart(4)} ←─🟡 MEDIUM (75th %ile, top quartile start)`); 
        console.log(`      ${this.thresholds.high.toString().padStart(4)} ←─🟠 HIGH (90th %ile, top decile)`);
    }
    
    /**
     * Calculate standard deviation
     */
    calculateStandardDeviation() {
        const mean = this.trafficVolumes.reduce((a, b) => a + b, 0) / this.trafficVolumes.length;
        const squaredDiffs = this.trafficVolumes.map(value => Math.pow(value - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
        return Math.sqrt(avgSquaredDiff);
    }

    /**
     * Generate detailed statistical analysis
     */
    generateStatisticalAnalysis() {
        const percentiles = this.calculatePercentiles();
        const mean = Math.round(this.trafficVolumes.reduce((a, b) => a + b, 0) / this.trafficVolumes.length);
        const median = percentiles[50];
        const min = Math.min(...this.trafficVolumes);
        const max = Math.max(...this.trafficVolumes);
        
        console.log('\n📊 ========== STATISTICAL ANALYSIS ==========\n');
        
        console.log('📈 BASIC STATISTICS:');
        console.log(`   Minimum Volume:     ${min} trips/day`);
        console.log(`   Maximum Volume:     ${max} trips/day`);
        console.log(`   Mean (Average):     ${mean} trips/day`);
        console.log(`   Median (50th %ile): ${median} trips/day`);
        
        console.log('\n📊 PERCENTILE DISTRIBUTION:');
        Object.entries(percentiles).forEach(([p, value]) => {
            console.log(`   ${p}th Percentile:    ${value} trips/day`);
        });
        
        console.log('\n🎯 THRESHOLD JUSTIFICATION:');
        console.log(`   ✅ LOW Risk Threshold (${this.thresholds.low}): Set at median (50th percentile)`);
        console.log(`      → Half of all stops have lower traffic = reasonable "low" baseline`);
        console.log(`   ✅ MEDIUM Risk Threshold (${this.thresholds.medium}): Set at 75th percentile`);
        console.log(`      → Top 25% of stops = moderately busy areas requiring attention`);
        console.log(`   ✅ HIGH Risk Threshold (${this.thresholds.high}): Set at 90th percentile`); 
        console.log(`      → Top 10% of stops = high congestion areas needing careful planning`);
        
        // Count stops in each risk category
        const riskCounts = {
            'MINIMAL': 0, 'LOW': 0, 'MEDIUM': 0, 'HIGH': 0, 'SEVERE': 0
        };
        
        this.trafficVolumes.forEach(volume => {
            riskCounts[this.getRiskLevel(volume)]++;
        });
        
        console.log('\n📊 RISK LEVEL DISTRIBUTION:');
        Object.entries(riskCounts).forEach(([level, count]) => {
            const percentage = ((count / this.trafficVolumes.length) * 100).toFixed(1);
            console.log(`   ${level}:  ${count.toString().padStart(4)} stops (${percentage}%)`);
        });
    }

    /**
     * Generate HTML visualization file with Box Plot
     */
    generateHTMLVisualization() {
        const percentiles = this.calculatePercentiles();
        
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Singapore Bus Traffic Threshold Analysis - Box Plot</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; }
        .threshold-info { background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .risk-level { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; margin: 2px; }
        .minimal { background: #6c757d; color: white; }
        .low { background: #28a745; color: white; }
        .medium { background: #ffc107; color: black; }
        .high { background: #fd7e14; color: white; }
        .severe { background: #dc3545; color: white; }
        .chart-container { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .chart { background: #f8f9fa; padding: 15px; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>� Singapore Public Bus Traffic Distribution Analysis</h1>
            <h2>Box Plot: Data-Driven Threshold Determination for Risk Assessment</h2>
            <p><strong>Dataset:</strong> ${this.trafficVolumes.length} bus stops | <strong>Source:</strong> Singapore Public Transport OD Data 2025-08</p>
        </div>

        <div class="threshold-info">
            <h3>🎯 Risk Level Thresholds (Percentile-Based)</h3>
            <div style="margin: 15px 0;">
                <span class="risk-level minimal">MINIMAL</span> < ${this.thresholds.minimal} trips/day<br>
                <span class="risk-level low">LOW</span> ${this.thresholds.minimal} - ${this.thresholds.low} trips/day (Bottom 50%)<br>
                <span class="risk-level medium">MEDIUM</span> ${this.thresholds.low} - ${this.thresholds.medium} trips/day (50th-75th percentile)<br>
                <span class="risk-level high">HIGH</span> ${this.thresholds.medium} - ${this.thresholds.high} trips/day (75th-90th percentile)<br>
                <span class="risk-level severe">SEVERE</span> > ${this.thresholds.high} trips/day (Top 10%)
            </div>
        </div>

        <div class="chart-container">
            <div class="chart">
                <div id="boxplot" style="width:100%;height:400px;"></div>
            </div>
            <div class="chart">
                <div id="violin" style="width:100%;height:400px;"></div>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <h4>📊 Basic Statistics</h4>
                <p><strong>Min:</strong> ${Math.min(...this.trafficVolumes)} trips/day</p>
                <p><strong>Max:</strong> ${Math.max(...this.trafficVolumes)} trips/day</p>
                <p><strong>Mean:</strong> ${Math.round(this.trafficVolumes.reduce((a,b) => a+b, 0) / this.trafficVolumes.length)} trips/day</p>
                <p><strong>Median:</strong> ${percentiles[50]} trips/day</p>
            </div>
            
            <div class="stat-card">
                <h4>📈 Key Percentiles</h4>
                <p><strong>75th:</strong> ${percentiles[75]} trips/day</p>
                <p><strong>90th:</strong> ${percentiles[90]} trips/day</p>
                <p><strong>95th:</strong> ${percentiles[95]} trips/day</p>
                <p><strong>99th:</strong> ${percentiles[99]} trips/day</p>
            </div>
        </div>

        <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
            <h3>💡 Why These Thresholds Make Sense</h3>
            <ul>
                <li><strong>Median-Based LOW Threshold:</strong> 50% of stops have less traffic = natural "low" baseline</li>
                <li><strong>75th Percentile MEDIUM:</strong> Top 25% of stops = moderately busy, requires attention</li>
                <li><strong>90th Percentile HIGH:</strong> Top 10% = high congestion, careful route planning needed</li>
                <li><strong>Statistical Validity:</strong> Based on ${(this.trafficVolumes.length / 1000000).toFixed(1)}M+ actual trip records from Singapore transport data</li>
            </ul>
        </div>
    </div>

    <script>
        const trafficData = ${JSON.stringify(this.trafficVolumes)};
        const thresholds = ${JSON.stringify(this.thresholds)};
        const percentiles = ${JSON.stringify(percentiles)};
        
        // Create Box Plot
        const boxTrace = {
            y: trafficData,
            type: 'box',
            name: 'Traffic Distribution',
            boxpoints: 'outliers',
            marker: { 
                color: '#007bff',
                outliercolor: 'red',
                line: { outliercolor: 'red', outlierwidth: 2 }
            },
            line: { color: '#007bff' },
            fillcolor: 'rgba(0,123,255,0.3)',
            hovertemplate: '<b>Traffic Volume</b><br>%{y} trips/day<extra></extra>'
        };
        
        // Add threshold lines for box plot
        const boxShapes = [
            {
                type: 'line',
                x0: -0.5, x1: 0.5,
                y0: thresholds.low, y1: thresholds.low,
                line: { color: '#28a745', width: 4, dash: 'dash' }
            },
            {
                type: 'line',
                x0: -0.5, x1: 0.5, 
                y0: thresholds.medium, y1: thresholds.medium,
                line: { color: '#ffc107', width: 4, dash: 'dash' }
            },
            {
                type: 'line',
                x0: -0.5, x1: 0.5,
                y0: thresholds.high, y1: thresholds.high,
                line: { color: '#fd7e14', width: 4, dash: 'dash' }
            }
        ];
        
        const boxAnnotations = [
            {
                x: 0.6, y: thresholds.low,
                text: 'LOW (50th %ile): ' + thresholds.low,
                showarrow: true, arrowhead: 2, arrowcolor: '#28a745',
                bgcolor: '#28a745', bordercolor: '#28a745', font: {color: 'white'}
            },
            {
                x: 0.6, y: thresholds.medium,
                text: 'MEDIUM (75th %ile): ' + thresholds.medium,
                showarrow: true, arrowhead: 2, arrowcolor: '#ffc107',
                bgcolor: '#ffc107', bordercolor: '#ffc107', font: {color: 'black'}
            },
            {
                x: 0.6, y: thresholds.high,
                text: 'HIGH (90th %ile): ' + thresholds.high,
                showarrow: true, arrowhead: 2, arrowcolor: '#fd7e14',
                bgcolor: '#fd7e14', bordercolor: '#fd7e14', font: {color: 'white'}
            }
        ];
        
        const boxLayout = {
            title: 'Box Plot: Traffic Volume Distribution with Risk Thresholds',
            yaxis: { 
                title: 'Daily Traffic Volume (trips/day)',
                range: [0, Math.min(8000, Math.max(...trafficData))]
            },
            xaxis: { title: 'Singapore Bus Stops Distribution' },
            showlegend: false,
            shapes: boxShapes,
            annotations: boxAnnotations,
            margin: { t: 50, r: 150, b: 80, l: 80 }
        };
        
        // Create Violin Plot for better distribution visualization
        const violinTrace = {
            y: trafficData,
            type: 'violin',
            name: 'Traffic Distribution', 
            box: { visible: true },
            meanline: { visible: true },
            marker: { color: '#17a2b8' },
            line: { color: '#17a2b8' },
            fillcolor: 'rgba(23,162,184,0.3)',
            hovertemplate: '<b>Density Distribution</b><br>%{y} trips/day<extra></extra>'
        };
        
        const violinLayout = {
            title: 'Violin Plot: Traffic Volume Probability Density',
            yaxis: { 
                title: 'Daily Traffic Volume (trips/day)',
                range: [0, Math.min(8000, Math.max(...trafficData))]
            },
            xaxis: { title: 'Probability Density' },
            showlegend: false,
            shapes: boxShapes,
            annotations: [
                {
                    x: 0.1, y: thresholds.low,
                    text: 'LOW: ' + thresholds.low, showarrow: false,
                    bgcolor: '#28a745', bordercolor: '#28a745', font: {color: 'white', size: 10}
                },
                {
                    x: 0.1, y: thresholds.medium,
                    text: 'MED: ' + thresholds.medium, showarrow: false,
                    bgcolor: '#ffc107', bordercolor: '#ffc107', font: {color: 'black', size: 10}
                },
                {
                    x: 0.1, y: thresholds.high,
                    text: 'HIGH: ' + thresholds.high, showarrow: false,
                    bgcolor: '#fd7e14', bordercolor: '#fd7e14', font: {color: 'white', size: 10}
                }
            ],
            margin: { t: 50, r: 50, b: 80, l: 80 }
        };
        
        // Render both plots
        Plotly.newPlot('boxplot', [boxTrace], boxLayout, {responsive: true});
        Plotly.newPlot('violin', [violinTrace], violinLayout, {responsive: true});
    </script>
</body>
</html>`;
        
        const htmlPath = path.join(__dirname, 'traffic_threshold_visualization.html');
        fs.writeFileSync(htmlPath, htmlContent);
        console.log(`\n📊 HTML visualization saved to: ${htmlPath}`);
        console.log('🌐 Open this file in your web browser to see the interactive chart!');
    }

    /**
     * Main execution method
     */
    async run() {
        try {
            console.log('🚀 Starting Traffic Threshold Visualization Analysis...\n');
            
            await this.loadBusStops();
            await this.loadTrafficData();
            
            this.generateASCIIHistogram();
            this.generateStatisticalAnalysis(); 
            this.generateHTMLVisualization();
            
            console.log('\n🎉 Traffic threshold visualization complete!');
            
        } catch (error) {
            console.error('❌ Error generating visualization:', error.message);
        }
    }
}

// Run the visualization
const visualizer = new ThresholdVisualizationGenerator();
visualizer.run();