// Welcome to Constants Hell, where dreams come to die and configuration lives forever

const path = require('path');
const { loadConfig } = require('./config');

// Load the config and pray it actually exists
const config = loadConfig();

// Path Configuration - Because nobody knows where their ROMs actually are
const ROMS_PATHS = config.Paths?.RomsPaths
  ? config.Paths.RomsPaths.split(',').map((p) => p.trim())
  : ['C:/RetroArch/Games/Roms']; // Default path for the criminally unorganized

// Where we'll store our digital hoarding results
const OUTPUT_FOLDER = config.Paths?.OutputFolder
  ? path.isAbsolute(config.Paths.OutputFolder)
    ? config.Paths.OutputFolder
    : path.join(__dirname, config.Paths.OutputFolder)
  : path.join(__dirname, 'data'); // The void where metadata goes to collect dust

// Image storage - For all those beautiful covers you'll never look at
const IMAGES_PATH = config.Paths?.ImagesFolder
  ? path.isAbsolute(config.Paths.ImagesFolder)
    ? config.Paths.ImagesFolder
    : path.join(__dirname, config.Paths.ImagesFolder)
  : path.join(OUTPUT_FOLDER, 'images');

// Core storage - Because you need more things to not use
const CORES_FOLDER = config.Paths?.CoresFolder
  ? path.isAbsolute(config.Paths.CoresFolder)
    ? config.Paths.CoresFolder
    : path.join(__dirname, config.Paths.CoresFolder)
  : path.join(__dirname, 'C:/RetroArch/cores');

// IGDB Credentials - Your ticket to the API rate limit hell
const CLIENT_ID = config.IGDB?.ClientID || '';
const CLIENT_SECRET = config.IGDB?.ClientSecret || '';

// Settings - Where user preferences go to be ignored
const SKIP_EXISTING_METADATA = config.Settings?.SkipExistingMetadata === 'true'; // Because why redo what's already wrong
const OFFLINE_MODE = config.Settings?.OfflineMode === 'true'; // For when the internet abandons you
let MAX_CONCURRENCY = parseInt(config.Settings?.Concurrency ?? '4', 10); // How many promises to break simultaneously
if (isNaN(MAX_CONCURRENCY) || MAX_CONCURRENCY < 1) {
  MAX_CONCURRENCY = 4;
}
const LAZY_DOWNLOAD = config.Settings?.LazyDownload === 'true'; // Because who has time for eager downloads
const ADAPTIVE_RATE = config.Settings?.AdaptiveRate === 'true'; // For when you want your rate to adapt to your mood
const VALIDATE_SCHEMA = config.Settings?.ValidateSchema === 'true'; // For the schema purists
const TAG_GENERATION = config.Settings?.TagGeneration === 'true'; // AI-powered wild guessing

// Output Format - Because JSON is the new XML
const OUTPUT_FORMAT = config.Settings?.OutputFormat?.toLowerCase() || 'json';

// Optional thresholds from config - Because limits are for the weak
const MAX_REQUESTS_PER_SECOND = parseInt(config.Settings?.MaxRequestsPerSecond || '4', 10);
const REFILL_INTERVAL_MS = parseInt(config.Settings?.RefillIntervalMs || '1000', 10);
const SAVE_EVERY_N = parseInt(config.Settings?.SaveEveryN || '20', 10);
const FUZZY_MATCH_THRESHOLD = parseFloat(config.Settings?.FuzzyMatchThreshold || '0.4');

// New settings - Because we needed more things to configure
const AUTO_SELECT_CORE_CONFIDENCE = parseFloat(config.Settings?.AutoSelectCoreConfidence || '0.8');
const MAX_CONSOLE_SUGGESTIONS = parseInt(config.Settings?.MaxConsoleSuggestions || '5', 10);

// Valid ROM file extensions - Because not all ROMs are created equal
const VALID_ROM_EXTENSIONS = new Set(
  config.Settings?.ValidRomExtensions
    ? config.Settings.ValidRomExtensions.split(',').map((ext) => ext.trim().toLowerCase())
    : [
        '.nes', '.sfc', '.smc', '.gba', '.gb', '.gbc', '.n64', '.z64', '.v64',
        '.a26', '.lnx', '.c64', '.col', '.int', '.sms', '.gg', '.pce', '.cue',
        '.iso', '.bin', '.adf', '.rom', '.img', '.chd', '.cso', '.gdi', '.cdi',
        '.zip',
      ]
);

// Paths for unmatched games - Because not all games deserve to be found
const UNMATCHED_JSON_PATH = path.join(OUTPUT_FOLDER, 'unmatched.json');
const FOLDER_CONSOLE_MAP_PATH = path.join(OUTPUT_FOLDER, 'folderConsoleMappings.json');
const CORES_JSON_PATH = path.join(OUTPUT_FOLDER, 'cores.json');
const CONSOLE_INDEX_PATH = path.join(OUTPUT_FOLDER, 'consoles_index.json');

// Relative prefix for images in JSON - Because absolute paths are too mainstream
const IMAGES_URL_PREFIX = '/' + path.relative(process.cwd(), IMAGES_PATH).replace(/\\/g, '/');

// Globals (exported for use in other modules) - Because sharing is caring
let PLATFORM_ID_MAP = {};
let AVAILABLE_CORES = {}; // Available cores from cores directory
let CORE_CONSOLE_MAP = {}; // Mapping of consoles to available cores
let CONSOLE_CORE_SELECTIONS = {}; // User selections for cores
let FOLDER_CONSOLE_MAP = {}; // Mapping of folder names to consoles
let IGDB_CACHE = {}; // Cache for IGDB responses

const MAX_BATCH_SIZE = 1; // Maximum batch size for IGDB queries

// Normalized platform names - Because consistency is overrated
const NORMALIZED_PLATFORM_NAMES = {
  'snes': 'snes',
  'super nintendo': 'snes',
  'super nintendo entertainment system': 'snes',
  'super nes': 'snes',
  'super famicom': 'snes',
  'nes': 'nes',
  'nintendo entertainment system': 'nes',
  'famicom': 'nes',
  'genesis': 'sega genesis',
  'mega drive': 'sega genesis',
  'sega mega drive': 'sega genesis',
  'sega/genesis': 'sega genesis',
  'amiga': 'amiga',
  'commodore amiga': 'amiga',
  'amiga/amiga': 'amiga',
  'intellivision': 'intellivision',
  'mattel intellivision': 'intellivision',
  'gba': 'game boy advance',
  'gameboy advance': 'game boy advance',
  'nintendo/game boy advance': 'game boy advance',
  'gb': 'game boy',
  'gameboy': 'game boy',
  'nintendo/game boy': 'game boy',
  'gbc': 'game boy color',
  'gameboy color': 'game boy color',
  'nintendo/game boy color': 'game boy color',
  'n64': 'nintendo 64',
  'nintendo/nintendo 64': 'nintendo 64',
  'atari 2600': 'atari 2600',
  'atari/2600': 'atari 2600',
  '2600': 'atari 2600',
  'atari 7800': 'atari 7800',
  'atari/7800': 'atari 7800',
  '7800': 'atari 7800',
  'atari jaguar': 'atari jaguar',
  'jaguar': 'atari jaguar',
  'atari/jaguar': 'atari jaguar',
  'atari lynx': 'atari lynx',
  'lynx': 'atari lynx',
  'atari/lynx': 'atari lynx',
  'colecovision': 'colecovision',
  'coleco': 'colecovision',
  'commodore 64': 'commodore 64',
  'c64': 'commodore 64',
  'commodore/c64': 'commodore 64',
  'sega master system': 'sega master system',
  'master system': 'sega master system',
  'sms': 'sega master system',
  'sega/master system': 'sega master system',
  'game gear': 'sega game gear',
  'gamegear': 'sega game gear',
  'sega game gear': 'sega game gear',
  'sega/game gear': 'sega game gear',
  'turbografx': 'turbografx-16',
  'turbografx 16': 'turbografx-16',
  'turbo grafx': 'turbografx-16',
  'pc engine': 'turbografx-16',
  'pce': 'turbografx-16',
  'virtual boy': 'virtual boy',
  'nintendo virtual boy': 'virtual boy',
  'wonderswan': 'wonderswan',
  'wonderswan color': 'wonderswan color',
  'neo geo': 'neo geo',
  'neo-geo': 'neo geo',
  'neogeo': 'neo geo',
  'neo geo cd': 'neo geo cd',
  'neo-geo cd': 'neo geo cd',
  'neogeo cd': 'neo geo cd'
};

// Platform variations - Because nobody can agree on names
const PLATFORM_VARIATIONS = {
  'snes': [
    'super nintendo entertainment system', 
    'super nintendo', 
    'super nes', 
    'super famicom',
    'nintendo/snes',
    'snes',
    'superfamicom'
  ],
  'nes': [
    'nintendo entertainment system', 
    'famicom',
    'nintendo/nes',
    'nes',
    'family computer',
    'nintendo famicom'
  ],
  'sega genesis': [
    'genesis',
    'mega drive', 
    'sega mega drive',
    'sega/genesis',
    'megadrive',
    'genesis/mega drive',
    'genesis/megadrive'
  ],
  'amiga': [
    'commodore amiga',
    'amiga/amiga',
    'amiga',
    'amiga cd32',
    'amiga cdtv'
  ],
  'game boy advance': [
    'gba',
    'gameboy advance',
    'nintendo/game boy advance',
    'game boy adv',
    'nintendo gba'
  ],
  'game boy': [
    'gb',
    'gameboy',
    'nintendo/game boy',
    'nintendo gb',
    'game boy dmg'
  ],
  'game boy color': [
    'gbc',
    'gameboy color',
    'nintendo/game boy color',
    'nintendo gbc',
    'color gameboy'
  ],
  'nintendo 64': [
    'n64',
    'nintendo/nintendo 64',
    'nintendo n64',
    'n-64',
    'project reality'
  ],
  'atari 2600': [
    'atari/2600',
    '2600',
    'atari vcs',
    'vcs',
    'atari 2600 vcs'
  ],
  'atari 7800': [
    'atari/7800',
    '7800',
    'atari 7800 prosystem',
    'prosystem'
  ],
  'atari jaguar': [
    'jaguar',
    'atari/jaguar',
    'jag',
    'jaguar 64'
  ],
  'atari lynx': [
    'lynx',
    'atari/lynx',
    'handy'
  ],
  'colecovision': [
    'coleco',
    'coleco vision',
    'coleco',
    'colecovision console'
  ],
  'commodore 64': [
    'c64',
    'commodore/c64',
    'c-64',
    'vic-64',
    'commodore64'
  ],
  'sega master system': [
    'master system',
    'sms',
    'sega/master system',
    'master system ii',
    'mark iii'
  ],
  'sega game gear': [
    'game gear',
    'gamegear',
    'sega/game gear',
    'gg',
    'sega gg'
  ],
  'turbografx-16': [
    'turbografx',
    'turbografx 16',
    'turbo grafx',
    'pc engine',
    'pce',
    'nec turbografx',
    'nec pc engine'
  ],
  'virtual boy': [
    'virtualboy',
    'nintendo virtual boy',
    'vb',
    'vboy'
  ],
  'wonderswan': [
    'wonder swan',
    'bandai wonderswan',
    'ws',
    'swan'
  ],
  'wonderswan color': [
    'wonder swan color',
    'bandai wonderswan color',
    'wsc',
    'swan color'
  ],
  'neo geo': [
    'neo-geo',
    'neogeo',
    'neo geo aes',
    'neo geo mvs',
    'aes',
    'mvs'
  ],
  'neo geo cd': [
    'neo-geo cd',
    'neogeo cd',
    'neo geo cd-z',
    'cd aes'
  ]
};

// Stop words - Because some words just don't matter
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'the', 'this', 'but', 'they', 'have', 'had', 'what', 'when',
  'where', 'who', 'which', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now',
  'around', 'without', 'over', 'again', 'once', 'under', 'further', 'before',
  'after', 'above', 'below', 'up', 'down', 'in', 'out', 'their', 'your'
]);

// Gaming categories - Because we need to categorize our digital addictions
const GAMING_CATEGORIES = {
  genres: new Set([
    'action', 'adventure', 'arcade', 'fighting', 'platform', 'puzzle', 'racing',
    'rpg', 'shooter', 'simulation', 'sports', 'strategy'
  ]),
  features: new Set([
    'multiplayer', 'coop', 'splitscreen', 'online', 'singleplayer',
    'simultaneous', 'stereo', 'scrolling'
  ]),
  attributes: new Set([
    'addictive', 'animated', 'cartoon', 'classic', 'retro', 'challenging',
    'fast', 'funny', 'hardcore', 'casual', 'difficult', 'easy'
  ])
};

module.exports = {
  ROMS_PATHS,
  OUTPUT_FOLDER,
  IMAGES_PATH,
  CORES_FOLDER,
  CLIENT_ID,
  CLIENT_SECRET,
  SKIP_EXISTING_METADATA,
  OFFLINE_MODE,
  MAX_CONCURRENCY,
  LAZY_DOWNLOAD,
  ADAPTIVE_RATE,
  VALIDATE_SCHEMA,
  TAG_GENERATION,
  OUTPUT_FORMAT,
  MAX_REQUESTS_PER_SECOND,
  REFILL_INTERVAL_MS,
  SAVE_EVERY_N,
  FUZZY_MATCH_THRESHOLD,
  AUTO_SELECT_CORE_CONFIDENCE,
  MAX_CONSOLE_SUGGESTIONS,
  VALID_ROM_EXTENSIONS,
  UNMATCHED_JSON_PATH,
  FOLDER_CONSOLE_MAP_PATH,
  CORES_JSON_PATH,
  CONSOLE_INDEX_PATH,
  IMAGES_URL_PREFIX,
  PLATFORM_ID_MAP,
  AVAILABLE_CORES,
  CORE_CONSOLE_MAP,
  CONSOLE_CORE_SELECTIONS,
  FOLDER_CONSOLE_MAP,
  IGDB_CACHE,
  MAX_BATCH_SIZE,
  NORMALIZED_PLATFORM_NAMES,
  PLATFORM_VARIATIONS,
  STOP_WORDS,
  GAMING_CATEGORIES,
  config,
};