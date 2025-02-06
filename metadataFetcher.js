// Welcome to the digital necromancer's playground, where we resurrect dead game data 
// and force it to dance for our amusement

// Summoning our dark utilities from the depths of node_modules
const { igdbRequest } = require('./igdb');
const stringSimilarity = require('string-similarity'); // Because humans can't even spell game titles consistently
const { logSuccess, logWarning } = require('./logger'); // For when things go right (rarely) or wrong (usually)
const {
  // The sacred scrolls of utility functions
  getPlatformId, // Converts human-readable platform names into soulless numbers
  normalizeTitle, // Strips games of their special characters like a cruel dictator
  getPlayerCount, // Counts how many friends you don't have to play with
  getCompanies, // Lists the corporate overlords responsible for your childhood memories
  generateTags, // Slaps labels on games like a morgue worker on toe tags
  processNestedGenres, // Untangles the nightmare that is nested genre trees
} = require('./utils');

// Configuration constants, or "How to Fail Differently"
const {
  OFFLINE_MODE, // For when the internet decides to give you the silent treatment
  FUZZY_MATCH_THRESHOLD, // How desperate we are to find a match (very)
  LAZY_DOWNLOAD, // Because sometimes we just can't be bothered
  TAG_GENERATION, // Auto-categorization for the chronically disorganized
  MAX_BATCH_SIZE, // The number of results before IGDB tells us to get lost
} = require('./constants');

// More utilities for hoarding digital pictures of games you'll never play
const { downloadImage } = require('./utils');
const {
  // The file path family: they're all different but equally disappointing
  getCoverImageAbsolutePath,
  getScreenshotAbsolutePath,
  getCoverImageShortPath,
  getScreenshotShortPath,
} = require('./utils');

// New helper functions for title matching
function normalizeGameTitle(title) {
  // Remove common ROM patterns and clean the title
  return title
    // Remove region codes
    .replace(/\((USA|Europe|Japan|World|EU|JP|US|E|J|U)\)/, '')
    // Remove version/revision numbers
    .replace(/\(v[\d\.]+\)/i, '')
    .replace(/\[v[\d\.]+\]/i, '')
    .replace(/\(Rev [\d\.]+\)/i, '')
    // Remove ROM dump info
    .replace(/\[(.*?)\]/, '')
    .replace(/\((.*?)\)/, '')
    // Remove file extensions
    .replace(/\.[a-zA-Z0-9]{3,4}$/, '')
    // Remove common ROM naming patterns
    .replace(/[_\-.]v\d+/, '')
    .replace(/(US|EU|JP|JPN|USA|PAL|NTSC)/, '')
    // Replace separators with spaces
    .replace(/[_\-\.]/g, ' ')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeTitle(title) {
  // Split into tokens and remove common noise words
  return title
    .toLowerCase()
    .split(/\s+/)
    .filter(token => 
      token.length > 1 && 
      !token.match(/^(the|and|of|in|on|at|to|for|ver|version|rev|revision)$/i)
    );
}

function getAlternativeTitles(title) {
  const normalized = normalizeGameTitle(title);
  const tokens = tokenizeTitle(normalized);
  
  const alternatives = new Set([
    title,
    normalized,
    tokens.join(' ')
  ]);

  // Handle Roman numerals
  alternatives.add(normalized.replace(/\b([IVX]+)\b/g, (m, roman) => {
    const numbers = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
    return numbers[roman] || roman;
  }));

  // Handle numeric suffixes
  alternatives.add(normalized.replace(/\b(\d+)\b/g, (m, num) => {
    const words = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
    return words[parseInt(num)] || num;
  }));

  return Array.from(alternatives);
}

// Add new helper functions for search strategies
function cleanTitleForSearch(title) {
  return title
    // Handle special word separators in titles
    .replace(/[-:\/\\]/g, ' ')
    // Handle numbered titles more carefully (e.g. "10 out of 10")
    .replace(/\b(\d+)(?:st|nd|rd|th)?\b/g, (match, num) => {
      const words = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
      // Keep both number and word form
      return num <= 10 ? `${num} | ${words[num]}` : num;
    })
    // Remove parentheses and brackets but keep their contents
    .replace(/[\(\[\{]([^\)\]\}]+)[\)\]\}]/g, '$1')
    // Normalize spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function generateSearchVariations(title) {
  const clean = cleanTitleForSearch(title);
  const variations = new Set();

  // Add original and cleaned versions
  variations.add(title);
  variations.add(clean);

  // Split on common separators and add parts
  const parts = title.split(/[-:\/\\]/);
  parts.forEach(part => variations.add(part.trim()));

  // Handle hyphenated titles specially
  if (title.includes('-')) {
    variations.add(title.replace(/-/g, ' '));
    variations.add(title.replace(/\s*-\s*/g, ''));
  }

  // Add version without special chars
  variations.add(title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim());

  // For numbered titles, add both numeric and word forms
  const numericMatch = title.match(/\b(\d+)\b/);
  if (numericMatch) {
    const num = parseInt(numericMatch[1]);
    const words = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
    if (num <= 10) {
      variations.add(title.replace(num.toString(), words[num]));
    }
  }

  return Array.from(variations);
}

// Enhanced fuzzy matching with weighting
function enhancedFuzzyMatch(baseTitle, candidates) {
  if (!candidates.length) return null;

  const baseTitles = getAlternativeTitles(baseTitle);
  let bestMatch = null;
  let bestScore = FUZZY_MATCH_THRESHOLD;

  for (const candidate of candidates) {
    const candidateTitles = [
      candidate.name,
      ...(candidate.alternative_names?.map(a => a.name) || [])
    ];

    for (const baseVariant of baseTitles) {
      for (const candidateTitle of candidateTitles) {
        if (!candidateTitle) continue;

        // Try exact match first
        if (baseVariant.toLowerCase() === candidateTitle.toLowerCase()) {
          return candidate;
        }

        // Calculate similarity score with weighting
        const similarity = stringSimilarity.compareTwoStrings(
          baseVariant.toLowerCase(),
          candidateTitle.toLowerCase()
        );

        // Add bonus for partial matches
        let score = similarity;
        if (baseVariant.toLowerCase().includes(candidateTitle.toLowerCase()) ||
            candidateTitle.toLowerCase().includes(baseVariant.toLowerCase())) {
          score += 0.1;
        }

        // Add bonus for matching word count
        const baseWords = baseVariant.split(/\s+/).length;
        const candWords = candidateTitle.split(/\s+/).length;
        if (baseWords === candWords) {
          score += 0.05;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }
    }
  }

  return bestMatch;
}

// Add new helper functions for advanced matching
function preprocessGameName(title) {
  const patterns = {
    // Regional variations
    regions: /\b(EU|USA|EUR|JPN|JAP|NTSC|PAL|World|UE|JP|U|J|E|A)\b/gi,
    // Version markers
    versions: /\b(v[\d\.]+|ver[\d\.]+|rev[\d\.]+)\b/gi,
    // Release modifiers
    modifiers: /\b(beta|alpha|proto|sample|demo|final|retail|promo)\b/gi,
    // Common fixes
    fixes: /\b(fix\d*|fixed|patch\d*|patched)\b/gi,
    // Translation markers
    translations: /\b((\w{2})\s*trans|translation|translated\s*\(?(\w{2})\)?)/gi,
    // Dump info
    dumps: /\[(.*?)\]|\((.*?)\)/g,
    // Disk/Tape markers
    media: /\b(disk|disc|tape|side)\s*[ABCD\d]\b/gi,
    // Common title separators
    separators: /[-_:;\/\\]/g,
    // Common suffixes
    suffixes: /\b(remastered|remake|rerelease|classic|collection)\b/gi
  };

  let clean = title;
  // Remove each pattern type and store matches
  const extracted = {};
  for (const [key, pattern] of Object.entries(patterns)) {
    const matches = clean.match(pattern) || [];
    extracted[key] = matches.map(m => m.toLowerCase());
    clean = clean.replace(pattern, ' ');
  }

  // Clean up whitespace
  clean = clean.replace(/\s+/g, ' ').trim();

  return {
    clean,
    extracted,
    original: title
  };
}

function generateSearchQueries(title, platformId) {
  const processed = preprocessGameName(title);
  const queries = [];

  // Base search query
  queries.push({
    type: 'exact',
    query: `
      where name = "${processed.clean.replace(/"/g, '\\"')}"
      ${platformId ? `& platforms = (${platformId})` : ''};
    `
  });

  // Search with series detection
  if (processed.clean.includes(':')) {
    const series = processed.clean.split(':')[0].trim();
    queries.push({
      type: 'series',
      query: `
        where collection.name ~ *"${series.replace(/"/g, '\\"')}"*
        ${platformId ? `& platforms = (${platformId})` : ''};
      `
    });
  }

  // Search with year if present
  const yearMatch = processed.clean.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[0]);
    queries.push({
      type: 'year',
      query: `
        where first_release_date >= ${new Date(year, 0, 1).getTime() / 1000}
        & first_release_date <= ${new Date(year, 11, 31).getTime() / 1000}
        & name ~ *"${processed.clean.replace(/"/g, '\\"')}"*
        ${platformId ? `& platforms = (${platformId})` : ''};
      `
    });
  }

  // Fuzzy search query as fallback
  queries.push({
    type: 'fuzzy',
    query: `
      search "${processed.clean.replace(/"/g, '\\"')}"; 
      where name ~ *"${processed.clean.replace(/"/g, '\\"')}"*
      ${platformId ? `& platforms = (${platformId})` : ''};
    `
  });

  return queries;
}

function scoreMatch(baseTitle, candidate, platformId) {
  let score = 0;
  const base = preprocessGameName(baseTitle);
  const candName = preprocessGameName(candidate.name);

  // Exact match bonus
  if (base.clean.toLowerCase() === candName.clean.toLowerCase()) {
    score += 100;
  }

  // Platform match bonus
  if (platformId && candidate.platforms && candidate.platforms.includes(parseInt(platformId))) {
    score += 20;
  }

  // Word match scoring
  const baseWords = new Set(base.clean.toLowerCase().split(/\s+/));
  const candWords = new Set(candName.clean.toLowerCase().split(/\s+/));
  const commonWords = [...baseWords].filter(word => candWords.has(word));
  score += (commonWords.length / Math.max(baseWords.size, candWords.size)) * 50;

  // Year match bonus - Fixed the regex syntax error
  const yearRegex = /\b(19|20)\d{2}\b/;
  const baseYear = base.clean.match(yearRegex)?.[0];
  const candYear = candidate.first_release_date ? 
    new Date(candidate.first_release_date * 1000).getFullYear().toString() : null;
  if (baseYear && candYear && baseYear === candYear) {
    score += 15;
  }

  // Region match bonus
  if (base.extracted.regions.some(r => 
    candName.extracted.regions.includes(r) || 
    (candidate.alternative_names || []).some(an => 
      an.name.toLowerCase().includes(r)))) {
    score += 10;
  }

  // Publisher/Developer match bonus
  if (candidate.involved_companies) {
    const companies = getCompanies(candidate.involved_companies, 'all');
    const companyWords = companies.toLowerCase().split(/\s+/);
    if (companyWords.some(word => base.clean.toLowerCase().includes(word))) {
      score += 10;
    }
  }

  return score;
}

async function enhancedBatchSearch(title, platformId) {
  const queries = generateSearchQueries(title, platformId);
  let allResults = [];
  
  for (const {type, query} of queries) {
    const results = await igdbRequest('games', query);
    if (results.length > 0) {
      // Score and deduplicate results
      const scoredResults = results.map(result => ({
        ...result,
        matchScore: scoreMatch(title, result, platformId),
        matchType: type
      }));
      
      allResults = allResults.concat(scoredResults);
      
      // If we got a high-confidence match, stop searching
      if (scoredResults.some(r => r.matchScore >= 90)) {
        break;
      }
    }
  }

  // Remove duplicates and sort by score
  const uniqueResults = Array.from(
    new Map(allResults.map(r => [r.id, r])).values()
  ).sort((a, b) => b.matchScore - a.matchScore);

  // Log matching process for debugging
  console.log(`Match results for "${title}":`);
  uniqueResults.slice(0, 3).forEach(r => 
    console.log(`- ${r.name} (Score: ${r.matchScore}, Type: ${r.matchType})`)
  );

  return uniqueResults;
}

// Improved batch search with better query construction
async function igdbBatchSearch(title, platformId) {
  return enhancedBatchSearch(title, platformId);
}

// The matchmaker from hell: tries to find love between your messy title and IGDB's database
function pickBestFuzzyMatch(baseGameTitle, igdbResults) {
  return enhancedFuzzyMatch(baseGameTitle, igdbResults);
}

// The main event: where hope goes to die and metadata comes to live
async function fetchGameMetadata(gameEntry) {
  if (OFFLINE_MODE) return null;

  const title = gameEntry.title;
  const consoleName = gameEntry.consoleName;
  const platformId = getPlatformId(consoleName);
  
  // Use our advanced search instead of the old batch search
  const results = await advancedSearch(title, platformId);
  
  // Log search details for debugging
  console.log(`\nSearch details for "${title}":`);
  console.log(`Generated variations:`, generateSearchStrategies(title));
  console.log(`Platform ID:`, platformId);
  
  if (results.length > 0) {
    // Return the highest scored result
    return results[0];
  }

  return null;
}

// New function for batch processing
async function fetchGameMetadataBatch(gameEntries) {
  if (OFFLINE_MODE) return new Array(gameEntries.length).fill(null);

  const results = await Promise.all(
    gameEntries.map(async (entry) => {
      const searchResults = await advancedSearch(entry.title, getPlatformId(entry.consoleName));
      return searchResults.length > 0 ? searchResults[0] : null;
    })
  );

  return results;
}

// Add these new helper functions
function generateNGrams(text, n = 3) {
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, '');
  const ngrams = [];
  for (let i = 0; i <= cleaned.length - n; i++) {
    ngrams.push(cleaned.slice(i, i + n));
  }
  return ngrams;
}

function getEditDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      if (i === 0) dp[i][j] = j;
      else if (j === 0) dp[i][j] = i;
      else if (str1[i - 1] === str2[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i - 1][j - 1], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function generateSearchStrategies(title) {
  const variations = new Set();
  
  // Original and basic normalized
  variations.add(title);
  
  // Remove common ROM suffixes and prefixes
  const withoutBrackets = title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
  variations.add(withoutBrackets);
  
  // Handle numbered series (e.g., "Final Fantasy VII" -> "Final Fantasy 7")
  const normalized = withoutBrackets.replace(/\b([IVX]+)\b/g, match => {
    const romans = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
    return Object.entries(romans).find(([r]) => r === match)?.[1] || match;
  });
  variations.add(normalized);

  // Handle special characters and separators
  const specialChars = normalized
    .replace(/[&+\/]/g, ' and ')
    .replace(/[_\-.:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  variations.add(specialChars);

  // Generate partial matches for long titles
  const words = specialChars.split(' ');
  if (words.length > 2) {
    variations.add(words.slice(0, 2).join(' ')); // First two words
    variations.add(words.slice(-2).join(' ')); // Last two words
    if (words.length > 3) {
      variations.add(words.slice(0, 3).join(' ')); // First three words
    }
  }

  return Array.from(variations);
}

async function advancedSearch(title, platformId) {
  const strategies = generateSearchStrategies(title);
  let allResults = [];

  // Strategy 1: Direct search using 'search' endpoint first
  const searchQuery = `
    search "${strategies[0].replace(/"/g, '\\"')}";
    fields name, alternative_names.name, cover.*, genres.name, first_release_date,
           summary, storyline, platforms, involved_companies.company.name,
           involved_companies.publisher, involved_companies.developer,
           total_rating, total_rating_count, rating, rating_count,
           aggregated_rating, aggregated_rating_count, category, status,
           game_modes.name, keywords.name, age_ratings.*, collection.name,
           franchise.name, screenshots.image_id;
    ${platformId ? `where platforms = (${platformId});` : ''}
    limit 50;
  `;

  try {
    const searchResults = await igdbRequest('games', searchQuery);
    allResults = allResults.concat(searchResults.map(r => ({ ...r, matchType: 'search' })));
  } catch (error) {
    console.log(`Search query failed: ${error.message}`);
    // Continue with other strategies even if this one fails
  }

  // Strategy 2: Exact name matching if search didn't work
  if (allResults.length === 0) {
    const cleanName = strategies[0].replace(/[^\w\s]/g, ' ').trim();
    const exactQuery = `
      fields name, alternative_names.name, cover.*, genres.name, first_release_date,
             summary, storyline, platforms, involved_companies.company.name,
             involved_companies.publisher, involved_companies.developer,
             total_rating, total_rating_count, rating, rating_count,
             aggregated_rating, aggregated_rating_count, category, status,
             game_modes.name, keywords.name, age_ratings.*, collection.name,
             franchise.name, screenshots.image_id;
      where name ~ "${cleanName}"
      ${platformId ? `& platforms = (${platformId})` : ''};
      limit 50;
    `;

    try {
      const exactResults = await igdbRequest('games', exactQuery);
      allResults = allResults.concat(exactResults.map(r => ({ ...r, matchType: 'exact' })));
    } catch (error) {
      console.log(`Exact query failed: ${error.message}`);
    }
  }

  // Score and rank all results
  const scoredResults = allResults.map(result => {
    let score = 0;
    const baseNgrams = generateNGrams(title);
    const resultNgrams = generateNGrams(result.name);
    
    // N-gram similarity
    const ngramIntersection = baseNgrams.filter(n => resultNgrams.includes(n)).length;
    score += (ngramIntersection / Math.max(baseNgrams.length, resultNgrams.length)) * 50;

    // Edit distance score
    const editDistance = getEditDistance(title.toLowerCase(), result.name.toLowerCase());
    const maxLength = Math.max(title.length, result.name.length);
    const editScore = (1 - editDistance / maxLength) * 30;
    score += editScore;

    // Word matches
    const titleWords = title.toLowerCase().split(/\s+/);
    const resultWords = result.name.toLowerCase().split(/\s+/);
    const wordMatches = titleWords.filter(w => resultWords.includes(w)).length;
    score += (wordMatches / Math.max(titleWords.length, resultWords.length)) * 20;

    return { ...result, score };
  });

  // Log the search process
  console.log(`\nSearch process for "${title}":`);
  console.log(`Variations tried:`, strategies);
  console.log(`Results found:`, scoredResults.length);
  if (scoredResults.length > 0) {
    console.log(`Top matches:`);
    scoredResults.slice(0, 3).forEach(r => 
      console.log(`- ${r.name} (Score: ${r.score})`)
    );
  }

  // Sort by score and remove duplicates
  return Array.from(
    new Map(scoredResults.map(r => [r.id, r])).values()
  ).sort((a, b) => b.score - a.score);
}

module.exports = {
  fetchGameMetadata,
  fetchGameMetadataBatch, // Export new function
};