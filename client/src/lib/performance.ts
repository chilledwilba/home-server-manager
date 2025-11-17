/**
 * Performance monitoring utilities for tracking Web Vitals and custom metrics
 * @module performance
 */

export interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

/**
 * Web Vitals thresholds based on Google's recommendations
 * @see https://web.dev/vitals/
 */
const THRESHOLDS = {
  // Largest Contentful Paint (LCP) - measures loading performance
  LCP: { good: 2500, poor: 4000 },
  // First Input Delay (FID) - measures interactivity
  FID: { good: 100, poor: 300 },
  // Cumulative Layout Shift (CLS) - measures visual stability
  CLS: { good: 0.1, poor: 0.25 },
  // First Contentful Paint (FCP) - measures perceived load speed
  FCP: { good: 1800, poor: 3000 },
  // Time to First Byte (TTFB) - measures connection + server response time
  TTFB: { good: 800, poor: 1800 },
} as const;

/**
 * Get rating for a metric value based on thresholds
 */
function getRating(
  value: number,
  thresholds: { good: number; poor: number },
): 'good' | 'needs-improvement' | 'poor' {
  if (value <= thresholds.good) {
    return 'good';
  }
  if (value <= thresholds.poor) {
    return 'needs-improvement';
  }
  return 'poor';
}

/**
 * Report a performance metric
 */
function reportMetric(metric: PerformanceMetric): void {
  // In production, send to analytics service
  if (import.meta.env.PROD) {
    // TODO: Send to analytics endpoint
    // navigator.sendBeacon('/api/analytics', JSON.stringify(metric));
  }

  // Log in development
  if (import.meta.env.DEV) {
    const _emoji =
      metric.rating === 'good' ? '✅' : metric.rating === 'needs-improvement' ? '⚠️' : '❌';
  }
}

/**
 * Monitor Largest Contentful Paint (LCP)
 * Measures when the largest content element becomes visible
 */
export function observeLCP(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as PerformanceEntry & { renderTime: number };

      reportMetric({
        name: 'LCP',
        value: lastEntry.renderTime || lastEntry.startTime,
        rating: getRating(lastEntry.renderTime || lastEntry.startTime, THRESHOLDS.LCP),
        timestamp: Date.now(),
      });
    });

    observer.observe({ entryTypes: ['largest-contentful-paint'] });
  } catch (_e) {
    // PerformanceObserver not supported
  }
}

/**
 * Monitor First Input Delay (FID)
 * Measures the time from when a user first interacts with a page to when the browser responds
 */
export function observeFID(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        const fidEntry = entry as PerformanceEntry & { processingStart: number };
        const fid = fidEntry.processingStart - entry.startTime;

        reportMetric({
          name: 'FID',
          value: fid,
          rating: getRating(fid, THRESHOLDS.FID),
          timestamp: Date.now(),
        });
      });
    });

    observer.observe({ entryTypes: ['first-input'] });
  } catch (_e) {
    // PerformanceObserver not supported
  }
}

/**
 * Monitor Cumulative Layout Shift (CLS)
 * Measures visual stability by tracking unexpected layout shifts
 */
export function observeCLS(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return;
  }

  try {
    let clsValue = 0;
    const clsEntries: PerformanceEntry[] = [];

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        const layoutShift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!layoutShift.hadRecentInput) {
          clsValue += layoutShift.value;
          clsEntries.push(entry);
        }
      });
    });

    observer.observe({ entryTypes: ['layout-shift'] });

    // Report CLS on page hide
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') {
          reportMetric({
            name: 'CLS',
            value: clsValue,
            rating: getRating(clsValue, THRESHOLDS.CLS),
            timestamp: Date.now(),
          });
          observer.disconnect();
        }
      },
      { once: true },
    );
  } catch (_e) {
    // PerformanceObserver not supported
  }
}

/**
 * Monitor First Contentful Paint (FCP)
 * Measures when the first content is painted to the screen
 */
export function observeFCP(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.name === 'first-contentful-paint') {
          reportMetric({
            name: 'FCP',
            value: entry.startTime,
            rating: getRating(entry.startTime, THRESHOLDS.FCP),
            timestamp: Date.now(),
          });
          observer.disconnect();
        }
      });
    });

    observer.observe({ entryTypes: ['paint'] });
  } catch (_e) {
    // PerformanceObserver not supported
  }
}

/**
 * Monitor Time to First Byte (TTFB)
 * Measures the time from navigation start to when the first byte is received
 */
export function observeTTFB(): void {
  if (typeof window === 'undefined' || !window.performance) {
    return;
  }

  try {
    const navigationTiming = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming;

    if (navigationTiming) {
      const ttfb = navigationTiming.responseStart - navigationTiming.requestStart;

      reportMetric({
        name: 'TTFB',
        value: ttfb,
        rating: getRating(ttfb, THRESHOLDS.TTFB),
        timestamp: Date.now(),
      });
    }
  } catch (_e) {
    // Performance API not supported
  }
}

/**
 * Monitor custom component render times
 */
export function measureComponentRender(componentName: string): () => void {
  if (typeof window === 'undefined' || !window.performance) {
    return () => {};
  }

  const startMark = `${componentName}-start`;
  const endMark = `${componentName}-end`;
  const measureName = `${componentName}-render`;

  performance.mark(startMark);

  return () => {
    performance.mark(endMark);
    try {
      performance.measure(measureName, startMark, endMark);
      const _measure = performance.getEntriesByName(measureName)[0];

      if (import.meta.env.DEV) {
      }

      // Clean up marks
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(measureName);
    } catch (_e) {
      // Measurement failed
    }
  };
}

/**
 * Initialize all performance observers
 * Call this once when the app starts
 */
export function initPerformanceMonitoring(): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Only monitor in production or when explicitly enabled
  if (import.meta.env.PROD || import.meta.env.VITE_ENABLE_PERF_MONITORING === 'true') {
    observeLCP();
    observeFID();
    observeCLS();
    observeFCP();
    observeTTFB();
  }
}

/**
 * Get current performance metrics summary
 */
export function getPerformanceSummary(): {
  navigation: PerformanceNavigationTiming | null;
  memory: Performance['memory'];
  resources: PerformanceResourceTiming[];
} {
  if (typeof window === 'undefined' || !window.performance) {
    return { navigation: null, memory: undefined, resources: [] };
  }

  return {
    navigation: performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming,
    memory: (performance as Performance & { memory?: Performance['memory'] }).memory,
    resources: performance.getEntriesByType('resource') as PerformanceResourceTiming[],
  };
}
