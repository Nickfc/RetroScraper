// Summoning the ancient ones (filesystem, path manipulation, and the cursed INI parser)
const fs = require('fs');
const path = require('path');
const ini = require('ini');

// Our cache of misery - null until we actually need to load something
let messages = null;

// The grand ritual of message loading
// Returns either your carefully crafted messages or a sad default set if everything goes wrong
function loadMessages() {
  // If we already went through this pain, no need to do it again
  if (messages) return messages;
  
  // Locate our sacred scroll of messages, hidden in the depths of the filesystem
  const messagesPath = path.join(__dirname, 'messages.ini');
  try {
    // Attempt to decipher the ancient texts
    const messagesContent = fs.readFileSync(messagesPath, 'utf-8');
    // Parse the enigmatic INI format, because JSON would have been too mainstream
    messages = ini.parse(messagesContent);
    return messages;
  } catch (error) {
    // Something went horribly wrong - time for plan B
    console.error('Error loading messages:', error);
    // Return the saddest default messages known to mankind
    return {
      SuccessMessages: {'1': 'Success'}, // The most boring success message ever
      WarningMessages: {'1': 'Warning'}, // Captain Obvious strikes again
      OfflineMessages: {'1': 'Offline'}, // For when the internet decides to die
      ProgressMessages: {'1': 'Processing...'} // The eternal lie of progress
    };
  }
}

// The Random Message Roulette™
// Where we spin the wheel of fortune and pick a random message from our collection of despair
function getRandomMessage(section) {
  // Load our messages, or die trying
  const msgs = loadMessages()[section];
  // If the section doesn't exist, return the void itself
  if (!msgs) return '';
  // Get all possible messages (aka our arsenal of psychological warfare)
  const keys = Object.keys(msgs);
  // Let chaos decide which message to inflict upon the user
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  return msgs[randomKey];
}

// Export these functions to spread the joy (or confusion) across the application
module.exports = {
  getRandomMessage,
  loadMessages
};