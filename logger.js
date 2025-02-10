// NEW: Refactored logger with log level filtering and consistent formatting.

const chalk = require('chalk');

// Log levels
const levels = { 
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  SUCCESS: 1
};

const currentLevel = process.env.LOG_LEVEL ? process.env.LOG_LEVEL.toUpperCase() : 'INFO';
const levelThreshold = levels[currentLevel] !== undefined ? levels[currentLevel] : levels.INFO;

function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  let levelStr = level;
  switch(level) {
    case 'DEBUG': levelStr = chalk.gray(level); break;
    case 'INFO': levelStr = chalk.white(level); break;
    case 'WARNING': levelStr = chalk.yellow(level); break;
    case 'ERROR': levelStr = chalk.red(level); break;
    case 'SUCCESS': levelStr = chalk.green(level); break;
  }
  return `[${timestamp}] [${levelStr}] ${message}`;
}

function logDebug(message) {
  if (levels.DEBUG >= levelThreshold) {
    console.log(formatMessage('DEBUG', message));
  }
}

function logInfo(message) {
  if (levels.INFO >= levelThreshold) {
    console.log(formatMessage('INFO', message));
  }
}

function logWarning(message) {
  if (levels.WARNING >= levelThreshold) {
    console.warn(formatMessage('WARNING', message));
  }
}

function logError(message) {
  if (levels.ERROR >= levelThreshold) {
    console.error(formatMessage('ERROR', message));
  }
}

function logSuccess(message) {
  if (levels.SUCCESS >= levelThreshold) {
    console.log(formatMessage('SUCCESS', message));
  }
}

module.exports = {
  logDebug,
  logInfo,
  logWarning,
  logError,
  logSuccess,
};