const { parentPort } = require('worker_threads');
const { buildGameLibrary } = require('./buildGameLibrary');

parentPort.on('message', async (message) => {
  try {
    // Validate incoming message
    if (!message || !message.chunk || !Array.isArray(message.chunk)) {
      throw new Error('Invalid chunk data received by worker');
    }

    // Validate config
    if (!message.config || !message.config.Settings) {
      throw new Error('Invalid configuration received by worker');
    }

    // Process only valid paths
    const validChunks = message.chunk.filter(path => 
      typeof path === 'string' && path.length > 0
    );

    if (validChunks.length === 0) {
      throw new Error('No valid paths in chunk');
    }

    // Pass config to buildGameLibrary
    global.config = message.config;
    const result = await buildGameLibrary(validChunks);
    
    parentPort.postMessage({
      finalMap: result?.finalMap || {},
      unmatchedGames: result?.unmatchedGames || []
    });
  } catch (error) {
    parentPort.postMessage({
      finalMap: {},
      unmatchedGames: [],
      error: error.message || 'Unknown worker error'
    });
  } finally {
    parentPort.close();
  }
});
