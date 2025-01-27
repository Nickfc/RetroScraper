// Welcome to IGDB.js, where we beg a corporate API for data like peasants at a medieval feast

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

// Our precious token, as fragile as your ex's promises
let accessToken = null;

// Begging Twitch for permission to exist... I mean, for an access token
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

// The main attraction: Where we dance with IGDB's API like we're walking on hot coals
async function igdbRequest(endpoint, query) {
  // Offline mode: When we pretend the internet doesn't exist, just like your social life
  if (OFFLINE_MODE) {
    return [];
  }

  // Check if we've cached this request, because why suffer twice?
  const cacheKey = `${endpoint}:${query}`;
  if (IGDB_CACHE[cacheKey]) {
    return IGDB_CACHE[cacheKey];
  }

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
          query,
          {
            headers: {
              'Client-ID': CLIENT_ID,
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
              'Content-Type': 'text/plain',
            },
          }
        );
        IGDB_CACHE[cacheKey] = response.data || [];
        return IGDB_CACHE[cacheKey];
      } catch (error) {
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

// Initialize IGDB connection, or as I like to call it: "The First Date"
async function initIGDB() {
  // Offline mode: Perfect for when you're as antisocial as a dev during crunch time
  if (OFFLINE_MODE) {
    logInfo(`Offline mode enabled. Skipping IGDB init.`);
    return;
  }
  // No credentials? That's like showing up to a party without pants
  if (!CLIENT_ID || !CLIENT_SECRET) {
    logError(`IGDB credentials not set in config.ini (ClientID / ClientSecret).`);
    process.exit(1);
  }
  accessToken = await getIGDBAccessToken();
}

// Fetch platform IDs, because apparently counting from 1 to infinity was too mainstream
async function fetchPlatformIDs() {
  // In offline mode, we pretend platforms don't exist, just like PC gamers pretend consoles don't exist
  if (OFFLINE_MODE) {
    logInfo('Offline mode enabled. Skipping platform IDs fetch.');
    return;
  }
  
  // Time to harvest platform data like a farmer with OCD
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
    // When everything goes wrong, blame it on cosmic rays
    logError(`Failed to fetch platform IDs: ${error.message}`);
  }
}

// Export our masochistic functions for others to enjoy
module.exports = {
  initIGDB,
  igdbRequest,
  fetchPlatformIDs,
};