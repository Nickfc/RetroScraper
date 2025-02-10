/**
 * Game Library Builder
 * 
 * Core module responsible for constructing and organizing the game library.
 * Handles ROM scanning, metadata collection, image downloads, and data
 * organization into a structured format.
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
// Importing our emotional support functions for when things go terribly wrong
const { logSuccess, logWarning, logInfo, logError } = require('./logger');
// Constants: Because magic numbers are for people who enjoy suffering
const {
  OUTPUT_FOLDER,
  IMAGES_PATH,
  SAVE_EVERY_N,
  LAZY_DOWNLOAD,
  OFFLINE_MODE,
  ROMS_PATHS,
  MAX_BATCH_SIZE,
} = require('./constants');
const { collectGameEntries } = require('./fileScanner');
const { fetchGameMetadata, fetchGameMetadataBatch } = require('./metadataFetcher');
const { createProgressBar, updateProgressBar, stopProgressBar } = require('./ui');
const {
  getCoverImageAbsolutePath,
  getCoverImageShortPath,
  getScreenshotAbsolutePath,
  getScreenshotShortPath,
  downloadImage,
  getPlatformId,
  normalizeTitle,
  getPlayerCount,
  getCompanies,
  generateTags,
  processNestedGenres,
  getAgeRatings,
} = require('./utils');
const { saveCurrentData } = require('./dataSaver');
const statsCollector = require('./statsCollector');

/**
 * Loads and parses existing game data from storage
 * @returns {Object} Map of existing game entries
 */
async function loadExistingGames() {
  const finalMap = {};

  // Create the digital basement if it doesn't exist
  try {
    await fs.promises.mkdir(OUTPUT_FOLDER, { recursive: true });
  } catch (err) {
    logError(`Failed to create OUTPUT_FOLDER: ${err.message}`);
  }

  let dirEntries = [];
  try {
    dirEntries = await fs.promises.readdir(OUTPUT_FOLDER, { withFileTypes: true });
  } catch (err) {
    logError(`Failed to read OUTPUT_FOLDER: ${err.message}`);
    return finalMap;
  }

  for (const entry of dirEntries) {
    const lower = entry.name.toLowerCase();
    if (!lower.endsWith('.json') && !lower.endsWith('.xml') && !lower.endsWith('.csv')) continue;
    if (['unmatched.json', 'consoles_index.json', 'folderconsolemappings.json', 'cores.json'].includes(lower)) continue;

    const fullPath = path.join(OUTPUT_FOLDER, entry.name);
    try {
      const content = await fs.promises.readFile(fullPath, 'utf8');
      let data = null;
      if (lower.endsWith('.json')) {
        data = JSON.parse(content);
      } else if (lower.endsWith('.xml')) {
        data = await xml2js.parseStringPromise(content, { explicitArray: false });
      } else if (lower.endsWith('.csv')) {
        const parse = require('csv-parse/lib/sync');
        const records = parse(content, { columns: true, skip_empty_lines: true });
        data = { Games: records };
      }
      const gamesArray = data.Games || [];
      for (const g of gamesArray) {
        const key = (g.Console.toLowerCase().trim() + ':' + g.Title.toLowerCase().trim());
        finalMap[key] = g;
      }
    } catch (err) {
      logWarning(`File ${entry.name} rejected us: ${err.message}`);
      continue;
    }
  }
  
  return finalMap;
}

/**
 * Processes a single game entry
 * @async
 * @param {Object} game - Game entry to process
 * @param {string} console - Console identifier
 * @param {Object} progressBar - Progress bar instance
 * @param {number} processedCount - Number of games processed
 * @returns {Promise<Object>} Processing result
 */
async function processGame(game, console, progressBar, processedCount) {
  try {
    // Fetch metadata from IGDB API
    const metadata = await fetchGameMetadata(game.name, console);
    
    // Handle metadata results
    if (metadata) {
      progressBar.updateProgressBar(processedCount, game.name, 'success');
      
      // Process platform specific info
      const platformId = getPlatformId(console) || 0;
      let releaseDateStr = '';
      let releaseYear = '';
      
      if (metadata.first_release_date) {
        const dt = new Date(metadata.first_release_date * 1000);
        releaseDateStr = dt.toISOString().split('T')[0];
        releaseYear = dt.getFullYear().toString();
      }

      // Process game metadata
      const storyline = metadata.storyline || '';
      const category = metadata.category !== undefined ? String(metadata.category) : '';
      const status = metadata.status !== undefined ? String(metadata.status) : '';
      const nestedGenres = processNestedGenres(metadata.genres);
      
      // Generate additional metadata
      const tagList = generateTags({
        summary: metadata.summary,
        storyline,
        genres: metadata.genres || [],
        developer: metadata.involved_companies ? 
          getCompanies(metadata.involved_companies, 'developer') : '',
      });

      return { 
        success: true, 
        metadata,
        platformId,
        releaseDateStr,
        releaseYear,
        storyline,
        category,
        status,
        nestedGenres,
        tagList
      };
    } else {
      progressBar.updateProgressBar(processedCount, game.name, 'warning');
      return { success: false };
    }
  } catch (error) {
    // Even our error handling has depression
    logError(`Failed to process game ${game.name}: ${error.message}`);
    progressBar.updateProgressBar(processedCount, game.name, 'error');
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Processes a batch of games concurrently
 * @async
 * @param {Array} games - Batch of games to process
 * @param {Object} finalMap - Current game library map
 * @param {Array} unmatchedGames - Array of unmatched games
 * @param {Object} progressBar - Progress bar instance
 * @param {number} processedCount - Total processed count
 * @returns {Promise<Object>} Batch processing results
 */
async function processBatch(games, finalMap, unmatchedGames, progressBar, processedCount) {
    try {
        const batch = games.filter(game => {
            if (!game || !game.consoleName || !game.title) return false;
            const key = game.consoleName.toLowerCase().trim() + ':' + game.title.toLowerCase().trim();
            return !finalMap[key];
        });

        if (batch.length === 0) return { processed: 0, matched: 0 };

        const metadataResults = await fetchGameMetadataBatch(batch);
        let batchMatchCount = 0;

        await Promise.all(batch.map(async (gameEntry, i) => {
            try {
                statsCollector.addProcessed();
                
                const metadata = metadataResults?.[i];
                if (!metadata) {
                    const gameInfo = gameEntry?.title || 'Unknown Game';
                    logWarning(`No metadata found for: ${gameInfo}`);
                    statsCollector.addUnmatched(gameEntry, 'No metadata found', []);
                    unmatchedGames.push({
                        title: gameEntry.title || 'Unknown',
                        console: gameEntry.consoleName || 'Unknown',
                        romPath: gameEntry.romPath || '',
                        folderPath: gameEntry.romPath ? path.dirname(gameEntry.romPath) : '',
                        reason: 'No metadata found'
                    });
                    return;
                }

                // Rest of the processing...
                // Asynchronously fetch file size
                let fileSize = 0;
                try {
                    const stats = await fs.promises.stat(gameEntry.romPath);
                    fileSize = stats.size;
                } catch (err) {
                    logWarning(`Failed to get file size for ${gameEntry.romPath}: ${err.message}`);
                }

                const storyline = metadata.storyline || '';
                const category = metadata.category !== undefined ? String(metadata.category) : '';
                const status = metadata.status !== undefined ? String(metadata.status) : '';
                const nestedGenres = processNestedGenres(metadata.genres);
                const tagList = generateTags({
                    summary: metadata.summary,
                    storyline,
                    genres: metadata.genres || [],
                    developer: metadata.involved_companies ? getCompanies(metadata.involved_companies, 'developer') : '',
                });

                // Create the game entry
                const gameData = {
                    Title: gameEntry.title,
                    Console: gameEntry.consoleName,
                    PlatformID: platformId,
                    IGDB_ID: metadata.id || 0,
                    Genre: metadata.genres ? metadata.genres.map(g => g.name).join(', ') : 'Unknown',
                    RomPaths: [gameEntry.romPath],
                    Description: metadata.summary || '',
                    Players: metadata.game_modes ? getPlayerCount(metadata.game_modes) : 1,
                    Rating: metadata.rating ? (metadata.rating / 10).toFixed(1) : '',
                    ReleaseDate: releaseDateStr,
                    ReleaseYear: releaseYear,
                    Developer: metadata.involved_companies ? getCompanies(metadata.involved_companies, 'developer') : '',
                    Publisher: metadata.involved_companies ? getCompanies(metadata.involved_companies, 'publisher') : '',
                    Keywords: metadata.keywords ? metadata.keywords.map(k => k.name).join(', ') : '',
                    AgeRatings: metadata.age_ratings ? getAgeRatings(metadata.age_ratings) : '',
                    Collection: metadata.collection?.name || '',
                    Franchise: metadata.franchise?.name || '',
                    Screenshots: [],
                    Region: '',
                    Language: '',
                    FileSize: fileSize,
                    PlayCount: 0,
                    PlayTime: 0,
                    LastPlayed: '',
                    ControllerType: 'Gamepad',
                    SupportWebsite: '',
                    CoverImage: '',
                    BackgroundImage: '',
                    HeaderImage: '',
                    SaveFileLocation: '',
                    CheatsAvailable: false,
                    Achievements: '',
                    YouTubeTrailer: '',
                    SoundtrackLink: '',
                    LaunchArguments: '',
                    VRSupport: false,
                    Notes: '',
                    ControlScheme: '',
                    DiskCount: 1,
                    AdditionalNotes: '',
                    MetadataFetched: true,
                    Storyline: storyline,
                    Category: category,
                    Status: status,
                    NestedGenres: nestedGenres,
                    TagList: tagList,
                };

                // Download images if available
                if (!LAZY_DOWNLOAD) {
                    if (metadata.cover?.image_id) {
                        const coverUrl = `https://images.igdb.com/igdb/image/upload/t_cover_big/${metadata.cover.image_id}.jpg`;
                        const coverAbs = getCoverImageAbsolutePath(gameEntry.consoleName, gameEntry.title);
                        const success = await downloadImage(coverUrl, coverAbs);
                        if (success) {
                            gameData.CoverImage = getCoverImageShortPath(gameEntry.consoleName, gameEntry.title);
                        }
                    }

                    if (metadata.screenshots?.length) {
                        const maxScreens = metadata.screenshots.slice(0, 3);
                        for (let j = 0; j < maxScreens.length; j++) {
                            const imageId = maxScreens[j].image_id;
                            const screenshotUrl = `https://images.igdb.com/igdb/image/upload/t_screenshot_big/${imageId}.jpg`;
                            const screenshotAbs = getScreenshotAbsolutePath(gameEntry.consoleName, gameEntry.title, j + 1);
                            const success = await downloadImage(screenshotUrl, screenshotAbs);
                            if (success) {
                                gameData.Screenshots.push(getScreenshotShortPath(gameEntry.consoleName, gameEntry.title, j + 1));
                            }
                        }
                    }
                }

                finalMap[key] = gameData;
                updateProgressBar(
                    progressBar, 
                    processedCount + i, 
                    batch.length, 
                    gameEntry?.title || 'Unknown Game', 
                    metadata ? 'success' : 'warning'
                );
            } catch (error) {
                const gameInfo = gameEntry?.title || 'Unknown Game';
                logError(`Error processing game ${gameInfo}: ${error.message}`);
                statsCollector.addUnmatched(gameEntry, `Processing error: ${error.message}`, null);
                return;
            }
        }));

        return {
            processed: batch.length,
            matched: batchMatchCount
        };
    } catch (error) {
        logError(`Batch processing error: ${error.message}`);
        return { processed: 0, matched: 0 };
    }
}

/**
 * Main library building function
 * Orchestrates the complete library building process
 * @async
 * @returns {Promise<Object>} Final game library and unmatched games
 */
async function buildGameLibrary() {
  // Load existing hoard
  const existingMap = await loadExistingGames();

  // Scan for new victims
  const newGameEntries = await collectGameEntries(ROMS_PATHS);
  if (newGameEntries.length === 0) {
    logWarning('Your ROM folder is as empty as my social life.');
    return { finalMap: existingMap, unmatchedGames: [] };
  }

  // Clone the existing mess and prepare for more
  const finalMap = { ...existingMap };

  // Progress bar: For the illusion of productivity
  const progressBar = createProgressBar(newGameEntries.length);

  // Where we store our rejection pile
  const unmatchedGames = [];
  let matchedCount = 0;

  let processedCount = 0;
  let processedSinceLastSave = 0; // Track unsaved progress for partial saves

  // Process in batches of MAX_BATCH_SIZE
  const batches = [];
  for (let i = 0; i < newGameEntries.length; i += MAX_BATCH_SIZE) {
    batches.push(newGameEntries.slice(i, i + MAX_BATCH_SIZE));
  }

  for (const batch of batches) {
    const batchResults = await processBatch(batch, finalMap, unmatchedGames, progressBar, processedCount);
    processedCount += batchResults.processed;
    processedSinceLastSave += batchResults.processed;
    matchedCount += batchResults.matched;
    
    // Update progress bar and any UI stuff as needed
    updateProgressBar(progressBar, processedCount, newGameEntries.length);
    
    // Partial save if threshold reached
    if (processedSinceLastSave >= SAVE_EVERY_N) {
        await saveCurrentData(finalMap, unmatchedGames);
        processedSinceLastSave = 0; // Reset the counter after save
        logInfo(`Partial save performed at ${processedCount} processed entries.`);
    }
  }

  // Final save if unsaved progress remains
  if (processedSinceLastSave > 0) {
    await saveCurrentData(finalMap, unmatchedGames);
  }

  // Kill the progress bar - Its job is done
  stopProgressBar(progressBar);

  // Final statistics
  const totalGames = Object.keys(finalMap).length;
  const matchRatio = ((matchedCount / processedCount) * 100).toFixed(2);
  logSuccess(`Processing complete!`);
  logSuccess(`Total games processed: ${processedCount}`);
  logSuccess(`Successfully matched: ${matchedCount}`);
  logSuccess(`Match ratio: ${matchRatio}%`);
  logSuccess(`Unmatched games: ${unmatchedGames.length}`);

  return { finalMap, unmatchedGames };
}

// Export our madness for others to enjoy
module.exports = {
  buildGameLibrary,
};