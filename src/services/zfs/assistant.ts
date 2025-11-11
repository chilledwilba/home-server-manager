/**
 * ZFS AI Assistant
 * Provides explanations and recommendations for ZFS concepts
 */
export class ZFSAssistant {
  /**
   * Explain ZFS concepts in simple terms
   */
  public explainConcept(concept: string): string {
    const explanations: Record<string, string> = {
      snapshot: `
A ZFS snapshot is like a photograph of your data at a specific moment in time.
It doesn't copy the data, just remembers what it looked like. This means:
- Snapshots are instant and use almost no space initially
- They only grow as you change the original data
- You can go back to any snapshot instantly
For your setup: Your personal data gets hourly snapshots for maximum protection.
      `,
      scrub: `
A ZFS scrub is like a health check for your stored data. It:
- Reads every block of data on the pool
- Verifies checksums to detect corruption
- Automatically repairs errors using redundancy
For your setup: Personal pool scrubs weekly, media monthly.
Your SSDs get TRIM instead to maintain performance.
      `,
      arc: `
ARC (Adaptive Replacement Cache) is ZFS's smart RAM cache. With your 64GB RAM:
- ZFS will use up to ~32GB for caching frequently accessed data
- This makes your system much faster
- The cache automatically adjusts based on system needs
This is why high RAM usage is normal and good with ZFS!
      `,
      compression: `
ZFS compression saves space by encoding data more efficiently:
- lz4 is recommended: fast with 10-50% space savings
- It's transparent - files work normally
- Actually makes things faster (less data to read from disk)
For your setup: Enable lz4 on all pools except already-compressed media.
      `,
      deduplication: `
Deduplication finds identical blocks and stores them once. BUT:
- Requires ~5GB RAM per TB of unique data
- Causes significant performance impact
- Your media files won't deduplicate well
Recommendation: Don't enable it. Use compression instead.
      `,
      resilver: `
Resilvering is ZFS rebuilding data after a disk failure or replacement:
- Reads all data from good disks
- Reconstructs missing data
- Writes to the new disk
Your personal pool (mirror) can resilver quickly and safely.
      `,
      raidz: `
RAIDZ is ZFS's improved RAID with better data protection:
- RAIDZ1 = 1 disk redundancy (like RAID5)
- RAIDZ2 = 2 disk redundancy (like RAID6)
- Better than traditional RAID due to checksums
Your setup uses mirrors for personal data (fastest, most redundant).
      `,
      mirror: `
A ZFS mirror duplicates every write to multiple disks:
- Your personal pool uses a 2-disk mirror (2x4TB)
- Can survive loss of one disk without data loss
- Fastest redundancy option for reads and writes
- Perfect for critical data that needs high performance
      `,
      pool: `
A ZFS pool is a collection of storage devices that work together:
- You have 3 pools: personal (mirror), media (single), apps (NVMe)
- Pools can be expanded by adding disks
- Each pool has its own settings and characteristics
- Snapshots and datasets exist within pools
      `,
    };

    const result = explanations[concept.toLowerCase()];
    if (result) {
      return result.trim();
    }

    return `Concept "${concept}" not found. Available concepts: ${Object.keys(explanations).join(', ')}`;
  }

  /**
   * Provide recommendations based on pool configuration
   */
  public getPoolRecommendations(poolConfig: {
    name: string;
    capacity?: { percent: number };
  }): string[] {
    const recommendations: string[] = [];

    // Check personal pool (2x4TB mirror)
    if (poolConfig.name === 'personal') {
      recommendations.push(
        '✅ Mirror configuration is excellent for critical data',
        '✅ Hourly snapshots provide excellent recovery points',
        '💡 Consider off-site backup for disaster recovery',
      );
    }

    // Check media pool (single 8TB)
    if (poolConfig.name === 'media') {
      recommendations.push(
        '⚠️ Single disk has no redundancy',
        '💡 Your media can be re-downloaded if lost',
        '✅ Daily snapshots are appropriate for media',
      );
    }

    // Check apps pool (1TB NVMe)
    if (poolConfig.name === 'apps') {
      recommendations.push(
        '✅ NVMe provides excellent performance for Docker',
        '💡 Enable autotrim for long-term SSD health',
        '✅ Daily snapshots protect against container issues',
      );
    }

    // General recommendations
    if (poolConfig.capacity && poolConfig.capacity.percent > 80) {
      recommendations.push(
        `⚠️ Pool is ${poolConfig.capacity.percent}% full`,
        '💡 ZFS performance degrades above 80% capacity',
        '🔧 Consider expanding the pool or cleaning old data',
      );
    }

    return recommendations;
  }

  /**
   * Diagnose pool issues
   */
  public async diagnoseIssue(
    issue: string,
    poolData: { name: string; capacity: { percent: number } },
    systemData: { memory: { arc: number } },
  ): Promise<string> {
    if (issue.toLowerCase().includes('slow')) {
      if (poolData.capacity.percent > 80) {
        return `
Your ${poolData.name} pool is ${poolData.capacity.percent}% full.
ZFS performance significantly degrades above 80% capacity.

Solutions:
1. Delete unnecessary snapshots
2. Remove old data
3. Add more drives to expand the pool

Immediate action: Check snapshot usage with 'zfs list -t snapshot'
        `.trim();
      }

      const arcGB = systemData.memory.arc / (1024 * 1024 * 1024);
      if (arcGB < 10) {
        return `
Your ARC cache is only ${arcGB.toFixed(1)}GB.
With 64GB RAM, it should be much larger.

This might indicate:
1. ARC is limited: Check 'arc_max' setting
2. Memory pressure from applications
3. Recent reboot (ARC needs time to warm up)

Check ARC stats with: arc_summary
        `.trim();
      }
    }

    if (issue.toLowerCase().includes('snapshot')) {
      return `
Snapshot Management Tips:

Current snapshots are consuming space. To check:
- List all snapshots: zfs list -t snapshot
- Check space used: zfs list -o space

To clean old snapshots:
- Delete specific: zfs destroy pool@snapshot
- Delete range: zfs destroy pool@snap1%snap2

Your retention policy will automatically clean old snapshots.
      `.trim();
    }

    return 'Please provide more specific information about the issue.';
  }

  /**
   * Get best practices for the user's setup
   */
  public getBestPractices(): Array<{
    category: string;
    practice: string;
    reason: string;
  }> {
    return [
      {
        category: 'Snapshots',
        practice: 'Hourly snapshots on personal pool',
        reason: 'Critical data needs frequent recovery points',
      },
      {
        category: 'Scrubs',
        practice: 'Weekly scrubs on personal, monthly on media',
        reason: 'Detects and repairs silent corruption before data loss',
      },
      {
        category: 'Capacity',
        practice: 'Keep pools under 80% full',
        reason: 'ZFS performance degrades significantly above 80%',
      },
      {
        category: 'Compression',
        practice: 'Enable lz4 compression',
        reason: 'Free space savings with no performance cost',
      },
      {
        category: 'ARC',
        practice: 'Allow ZFS to use ~50% of RAM for ARC',
        reason: 'Dramatically improves read performance',
      },
      {
        category: 'Backups',
        practice: 'Regular backups to external storage',
        reason: 'Protects against pool failure and ransomware',
      },
    ];
  }
}
