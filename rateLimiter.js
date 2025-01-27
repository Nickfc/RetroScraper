// Welcome to Rate Limiter - Where your requests go to wait in purgatory
// This module implements a token bucket algorithm with concurrent request limiting

// Bringing in the tools of oppression
// Utilities for Promise conversion, logging, and timing operations
const util = require('util');
const { logWarning } = require('./logger');
const { setTimeout } = require('timers');
const {
  MAX_REQUESTS_PER_SECOND,  // How many souls we process per second
  REFILL_INTERVAL_MS,       // Time between mercy refills
  MAX_CONCURRENCY,          // Maximum parallel torments allowed
  ADAPTIVE_RATE,           // Whether we learn from our victims' suffering
} = require('./constants');

// Converting setTimeout into a Promise because callbacks are hell (literally)
// Promisify setTimeout to use with async/await pattern
const setTimeoutPromise = util.promisify(setTimeout);

// The current number of requests being processed (or tortured, depending on your perspective)
// Tracks how many requests are currently executing in parallel
let currentConcurrency = 0;
// The waiting line to digital damnation
// Queue of tasks waiting to be executed when capacity becomes available
let activeTasks = [];
// Our precious tokens, like treats for well-behaved requests
// Token bucket counter for rate limiting, replenished periodically
let tokenBucket = MAX_REQUESTS_PER_SECOND;
// Timestamp of our last 429 error (aka "The Great Rejection")
// Used to track and adapt to server's "Too Many Requests" responses
let last429Timestamp = 0;

// Refill the token bucket, like a cruel god bestowing limited mercy
// Replenishes available request tokens at a fixed interval
setInterval(() => {
  tokenBucket = MAX_REQUESTS_PER_SECOND;
}, REFILL_INTERVAL_MS);

// The gatekeeper function: Where hopes and dreams go to die in a queue
// Main entry point that wraps requests with rate limiting and concurrency control
function queueRequest(fn) {
  return new Promise((resolve, reject) => {
    // Each task is like a little prisoner, waiting for its turn in the chamber
    const task = async () => {
      try {
        await waitForToken(); // Stand in line like a good little request
        currentConcurrency++; // Another soul enters the processing chamber
        const result = await fn();
        currentConcurrency--; // One less request to worry about (they either made it or they didn't)
        resolve(result);
        processNextTask(); // "Next victim, please!"
      } catch (err) {
        currentConcurrency--; // Another one bites the dust
        reject(err);
        processNextTask(); // The show must go on
      }
    };

    activeTasks.push(task); // Welcome to the waiting room of despair
    processNextTask();
  });
}

// The executioner: Processes tasks when there's room in the torture chamber
// Dequeues and executes pending tasks if below MAX_CONCURRENCY limit
function processNextTask() {
  while (activeTasks.length > 0 && currentConcurrency < MAX_CONCURRENCY) {
    const next = activeTasks.shift(); // Pick the next unfortunate soul
    next(); // Your time has come
  }
}

// The token dispenser: Where requests learn the true meaning of patience
// Implements the token bucket algorithm, blocking until a token is available
async function waitForToken() {
  while (tokenBucket <= 0) {
    await setTimeoutPromise(100); // Sweet dreams, keep waiting
  }
  tokenBucket--; // Another token bites the dust
}

// When the server says "Too Many Requests" and we actually listen
// Adaptive rate limiting: reduces MAX_CONCURRENCY when hitting 429s frequently
function handle429() {
  const now = Date.now();
  if (!ADAPTIVE_RATE) return;
  if (now - last429Timestamp < 30000) {
    const old = MAX_CONCURRENCY;
    MAX_CONCURRENCY = Math.max(1, Math.floor(MAX_CONCURRENCY / 2));
    logWarning(`429: The server has spoken. Cutting our ambitions in half: ${old} → ${MAX_CONCURRENCY}. Time to dream smaller.`);
  }
  last429Timestamp = now; // Mark the time of our latest humiliation
}

// Export our instruments of rate control
// Expose the queue interface and 429 handler for external use
module.exports = {
  queueRequest, // The queue master: Wraps requests with rate limiting
  handle429,    // The humbler: Handles rate limit exceeded scenarios
};