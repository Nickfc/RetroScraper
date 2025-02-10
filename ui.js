// Welcome to the UI nightmare - where progress bars come to die and spinners spin eternally

// Importing our weapons of mass distraction
const cliProgress = require('cli-progress');
const chalk = require('chalk'); // Because black and white is too mainstream
const { getRandomMessage } = require('./messageLoader'); // For when we run out of original insults

// Color schemes for your visual suffering
const themes = {
  default: {
    // For those who like their progress bars to look like a unicorn threw up
    bar: chalk.cyan,
    eta: chalk.yellow,
    game: chalk.green,
    status: chalk.blue,
    error: chalk.red
  },
  dark: {
    // For the emotionally damaged developers
    bar: chalk.gray,
    eta: chalk.white,
    game: chalk.green,
    status: chalk.blue,
    error: chalk.red
  }
};

// The most reliable spinner in existence - it's so basic, it makes ASCII art look sophisticated
const spinnerFrames = ['|', '/', '-', '\\'];

// Global variables - because who doesn't love some good old-fashioned state management disasters?
let spinnerInterval;
let currentTheme = themes.default;
let currentSpinnerFrame = 0;

// The format that will haunt your terminal's dreams
const defaultFormat = {
  format: (options, params, payload) => {
    try {
      // Only show spinner character if this is an active update, otherwise use space
      const spinChar = options.isCompleted ? ' ' : spinnerFrames[currentSpinnerFrame % spinnerFrames.length];
      
      // Calculate the bar width and create the progress bar using simple ASCII
      const barSize = 30;
      const progress = (params.value / params.total) || 0;
      const filled = Math.floor(progress * barSize);
      const remaining = barSize - filled;
      const progressBar = '='.repeat(filled) + '-'.repeat(remaining);  // Using ASCII characters
      const bar = currentTheme.bar(progressBar);
      
      // Calculate percentage from progress
      const percent = (progress * 100).toFixed(0).padStart(3);
      
      const fraction = `${(params.value || 0).toString().padStart(5)}/${params.total}`;
      
      // Format ETA properly with better validation
      let etaString = '??:??';
      if (params.eta !== undefined && params.eta !== Infinity && !isNaN(params.eta)) {
        const eta = Math.ceil(params.eta);
        const hours = Math.floor(eta / 3600);
        const minutes = Math.floor((eta % 3600) / 60);
        const seconds = eta % 60;
        if (hours > 0) {
          etaString = `${hours}h${minutes.toString().padStart(2, '0')}m`;
        } else {
          etaString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
      }
      const eta = currentTheme.eta(`ETA: ${etaString.padEnd(7)}`);
      
      const game = currentTheme.game((payload?.gameTitle || '').padEnd(30));
      const status = currentTheme.status(payload?.metadataStatus || '');
      
      return `${spinChar} ${bar} ${percent}% | ${fraction} | ${eta} | ${game} | ${status}`;
    } catch (error) {
      console.error('Format error:', error); // When even the formatter gives up on life
      return 'Initializing...'; // The lie we tell users when everything breaks
    }
  },
  hideCursor: true, // Hide the cursor because watching it blink is too much excitement
  etaBuffer: 50,    // The crystal ball of completion times - equally unreliable
  clearOnComplete: true, // Destroy the evidence
  linewrap: false,  // Because wrapped text is for the weak
  barsize: 30       // The perfect size to display inadequate progress
};

// Change themes because sometimes you need your depression in different colors
function setTheme(themeName) {
  currentTheme = themes[themeName] || themes.default;
}

// The spinner - nature's way of saying "I'm not frozen, I'm just thinking really hard"
function startSpinner(progressBar) {
  // Clear any existing interval first
  stopSpinner();
  
  // Reset frame counter
  currentSpinnerFrame = 0;
  
  // Add UTF-8 encoding hint
  process.stdout.setDefaultEncoding('utf8');
  
  spinnerInterval = setInterval(() => {
    try {
      if (progressBar && !progressBar.terminal.isTTY) {
        return; // Don't animate if not in terminal
      }
      
      if (progressBar) {
        currentSpinnerFrame = (currentSpinnerFrame + 1) % spinnerFrames.length;
        progressBar.render();
      }
    } catch (error) {
      console.error('Spinner error:', error);
      stopSpinner();
    }
  }, 80);
}

// When the spinning needs to stop (usually due to user rage-quitting)
function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
  }
}

// Creates a progress bar that will slowly crush your soul
function createProgressBar(totalGames, options = {}) {
  try {
    // Validate totalGames because users can't be trusted with numbers
    if (!totalGames || totalGames < 0) {
      totalGames = 0; // When in doubt, start from nothing, just like my career
    }

    // Ensure spinner starts from beginning
    currentSpinnerFrame = 0;
    
    const progressBar = new cliProgress.SingleBar({
      ...defaultFormat,
      ...options
    });

    // Initialize with proper starting values
    const initialState = {
      gameTitle: '',
      metadataStatus: '',
      progress: 0,
      value: 0,
      total: totalGames,
      eta: 0,
      eta_formatted: '??:??'
    };

    progressBar.start(totalGames, 0, initialState);
    
    // Start spinner after bar is created
    process.nextTick(() => startSpinner(progressBar));
    
    return progressBar;
  } catch (error) {
    showError('Error creating progress bar: ' + error.message); // When even the simple task of showing progress fails
    return null; // Return null - the programmatic equivalent of giving up
  }
}

// Updates the progress bar with new lies about completion time
function updateProgressBar(progressBar, processedCount, totalCount, gameTitle, metadataStatus) {
  try {
    if (!progressBar) return;

    // Ensure gameTitle is a string and has a valid length
    const safeTitle = String(gameTitle || '').substring(0, 30);
    const percent = Math.floor((processedCount / totalCount) * 100);

    // Update the progress bar
    progressBar.update(processedCount, {
      gameTitle: safeTitle,
      metadataStatus: '',
      isCompleted: false
    });

    // Handle status messages
    if (metadataStatus && ['success', 'warning', 'offline'].includes(metadataStatus.toLowerCase())) {
      const statusPart = metadataStatus.toLowerCase() === 'success' 
        ? chalk.green('[SUCCESS]')
        : metadataStatus.toLowerCase() === 'warning'
          ? chalk.yellow('[WARNING]')
          : chalk.blue('[OFFLINE]');

      const message = metadataStatus.toLowerCase() === 'success'
        ? `Metadata found! (${getRandomMessage('SuccessMessages')})`
        : metadataStatus.toLowerCase() === 'warning'
          ? `No metadata found (${getRandomMessage('WarningMessages')})`
          : `Skipped metadata check (${getRandomMessage('OfflineMessages')})`;

      console.log(`${statusPart} | ${chalk.white(message)}`);
    }
  } catch (error) {
    console.error(`Progress bar update error: ${error.message}`);
  }
}

// The sweet release of death (for the progress bar)
function stopProgressBar(progressBar) {
  try {
    if (progressBar) {
      stopSpinner();
      progressBar.stop(); // Finally, put it out of its misery
    }
  } catch (error) {
    showError('Error stopping progress bar: ' + error.message); // When even stopping fails - you know it's bad
  }
}

// Because users need to know exactly how badly things went wrong
function showError(message) {
  const timestamp = new Date().toLocaleTimeString(); // Timestamp the failure for posterity
  console.error(currentTheme.error(`[${timestamp}] Error: ${message}`)); // Paint it red, because errors should hurt
}

// Export these functions so other modules can share in the misery
module.exports = {
  createProgressBar,
  updateProgressBar,
  stopProgressBar,
  showError,
  setTheme
};