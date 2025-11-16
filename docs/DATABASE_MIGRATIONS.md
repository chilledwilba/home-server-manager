# Database Migration Guide

## Overview

This document describes the database migration system for the Home Server Manager. The system provides safe, tracked, and reversible database schema changes with automatic backups.

## Features

- ✅ **Versioned Migrations**: Track all schema changes with version numbers
- ✅ **Automatic Backups**: Create backups before applying migrations
- ✅ **Rollback Support**: Safely rollback migrations to any previous version
- ✅ **Transaction Safety**: All migrations run in transactions
- ✅ **Integrity Checks**: Verify database integrity before and after migrations
- ✅ **Migration History**: Track all migration attempts with success/failure status
- ✅ **Dry Run Mode**: Preview migrations without applying them

## Quick Start

### Check Migration Status

```bash
tsx scripts/migrate.ts status
```

This shows:
- Current database version
- Applied migrations
- Pending migrations
- Recent migration history
- Available backups

### Apply Migrations

```bash
# Apply all pending migrations
tsx scripts/migrate.ts up

# Apply migrations up to specific version
tsx scripts/migrate.ts up 3

# Preview migrations without applying (dry run)
tsx scripts/migrate.ts up dry-run
```

### Rollback Migrations

```bash
# Rollback one migration
tsx scripts/migrate.ts down

# Rollback to specific version
tsx scripts/migrate.ts down 2
```

### Restore from Backup

```bash
# List available backups
tsx scripts/restore.ts

# Restore specific backup
tsx scripts/restore.ts ./data/backups/monitor.db.backup-2024-01-01T12-00-00-000Z
```

## Migration Structure

Migrations are defined in `scripts/migrate.ts`:

```typescript
const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    description: 'Create initial database schema',
    up: (db: Database.Database) => {
      // Apply migration
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        );
      `);
    },
    down: (db: Database.Database) => {
      // Rollback migration
      db.exec('DROP TABLE users');
    },
  },
  // Add more migrations here
];
```

## Best Practices

### Writing Migrations

1. **Always provide both `up` and `down`**
   ```typescript
   {
     version: 2,
     name: 'add_email_column',
     description: 'Add email column to users table',
     up: (db) => {
       db.exec('ALTER TABLE users ADD COLUMN email TEXT');
     },
     down: (db) => {
       // SQLite doesn't support DROP COLUMN directly
       // Use table recreation approach
       db.exec(`
         CREATE TABLE users_new (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           name TEXT NOT NULL
         );
         INSERT INTO users_new (id, name) SELECT id, name FROM users;
         DROP TABLE users;
         ALTER TABLE users_new RENAME TO users;
       `);
     },
   }
   ```

2. **Use transactions for multi-step migrations**
   - The system automatically wraps migrations in transactions
   - If any step fails, the entire migration is rolled back

3. **Test migrations thoroughly**
   ```bash
   # Always test in dry-run mode first
   tsx scripts/migrate.ts up dry-run

   # Apply to test database
   DATABASE_PATH=./data/test.db tsx scripts/migrate.ts up

   # Test rollback
   DATABASE_PATH=./data/test.db tsx scripts/migrate.ts down
   ```

4. **Include data migrations when needed**
   ```typescript
   {
     version: 3,
     name: 'normalize_email_addresses',
     description: 'Convert all email addresses to lowercase',
     up: (db) => {
       db.exec(`
         UPDATE users SET email = LOWER(email) WHERE email IS NOT NULL;
       `);
     },
     down: (db) => {
       // Data migrations may not be reversible
       // Document this in the description
       throw new Error('Cannot reverse data normalization');
     },
   }
   ```

### Production Workflow

1. **Before Deploying**
   ```bash
   # Check current status
   tsx scripts/migrate.ts status

   # Preview migrations
   tsx scripts/migrate.ts up dry-run

   # Verify backups are configured
   ls -lh ./data/backups/
   ```

2. **During Deployment**
   ```bash
   # Migrations run automatically with backup
   tsx scripts/migrate.ts up
   ```

3. **If Migration Fails**
   ```bash
   # Check migration history for errors
   tsx scripts/migrate.ts status

   # Restore from backup if needed
   tsx scripts/restore.ts ./data/backups/[latest-backup]

   # Fix migration code and retry
   tsx scripts/migrate.ts up
   ```

4. **Rolling Back**
   ```bash
   # Rollback one version
   tsx scripts/migrate.ts down

   # Or rollback to specific version
   tsx scripts/migrate.ts down 5
   ```

## Database Tables

### migrations

Tracks applied migrations:

```sql
CREATE TABLE migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  applied_at TEXT NOT NULL,
  rolled_back_at TEXT,
  backup_path TEXT,
  status TEXT NOT NULL DEFAULT 'applied',
  error_message TEXT
);
```

Fields:
- `version`: Migration version number (sequential)
- `name`: Short name for the migration
- `description`: Detailed description
- `applied_at`: When the migration was applied
- `rolled_back_at`: When it was rolled back (if applicable)
- `backup_path`: Path to backup created before this migration
- `status`: `applied` or `rolled_back`
- `error_message`: Error if migration failed

### migration_history

Tracks all migration attempts (successes and failures):

```sql
CREATE TABLE migration_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  backup_path TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
```

Fields:
- `version`: Migration version
- `direction`: `up` or `down`
- `status`: `running`, `success`, or `failed`
- `backup_path`: Associated backup
- `error_message`: Error details if failed
- `started_at`: When attempt started
- `completed_at`: When it finished

## Backup System

### Automatic Backups

Backups are created automatically before migrations:

- Stored in `./data/backups/`
- Filename format: `monitor.db.backup-2024-01-01T12-00-00-000Z`
- Includes WAL and SHM files if present
- Keeps last 10 backups (configurable)
- Old backups are automatically cleaned up

### Manual Backup

```typescript
import { createBackup } from './src/db/backup.js';

const result = createBackup('./data/monitor.db', {
  maxBackups: 10,
  backupDir: './data/backups',
});

if (result.success) {
  console.log(`Backup created: ${result.backupPath}`);
} else {
  console.error(`Backup failed: ${result.error}`);
}
```

### Restore Process

```bash
# List backups
tsx scripts/restore.ts

# Restore specific backup
tsx scripts/restore.ts ./data/backups/monitor.db.backup-2024-01-01T12-00-00-000Z
```

⚠️ **Warning**: Restoring overwrites the current database!

## Environment Variables

- `DATABASE_PATH`: Path to database file (default: `./data/home-server-monitor.db`)

```bash
# Use custom database path
DATABASE_PATH=/var/lib/monitor/db.sqlite tsx scripts/migrate.ts status
```

## Integrity Checks

The system automatically verifies database integrity:

1. **Before Migration**
   - Runs `PRAGMA integrity_check`
   - Checks foreign key constraints
   - Verifies migrations table exists

2. **After Migration**
   - Runs integrity check again
   - Ensures database is in valid state
   - Alerts if any issues found

## Common Scenarios

### Adding a New Table

```typescript
{
  version: 4,
  name: 'add_sessions_table',
  description: 'Create sessions table for user authentication',
  up: (db) => {
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);
    `);
  },
  down: (db) => {
    db.exec('DROP TABLE sessions');
  },
}
```

### Adding a Column

```typescript
{
  version: 5,
  name: 'add_user_role',
  description: 'Add role column to users table',
  up: (db) => {
    db.exec(`
      ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
    `);
  },
  down: (db) => {
    // SQLite doesn't support DROP COLUMN
    // Recreate table without the column
    db.exec(`
      CREATE TABLE users_backup AS SELECT id, name, email FROM users;
      DROP TABLE users;
      ALTER TABLE users_backup RENAME TO users;
    `);
  },
}
```

### Creating Indexes

```typescript
{
  version: 6,
  name: 'add_performance_indexes',
  description: 'Add indexes for query performance',
  up: (db) => {
    db.exec(`
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);
    `);
  },
  down: (db) => {
    db.exec(`
      DROP INDEX idx_users_email;
      DROP INDEX idx_sessions_expires;
    `);
  },
}
```

### Data Migration

```typescript
{
  version: 7,
  name: 'migrate_legacy_data',
  description: 'Convert legacy data format to new schema',
  up: (db) => {
    // Complex data transformation
    const legacyRecords = db.prepare('SELECT * FROM legacy_table').all();

    for (const record of legacyRecords) {
      db.prepare(`
        INSERT INTO new_table (id, transformed_data)
        VALUES (?, ?)
      `).run(record.id, transformData(record.data));
    }

    db.exec('DROP TABLE legacy_table');
  },
  down: (db) => {
    throw new Error('Cannot reverse data migration from version 7');
  },
}
```

## Troubleshooting

### Migration Fails Mid-Application

**Problem**: Migration fails after some steps
**Solution**: Migrations run in transactions, so partial changes are automatically rolled back

```bash
# Check status to see the error
tsx scripts/migrate.ts status

# Fix the migration code
# Then retry
tsx scripts/migrate.ts up
```

### Database Corruption

**Problem**: Database integrity check fails
**Solution**: Restore from latest backup

```bash
# List available backups
tsx scripts/restore.ts

# Restore the most recent backup
tsx scripts/restore.ts ./data/backups/monitor.db.backup-[timestamp]

# Verify integrity
DATABASE_PATH=./data/monitor.db tsx scripts/migrate.ts status
```

### Can't Rollback Data Migration

**Problem**: Data transformation is not reversible
**Solution**: Document in migration and rely on backups

```typescript
{
  version: 8,
  name: 'irreversible_data_change',
  description: 'IRREVERSIBLE: Converts data to new format',
  down: (db) => {
    throw new Error(
      'Cannot rollback this migration. Restore from backup if needed.'
    );
  },
}
```

### Out of Disk Space During Migration

**Problem**: Not enough space for backup
**Solution**: Clean old backups or adjust maxBackups

```bash
# Manually clean old backups
rm ./data/backups/monitor.db.backup-[old-timestamp]*

# Or modify maxBackups in migration code
```

## Testing Migrations

### Unit Tests

Tests are located in:
- `tests/unit/db/backup.test.ts` - Backup system tests
- `tests/integration/db/migrations.test.ts` - Migration system tests

```bash
# Run migration tests
pnpm test tests/unit/db/backup.test.ts
pnpm test tests/integration/db/migrations.test.ts
```

### Integration Testing

1. **Test on Copy of Production Data**
   ```bash
   cp ./data/monitor.db ./data/test.db
   DATABASE_PATH=./data/test.db tsx scripts/migrate.ts up
   ```

2. **Test Rollback**
   ```bash
   DATABASE_PATH=./data/test.db tsx scripts/migrate.ts down
   ```

3. **Verify Data Integrity**
   ```bash
   DATABASE_PATH=./data/test.db tsx scripts/migrate.ts status
   ```

## Security Considerations

1. **Backup Permissions**: Ensure backup directory is properly secured
   ```bash
   chmod 700 ./data/backups
   ```

2. **Database Permissions**: Restrict database file access
   ```bash
   chmod 600 ./data/monitor.db
   ```

3. **Migration Code Review**: Always review migration code before applying to production

4. **Backup Retention**: Configure appropriate backup retention based on disk space

## Performance Tips

1. **Large Tables**: Use batch operations for data migrations
   ```typescript
   // Instead of individual inserts
   db.prepare('INSERT INTO table VALUES (?)').run(value);

   // Use transactions with batches
   const insert = db.prepare('INSERT INTO table VALUES (?)');
   const insertMany = db.transaction((items) => {
     for (const item of items) insert.run(item);
   });
   insertMany(items);
   ```

2. **Indexes**: Create indexes AFTER bulk data insertion

3. **WAL Mode**: Database already uses WAL mode for better concurrency

## Monitoring and Alerting

Monitor migration health:

```bash
# Check recent migration history
tsx scripts/migrate.ts status

# Look for failed migrations in logs
grep "failed" ./logs/migration.log
```

Consider setting up alerts for:
- Failed migrations
- Low disk space before backup
- Long-running migrations

## References

- [SQLite Migration Best Practices](https://sqlite.org/lang_altertable.html)
- [Database Transaction Safety](https://sqlite.org/atomiccommit.html)
- [WAL Mode](https://sqlite.org/wal.html)

---

**Last Updated**: 2025-11-16
**Version**: 1.0
