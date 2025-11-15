#!/bin/bash
# Database backup script
# Backs up the SQLite database with timestamp and maintains retention

set -e  # Exit on error

# Configuration
BACKUP_DIR="./data/backups"
DB_FILE="./data/home-server-monitor.db"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup-$TIMESTAMP.db"
KEEP_BACKUPS=7  # Keep last 7 backups

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database file exists
if [ ! -f "$DB_FILE" ]; then
    echo -e "${YELLOW}⚠️  Database file not found: $DB_FILE${NC}"
    echo "Nothing to backup."
    exit 0
fi

# Create backup
echo "📦 Backing up database..."
cp "$DB_FILE" "$BACKUP_FILE"

# Verify backup
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Database backed up successfully${NC}"
    echo "   Location: $BACKUP_FILE"
    echo "   Size: $BACKUP_SIZE"
else
    echo "❌ Backup failed!"
    exit 1
fi

# Clean up old backups (keep only last N backups)
echo ""
echo "🧹 Cleaning up old backups (keeping $KEEP_BACKUPS most recent)..."
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup-*.db 2>/dev/null | wc -l | tr -d ' ')

if [ "$BACKUP_COUNT" -gt "$KEEP_BACKUPS" ]; then
    # Delete old backups
    ls -t "$BACKUP_DIR"/backup-*.db | tail -n +$((KEEP_BACKUPS + 1)) | xargs rm -f
    DELETED=$((BACKUP_COUNT - KEEP_BACKUPS))
    echo -e "${GREEN}✅ Removed $DELETED old backup(s)${NC}"
else
    echo "   No old backups to remove (total: $BACKUP_COUNT)"
fi

# Show remaining backups
echo ""
echo "📊 Current backups:"
ls -lh "$BACKUP_DIR"/backup-*.db 2>/dev/null | awk '{print "   " $9 " (" $5 ")"}'

echo ""
echo -e "${GREEN}✅ Backup complete!${NC}"
