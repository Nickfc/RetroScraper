/**
 * Folder Mapping System
 * 
 * Manages the mapping between ROM folder names and their corresponding
 * console/platform identifiers. Handles folder name normalization,
 * console detection, and user-assisted mapping.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const stringSimilarity = require('string-similarity');
const { logInfo, logSuccess, logWarning, logError } = require('./logger');
const {
  FOLDER_CONSOLE_MAP_PATH,
  NORMALIZED_PLATFORM_NAMES,
  PLATFORM_ID_MAP,
  CORE_CONSOLE_MAP,
  PLATFORM_VARIATIONS,
  FUZZY_MATCH_THRESHOLD,
  MAX_CONSOLE_SUGGESTIONS
} = require('./constants');

// Global mapping storage
let FOLDER_CONSOLE_MAP = {};

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

async function promptForConsoleMatch(folderName, suggestions) {
  return new Promise((resolve) => {
    const rl = createReadlineInterface();
    
    console.log(`\nSelect console for "${folderName}":`);
    suggestions.forEach((s, i) => {
      console.log(`${i + 1}: ${s.console} (${Math.round(s.rating * 100)}% match)`);
    });
    console.log(`${suggestions.length + 1}: None of these`);

    rl.question('Enter number: ', (answer) => {
      rl.close();
      const num = parseInt(answer) - 1;
      if (num >= 0 && num < suggestions.length) {
        resolve(suggestions[num].console);
      } else {
        resolve(null);
      }
    });
  });
}

function loadFolderConsoleMappings() {
  if (fs.existsSync(FOLDER_CONSOLE_MAP_PATH)) {
    try {
      const content = fs.readFileSync(FOLDER_CONSOLE_MAP_PATH, 'utf8');
      FOLDER_CONSOLE_MAP = JSON.parse(content);
      logSuccess(`Loaded ${Object.keys(FOLDER_CONSOLE_MAP).length} existing console mappings`);
    } catch (err) {
      logWarning(`The mapping file exists but is probably corrupted. Starting fresh.`);
      FOLDER_CONSOLE_MAP = {};
    }
  }
}

function saveFolderConsoleMappings() {
  fs.writeFileSync(FOLDER_CONSOLE_MAP_PATH, JSON.stringify(FOLDER_CONSOLE_MAP, null, 2), 'utf8');
  logSuccess(`Saved ${Object.keys(FOLDER_CONSOLE_MAP).length} console mappings`);
}

function normalizePlatformName(name) {
  const normalized = name.toLowerCase().trim();
  return NORMALIZED_PLATFORM_NAMES[normalized] || normalized;
}

async function mapFoldersToConsoles(folderNames) {
  if (!Array.isArray(folderNames)) {
    logWarning('No folders to map. Did your hard drive finally give up?');
    return {};
  }

  const knownConsoleNames = new Set([
    ...Object.keys(PLATFORM_ID_MAP),
    ...Object.keys(CORE_CONSOLE_MAP),
    ...Object.keys(NORMALIZED_PLATFORM_NAMES)
  ]);
  
  const mappings = {};

  for (const folderName of folderNames) {
    if (!folderName) continue;

    try {
      const normalizedPath = folderName.toLowerCase().replace(/\\/g, '/');
      const normalizedName = normalizePlatformName(path.basename(normalizedPath));
      
      // Check if we already have a direct match
      if (knownConsoleNames.has(normalizedName)) {
        mappings[folderName] = normalizedName;
        FOLDER_CONSOLE_MAP[normalizedPath] = normalizedName;
        continue;
      }

      // Check platform variations
      let matchFound = false;
      for (const [platform, variations] of Object.entries(PLATFORM_VARIATIONS)) {
        if (variations.some(v => normalizedPath.includes(v.toLowerCase()))) {
          const normalizedPlatform = normalizePlatformName(platform);
          mappings[folderName] = normalizedPlatform;
          FOLDER_CONSOLE_MAP[normalizedPath] = normalizedPlatform;
          matchFound = true;
          break;
        }
      }
      if (matchFound) continue;

      // Check existing mappings
      if (FOLDER_CONSOLE_MAP[normalizedPath]) {
        mappings[folderName] = FOLDER_CONSOLE_MAP[normalizedPath];
        continue;
      }

      // Fuzzy matching as last resort
      const matches = stringSimilarity.findBestMatch(
        path.basename(normalizedPath),
        Array.from(knownConsoleNames)
      );

      const bestMatches = matches.ratings
        .filter(match => match.rating > (FUZZY_MATCH_THRESHOLD || 0.4))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, MAX_CONSOLE_SUGGESTIONS);

      if (bestMatches.length > 0) {
        const consoleName = await promptForConsoleMatch(folderName, bestMatches.map(match => ({
          console: match.target,
          rating: match.rating
        })));

        if (consoleName) {
          FOLDER_CONSOLE_MAP[normalizedPath] = consoleName;
          mappings[folderName] = consoleName;
          saveFolderConsoleMappings();
        }
      } else {
        logWarning(`No matches found for "${folderName}"`);
      }
    } catch (error) {
      logError(`Failed to process "${folderName}": ${error.message}`);
    }
  }

  return mappings;
}

module.exports = {
  loadFolderConsoleMappings,
  saveFolderConsoleMappings,
  mapFoldersToConsoles,
  FOLDER_CONSOLE_MAP
};