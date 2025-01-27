// Welcome to dataSaver.js - Where your ROMs go to get properly documented before their inevitable demise

// Summoning the elder gods of Node.js
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js'); // Because JSON wasn't complicated enough
const { Parser } = require('json2csv'); // For those who still live in Excel hell
const Ajv = require('ajv'); // The JSON bouncer that makes sure your data isn't drunk
const { logSuccess, logError, logWarning } = require('./logger');

// Constants: The sacred texts that tell us where to bury the bodies (of data)
const {
  OUTPUT_FORMAT,
  VALIDATE_SCHEMA,
  OUTPUT_FOLDER,
  UNMATCHED_JSON_PATH,
  CONSOLE_INDEX_PATH,
  CORES_JSON_PATH,
  CONSOLE_CORE_SELECTIONS,
} = require('./constants');

const { sanitizeForFileName } = require('./utils'); // Because spaces in filenames are the devil's work

// The Great Validator: Making sure your games collection isn't a complete mess
// Though let's be honest, it probably still is
function validateJsonSchema(games) {
  const schema = {
    type: 'object',
    properties: {
      Games: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            // Basic game information
            Title: { type: 'string' },
            Console: { type: 'string' },
            PlatformID: { type: 'number' },
            IGDB_ID: { type: 'number' },
            Genre: { type: 'string' },
            RomPaths: {
              type: 'array',
              items: { type: 'string' },
            },
            Description: { type: 'string' },
            Players: { type: 'number' },
            Rating: { type: 'string' },
            ReleaseDate: { type: 'string' },
            ReleaseYear: { type: 'string' },
            Developer: { type: 'string' },
            Publisher: { type: 'string' },
            Keywords: { type: 'string' },
            AgeRatings: { type: 'string' },
            Collection: { type: 'string' },
            Franchise: { type: 'string' },
            Screenshots: {
              type: 'array',
              items: { type: 'string' },
            },
            // Additional game metadata
            Region: { type: 'string' },
            Language: { type: 'string' },
            FileSize: { type: 'number' },
            PlayCount: { type: 'number' },
            PlayTime: { type: 'number' },
            LastPlayed: { type: 'string' },
            ControllerType: { type: 'string' },
            SupportWebsite: { type: 'string' },
            CoverImage: { type: 'string' },
            BackgroundImage: { type: 'string' },
            HeaderImage: { type: 'string' },
            SaveFileLocation: { type: 'string' },
            CheatsAvailable: { type: 'boolean' },
            Achievements: { type: 'string' },
            YouTubeTrailer: { type: 'string' },
            SoundtrackLink: { type: 'string' },
            LaunchArguments: { type: 'string' },
            VRSupport: { type: 'boolean' },
            Notes: { type: 'string' },
            ControlScheme: { type: 'string' },
            DiskCount: { type: 'number' },
            AdditionalNotes: { type: 'string' },
            MetadataFetched: { type: 'boolean' },
            // Fields added for enhanced metadata
            Storyline: { type: 'string' },
            Category: { type: 'string' },
            Status: { type: 'string' },
            NestedGenres: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  parent: { type: ['string', 'null'] },
                },
                required: ['name', 'parent'],
              },
            },
            TagList: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['Title', 'Console', 'RomPaths'], // Required fields for each game
        },
      },
    },
    required: ['Games'], // The 'Games' array is required at the root level
  };

  const ajv = new Ajv({ allErrors: true }); // Judge, jury, and executioner of your JSON
  const validate = ajv.compile(schema);
  const valid = validate({ Games: games });
  if (!valid) {
    logWarning(`Your data is as organized as a tornado in a trailer park: ${JSON.stringify(validate.errors, null, 2)}`);
  } else {
    logSuccess(`Your data actually passed validation. What kind of black magic is this?`);
  }
}

// The Grand Archival Process: Where we attempt to organize digital chaos
// Warning: May cause excessive disk usage and relationship problems
async function saveCurrentData(finalMap, unmatchedGames) {
  // Sorting games by console, because mixing platforms is for heathens
  const byConsole = {};
  for (const key of Object.keys(finalMap)) {
    const gameObj = finalMap[key];
    const cName = gameObj.Console;
    if (!byConsole[cName]) {
      byConsole[cName] = [];
    }
    byConsole[cName].push(gameObj);
  }

  // Time to sort through this digital hoarder's paradise
  for (const consoleName of Object.keys(byConsole)) {
    // Alphabetizing, because we're not complete barbarians
    byConsole[consoleName].sort((a, b) => a.Title.localeCompare(b.Title));

    // Validate the data, if you're into that kind of masochism
    if (VALIDATE_SCHEMA && OUTPUT_FORMAT === 'json') {
      validateJsonSchema(byConsole[consoleName]);
    }

    // Prepare the final resting place for your data
    const fileName = sanitizeForFileName(consoleName) + '.' + OUTPUT_FORMAT;
    const outPath = path.join(OUTPUT_FOLDER, fileName);
    const gamesData = byConsole[consoleName];

    // The format roulette: Pick your poison
    switch (OUTPUT_FORMAT) {
      case 'json':
        // JSON: Because readable data is overrated
        fs.writeFileSync(outPath, JSON.stringify({ Games: gamesData }, null, 2), 'utf8');
        break;
      case 'xml':
        // XML: For those who enjoy angle brackets a bit too much
        const builder = new xml2js.Builder();
        const xml = builder.buildObject({ Games: { Game: gamesData } });
        fs.writeFileSync(outPath, xml, 'utf8');
        break;
      case 'csv':
        // CSV: Spreadsheet enthusiasts' last resort
        const parser = new Parser();
        const csv = parser.parse(gamesData);
        fs.writeFileSync(outPath, csv, 'utf8');
        break;
      default:
        // If you've reached here, you've really messed up
        logError(`What kind of format is "${OUTPUT_FORMAT}"? I'm not a miracle worker.`);
        return;
    }
    logSuccess(`Successfully archived ${gamesData.length} games. Your digital hoarding is progressing nicely.`);
  }

  // Document the ones that got away
  fs.writeFileSync(
    UNMATCHED_JSON_PATH,
    JSON.stringify(unmatchedGames, null, 2),
    'utf8'
  );
  logSuccess(`Documented ${unmatchedGames.length} lost souls in the digital purgatory.`);

  // Create the index of your digital empire
  const consoleIndex = Object.keys(byConsole).map((consoleName) => {
    const fileName = sanitizeForFileName(consoleName) + '.' + OUTPUT_FORMAT;
    return {
      console: consoleName,
      file: fileName,
      count: byConsole[consoleName].length,
    };
  });

  const indexObj = { consoles: consoleIndex };
  fs.writeFileSync(
    CONSOLE_INDEX_PATH,
    JSON.stringify(indexObj, null, 2),
    'utf8'
  );
  logSuccess(`Wrote consoles index to "${CONSOLE_INDEX_PATH}".`);

  // Save the core mappings, because remembering which emulator runs what is too hard
  fs.writeFileSync(
    CORES_JSON_PATH,
    JSON.stringify(CONSOLE_CORE_SELECTIONS, null, 2),
    'utf8'
  );
  logSuccess(`Preserved the sacred core mappings. Future you will be slightly less confused.`);
}

// Export these functions, spread the data hoarding love
module.exports = {
  validateJsonSchema,
  saveCurrentData,
};