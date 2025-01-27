// Welcome to the digital necromancer's playground, where we resurrect dead game data 
// and force it to dance for our amusement

// Summoning our dark utilities from the depths of node_modules
const { igdbRequest } = require('./igdb');
const stringSimilarity = require('string-similarity'); // Because humans can't even spell game titles consistently
const { logSuccess, logWarning } = require('./logger'); // For when things go right (rarely) or wrong (usually)
const {
  // The sacred scrolls of utility functions
  getPlatformId, // Converts human-readable platform names into soulless numbers
  normalizeTitle, // Strips games of their special characters like a cruel dictator
  getPlayerCount, // Counts how many friends you don't have to play with
  getCompanies, // Lists the corporate overlords responsible for your childhood memories
  generateTags, // Slaps labels on games like a morgue worker on toe tags
  processNestedGenres, // Untangles the nightmare that is nested genre trees
} = require('./utils');

// Configuration constants, or "How to Fail Differently"
const {
  OFFLINE_MODE, // For when the internet decides to give you the silent treatment
  FUZZY_MATCH_THRESHOLD, // How desperate we are to find a match (very)
  LAZY_DOWNLOAD, // Because sometimes we just can't be bothered
  TAG_GENERATION, // Auto-categorization for the chronically disorganized
  MAX_BATCH_SIZE, // The number of results before IGDB tells us to get lost
} = require('./constants');

// More utilities for hoarding digital pictures of games you'll never play
const { downloadImage } = require('./utils');
const {
  // The file path family: they're all different but equally disappointing
  getCoverImageAbsolutePath,
  getScreenshotAbsolutePath,
  getCoverImageShortPath,
  getScreenshotShortPath,
} = require('./utils');

// The grand inquisitor: interrogates IGDB's API until it confesses
async function igdbBatchSearch(title, platformId) {
  // Sanitize the title because apparently quotes are too spicy for APIs
  const sanitizedTitle = title.replace(/"/g, '\\"');
  // If we have a platform ID, use it. If not, well, good luck to us all
  const platformFilter = platformId ? `where platforms = (${platformId});` : '';
  
  // The most ambitious crossover event: asking for every piece of data IGDB has
  // while praying the API doesn't laugh at us
  const query = `
    search "${sanitizedTitle}";
    ${platformFilter}
    fields name, alternative_names.name, cover.*, genres.name, first_release_date,
           summary, storyline, platforms, involved_companies.company.name,
           involved_companies.publisher, involved_companies.developer,
           total_rating, total_rating_count, rating, rating_count,
           aggregated_rating, aggregated_rating_count, category, status,
           game_modes.name, keywords.name, age_ratings.*, collection.name,
           franchise.name, screenshots.image_id;
    limit ${MAX_BATCH_SIZE};
  `;
  return igdbRequest('games', query);
}

// The matchmaker from hell: tries to find love between your messy title and IGDB's database
function pickBestFuzzyMatch(baseGameTitle, igdbResults) {
  // No results? No problem! Here's your null, thanks for playing
  if (!igdbResults.length) return null;
  const allNames = [];

  // Collect all possible names like we're building Noah's ark of game titles
  igdbResults.forEach((game, idx) => {
    allNames.push({ name: game.name?.toLowerCase() || '', idx });
    (game.alternative_names || []).forEach((a) => {
      allNames.push({ name: a.name?.toLowerCase() || '', idx });
    });
  });

  // Transform everything to lowercase because CAPS LOCK IS CRUISE CONTROL FOR COOL
  const base = baseGameTitle.toLowerCase();
  const allTitles = allNames.map((x) => x.name);
  // Find the least worst match in our pile of possibilities
  const bestMatchObj = stringSimilarity.findBestMatch(base, allTitles);
  
  // If the match is worse than our threshold, abandon all hope
  if (bestMatchObj.bestMatch.rating < FUZZY_MATCH_THRESHOLD) {
    return null;
  }
  const bestMatchIndex = bestMatchObj.bestMatchIndex;
  const matchingIdx = allNames[bestMatchIndex].idx;
  return igdbResults[matchingIdx];
}

// The main event: where hope goes to die and metadata comes to live
async function fetchGameMetadata(gameEntry) {
  // If we're offline, return null faster than your ex returns your texts
  if (OFFLINE_MODE) {
    return null;
  }

  // Extract the vital organs... er, information
  const title = gameEntry.title;
  const consoleName = gameEntry.consoleName;
  // Convert console name to a number because computers hate names
  const platformId = getPlatformId(consoleName);
  
  // Commence the digital séance
  const metadataResults = await igdbBatchSearch(title, platformId);

  // Normalize the title because special characters are for the weak
  const baseTitle = normalizeTitle(title);

  // First, try exact matches (ha! good luck with that)
  const possibleMatches = metadataResults.filter((game) => {
    return game.name?.toLowerCase() === baseTitle.toLowerCase() ||
      game.alternative_names?.some((alt) => alt.name?.toLowerCase() === baseTitle.toLowerCase());
  });

  // If exact matching fails, resort to fuzzy matching (aka digital desperation)
  let metadata = pickBestFuzzyMatch(baseTitle, possibleMatches);
  if (!metadata) {
    metadata = pickBestFuzzyMatch(baseTitle, metadataResults);
  }

  // Return whatever we found, or null if the digital gods abandoned us
  return metadata;
}

// Export our function so others can share in the disappointment
module.exports = {
  fetchGameMetadata,
};