/**
 * RetroScraper File Scanner Module
 * 
 * Implements comprehensive ROM file discovery and analysis functionality.
 * Traverses configured directories to identify valid ROM files and map them
 * to their respective gaming platforms.
 * 
 * Key features:
 * - Recursive directory traversal
 * - ROM file validation
 * - Console platform mapping
 * - Metadata extraction from filenames
 * - Error handling and logging
 */

/*
 * The Grand ROM Inquisitor
 * Because someone has to do the dirty work of finding those pesky ROMs
 * that are totally legally backed up from your massive collection, right? ;)
 */

// Summon the elder gods of the filesystem
const fs = require('fs');
const path = require('path');
// Import our accomplices in crime
const { isValidRomExtension, getBaseGameName } = require('./utils');
const { logError, logInfo } = require('./logger'); // assuming logInfo exists or create it accordingly
const { mapFoldersToConsoles, FOLDER_CONSOLE_MAP } = require('./folderMapper');

// The main hunting grounds where we track down our digital prey
async function collectGameEntries(romPaths) {
  // The mass grave where we store our findings
  const gameEntries = [];
  // A sacred scroll of folders we need to decode later
  const folderNamesToMap = new Set();

  // Use fs.promises for asynchronous directory scanning
  const fsp = fs.promises;

  // Recursively descent into the madness of nested folders
  async function scanDirectoryForGames(dirPath, relativePathParts) {
    let entries;
    try {
      // Asynchronously read directory entries
      entries = await fsp.readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      // The void stared back and we blinked
      logError(`Failed to read directory "${dirPath}": ${err.message}`);
      return;
    }

    // Flag to mark if we found any souls worth harvesting
    let hasValidFiles = false;
    
    // For each potential victim in our path
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        try {
          // Ah, a dungeon! Let's delve deeper into the darkness
          await scanDirectoryForGames(fullPath, relativePathParts.concat(entry.name));
        } catch (err) {
          logError(`Error scanning subdirectory "${fullPath}": ${err.message}`);
        }
      } else {
        // Examine the specimen's DNA (file extension)
        const ext = path.extname(entry.name);
        if (isValidRomExtension(ext)) {
          // We found one! Another ROM to add to our collection...
          hasValidFiles = true;
          const baseName = getBaseGameName(entry.name);
          const folderKey = relativePathParts.join('/');
          gameEntries.push({
            title: baseName,          // The victim's true name
            consoleName: folderKey,   // Their origin story
            romPath: fullPath,        // Where to find the body
          });
        }
      }
    }

    // If we found any victims in this folder, mark it for future reference
    if (hasValidFiles) {
      const folderKey = relativePathParts.join('/');
      folderNamesToMap.add(folderKey);
    }
  }

  // Begin the grand hunt across all provided hunting grounds
  for (const romPath of romPaths) {
    try {
      await scanDirectoryForGames(romPath, []);
    } catch (err) {
      logError(`Error scanning ROM path "${romPath}": ${err.message}`);
    }
  }

  // Decode the ancient console runes from our folder names
  try {
    const folderMappings = await mapFoldersToConsoles(Array.from(folderNamesToMap));
    // Properly label our specimens with their console of origin
    // Like a twisted museum curator cataloging their finds
    for (const entry of gameEntries) {
      const folderKey = entry.consoleName;
      entry.consoleName = folderMappings[folderKey] || entry.consoleName;
    }
  } catch (err) {
    logError(`Error mapping folders to consoles: ${err.message}`);
  }

  // Return our macabre collection to the caller
  return gameEntries;
}

// Export our ritual for others to use
module.exports = {
  collectGameEntries,
};