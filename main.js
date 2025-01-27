/*
 * Welcome to the meat grinder of your nostalgia
 * Where we turn your precious ROMs into a properly organized library
 * Because apparently, "random folders from 2007" isn't a valid organization system
 */

const fs = require('fs');
const path = require('path');
// Importing our colorful console companions for when things inevitably go wrong
const { logSuccess, logWarning, logInfo, logError } = require('./logger');
// The sacred scrolls of configuration - touch them and everything breaks
const {
  OUTPUT_FOLDER,
  IMAGES_PATH,
  ROMS_PATHS,
  config, // Your hopes and dreams in JSON format
} = require('./constants');
// IGDB API - Because we need someone else to validate your gaming history
const { initIGDB, fetchPlatformIDs } = require('./igdb');
// Maps consoles to cores, like matching prison inmates to cells
const { mapConsolesToCores } = require('./coreMapper');
// The grand architect of your digital hoard
const { buildGameLibrary } = require('./buildGameLibrary');
// For when CTRL+C strikes and we need to save our progress like it's 1999
const { saveCurrentData } = require('./dataSaver');
// Because someone thought folder names like "Nintando64" were a good idea
const { loadFolderConsoleMappings } = require('./folderMapper');

// Global variables: The sword of Damocles hanging over our error handling
let scriptInProgress = true;
let finalMapGlobal = null;
let unmatchedGlobal = null;

// Initialize all the things that can go wrong
async function initData() {
  // Pray to the IGDB gods
  await initIGDB();
  // Check if we're in "I don't trust the internet" mode
  if (!config.Settings?.OfflineMode || config.Settings.OfflineMode !== 'true') {
    await fetchPlatformIDs();
  } else {
    logInfo('Running in offline mode - like it\'s Y2K all over again');
  }
  // Match consoles to cores like a deranged matchmaker
  await mapConsolesToCores();
  // Load folder mappings, because spelling is hard
  loadFolderConsoleMappings();
}

// Hunt down folders like they owe us money
async function scanFolders() {
  try {
    // Transform your chaotic ROM paths into something resembling organization
    const folders = ROMS_PATHS.map(romPath => {
      if (!fs.existsSync(romPath)) {
        logWarning(`ROMs path not found: ${romPath} - Did the dog eat your ROMs?`);
        return null;
      }
      return fs.readdirSync(romPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(romPath, dirent.name));
    })
    .filter(Boolean) // Filter out the dead bodies
    .flat();

    if (folders.length === 0) {
      logWarning('No ROM folders found - Your childhood seems to be missing');
      return [];
    }

    return folders;
  } catch (error) {
    logError(`Failed to scan ROM folders: ${error.message} - The archaeology expedition has failed`);
    return [];
  }
}

// The main event - Where dreams come to be reorganized
async function main() {
  try {
    // Handle CTRL+C with the grace of a cat on a keyboard
    process.on('SIGINT', async () => {
      if (scriptInProgress) {
        logWarning('Caught SIGINT - Saving progress before you kill me completely...');
        if (finalMapGlobal && unmatchedGlobal) {
          await saveCurrentData(finalMapGlobal, unmatchedGlobal);
        }
        process.exit(1);
      } else {
        process.exit(0);
      }
    });

    // Check if your ROM paths actually exist in this dimension
    ROMS_PATHS.forEach((romPath) => {
      if (!fs.existsSync(romPath)) {
        logWarning(`ROMs path "${romPath}" is MIA. Probably ran away to join the circus.`);
      }
    });

    // Filter out the paths that actually exist in reality
    const existingRomsPaths = ROMS_PATHS.filter((romPath) => fs.existsSync(romPath));

    if (existingRomsPaths.length === 0) {
      logError('All ROM directories are imaginary. Please touch grass and try again.');
      process.exit(1);
    }

    // Create folders - Because we need somewhere to store your organized chaos
    fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
    fs.mkdirSync(IMAGES_PATH, { recursive: true });

    // Initialize the pain train
    await initData();

    // Build the library - Where ROMs go to be judged
    const { finalMap, unmatchedGames } = await buildGameLibrary();
    finalMapGlobal = finalMap;
    unmatchedGlobal = unmatchedGames;

    // Save everything before the universe implodes
    await saveCurrentData(finalMap, unmatchedGames);
    scriptInProgress = false;

    // Celebrate our victory over entropy
    const totalGames = Object.keys(finalMap).length;
    logSuccess(`Successfully processed ${totalGames} games. Your OCD can rest now.`);
  } catch (error) {
    logError(`Everything is on fire: ${error.message} - Time to panic!`);
  }
}

// Let the games begin!
main();