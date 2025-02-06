// Welcome to the digital hoarder's paradise, where we catalog every ROM you've "legally acquired" 🏴‍☠️

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

// The hoarder's inventory system - Because physical clutter wasn't enough
function loadExistingGames() {
  const finalMap = {};

  // Create the digital basement if it doesn't exist
  if (!fs.existsSync(OUTPUT_FOLDER)) {
    fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
  }

  // Scan through our digital collection like a desperate archaeologist
  const dirEntries = fs.readdirSync(OUTPUT_FOLDER, { withFileTypes: true });
  for (const entry of dirEntries) {
    const lower = entry.name.toLowerCase();
    // Filter out anything that isn't our precious game data
    if (!lower.endsWith('.json') && !lower.endsWith('.xml') && !lower.endsWith('.csv')) continue;
    // Skip our shame files
    if (['unmatched.json', 'consoles_index.json', 'folderconsolemappings.json', 'cores.json'].includes(lower)) continue;

    // Attempt to read our digital hoarding manifest
    const fullPath = path.join(OUTPUT_FOLDER, entry.name);
    let data = null;
    try {
      const content = fs.readFileSync(fullPath, 'utf8');

      // Pick your poison: JSON, XML, or CSV - all equally painful
      if (lower.endsWith('.json')) {
        data = JSON.parse(content);
      } else if (lower.endsWith('.xml')) {
        data = xml2js.parseStringPromise(content, { explicitArray: false });
      } else if (lower.endsWith('.csv')) {
        // CSV: Because sometimes we hate ourselves enough to use Excel
        const parse = require('csv-parse/lib/sync');
        const records = parse(content, {
          columns: true,
          skip_empty_lines: true,
        });
        data = { Games: records };
      }
    } catch (err) {
      logWarning(`File ${entry.name} rejected us like a first date: ${err.message}`);
      continue;
    }
    const gamesArray = data.Games || [];

    // Index everything because searching is for the weak
    for (const g of gamesArray) {
      const key = (g.Console.toLowerCase().trim() + ':' + g.Title.toLowerCase().trim());
      finalMap[key] = g;
    }
  }

  return finalMap;
}

// Where dreams go to die - Processing individual games
async function processGame(game, console, progressBar, processedCount) {
  try {
    // ...existing code...
    
    if (metadata) {
      progressBar.updateProgressBar(processedCount, game.name, 'success');
      return { success: true, metadata };
    } else {
      progressBar.updateProgressBar(processedCount, game.name, 'warning');
      return { success: false };
    }
    
    // ...existing code...
  } catch (error) {
    // Even our error handling has depression
    // ...existing error handling...
  }
}

// Process games in batches
async function processBatch(games, finalMap, unmatchedGames, progressBar, processedCount) {
  const batch = games.filter(game => {
    const key = game.consoleName.toLowerCase().trim() + ':' + game.title.toLowerCase().trim();
    return !finalMap[key];
  });

  if (batch.length === 0) return { processed: 0, matched: 0 };

  const metadataResults = await fetchGameMetadataBatch(batch);
  let batchMatchCount = 0;

  await Promise.all(batch.map(async (gameEntry, i) => {
    const metadata = metadataResults[i];
    if (metadata) batchMatchCount++;
    
    const key = gameEntry.consoleName.toLowerCase().trim() + ':' + gameEntry.title.toLowerCase().trim();

    if (!metadata) {
      unmatchedGames.push({
        title: gameEntry.title,
        console: gameEntry.consoleName,
        romPath: gameEntry.romPath
      });
      updateProgressBar(progressBar, processedCount + i, gameEntry.title, 'warning');
      return;
    }

    // Process the metadata
    const platformId = getPlatformId(gameEntry.consoleName) || 0;
    let releaseDateStr = '';
    let releaseYear = '';
    if (metadata.first_release_date) {
      const dt = new Date(metadata.first_release_date * 1000);
      releaseDateStr = dt.toISOString().split('T')[0];
      releaseYear = dt.getFullYear().toString();
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
      FileSize: fs.statSync(gameEntry.romPath).size,
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
    updateProgressBar(progressBar, processedCount + i, gameEntry.title, 'success');
  }));

  return {
    processed: batch.length,
    matched: batchMatchCount
  };
}

// The main event - Where we turn your ROM collection into a properly cataloged obsession
async function buildGameLibrary() {
  // Load existing hoard
  const existingMap = loadExistingGames();

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
  let processedSinceLastSave = 0;

  // Process in batches of MAX_BATCH_SIZE
  const batches = [];
  for (let i = 0; i < newGameEntries.length; i += MAX_BATCH_SIZE) {
    batches.push(newGameEntries.slice(i, i + MAX_BATCH_SIZE));
  }

  for (const batch of batches) {
    const batchResults = await processBatch(batch, finalMap, unmatchedGames, progressBar, processedCount);
    processedCount += batchResults.processed;
    matchedCount += batchResults.matched;

    if (processedSinceLastSave >= SAVE_EVERY_N) {
      await saveCurrentData(finalMap, unmatchedGames);
      // Display current matching ratio
      const ratio = ((matchedCount / processedCount) * 100).toFixed(2);
      logInfo(`Current match ratio: ${matchedCount}/${processedCount} (${ratio}%)`);
      processedSinceLastSave = 0;
    }
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