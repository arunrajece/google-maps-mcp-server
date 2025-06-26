import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GoogleMapsService } from './google-maps.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
let config;
try {
  const configPath = join(__dirname, '../config/config.json');
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('Error loading config:', error.message);
  process.exit(1);
}

// Validate API key
if (!config.googleMaps.apiKey || config.googleMaps.apiKey === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
  console.error('Please set your Google Maps API key in config/config.json');
  process.exit(1);
}

// Initialize Google Maps service
const googleMaps = new GoogleMapsService(config.googleMaps.apiKey);

// Create MCP server
const server = new Server(
  {
    name: 'google-maps-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
const tools = [
  {
    name: 'calculate_route',
    description: 'Calculate optimal route between origin and destination with traffic consideration',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Starting location (address or coordinates)' },
        destination: { type: 'string', description: 'Destination location (address or coordinates)' },
        waypoints: { 
          type: 'array', 
          items: { type: 'string' }, 
          description: 'Optional waypoints between origin and destination' 
        },
        options: {
          type: 'object',
          properties: {
            avoidTolls: { type: 'boolean', default: false },
            avoidHighways: { type: 'boolean', default: false },
            departureTime: { type: 'string', description: 'ISO datetime for departure' },
            trafficModel: { 
              type: 'string', 
              enum: ['best_guess', 'pessimistic', 'optimistic'],
              default: 'best_guess'
            }
          }
        }
      },
      required: ['origin', 'destination']
    }
  },
  {
    name: 'compare_routes',
    description: 'Compare multiple route alternatives with different options',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Starting location' },
        destination: { type: 'string', description: 'Destination location' },
        waypoints: { type: 'array', items: { type: 'string' } },
        alternatives: { type: 'boolean', default: true },
        compareOptions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              avoidTolls: { type: 'boolean' },
              avoidHighways: { type: 'boolean' },
              trafficModel: { type: 'string' }
            }
          }
        }
      },
      required: ['origin', 'destination']
    }
  },
  {
    name: 'get_live_traffic',
    description: 'Get live traffic information and travel time for a route',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Starting location' },
        destination: { type: 'string', description: 'Destination location' },
        departureTime: { type: 'string', description: 'Departure time (now, or ISO datetime)' }
      },
      required: ['origin', 'destination']
    }
  },
  {
    name: 'estimate_costs',
    description: 'Estimate trip costs including fuel, tolls, and total expenses',
    inputSchema: {
      type: 'object',
      properties: {
        route: { 
          type: 'object',
          description: 'Route object from calculate_route or provide origin/destination'
        },
        origin: { type: 'string' },
        destination: { type: 'string' },
        vehicleOptions: {
          type: 'object',
          properties: {
            fuelEfficiency: { type: 'number', description: 'Liters per 100km' },
            fuelPrice: { type: 'number', description: 'Price per liter' }
          }
        }
      }
    }
  }
];

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'calculate_route':
        return await handleCalculateRoute(args);
      case 'compare_routes':
        return await handleCompareRoutes(args);
      case 'get_live_traffic':
        return await handleGetLiveTraffic(args);
      case 'estimate_costs':
        return await handleEstimateCosts(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Tool implementation functions
async function handleCalculateRoute(args) {
  const { origin, destination, waypoints = [], options = {} } = args;
  
  const route = await googleMaps.calculateRoute({
    origin,
    destination,
    waypoints,
    ...options
  });

  const result = {
    success: true,
    route: {
      summary: route.summary,
      distance: route.distance,
      duration: route.duration,
      durationInTraffic: route.durationInTraffic,
      polyline: route.polyline,
      steps: route.steps,
      warnings: route.warnings,
      tollInfo: route.tollInfo
    },
    metadata: {
      timestamp: new Date().toISOString(),
      trafficModel: options.trafficModel || 'best_guess'
    }
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

async function handleCompareRoutes(args) {
  const { origin, destination, waypoints = [], alternatives = true, compareOptions = [] } = args;
  
  // Get multiple route options
  const routePromises = [];
  
  // Default route
  routePromises.push(googleMaps.calculateRoute({
    origin,
    destination,
    waypoints,
    alternatives: true
  }));
  
  // Routes with different options
  for (const option of compareOptions) {
    routePromises.push(googleMaps.calculateRoute({
      origin,
      destination,
      waypoints,
      ...option
    }));
  }
  
  const routes = await Promise.all(routePromises);
  
  // Compare and rank routes
  const comparison = {
    routes: routes.map((route, index) => ({
      id: index,
      summary: route.summary,
      distance: route.distance,
      duration: route.duration,
      durationInTraffic: route.durationInTraffic,
      tollInfo: route.tollInfo,
      options: index === 0 ? 'default' : compareOptions[index - 1]
    })),
    recommendation: findBestRoute(routes),
    summary: {
      fastestRoute: routes.reduce((fastest, current) => 
        current.durationInTraffic < fastest.durationInTraffic ? current : fastest
      ),
      shortestRoute: routes.reduce((shortest, current) => 
        current.distance < shortest.distance ? current : shortest
      )
    }
  };
  
  const result = {
    success: true,
    comparison,
    metadata: {
      timestamp: new Date().toISOString(),
      routesCompared: routes.length
    }
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

async function handleGetLiveTraffic(args) {
  const { origin, destination, departureTime = 'now' } = args;
  
  const trafficData = await googleMaps.getTrafficInfo({
    origin,
    destination,
    departureTime
  });
  
  const result = {
    success: true,
    traffic: {
      currentDuration: trafficData.duration,
      durationInTraffic: trafficData.durationInTraffic,
      trafficDelay: trafficData.durationInTraffic - trafficData.duration,
      trafficCondition: getTrafficCondition(trafficData),
      alternativeTimes: trafficData.alternativeTimes,
      route: trafficData.route
    },
    metadata: {
      timestamp: new Date().toISOString(),
      departureTime
    }
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

async function handleEstimateCosts(args) {
  const { route, origin, destination, vehicleOptions = {} } = args;
  
  let routeData = route;
  
  // If no route provided, calculate one
  if (!route && origin && destination) {
    routeData = await googleMaps.calculateRoute({ origin, destination });
  }
  
  if (!routeData) {
    throw new Error('No route data available for cost estimation');
  }
  
  const costs = calculateTripCosts(routeData, vehicleOptions);
  
  const result = {
    success: true,
    costs: {
      fuel: costs.fuelCost,
      tolls: costs.tollCost,
      total: costs.totalCost,
      breakdown: costs.breakdown,
      assumptions: costs.assumptions
    },
    route: {
      distance: routeData.distance,
      duration: routeData.duration,
      tollInfo: routeData.tollInfo
    },
    metadata: {
      timestamp: new Date().toISOString(),
      currency: 'USD'
    }
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

// Helper functions
function findBestRoute(routes) {
  const fastest = routes.reduce((best, current) => 
    current.durationInTraffic < best.durationInTraffic ? current : best
  );
  
  return {
    recommended: fastest,
    reason: 'Fastest travel time with current traffic conditions'
  };
}

function getTrafficCondition(trafficData) {
  const delay = trafficData.durationInTraffic - trafficData.duration;
  const delayRatio = delay / trafficData.duration;
  
  if (delayRatio < 0.1) return 'light';
  if (delayRatio < 0.3) return 'moderate';
  if (delayRatio < 0.5) return 'heavy';
  return 'severe';
}

function calculateTripCosts(route, vehicleOptions) {
  const fuelEfficiency = vehicleOptions.fuelEfficiency || config.costs.vehicleFuelEfficiency;
  const fuelPrice = vehicleOptions.fuelPrice || config.costs.fuelPricePerLiter;
  
  const distanceKm = route.distance / 1000;
  const fuelNeeded = (distanceKm / 100) * fuelEfficiency;
  const fuelCost = fuelNeeded * fuelPrice;
  
  const tollCost = route.tollInfo ? route.tollInfo.estimatedCost : distanceKm * config.costs.tollEstimatePerKm;
  
  return {
    fuelCost: Math.round(fuelCost * 100) / 100,
    tollCost: Math.round(tollCost * 100) / 100,
    totalCost: Math.round((fuelCost + tollCost) * 100) / 100,
    breakdown: {
      distance: `${distanceKm.toFixed(1)} km`,
      fuelNeeded: `${fuelNeeded.toFixed(1)} L`,
      fuelEfficiency: `${fuelEfficiency} L/100km`,
      fuelPrice: `${fuelPrice}/L`
    },
    assumptions: {
      fuelEfficiency: `${fuelEfficiency} L/100km`,
      fuelPrice: `${fuelPrice} per liter`,
      tollEstimate: 'Based on route analysis'
    }
  };
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});