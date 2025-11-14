/**
 * Arr Failure Analyzer
 * Analyzes download failures and provides suggestions
 */

interface QueueItem {
  title: string;
  status: string;
  errorMessage?: string;
  downloadId: string;
  protocol: string;
  size: number;
  sizeleft: number;
  timeleft?: string;
  trackedDownloadStatus?: string;
  statusMessages?: unknown[];
}

interface FailureAnalysis {
  type: string;
  shouldRetry: boolean;
  requiresIntervention: boolean;
  suggestedAction: string;
}

export class ArrFailureAnalyzer {
  /**
   * Analyze download failure and provide recommendations
   */
  analyzeFailure(item: QueueItem): FailureAnalysis {
    const errorLower = (item.errorMessage || '').toLowerCase();

    if (errorLower.includes('disk') || errorLower.includes('space')) {
      return {
        type: 'disk_space',
        shouldRetry: false,
        requiresIntervention: true,
        suggestedAction: 'Free up disk space on media or download drive',
      };
    }

    if (errorLower.includes('permission') || errorLower.includes('access denied')) {
      return {
        type: 'permissions',
        shouldRetry: false,
        requiresIntervention: true,
        suggestedAction: 'Check folder permissions and PUID/PGID settings',
      };
    }

    if (errorLower.includes('connection') || errorLower.includes('timeout')) {
      return {
        type: 'connection',
        shouldRetry: true,
        requiresIntervention: false,
        suggestedAction: 'Temporary connection issue, will retry automatically',
      };
    }

    if (errorLower.includes('not found') || errorLower.includes('404')) {
      return {
        type: 'not_found',
        shouldRetry: false,
        requiresIntervention: true,
        suggestedAction: 'Release no longer available, search for alternative',
      };
    }

    return {
      type: 'unknown',
      shouldRetry: false,
      requiresIntervention: true,
      suggestedAction: 'Manual investigation required',
    };
  }

  /**
   * Filter failed items from queue
   */
  getFailedItems(queueItems: QueueItem[]): QueueItem[] {
    return queueItems.filter(
      (i) =>
        i.errorMessage ||
        i.trackedDownloadStatus === 'warning' ||
        i.trackedDownloadStatus === 'error',
    );
  }
}
