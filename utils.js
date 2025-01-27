// Welcome to Utils.js: The digital wasteland where functions come to die
// A graveyard of miscellaneous code that didn't fit anywhere else
// If technical debt had a face, this would be its mugshot

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { logError } = require('./logger');
const {
  VALID_ROM_EXTENSIONS,
  PLATFORM_ID_MAP,
  IMAGES_PATH,
  IMAGES_URL_PREFIX,
} = require('./constants');

// Attempts to extract a game's true name from the chaos of brackets, parentheses,
// and the existential dread of ROM naming conventions
function getBaseGameName(filename) {
  // Strip away the extension like tears in rain
  let baseName = path.basename(filename, path.extname(filename));
  // Purge all bracket content like it's a digital exorcism
  baseName = baseName.replace(/[\(\[\{][^\)\]\}]+[\)\]\}]\s*/g, '').trim();
  return baseName;
}

// Judge a ROM by its extension, because we're shallow like that
function isValidRomExtension(ext) {
  return VALID_ROM_EXTENSIONS.has(ext.toLowerCase());
}

// Transform game titles into something that won't make our database have a mental breakdown
function normalizeTitle(title) {
  return title
    .toLowerCase() // Because screaming is only cool at metal concerts
    .replace(/[^\w\s'-]/g, ' ') // Eliminate special characters like they owe us money
    .replace(/\s{2,}/g, ' ') // Double spaces are like double negatives - they shouldn't exist
    .trim(); // Trim the fat, like your personal trainer wishes you would
}

// Find the platform ID or die trying
// Spoiler alert: Sometimes we die trying
function getPlatformId(consoleName) {
  const normalized = consoleName.toLowerCase();
  if (PLATFORM_ID_MAP[normalized]) {
    return PLATFORM_ID_MAP[normalized];
  }
  for (const [key, val] of Object.entries(PLATFORM_ID_MAP)) {
    if (normalized.includes(key)) {
      return val;
    }
  }
  return null;
}

// Count players like a bouncer at a digital nightclub
function getPlayerCount(gameModes) {
  if (!Array.isArray(gameModes)) return 1;
  return gameModes.some(m => m.name?.toLowerCase().includes('multiplayer')) ? 2 : 1;
}

// Extract company names like we're corporate stalkers
function getCompanies(involvedCompanies, role) {
  if (!Array.isArray(involvedCompanies)) return '';
  return involvedCompanies
    .filter(ic => ic && ic[role] && ic.company && ic.company.name)
    .map(ic => ic.company.name)
    .join(', ');
}

// Generate tags by mangling every piece of text we can find
// It's like making digital soup from game description leftovers
function generateTags({ summary, storyline, genres, developer }) {
  const tokens = [];
  if (summary) tokens.push(...summary.toLowerCase().split(/\W+/));
  if (storyline) tokens.push(...storyline.toLowerCase().split(/\W+/));
  if (genres && genres.length) {
    tokens.push(...genres.map(g => g.name.toLowerCase()));
  }
  if (developer) tokens.push(...developer.toLowerCase().split(/\W+/));

  const filtered = new Set(tokens.filter(t => t.length >= 4));
  return Array.from(filtered).sort();
}

// Process genres while pretending we understand game categorization
function processNestedGenres(igdbGenres) {
  if (!Array.isArray(igdbGenres)) return [];
  return igdbGenres.map(g => ({
    name: g.name,
    parent: null,
  }));
}

// Make filenames Windows-friendly, because Windows is that one picky eater at dinner
function sanitizeForFileName(str) {
  // Eliminate characters that make Windows throw a temper tantrum
  let sanitized = str.replace(/[<>:"\\|?*]+/g, '').trim();
  // Convert forward slashes to hyphens because we're diplomatic like that
  sanitized = sanitized.replace(/\//g, ' - ');
  // Collapse multiple spaces like a failed soufflé
  sanitized = sanitized.replace(/\s+/g, ' ');
  // Remove trailing dots because Windows has trust issues
  while (sanitized.endsWith('.') || sanitized.endsWith(' ')) {
    sanitized = sanitized.slice(0, -1);
  }
  return sanitized;
}

// The following four functions are basically the same thing written different ways
// Because copy-paste is a lifestyle choice
function getCoverImageShortPath(consoleName, gameTitle) {
  const c = sanitizeForFileName(consoleName);
  const g = sanitizeForFileName(gameTitle);
  return `${IMAGES_URL_PREFIX}/${c}/${g}/cover.jpg`;
}

function getScreenshotShortPath(consoleName, gameTitle, index) {
  const c = sanitizeForFileName(consoleName);
  const g = sanitizeForFileName(gameTitle);
  return `${IMAGES_URL_PREFIX}/${c}/${g}/screenshots/${index}.jpg`;
}

function getCoverImageAbsolutePath(consoleName, gameTitle) {
  const c = sanitizeForFileName(consoleName);
  const g = sanitizeForFileName(gameTitle);
  return path.join(IMAGES_PATH, c, g, 'cover.jpg');
}

function getScreenshotAbsolutePath(consoleName, gameTitle, index) {
  const c = sanitizeForFileName(consoleName);
  const g = sanitizeForFileName(gameTitle);
  return path.join(IMAGES_PATH, c, g, 'screenshots', `${index}.jpg`);
}

// Download images with the reliability of a weather forecast
async function downloadImage(url, filepath) {
  try {
    // Create directories like we're playing digital Minecraft
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    const response = await axios.get(url, { responseType: 'stream' });
    // Set up a promise that might or might not betray us
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filepath);
      response.data.pipe(writer);
      let error = null;
      writer.on('error', (err) => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on('close', () => {
        if (!error) resolve();
      });
    });
    return true;
  } catch (error) {
    logError(`Failed to download image from "${url}": ${error.message}`);
    return false; // Return false, like our hopes and dreams
  }
}

// Translate age ratings into something resembling human language
// Spoiler: It still won't make sense
function getAgeRatings(ageRatings) {
  if (!Array.isArray(ageRatings)) return '';
  // Convert arbitrary numbers into something resembling sense
  return ageRatings
    .filter(ar => ar && ar.category && ar.rating)
    .map(ar => `${ar.category}: ${ar.rating}`) // Format it like we know what we're doing
    .join(', ');
}

// Export our sins to the world
module.exports = {
  getBaseGameName,
  isValidRomExtension,
  normalizeTitle,
  getPlatformId,
  getPlayerCount,
  getCompanies,
  generateTags,
  processNestedGenres,
  sanitizeForFileName,
  getCoverImageShortPath,
  getScreenshotShortPath,
  getCoverImageAbsolutePath,
  getScreenshotAbsolutePath,
  downloadImage,
  getAgeRatings,
};