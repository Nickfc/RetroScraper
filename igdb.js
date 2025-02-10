/**
 * IGDB API Integration Module
 * 
 * Handles all interactions with the IGDB API, including authentication,
 * request management, rate limiting, and data caching.
 */

const axios = require('axios');
const { logInfo, logError, logWarning, logSuccess } = require('./logger');
const {
  CLIENT_ID,
  CLIENT_SECRET,
  OFFLINE_MODE,
  IGDB_CACHE,
  PLATFORM_ID_MAP,
  MAX_CONCURRENCY,
  config, // Import config
} = require('./constants');
const { queueRequest, handle429 } = require('./rateLimiter');

/**
 * Authentication token for IGDB API access
 * @type {string|null}
 */
let accessToken = null;

/**
 * Retrieves an access token from Twitch for IGDB API access
 * @async
 * @returns {Promise<string>} The access token for API authentication
 * @throws {Error} If token acquisition fails
 */
async function getIGDBAccessToken() {
  try {
    const response = await axios.post(
      'https://id.twitch.tv/oauth2/token',
      null,
      {
        params: {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: 'client_credentials',
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    logError(`Failed to obtain IGDB access token: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Executes a request to the IGDB API with retry and rate limiting logic
 * @async
 * @param {string} endpoint - The IGDB API endpoint to query
 * @param {string} query - The IGDB query string
 * @returns {Promise<Array>} The API response data
 */
async function igdbRequest(endpoint, query) {
  if (OFFLINE_MODE) {
    return [];
  }

  const cacheKey = `${endpoint}:${query}`;
  if (IGDB_CACHE[cacheKey]) {
    return IGDB_CACHE[cacheKey];
  }

  // Validate and clean the query
  const cleanQuery = query
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/;+$/, ';'); // Ensure single semicolon at end

  // The actual request function, where hopes and dreams go to die
  const fn = async () => {
    let retries = 0;
    const maxRetries = 5; // Five chances at happiness, more than life usually gives you
    let delay = 2000; // Starting with 2 seconds of existential dread

    while (true) {
      try {
        // Attempting to communicate with the API gods
        const response = await axios.post(
          `https://api.igdb.com/v4/${endpoint}`,
          cleanQuery,
          {
            headers: {
              'Client-ID': CLIENT_ID,
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
              'Content-Type': 'text/plain',
            },
          }
        );

        // Log successful queries for debugging
        console.log(`Successful query for ${endpoint}:`, cleanQuery);

        IGDB_CACHE[cacheKey] = response.data || [];
        return IGDB_CACHE[cacheKey];
      } catch (error) {
        console.log(`API Error for query: ${cleanQuery}`);
        console.log(`Error details:`, error.response?.data || error.message);

        if (error.response) {
          // 401: When the API decides our friendship is over
          if (error.response.status === 401) {
            logInfo(`Access token expired. Renewing...`);
            accessToken = await getIGDBAccessToken();
            continue;
          }
          // 429: Too Many Requests - API's way of saying "Stop being so clingy"
          if (error.response.status === 429) {
            logWarning(`Received 429 (Too Many Requests). Retrying after delay...`);
            handle429();
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
            retries++;
            if (retries > maxRetries) {
              logError(`Max retries reached for IGDB request.`);
              return [];
            }
            continue;
          }
          // 413: When your request is as bloated as your gaming backlog
          if (error.response.status === 413) {
            logError(`IGDB request error: Request payload too large. Consider reducing batch size.`);
            throw new Error(`IGDB request error: Request payload too large.`);
          }
          // 400: Invalid query
          if (error.response.status === 400) {
            logError(`Invalid query: ${cleanQuery}`);
            return [];
          }
        }
        // If all else fails, curl up in a corner and cry
        logError(`IGDB request error: ${error.message}`);
        return [];
      }
    }
  };

  // Queue the request like it's waiting for therapy - it needs help, but has to wait its turn
  return queueRequest(fn);
}

/**
 * Initializes the IGDB API connection and validates credentials
 * @async
 * @throws {Error} If credentials are missing or invalid
 */
async function initIGDB() {
  if (OFFLINE_MODE) {
    logInfo(`Offline mode enabled. Skipping IGDB init.`);
    return;
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    logError(`IGDB credentials not set in config.ini (ClientID / ClientSecret).`);
    process.exit(1);
  }
  accessToken = await getIGDBAccessToken();
}

/**
 * Retrieves and caches platform IDs from IGDB
 * Maps platform names to their corresponding IGDB IDs
 * @async
 */
async function fetchPlatformIDs() {
  if (OFFLINE_MODE) {
    logInfo('Offline mode enabled. Skipping platform IDs fetch.');
    return;
  }
  
  logInfo('Fetching platform IDs from IGDB...');
  try {
    let platforms = [];
    let offset = 0;
    const limit = 500; // IGDB allows up to 500 per request
    while (true) {
      const query = `fields id,name,alternative_name; limit ${limit}; offset ${offset};`;
      const response = await igdbRequest('platforms', query);
      if (!response.length) break;
      platforms = platforms.concat(response);
      offset += limit;
    }
    for (const platform of platforms) {
      PLATFORM_ID_MAP[platform.name.toLowerCase()] = platform.id;
      if (platform.alternative_name) {
        PLATFORM_ID_MAP[platform.alternative_name.toLowerCase()] = platform.id;
      }
    }
    logSuccess(`Fetched ${platforms.length} platforms from IGDB.`);
  } catch (error) {
    logError(`Failed to fetch platform IDs: ${error.message}`);
  }
}

module.exports = {
  initIGDB,
  igdbRequest,
  fetchPlatformIDs,
};