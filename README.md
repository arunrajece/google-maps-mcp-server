# Google Maps MCP Server

A Model Context Protocol (MCP) server that integrates Google Maps routing and traffic capabilities with Claude AI for advanced route planning, traffic analysis, and cost estimation.

## Prerequisites

- **Node.js** (LTS version 18+ recommended) - Download from [nodejs.org](https://nodejs.org/)
- **Google Maps API Key** with required services enabled
- **Claude Desktop** application for MCP integration

## Setup Instructions

### 1. Clone and Install
```bash
git clone [your-repo-url]
cd google-maps-mcp-server
npm install
```

### 2. Get Google Maps API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the following APIs:
   - **Directions API** (required for routing)
   - **Distance Matrix API** (required for traffic data)
   - **Geocoding API** (required for address lookup)
   - **Places API** (optional, for enhanced address search)
4. Create credentials → API Key
5. Restrict the API key to the enabled services above

### 3. Configure API Key
Edit `config/config.json` and replace `GOOGLE_API_KEY` with your actual API key:
```json
{
  "googleMaps": {
    "apiKey": "your-actual-api-key-here"
  }
}
```

### 4. Test the Server
```bash
# Test configuration
npm test

# Start in development mode
npm run dev
```

### 5. Configure Claude Desktop
Add this to your Claude Desktop MCP settings file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "google-maps": {
      "command": "node",
      "args": ["/absolute/path/to/google-maps-mcp-server/src/index.js"],
      "cwd": "/absolute/path/to/google-maps-mcp-server"
    }
  }
}
```

### 6. Start Using
Restart Claude Desktop and you can now ask questions like:
- "Find the fastest route from New York to Boston"
- "Compare routes to the airport with and without tolls"
- "What's the traffic like for my commute right now?"

## Available Tools

- **calculate_route**: Get optimal route with traffic consideration and waypoints
- **compare_routes**: Compare multiple route alternatives with different options
- **get_live_traffic**: Get real-time traffic information and travel delays
- **estimate_costs**: Calculate trip costs including fuel and toll estimates

## Troubleshooting

### Common Issues

**1. "Please set your Google Maps API key" error**
- Check that `config/config.json` has your actual API key, not `GOOGLE_API_KEY`
- Ensure the JSON format is valid (no trailing commas)

**2. "Google Maps API error" messages**
- Verify your API key is valid and has the required APIs enabled
- Check API quotas and billing in Google Cloud Console
- Ensure your API key isn't restricted to wrong domains/IPs

**3. "No route found" errors**
- Check that addresses are valid and exist
- Try using coordinates instead of addresses (lat,lng format)
- Verify the locations are accessible by car

**4. Server won't start**
```bash
# Check Node.js version
node --version  # Should be 18+

# Clear dependencies and reinstall
rm -rf node_modules package-lock.json
npm install

# Check for configuration errors
npm test
```

**5. Claude Desktop can't find the server**
- Use absolute paths in Claude Desktop config
- Restart Claude Desktop after configuration changes
- Check that the MCP config file path is correct for your OS

### Debug Mode
Run with debug logging:
```bash
DEBUG=* npm start
```

### Testing Individual Tools
```bash
# Test route calculation
echo '{"origin":"New York, NY","destination":"Boston, MA"}' | node src/index.js

# Check API connectivity
curl "https://maps.googleapis.com/maps/api/directions/json?origin=NYC&destination=Boston&key=YOUR_API_KEY"
```

## Configuration Options

Edit `config/config.json` to customize:

```json
{
  "googleMaps": {
    "apiKey": "your-api-key"
  },
  "server": {
    "port": 3001,
    "host": "localhost"
  },
  "routing": {
    "defaultTrafficModel": "best_guess",
    "maxWaypoints": 25,
    "maxAlternatives": 3,
    "units": "metric"
  },
  "costs": {
    "fuelPricePerLiter": 1.50,
    "vehicleFuelEfficiency": 8.0,
    "tollEstimatePerKm": 0.05
  }
}
```

## License

MIT License - feel free to modify and distribute.