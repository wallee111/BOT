/**
 * Performance monitoring utilities for tracking Firestore operations and app performance
 */

const PERF_ENABLED = typeof window !== 'undefined' && window.localStorage?.getItem('debug_performance') === 'true';

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.firestoreReads = 0;
        this.firestoreWrites = 0;
        this.cacheHits = 0;
        this.cacheMisses = 0;
    }

    // Track Firestore read operation
    trackRead(count = 1) {
        this.firestoreReads += count;
        if (PERF_ENABLED) {
            console.log(`[Perf] Firestore reads: ${this.firestoreReads}`);
        }
    }

    // Track Firestore write operation
    trackWrite(count = 1) {
        this.firestoreWrites += count;
        if (PERF_ENABLED) {
            console.log(`[Perf] Firestore writes: ${this.firestoreWrites}`);
        }
    }

    // Track cache hit
    trackCacheHit(key) {
        this.cacheHits++;
        if (PERF_ENABLED) {
            console.log(`[Perf] Cache hit: ${key} (total hits: ${this.cacheHits})`);
        }
    }

    // Track cache miss
    trackCacheMiss(key) {
        this.cacheMisses++;
        if (PERF_ENABLED) {
            console.log(`[Perf] Cache miss: ${key} (total misses: ${this.cacheMisses})`);
        }
    }

    // Start timing an operation
    startTimer(label) {
        if (!PERF_ENABLED) return;
        this.metrics.set(label, performance.now());
    }

    // End timing an operation and log duration
    endTimer(label) {
        if (!PERF_ENABLED) return;
        const start = this.metrics.get(label);
        if (start) {
            const duration = performance.now() - start;
            console.log(`[Perf] ${label}: ${duration.toFixed(2)}ms`);
            this.metrics.delete(label);
            return duration;
        }
    }

    // Get performance summary
    getSummary() {
        return {
            firestoreReads: this.firestoreReads,
            firestoreWrites: this.firestoreWrites,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            cacheHitRate: this.cacheHits + this.cacheMisses > 0
                ? (this.cacheHits / (this.cacheHits + this.cacheMisses) * 100).toFixed(2) + '%'
                : 'N/A',
        };
    }

    // Reset all metrics
    reset() {
        this.firestoreReads = 0;
        this.firestoreWrites = 0;
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.metrics.clear();
    }

    // Log summary to console
    logSummary() {
        if (!PERF_ENABLED) return;
        const summary = this.getSummary();
        console.table(summary);
    }
}

// Singleton instance
export const perfMonitor = new PerformanceMonitor();

// Expose to window for debugging (only in development)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
    window.__perfMonitor = perfMonitor;
    console.info('[Perf] Performance monitor available at window.__perfMonitor');
    console.info('[Perf] Enable logging with: localStorage.setItem("debug_performance", "true")');
}

/**
 * Estimate Firestore costs based on operations
 * Pricing as of 2024 (Free tier: 50K reads/day, 20K writes/day)
 */
export function estimateCosts() {
    const summary = perfMonitor.getSummary();
    const READ_COST = 0.06 / 100000;  // $0.06 per 100K reads
    const WRITE_COST = 0.18 / 100000; // $0.18 per 100K writes

    const readCost = summary.firestoreReads * READ_COST;
    const writeCost = summary.firestoreWrites * WRITE_COST;
    const totalCost = readCost + writeCost;

    return {
        reads: summary.firestoreReads,
        writes: summary.firestoreWrites,
        estimatedCost: `$${totalCost.toFixed(6)}`,
        readCost: `$${readCost.toFixed(6)}`,
        writeCost: `$${writeCost.toFixed(6)}`,
    };
}
