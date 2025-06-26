import { Client } from '@googlemaps/google-maps-services-js';

export class GoogleMapsService {
  constructor(apiKey) {
    this.client = new Client({});
    this.apiKey = apiKey;
  }

  async calculateRoute(params) {
    const { origin, destination, waypoints = [], alternatives = false, ...options } = params;
    
    try {
      // Use Directions API for comprehensive routing
      const response = await this.client.directions({
        params: {
          origin,
          destination,
          waypoints: waypoints.length > 0 ? waypoints.join('|') : undefined,
          key: this.apiKey,
          mode: 'driving',
          departure_time: options.departureTime ? new Date(options.departureTime) : 'now',
          traffic_model: options.trafficModel || 'best_guess',
          avoid: this.buildAvoidString(options),
          alternatives: alternatives,
          units: 'metric'
        }
      });

      const route = response.data.routes[0];
      if (!route) {
        throw new Error('No route found');
      }

      return this.formatRouteResponse(route);
    } catch (error) {
      throw new Error(`Google Maps API error: ${error.message}`);
    }
  }

  async getTrafficInfo(params) {
    const { origin, destination, departureTime = 'now' } = params;
    
    try {
      // Get route with traffic
      const response = await this.client.directions({
        params: {
          origin,
          destination,
          key: this.apiKey,
          mode: 'driving',
          departure_time: departureTime === 'now' ? 'now' : new Date(departureTime),
          traffic_model: 'best_guess',
          units: 'metric'
        }
      });

      const route = response.data.routes[0];
      const leg = route.legs[0];

      // Get alternative times
      const alternativeTimes = await this.getAlternativeTimes(origin, destination);

      return {
        duration: leg.duration.value,
        durationInTraffic: leg.duration_in_traffic ? leg.duration_in_traffic.value : leg.duration.value,
        route: this.formatRouteResponse(route),
        alternativeTimes
      };
    } catch (error) {
      throw new Error(`Traffic info error: ${error.message}`);
    }
  }

  async getAlternativeTimes(origin, destination) {
    const times = ['now'];
    const results = {};
    
    // Check traffic at different times
    const timeOffsets = [1800, 3600, 7200]; // 30min, 1hr, 2hr from now
    
    for (const offset of timeOffsets) {
      const departureTime = new Date(Date.now() + offset * 1000);
      try {
        const response = await this.client.directions({
          params: {
            origin,
            destination,
            key: this.apiKey,
            mode: 'driving',
            departure_time: departureTime,
            traffic_model: 'best_guess',
            units: 'metric'
          }
        });
        
        const duration = response.data.routes[0].legs[0].duration_in_traffic?.value || 
                        response.data.routes[0].legs[0].duration.value;
        
        results[`+${offset/60}min`] = {
          duration,
          departureTime: departureTime.toISOString()
        };
      } catch (error) {
        console.warn(`Failed to get alternative time for +${offset/60}min:`, error.message);
      }
    }
    
    return results;
  }

  buildAvoidString(options) {
    const avoid = [];
    if (options.avoidTolls) avoid.push('tolls');
    if (options.avoidHighways) avoid.push('highways');
    if (options.avoidFerries) avoid.push('ferries');
    return avoid.length > 0 ? avoid.join('|') : undefined;
  }

  formatRouteResponse(route) {
    const leg = route.legs[0];
    
    return {
      summary: route.summary,
      distance: leg.distance.value, // meters
      duration: leg.duration.value, // seconds
      durationInTraffic: leg.duration_in_traffic ? leg.duration_in_traffic.value : leg.duration.value,
      polyline: route.overview_polyline.points,
      steps: leg.steps.map(step => ({
        instruction: step.html_instructions.replace(/<[^>]*>/g, ''), // Remove HTML tags
        distance: step.distance.text,
        duration: step.duration.text,
        maneuver: step.maneuver
      })),
      warnings: route.warnings || [],
      tollInfo: this.extractTollInfo(route),
      bounds: route.bounds,
      copyrights: route.copyrights
    };
  }

  extractTollInfo(route) {
    // Check for toll information in warnings or route data
    const tollWarnings = route.warnings?.filter(warning => 
      warning.toLowerCase().includes('toll')
    ) || [];
    
    return {
      hasTolls: tollWarnings.length > 0,
      warnings: tollWarnings,
      estimatedCost: null // Would need additional API or estimation logic
    };
  }
}
