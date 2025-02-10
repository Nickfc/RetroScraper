/**
 * RetroScraper Main Application Entry
 * 
 * Serves as the primary orchestrator for the ROM organization and metadata scraping system.
 * Handles initialization, folder scanning, and library building processes while maintaining
 * data integrity through graceful shutdown handling.
 * 
 * Key responsibilities:
 * - Application bootstrapping and configuration loading
 * - Directory structure validation and creation
 * - Process signal handling for graceful shutdowns
 * - ROM folder scanning and processing coordination
 * - Data persistence management
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk'); // Import chalk for colored output
// Utility modules for console output and logging
const { logSuccess, logWarning, logInfo, logError } = require('./logger');
// Core configuration and path definitions
const {
  OUTPUT_FOLDER,
  IMAGES_PATH,
  ROMS_PATHS,
  config,
} = require('./constants');
// External API and data processing modules
const { initIGDB, fetchPlatformIDs } = require('./igdb');
const { mapConsolesToCores } = require('./coreMapper');
const { buildGameLibrary } = require('./buildGameLibrary');
const { saveCurrentData } = require('./dataSaver');
const { loadFolderConsoleMappings } = require('./folderMapper');

/**
 * Global state management
 * Maintains script status and data references for graceful shutdown handling
 */
let scriptInProgress = true;
let finalMapGlobal = null;
let unmatchedGlobal = null;
let lastSavedCount = 0; // Tracks processed count during the last save
let periodicSaveInterval;

/**
 * SIGINT Handler
 * Ensures data persistence on script interruption
 * Captures Ctrl+C and similar termination signals
 */
process.on('SIGINT', async () => {
  try {
    if (scriptInProgress) {
      logWarning('Caught SIGINT - Saving progress before shutdown...');
      if (finalMapGlobal && unmatchedGlobal) {
        await saveCurrentData(finalMapGlobal, unmatchedGlobal);
        logSuccess('Progress saved successfully!');
      }
    }
  } catch (error) {
    logError(`Failed to save data on interrupt: ${error.message}`);
  } finally {
    process.exit(0);
  }
});

// Additional signal handling
process.on('SIGTERM', async () => {
  try {
    if (scriptInProgress) {
      logWarning('Caught SIGTERM - Saving progress before shutdown...');
      if (finalMapGlobal && unmatchedGlobal) {
        await saveCurrentData(finalMapGlobal, unmatchedGlobal);
        logSuccess('Progress saved successfully!');
      }
    }
  } catch (error) {
    logError(`Failed to save data on SIGTERM: ${error.message}`);
  } finally {
    process.exit(0);
  }
});

// Global error handlers for extra robustness
process.on('uncaughtException', async (error) => {
  logError(`Uncaught Exception: ${error.message}`);
  if (finalMapGlobal && unmatchedGlobal) {
    try {
      await saveCurrentData(finalMapGlobal, unmatchedGlobal);
      logSuccess('Saved progress after uncaught exception.');
    } catch (err) {
      logError(`Failed saving after exception: ${err.message}`);
    }
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  logError(`Unhandled Rejection: ${reason}`);
  if (finalMapGlobal && unmatchedGlobal) {
    try {
      await saveCurrentData(finalMapGlobal, unmatchedGlobal);
      logSuccess('Saved progress after unhandled rejection.');
    } catch (err) {
      logError(`Failed saving after rejection: ${err.message}`);
    }
  }
  process.exit(1);
});

/**
 * Initializes core system components and external services
 * @async
 * Performs:
 * - IGDB API initialization
 * - Platform ID fetching (unless in offline mode)
 * - Console-to-core mapping
 * - Folder mapping configuration
 */
async function initData() {
  await initIGDB();
  if (!config.Settings?.OfflineMode || config.Settings.OfflineMode !== 'true') {
    await fetchPlatformIDs();
  } else {
    logInfo('Running in offline mode - like it\'s Y2K all over again');
  }
  await mapConsolesToCores();
  loadFolderConsoleMappings();
}

/**
 * Scans configured ROM directories for valid folders
 * @async
 * @returns {Promise<string[]>} Array of valid ROM folder paths
 * 
 * Validates existence of configured paths and returns a flat array
 * of all discovered ROM directories
 */
async function scanFolders() {
  try {
    const folderPromises = ROMS_PATHS.map(async (romPath) => {
      try {
        await fs.promises.access(romPath);
        const entries = await fs.promises.readdir(romPath, { withFileTypes: true });
        return entries.filter(ent => ent.isDirectory()).map(ent => path.join(romPath, ent.name));
      } catch (err) {
        logWarning(`ROMs path not accessible: ${romPath}`);
        return [];
      }
    });
    const folders = (await Promise.all(folderPromises)).flat();
    if (folders.length === 0) {
      logWarning('No ROM folders found - Your childhood seems to be missing');
    }
    return folders;
  } catch (error) {
    logError(`Failed to scan ROM folders: ${error.message} - The archaeology expedition has failed`);
    return [];
  }
}

// NEW: Display an attractive ASCII art banner at startup
function displayBanner() {
  try {
    const banner = `
    ${chalk.cyan('  ______     __               __         ______       __             ')}
    ${chalk.cyan(' /_  __/____/ /___ _______   / /  ____  / ____/____  / /_____  _____')}
    ${chalk.cyan('  / / / ___/ / __ `/ ___/ | / /  / __ \\/ /   / __ \\/ __/ __ \\/ ___/')}
    ${chalk.cyan(' / / (__  ) / /_/ (__  )| |/ /__/ /_/ / /___/ /_/ / /_/ /_/ (__  ) ')}
    ${chalk.cyan('/_/ /____/_/\\__,_/____/ |___/_____/\\____/\\____/\\__/\\____/____/  ')}
    `;
    console.log(banner);
    console.log(chalk.magenta('Welcome to RetroScraper: Organizing your ROMs in style!\n'));
  } catch (error) {
    console.error('Failed to display banner:', error.message);
  }
}

// NEW: Enhanced summary function to display a formatted result summary
function displaySummary(finalMap, processedCount, matchedCount, unmatchedCount) {
  try {
    const totalGames = Object.keys(finalMap).length;
    const matchRatio = processedCount > 0 ? ((matchedCount / processedCount) * 100).toFixed(2) : 0;
    console.log(chalk.green.bold('\n=== Processing Summary ==='));
    console.log(chalk.white(`Total Games Processed: ${processedCount}`));
    console.log(chalk.white(`Successfully Matched:   ${matchedCount}`));
    console.log(chalk.white(`Match Ratio:            ${matchRatio}%`));
    console.log(chalk.white(`Total Games in Library: ${totalGames}`));
    console.log(chalk.white(`Unmatched Games:        ${unmatchedCount}\n`));
    console.log(chalk.blue('Thank you for using RetroScraper!'));
  } catch (error) {
    console.error('Error displaying summary:', error.message);
  }
}

/**
 * Main application execution flow
 * @async
 * 
 * Orchestrates the complete ROM processing pipeline:
 * 1. Validates ROM paths and creates necessary directories
 * 2. Initializes system components
 * 3. Processes and organizes ROM library
 * 4. Handles data persistence
 */
async function main() {
  displayBanner();
  try {
    /**
     * Path validation and directory setup
     */
    // Validate ROM paths asynchronously
    const validRomsPromises = ROMS_PATHS.map(async (romPath) => {
      try {
        await fs.promises.access(romPath);
        return romPath;
      } catch (err) {
        logWarning(`ROM path validation failed: "${romPath}" does not exist`);
        return null;
      }
    });
    const existingRomsPaths = (await Promise.all(validRomsPromises)).filter(Boolean);
    if (existingRomsPaths.length === 0) {
      logError('Fatal: No valid ROM directories found in configuration');
      process.exit(1);
    }
    
    // Asynchronously create required directories
    try {
      await fs.promises.mkdir(OUTPUT_FOLDER, { recursive: true });
      await fs.promises.mkdir(IMAGES_PATH, { recursive: true });
    } catch (err) {
      logError(`Failed to create required directories: ${err.message}`);
      process.exit(1);
    }

    // System initialization
    await initData();

    // Start periodic saving before heavy processing begins
    await startPeriodicSave();

    /**
     * Library processing and data persistence
     */
    const { finalMap, unmatchedGames } = await buildGameLibrary();
    finalMapGlobal = finalMap;
    unmatchedGlobal = unmatchedGames;

    // Final save before termination
    await saveCurrentData(finalMap, unmatchedGames);
    scriptInProgress = false;

    // Stop periodic save interval now that processing is complete
    clearInterval(periodicSaveInterval);

    logSuccess(`Processing complete: Successfully organized ${Object.keys(finalMap).length} games`);
    // NEW: Display formatted summary to enhance output & UX
    const processedCount = Object.keys(finalMap).length + unmatchedGames.length;
    const matchedCount = processedCount - unmatchedGames.length;
    displaySummary(finalMap, processedCount, matchedCount, unmatchedGames.length);
  } catch (error) {
    logError(`Fatal error during execution: ${error.message}`);
    process.exit(1);
  }
}

// Application entry point
main();

async function startPeriodicSave() {
  // Periodically check every 30 seconds (adjust as needed)
  periodicSaveInterval = setInterval(async () => {
    // Calculate current processed count from global state
    const processedCount = finalMapGlobal ? Object.keys(finalMapGlobal).length + (unmatchedGlobal ? unmatchedGlobal.length : 0) : 0;
    if (processedCount - lastSavedCount >= config.Settings.SaveEveryN) {
      await saveCurrentData(finalMapGlobal, unmatchedGlobal);
      lastSavedCount = processedCount;
      logInfo(`Periodic save triggered at ${processedCount} processed games.`);
    }
  }, 30000);
}