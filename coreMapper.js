/**
 * RetroScraper Core Mapping Module
 * 
 * Manages relationships between emulator cores and gaming platforms through
 * sophisticated mapping and configuration mechanisms. Provides core discovery,
 * compatibility mapping, and user preference management.
 * 
 * Core features:
 * - Automatic core discovery and analysis
 * - Platform compatibility mapping
 * - Core preference management
 * - Core info file parsing
 * - Conflict resolution with user input
 */

const fs = require('fs');
const path = require('path');
const { default: inquirer } = require('inquirer');
const { logInfo, logSuccess, logWarning, logError } = require('./logger');
const {
  CORES_FOLDER,
  CORES_JSON_PATH,
  CORE_CONSOLE_MAP,
  CONSOLE_CORE_SELECTIONS,
  AVAILABLE_CORES,
  AUTO_SELECT_CORE_CONFIDENCE,
  MAX_CONSOLE_SUGGESTIONS,
  config, // Import config
} = require('./constants');

/**
 * Extract the deep dark secrets from a core's diary (info file)
 * Because privacy is just an illusion in our digital dystopia
 */
function parseCoreInfoFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const info = {};
  for (const line of lines) {
    const match = line.match(/^([^ ]*) = "(.*)"$/);
    if (match) {
      const key = match[1];
      const value = match[2];
      info[key] = value;
    }
  }
  return info;
}

/**
 * Find where the cores hide their dirty little secrets
 * Basically stalking, but we call it "directory traversal" to sound professional
 */
function getInfoDirPath() {
  // Replace 'cores' with 'info' in the CORES_FOLDER path
  return CORES_FOLDER.replace(/cores$/, 'info');
}

/**
 * Hunt down all available cores like a desperate matchmaker
 * Warning: May cause cores to develop trust issues
 */
async function fetchAvailableCores() {
  logInfo('Beginning our core hunting expedition...');
  try {
    const coreFiles = fs.readdirSync(CORES_FOLDER);
    const infoDir = getInfoDirPath();

    for (const file of coreFiles) {
      if (file.endsWith('_libretro.dll') || file.endsWith('.dll')) {
        const coreName = path.basename(file, '_libretro.dll').replace('.dll', '');
        const corePath = path.join(CORES_FOLDER, file);
        const infoFileNames = [
          `${coreName}_libretro.info`,
          `${coreName}.info`,
        ];
        let coreInfoFile = null;
        
        // First try the info directory
        for (const infoFileName of infoFileNames) {
          const possiblePath = path.join(infoDir, infoFileName);
          if (fs.existsSync(possiblePath)) {
            coreInfoFile = possiblePath;
            break;
          }
        }
        
        // Fallback to cores directory if not found in info directory
        if (!coreInfoFile) {
          for (const infoFileName of infoFileNames) {
            const possiblePath = path.join(CORES_FOLDER, infoFileName);
            if (fs.existsSync(possiblePath)) {
              coreInfoFile = possiblePath;
              break;
            }
          }
        }

        let coreInfo = {};
        if (coreInfoFile && fs.existsSync(coreInfoFile)) {
          coreInfo = parseCoreInfoFile(coreInfoFile);
        } else {
          logWarning(`Missing .info file for core "${coreName}".`);
        }

        let systems = [];
        // Extract supported systems from core info
        const systemsFieldNames = ['supported_extensions', 'systems', 'systemname', 'supported_platforms'];
        for (const field of systemsFieldNames) {
          if (coreInfo[field]) {
            systems = systems.concat(coreInfo[field].toLowerCase().split(',').map(s => s.trim()));
          }
        }

        if (systems.length === 0 && coreInfo['display_name']) {
          systems = [coreInfo['display_name'].toLowerCase()];
        }
        if (!systems.length) {
          systems = [coreName.toLowerCase()];
        }

        for (const system of systems) {
          if (!CORE_CONSOLE_MAP[system]) {
            CORE_CONSOLE_MAP[system] = [];
          }
          CORE_CONSOLE_MAP[system].push({
            coreName,
            corePath,
            coreInfo,
          });
        }
        AVAILABLE_CORES[coreName] = corePath;
      }
    }
    logSuccess(`Successfully trapped ${Object.keys(AVAILABLE_CORES).length} cores in our dungeon.`);
    logSuccess(`Created ${Object.keys(CORE_CONSOLE_MAP).length} forced partnerships.`);
  } catch (error) {
    logError(`Our matchmaking service crashed and burned: ${error.message}`);
  }
}

/**
 * Judge cores based on their worthiness, like a dystopian dating show
 * Higher numbers mean better marriage material
 */
function getCorePriority(coreName, extension, consoleName) {
  // Priority rules for ZIP files
  if (extension === '.zip') {
    const consoleLower = consoleName.toLowerCase();
    const priorities = {
      'neo geo': {
        'fbalpha2012_neogeo': 3,
        'fbneo': 2
      },
      'sega genesis': {
        'genesis_plus_gx': 3,
        'picodrive': 2
      },
      'snes': {
        'snes9x': 3,
        'snes9x2002': 2
      },
      'commodore 64': {
        'vice_x64': 3
      }
      // Add more console-specific core priorities as needed
    };

    return (priorities[consoleLower] && priorities[consoleLower][coreName]) || 1;
  }

  // Default priority for exact extension matches
  return 2;
}

/**
 * The final judgment: Decide who gets to marry whom
 * No prenups allowed in this establishment
 */
async function resolveCoreConflicts() {
  logInfo('Time to play cupid with these poor souls...');
  
  // Load cores from config.ini if specified
  if (config.Cores) {
    for (const [consoleName, corePath] of Object.entries(config.Cores)) {
      CONSOLE_CORE_SELECTIONS[consoleName.toLowerCase()] = corePath;
    }
    logInfo(`Found ${Object.keys(config.Cores).length} pre-arranged marriages in config.ini.`);
  }

  for (const consoleName in CORE_CONSOLE_MAP) {
    const normalizedConsoleName = consoleName.toLowerCase();
    if (CONSOLE_CORE_SELECTIONS[normalizedConsoleName]) {
      continue;
    }

    const cores = CORE_CONSOLE_MAP[consoleName];
    if (cores.length === 1) {
      // Arranged marriage with no options, how tragic
      CONSOLE_CORE_SELECTIONS[normalizedConsoleName] = cores[0].corePath;
    } else if (cores.length > 1) {
      // It's like The Bachelor, but with more silicon and less rose ceremonies
      // Sort cores by priority
      const sortedCores = [...cores].sort((a, b) => {
        const aName = a.coreName.toLowerCase();
        const bName = b.coreName.toLowerCase();
        const aPriority = getCorePriority(aName, '.zip', consoleName);
        const bPriority = getCorePriority(bName, '.zip', consoleName);
        return bPriority - aPriority;
      });

      const choices = sortedCores.map((core) => ({
        name: `${core.coreInfo.display_name || core.coreName}`,
        value: core.corePath,
      }));

      if (AUTO_SELECT_CORE_CONFIDENCE) {
        // Automate the suffering
        CONSOLE_CORE_SELECTIONS[normalizedConsoleName] = choices[0].value;
        logInfo(`Forced "${consoleName}" into a loveless marriage with ${choices[0].name}`);
      } else {
        try {
          const answer = await inquirer.prompt([
            {
              type: 'list',
              name: 'corePath',
              message: `Multiple cores found for "${consoleName}". Select the preferred core:`,
              choices,
            }
          ]);
          CONSOLE_CORE_SELECTIONS[normalizedConsoleName] = answer.corePath;
          logInfo(`Selected core for "${consoleName}": ${answer.corePath}`);
        } catch (error) {
          logError(`Failed to prompt for core selection: ${error.message}`);
          CONSOLE_CORE_SELECTIONS[normalizedConsoleName] = choices[0].value;
          logInfo(`Auto-selected first core for "${consoleName}" due to error: ${choices[0].name}`);
        }
      }
    }
  }
  logSuccess('All cores have been successfully paired off. May they find happiness (or at least stability).');
}

/**
 * The grand ceremony where we bind consoles and cores for eternity
 * Or until the next update breaks everything
 */
async function mapConsolesToCores() {
  await fetchAvailableCores();
  await resolveCoreConflicts();
  // Document the arrangements in our book of eternal bindings
  fs.writeFileSync(CORES_JSON_PATH, JSON.stringify(CONSOLE_CORE_SELECTIONS, null, 2), 'utf8');
  logSuccess(`All marriages have been legally documented in "${CORES_JSON_PATH}". No refunds.`);
}

// Export our matchmaking services
module.exports = {
  mapConsolesToCores,
  CONSOLE_CORE_SELECTIONS, // The book of forced marriages
};