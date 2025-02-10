class StatsCollector {
    constructor() {
        this.stats = {
            totalProcessed: 0,
            successfulMatches: 0,
            totalInLibrary: 0,
            unmatchedGames: [],
            processingStartTime: Date.now(),
            matchesByConsole: {},
            failureReasons: {},
            processingSpeed: [], // Games/minute over time
        };
    }

    addProcessed() {
        this.stats.totalProcessed++;
        this.updateProcessingSpeed();
    }

    addMatch(console) {
        this.stats.successfulMatches++;
        this.stats.matchesByConsole[console] = (this.stats.matchesByConsole[console] || 0) + 1;
    }

    addUnmatched(game, reason, searchResults) {
        this.stats.unmatchedGames.push({
            title: game.title,
            console: game.consoleName,
            romPath: game.romPath,
            folderPath: game.folderPath,
            reason: reason,
            bestMatch: searchResults?.length > 0 ? {
                title: searchResults[0].name,
                score: searchResults[0].score,
                id: searchResults[0].id
            } : null,
            attemptedVariations: game.searchVariations || [],
            timestamp: new Date().toISOString()
        });
    }

    updateProcessingSpeed() {
        const elapsedMinutes = (Date.now() - this.stats.processingStartTime) / 60000;
        if (elapsedMinutes > 0) {
            this.stats.processingSpeed.push({
                timestamp: Date.now(),
                gamesPerMinute: this.stats.totalProcessed / elapsedMinutes
            });
        }
    }

    getSummary() {
        const elapsedTime = (Date.now() - this.stats.processingStartTime) / 1000;
        const matchRatio = this.stats.totalProcessed > 0 
            ? ((this.stats.successfulMatches / this.stats.totalProcessed) * 100).toFixed(2)
            : 0;

        return {
            processingSummary: {
                totalGamesProcessed: this.stats.totalProcessed,
                successfulMatches: this.stats.successfulMatches,
                matchRatio: `${matchRatio}%`,
                totalInLibrary: this.stats.successfulMatches,
                unmatchedGames: this.stats.unmatchedGames.length,
                elapsedTime: `${Math.floor(elapsedTime / 60)}m ${Math.floor(elapsedTime % 60)}s`,
                averageSpeed: `${(this.stats.totalProcessed / (elapsedTime / 60)).toFixed(2)} games/minute`
            },
            consoleBreakdown: this.stats.matchesByConsole,
            failureAnalysis: {
                topReasons: Object.entries(this.stats.failureReasons)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 5),
                unmatchedSample: this.stats.unmatchedGames.slice(-5) // Last 5 unmatched games
            }
        };
    }

    formatSummaryForDisplay() {
        const summary = this.getSummary();
        return `=== Processing Summary ===
Total Games Processed: ${summary.processingSummary.totalGamesProcessed}
Successfully Matched:   ${summary.processingSummary.successfulMatches}
Match Ratio:           ${summary.processingSummary.matchRatio}
Processing Time:       ${summary.processingSummary.elapsedTime}
Average Speed:         ${summary.processingSummary.averageSpeed}

=== Console Breakdown ===
${Object.entries(summary.consoleBreakdown)
    .map(([console, count]) => `${console}: ${count} games`)
    .join('\n')}

=== Recent Unmatched Games ===
${summary.failureAnalysis.unmatchedSample
    .map(game => `- ${game.title} (${game.console}) - ${game.reason}`)
    .join('\n')}`;
    }
}

module.exports = new StatsCollector();
