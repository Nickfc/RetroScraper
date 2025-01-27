// Because every project needs yet another logger... *sigh*

const chalk = require('chalk');
const { getRandomMessage } = require('./messageLoader');

// When everything goes horribly wrong, and you need someone to blame
function logError(msg) {
  console.error(chalk.red(`[ERROR  ] | ${msg}`));
}

// For those "it's not a bug, it's a feature" moments
function logWarning(msg) {
  const warningPrefix = getRandomMessage('WarningMessages');
  console.warn(chalk.yellow(`[WARNING] | ${msg} (${warningPrefix})`));
}

// When you need to pretend things are actually happening
function logInfo(msg) {
  const progressPrefix = getRandomMessage('ProgressMessages');
  console.log(chalk.cyan(`[INFO   ] | ${progressPrefix} - ${msg}`));
}

// Celebrating those rare moments when something actually works
function logSuccess(msg) {
  const successPrefix = getRandomMessage('SuccessMessages');
  console.log(chalk.green(`[SUCCESS] | ${msg} (${successPrefix})`));
}

// Export these wonderful tools of despair
module.exports = {
  logError,
  logWarning,
  logInfo,
  logSuccess,
};