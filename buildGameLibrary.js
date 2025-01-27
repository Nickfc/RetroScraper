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
} = require('./constants');
const { collectGameEntries } = require('./fileScanner');
const { fetchGameMetadata } = require('./metadataFetcher');
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

  let processedCount = 0;
  let processedSinceLastSave = 0;

  // The main processing loop - Where hopes and dreams go to die
  for (let i = 0; i < newGameEntries.length; i++) {
    const gameEntry = newGameEntries[i];
    const { title: baseName, consoleName, romPath } = gameEntry;
    const key = consoleName.toLowerCase().trim() + ':' + baseName.toLowerCase().trim();

    updateProgressBar(progressBar, processedCount, baseName, '');

    let romFileSize = 0;
    try {
      romFileSize = fs.statSync(romPath).size;
    } catch (err) {
      logError(`Failed to get file size for ROM "${romPath}": ${err.message}`);
    }

    let existing = finalMap[key];

    if (!existing) {
      let metadata = null;
      try {
        metadata = await fetchGameMetadata(gameEntry);
      } catch (error) {
        logError(`Failed to fetch metadata for "${baseName}": ${error.message}`);
        metadata = null;
      }
      
      let didFetchMetadata = !!metadata;

      // Update progress before processing metadata
      if (metadata) {
        updateProgressBar(progressBar, processedCount, baseName, 'success');
      } else if (!OFFLINE_MODE) {
        updateProgressBar(progressBar, processedCount, baseName, 'warning');
        unmatchedGames.push({ title: baseName, console: consoleName, romPath });
      } else {
        updateProgressBar(progressBar, processedCount, baseName, 'offline');
      }

      // Process and save metadata
      const platformId = getPlatformId(consoleName) || 0;
      let releaseDateStr = '';
      let releaseYear = '';
      if (metadata?.first_release_date) {
        const dt = new Date(metadata.first_release_date * 1000);
        releaseDateStr = dt.toISOString().split('T')[0];
        releaseYear = dt.getFullYear().toString();
      }

      const storyline = metadata?.storyline || '';
      const category = metadata?.category !== undefined ? String(metadata.category) : '';
      const status = metadata?.status !== undefined ? String(metadata.status) : '';

      const nestedGenres = processNestedGenres(metadata?.genres);

      let tagList = [];
      if (metadata) {
        tagList = generateTags({
          summary: metadata.summary,
          storyline,
          genres: metadata.genres || [],
          developer: metadata?.involved_companies
            ? getCompanies(metadata.involved_companies, 'developer')
            : '',
        });
      }

      existing = {
        Title: baseName,
        Console: consoleName,
        PlatformID: platformId,
        IGDB_ID: metadata?.id || 0,
        Genre: metadata?.genres
          ? metadata.genres.map((g) => g.name).join(', ')
          : 'Unknown',
        RomPaths: [romPath],
        Description: metadata?.summary || '',
        Players: metadata?.game_modes ? getPlayerCount(metadata.game_modes) : 1,
        Rating: metadata?.rating ? (metadata.rating / 10).toFixed(1) : '',
        ReleaseDate: releaseDateStr,
        ReleaseYear: releaseYear,
        Developer: metadata?.involved_companies
          ? getCompanies(metadata.involved_companies, 'developer')
          : '',
        Publisher: metadata?.involved_companies
          ? getCompanies(metadata.involved_companies, 'publisher')
          : '',
        Keywords: metadata?.keywords
          ? metadata.keywords.map((k) => k.name).join(', ')
          : '',
        AgeRatings: metadata?.age_ratings
          ? getAgeRatings(metadata.age_ratings)
          : '',
        Collection: metadata?.collection?.name || '',
        Franchise: metadata?.franchise?.name || '',
        Screenshots: [],
        Region: '',
        Language: '',
        FileSize: romFileSize,
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
        MetadataFetched: didFetchMetadata,

        Storyline: storyline,
        Category: category,
        Status: status,
        NestedGenres: nestedGenres,
        TagList: tagList,
      };

      if (metadata && !LAZY_DOWNLOAD) {
        if (metadata.cover?.image_id) {
          const coverUrl = `https://images.igdb.com/igdb/image/upload/t_cover_big/${metadata.cover.image_id}.jpg`;
          const coverAbs = getCoverImageAbsolutePath(consoleName, baseName);
          const success = await downloadImage(coverUrl, coverAbs);
          if (success) {
            existing.CoverImage = getCoverImageShortPath(consoleName, baseName);
          }
        }
        if (metadata?.screenshots?.length) {
          const maxScreens = metadata.screenshots.slice(0, 3);
          for (let j = 0; j < maxScreens.length; j++) {
            const imageId = maxScreens[j].image_id;
            const screenshotUrl = `https://images.igdb.com/igdb/image/upload/t_screenshot_big/${imageId}.jpg`;
            const screenshotAbs = getScreenshotAbsolutePath(consoleName, baseName, j + 1);
            const success = await downloadImage(screenshotUrl, screenshotAbs);
            if (success) {
              existing.Screenshots.push(
                getScreenshotShortPath(consoleName, baseName, j + 1)
              );
            }
          }
        }
      } else if (metadata && LAZY_DOWNLOAD) {
        if (metadata.cover?.image_id) {
          existing.CoverImage = `https://images.igdb.com/igdb/image/upload/t_cover_big/${metadata.cover.image_id}.jpg`;
        }
        if (metadata?.screenshots?.length) {
          const maxScreens = metadata.screenshots.slice(0, 3);
          for (let j = 0; j < maxScreens.length; j++) {
            const imageId = maxScreens[j].image_id;
            const screenshotUrl = `https://images.igdb.com/igdb/image/upload/t_screenshot_big/${imageId}.jpg`;
            existing.Screenshots.push(screenshotUrl);
          }
        }
      }

      finalMap[key] = existing;
    } else {
      // Game already exists in finalMap
      if (!existing.RomPaths.includes(romPath)) {
        existing.RomPaths.push(romPath);
      }
      existing.FileSize = (existing.FileSize || 0) + romFileSize;
    }

    processedCount++;
    processedSinceLastSave++;

    // Save periodically because crashes are fun
    if (processedSinceLastSave >= SAVE_EVERY_N) {
      await saveCurrentData(finalMap, unmatchedGames);
      processedSinceLastSave = 0;
    }
  }

  // Kill the progress bar - Its job is done
  stopProgressBar(progressBar);
  return { finalMap, unmatchedGames };
}

// Export our madness for others to enjoy
module.exports = {
  buildGameLibrary,
};