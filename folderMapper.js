/*
 * Welcome to folderMapper.js - Where your messy ROM folders come to be judged
 * Because apparently, you can't be trusted to organize your own files properly
 */

// Summoning the dark lords of node modules
const fs = require('fs');
const { default: inquirer } = require('inquirer');
const stringSimilarity = require('string-similarity');
const path = require('path');

// Import our sacred constants, may they guide us through this folder nightmare
const {
  FOLDER_CONSOLE_MAP_PATH,
  FOLDER_CONSOLE_MAP,
  PLATFORM_ID_MAP,
  CORE_CONSOLE_MAP,
  MAX_CONSOLE_SUGGESTIONS,
  PLATFORM_VARIATIONS,
  FUZZY_MATCH_THRESHOLD,
  NORMALIZED_PLATFORM_NAMES,
} = require('./constants');

// For when things go terribly wrong (and they will)
const { logWarning, logInfo, logSuccess, logError } = require('./logger');

// Attempts to load previous mappings, if they haven't been lost to the void
function loadFolderConsoleMappings() {
  if (fs.existsSync(FOLDER_CONSOLE_MAP_PATH)) {
    try {
      const content = fs.readFileSync(FOLDER_CONSOLE_MAP_PATH, 'utf8');
      Object.assign(FOLDER_CONSOLE_MAP, JSON.parse(content));
    } catch (err) {
      logWarning(`The mapping file exists but is probably corrupted. Just like your childhood memories.`);
    }
  }
}

// Saves our desperate attempts at organization to a file
function saveFolderConsoleMappings() {
  fs.writeFileSync(FOLDER_CONSOLE_MAP_PATH, JSON.stringify(FOLDER_CONSOLE_MAP, null, 2), 'utf8');
}

// Because apparently, different people call the same console by 50 different names
function normalizePlatformName(name) {
  const normalized = name.toLowerCase().trim();
  return NORMALIZED_PLATFORM_NAMES[normalized] || normalized;
}

// The main attraction: Where we try to make sense of your chaotic folder structure
async function mapFoldersToConsoles(folderNames) {
  if (!Array.isArray(folderNames)) {
    logWarning('No folders to map. Did your hard drive finally give up?');
    return {};
  }

  // The sacred scroll of known console names. May it be complete (it's not)
  const knownConsoleNames = new Set([
    ...Object.keys(PLATFORM_ID_MAP),
    ...Object.keys(CORE_CONSOLE_MAP),
    ...Object.keys(NORMALIZED_PLATFORM_NAMES)
  ]);
  
  // Where hope goes to die
  const mappings = {};

  for (const folderName of folderNames) {
    if (!folderName) continue; // Empty folder names? Really?
    
    try {
      // Normalize paths because Windows users can't be trusted with forward slashes
      const normalizedPath = (folderName || '').toLowerCase().replace(/\\/g, '/');
      
      // First, we try the obvious approach (which rarely works)
      const normalizedName = normalizePlatformName(path.basename(normalizedPath));
      if (knownConsoleNames.has(normalizedName)) {
        mappings[folderName] = normalizedName;
        FOLDER_CONSOLE_MAP[normalizedPath] = normalizedName;
        continue;
      }

      // Time to play "guess the console" based on your creative folder naming
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

      // Check if we've seen this mess before
      if (FOLDER_CONSOLE_MAP[normalizedPath]) {
        mappings[folderName] = FOLDER_CONSOLE_MAP[normalizedPath];
        continue;
      }

      // Get folder name without path
      const baseName = path.basename(normalizedPath);
      if (!baseName) continue;

      // Check if the base name has a direct mapping
      if (FOLDER_CONSOLE_MAP[baseName]) {
        mappings[folderName] = FOLDER_CONSOLE_MAP[baseName];
        FOLDER_CONSOLE_MAP[normalizedPath] = FOLDER_CONSOLE_MAP[baseName];
        continue;
      }

      // When all else fails, resort to fuzzy matching (like your memory of where you put those ROMs)
      const matches = stringSimilarity.findBestMatch(
        baseName,
        Array.from(knownConsoleNames)
      );

      // Filter out the absolutely terrible matches, keep the merely bad ones
      const threshold = FUZZY_MATCH_THRESHOLD || 0.4; // Provide default if undefined
      const bestMatches = matches.ratings
        .filter(match => match.rating > threshold)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, MAX_CONSOLE_SUGGESTIONS);

      if (bestMatches.length === 0) {
        logWarning(`No good matches found for "${folderName}", skipping...`);
        continue;
      }

      try {
        const answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'consoleName',
            message: `Select the console/platform for folder "${folderName}":`,
            choices: [
              ...bestMatches.map((match) => ({
                name: `${match.target} (Similarity: ${(match.rating * 100).toFixed(1)}%)`,
                value: match.target,
              })),
              { name: 'Other (Enter manually)', value: 'other' }
            ],
          }
        ]);

        let consoleName = answer.consoleName;
        if (consoleName === 'other') {
          const manualEntry = await inquirer.prompt([
            {
              type: 'input',
              name: 'manualConsoleName',
              message: 'Enter the console/platform name:',
            }
          ]);
          consoleName = manualEntry.manualConsoleName;
        }

        FOLDER_CONSOLE_MAP[folderName] = consoleName;
        mappings[folderName] = consoleName;
        saveFolderConsoleMappings();
      } catch (error) {
        logError(`Failed to prompt for console selection: ${error.message}`);
        return mappings;
      }
    } catch (error) {
      logError(`Even our best guess failed for "${folderName}". You're on your own with this one.`);
      continue;
    }
  }

  return mappings; // Here's your folder mapping. Don't say we didn't try.
}

// Attempts to divine the console name from the path alone
function detectConsoleFromPath(folderPath) {
  // Normalize the path because consistency is a myth
  const normalizedPath = folderPath.toLowerCase().replace(/\\/g, '/');
  
  // Check exact path match first
  const exactMatch = CONSOLE_FOLDER_MAPPINGS[normalizedPath];
  if (exactMatch) return exactMatch;

  // Get the folder name
  const folderName = path.basename(folderPath).toLowerCase();
  
  // Check direct folder name match
  const directMatch = CONSOLE_FOLDER_MAPPINGS[folderName];
  if (directMatch) return directMatch;

  // If no direct match, then proceed with fuzzy matching
  // ...existing fuzzy matching code...
}

// Measures how wrong we probably are about matching folders to consoles
function getSimilarityScore(folderName, consoleName) {
  // If either name is missing, we're already doomed
  if (!folderName || !consoleName) return 0;

  const folder = folderName.toLowerCase();
  const console = consoleName.toLowerCase();
  
  // Check if the console name is a known platform in IGDB
  if (PLATFORM_ID_MAP[console]) {
    // Check variations of the platform name
    const variations = PLATFORM_VARIATIONS[console] || [];
    for (const variation of variations) {
      if (folder.includes(variation) || variation.includes(folder)) {
        return 95;
      }
    }
  }

  // Check if folder matches platform name directly
  if (folder.includes(console) || console.includes(folder)) {
    return 90;
  }

  // Use string similarity with reduced weight for non-exact matches
  return stringSimilarity.compareTwoStrings(folder, console) * 70;
}

// Export these functions so other files can share in the misery
module.exports = {
  loadFolderConsoleMappings,
  saveFolderConsoleMappings,
  mapFoldersToConsoles,
  FOLDER_CONSOLE_MAP,
};