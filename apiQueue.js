const PQueue = require('p-queue').default;
const { logWarning, logInfo, logDebug } = require('./logger');

// Rate limiting configuration based on IGDB's limits
const queue = new PQueue({
    concurrency: 8,              // Increased to allow more concurrent requests
    interval: 1000,              // 1 second interval
    intervalCap: 8,              // Increased cap accordingly
    timeout: 15000,              // 15 second timeout
    throwOnTimeout: true,
    autoStart: true
});

// Monitor rate limiting
let tooManyRequests = 0;
const RATE_LIMIT_THRESHOLD = 3;  // Number of 429 errors before reducing concurrency

queue.on('error', error => {
    if (error.message.includes('429')) {
        tooManyRequests++;
        if (tooManyRequests >= RATE_LIMIT_THRESHOLD) {
            logWarning('Too many rate limits, reducing concurrency');
            queue.concurrency = Math.max(1, Math.floor(queue.concurrency / 2));
            tooManyRequests = 0;
        }
    }
});

// Reset rate limit counter periodically
setInterval(() => {
    if (tooManyRequests > 0) {
        tooManyRequests--;
    }
}, 60000); // Check every minute

// Add performance monitoring
let totalProcessed = 0;
let startTime = Date.now();

queue.on('completed', () => {
    totalProcessed++;
    if (totalProcessed % 100 === 0) {
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const rate = totalProcessed / elapsedSeconds;
        logInfo(`Processing rate: ${rate.toFixed(2)} items/second`);
    }
});

// Monitor queue events
queue.on('active', () => {
    if (queue.pending > 10) {
        logWarning(`Queue size: ${queue.size}  Pending: ${queue.pending}`);
    }
});

// Enhanced queue monitoring
queue.on('active', () => {
    const { size, pending } = queue;
    logInfo(`Queue status: ${size} total, ${pending} pending`);
});

queue.on('completed', (result) => {
    logDebug(`Task completed. Queue size: ${queue.size}`);
});

queue.on('error', error => {
    logWarning(`Queue error: ${error.message}`);
});

// Add task to queue with retry logic
async function addToQueue(task, priority = 0) {
    const maxRetries = 3;
    let attempt = 0;
    let lastError = null;

    while (attempt < maxRetries) {
        try {
            return await queue.add(task, {
                priority,
                timeout: 15000
            });
        } catch (error) {
            lastError = error;
            attempt++;
            
            if (error.message.includes('429')) {
                // Exponential backoff for rate limits
                const delay = Math.pow(2, attempt + 2) * 1000; // Longer delays for rate limits
                logWarning(`Rate limited, pausing for ${delay}ms`);
                await queue.pause();
                await new Promise(resolve => setTimeout(resolve, delay));
                await queue.start();
            } else {
                // Standard exponential backoff for other errors
                await new Promise(resolve => 
                    setTimeout(resolve, Math.pow(2, attempt) * 1000)
                );
            }
        }
    }
    throw lastError;
}

// Add queue statistics
function getQueueStats() {
    return {
        size: queue.size,
        pending: queue.pending,
        isPaused: queue.isPaused
    };
}

module.exports = {
    queue,
    addToQueue,
    getQueueStats  // Export stats function
};
