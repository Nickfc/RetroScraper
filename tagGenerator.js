const { STOP_WORDS, GAMING_CATEGORIES } = require('./constants');

// Expanded gaming terms with more specific terms
const GAMING_TERMS = new Set([
  // Core gameplay terms
  'action', 'adventure', 'arcade', 'battle', 'combat', 'fighting',
  'multiplayer', 'platform', 'puzzle', 'racing', 'rpg', 'shooter',
  'simulation', 'sport', 'strategy',
  
  // Common gameplay descriptors
  'scrolling', 'simultaneous', 'split-screen', 'cooperative', 'competitive',
  'turn-based', 'real-time', 'tactical', 'side-view', 'top-down',
  
  // Technical features
  'graphics', 'animation', 'parallax', 'stereo', 'sound', 'music',
  'effects', 'sprites', 'rendered', 'pixel-art',
  
  // Game mechanics
  'levels', 'missions', 'stages', 'quests', 'campaign', 'story',
  'score', 'highscore', 'powerups', 'upgrades', 'achievements',
  
  // Game elements
  'characters', 'enemies', 'bosses', 'weapons', 'items', 'collectibles',
  'treasures', 'secrets', 'unlockables', 'customization'
]);

// Additional words that should always be removed
const EXTRA_STOP_WORDS = new Set([
  'your', 'from', 'with', 'without', 'over', 'some', 'this', 'that',
  'well', 'each', 'both', 'most', 'such', 'back', 'come', 'best',
  'around', 'their', 'about', 'into', 'other', 'these', 'those',
  'much', 'many', 'more', 'must', 'lots', 'find', 'based', 'like',
  'full', 'have', 'huge', 'long', 'lost', 'make', 'take', 'very'
]);

// Common genre combinations that should be preserved
const GENRE_COMBOS = new Map([
  ['hack/slash', 'hackandslash'],
  ['beat/em/up', 'beatemup'],
  ['shoot/em/up', 'shootemup'],
  ['run/gun', 'runandgun']
]);

// Feature detection patterns
const FEATURE_PATTERNS = new Map([
  [/\b(?:vs|versus)\b.*(?:player|cpu|computer)/, 'competitive'],
  [/\b(?:high|top)\s*scores?\b/, 'highscore'],
  [/\b(?:save|load|continue)\s*game\b/, 'savegame'],
  [/\b(?:two|2|multiple)\s*players?\b/, 'multiplayer'],
  [/\b(?:power|bonus)\s*ups?\b/, 'powerups']
]);

// Strips words of their dignity and forces them into submission
// Just like life strips away our dreams
function cleanWord(word) {
  return word.toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Purging special characters like we purge our emotions
    .trim();
}

// Judges words like society judges us
// Returns true if the word is worthy of existence, false if it should be cast into the void
function isValidTag(word) {
  // Must be between 3 and 20 chars to be valid
  if (word.length < 3 || word.length > 20) return false;
  
  // Reject pure numbers and stop words
  if (/^\d+k?$/.test(word) || STOP_WORDS.has(word) || EXTRA_STOP_WORDS.has(word)) return false;

  // Always accept gaming-specific terms
  if (GAMING_TERMS.has(word)) return true;

  // Check gaming categories with higher threshold
  for (const category of Object.values(GAMING_CATEGORIES)) {
    if (category.has(word)) return true;
  }

  // More aggressive filtering for generic words
  if (word.length < 5) return false; // Reject very short non-gaming terms
  
  return false; // Reject everything else by default
}

// Performs group therapy for similar tags
// Forces them to conform to society's standards
function normalizeTags(tags) {
  const normalizedTags = new Set();
  const frequency = {};
  
  // First pass: count frequencies
  for (let tag of tags) {
    tag = cleanWord(tag);
    if (tag) {
      frequency[tag] = (frequency[tag] || 0) + 1;
    }
  }

  // Second pass: apply rules with stricter thresholds
  for (let tag of tags) {
    tag = cleanWord(tag);
    
    // Only accept tags that are either gaming terms or appear frequently
    if (isValidTag(tag) && (
      GAMING_TERMS.has(tag) || 
      frequency[tag] > 2 // Increased frequency threshold
    )) {
      // Normalize variations
      switch(tag) {
        case 'multiplayer':
        case 'multiplay':
        case 'multi':
          normalizedTags.add('multiplayer');
          break;
        case 'platformer':
        case 'platform':
          normalizedTags.add('platform');
          break;
        case 'simulation':
        case 'simulator':
          normalizedTags.add('simulation');
          break;
        case 'sports':
        case 'sport':
          normalizedTags.add('sport');
          break;
        case 'strategy':
        case 'strategic':
          normalizedTags.add('strategy');
          break;
        case 'versus':
        case 'vs':
          normalizedTags.add('competitive');
          break;
        case 'missions':
        case 'quests':
        case 'objectives':
          normalizedTags.add('missions');
          break;
        case 'modes':
        case 'gameplay':
          normalizedTags.add('gameplay');
          break;
        case 'difficult':
        case 'challenging':
          normalizedTags.add('hardcore');
          break;
        case 'graphic':
        case 'graphical':
          normalizedTags.add('graphics');
          break;
        case 'animated':
        case 'animate':
          normalizedTags.add('animation');
          break;
        case 'music':
        case 'musical':
        case 'soundtrack':
          normalizedTags.add('music');
          break;
        default:
          normalizedTags.add(tag);
      }
    }
  }

  // Prioritize gaming terms in final sort
  return Array.from(normalizedTags)
    .sort((a, b) => {
      const aGaming = GAMING_TERMS.has(a);
      const bGaming = GAMING_TERMS.has(b);
      if (aGaming && !bGaming) return -1;
      if (!aGaming && bGaming) return 1;
      return frequency[b] - frequency[a];
    })
    .slice(0, 8); // Reduced to fewer, more relevant tags
}

// The grand architect of tag generation
// Takes your meaningless words and tries to make them useful
// Like my therapist, but for text
function generateTags(description) {
  // Handle the void with grace
  if (!description) return [];
  
  // Extract feature-based tags first
  const featureTags = new Set();
  for (const [pattern, tag] of FEATURE_PATTERNS) {
    if (pattern.test(description.toLowerCase())) {
      featureTags.add(tag);
    }
  }

  // Split the description like my last relationship
  // Clean each word like we clean our browser history
  const words = description
    .split(/\s+/)
    .map(cleanWord)
    .filter(word => word.length > 0);
  
  // Combine feature tags with processed words
  return normalizeTags([...words, ...featureTags]);
}

// Export these functions to spread the misery
module.exports = {
  generateTags,
  normalizeTags,
  GAMING_TERMS, // Export for testing
  FEATURE_PATTERNS
};