# Error Codes Reference

This document provides a comprehensive reference for all error codes used in the Home Server Manager application.

## Error Code Structure

Error codes follow the format: `ERR_<DOMAIN>_<CODE>`

Where:

- **DOMAIN**: The system component (INTERNAL, TRUENAS, PORTAINER, ZFS, etc.)
- **CODE**: A unique 4-digit numeric identifier within that domain

## Error Severity Levels

| Severity   | Description                 | Impact                                     |
| ---------- | --------------------------- | ------------------------------------------ |
| `CRITICAL` | System down, data loss risk | Immediate action required                  |
| `HIGH`     | Major functionality broken  | Action required soon                       |
| `MEDIUM`   | Feature degraded            | Should be addressed                        |
| `LOW`      | Minor issue                 | Can be addressed during normal maintenance |

## Error Code Ranges

| Range     | Domain           | Description                 |
| --------- | ---------------- | --------------------------- |
| 1000-1999 | System           | Internal system errors      |
| 2000-2999 | TrueNAS          | TrueNAS integration errors  |
| 3000-3999 | Docker/Portainer | Container management errors |
| 4000-4999 | ZFS              | ZFS operations errors       |
| 5000-5999 | Validation       | Input validation errors     |
| 6000-6999 | Authentication   | Auth/authorization errors   |
| 7000-7999 | Resource         | Resource management errors  |
| 8000-8999 | External         | External service errors     |
| 9000-9999 | Security         | Security-related errors     |

---

## System Errors (1000-1999)

### ERR_INTERNAL_1000

- **Name**: Internal Error
- **HTTP Status**: 500
- **Severity**: CRITICAL
- **Recoverable**: No
- **Description**: An unexpected internal error occurred
- **Recovery**: Contact system administrator
- **Common Causes**:
  - Unhandled exceptions
  - Unexpected system state
  - Programming errors

### ERR_DATABASE_1001

- **Name**: Database Error
- **HTTP Status**: 500
- **Severity**: CRITICAL
- **Recoverable**: No
- **Description**: Database operation failed
- **Recovery**: Check database connectivity and integrity
- **Common Causes**:
  - Database connection lost
  - Disk full
  - Corrupted database file
  - Lock timeout

### ERR_CONFIG_1002

- **Name**: Configuration Error
- **HTTP Status**: 500
- **Severity**: HIGH
- **Recoverable**: No
- **Description**: Invalid or missing configuration
- **Recovery**: Review and fix configuration files
- **Common Causes**:
  - Missing required environment variables
  - Invalid configuration values
  - Missing configuration files

### ERR_INIT_1003

- **Name**: Initialization Error
- **HTTP Status**: 500
- **Severity**: CRITICAL
- **Recoverable**: No
- **Description**: Service initialization failed
- **Recovery**: Check logs and restart service
- **Common Causes**:
  - Failed service dependencies
  - Invalid initialization parameters
  - Resource unavailability

---

## TrueNAS Errors (2000-2999)

### ERR_TRUENAS_2000

- **Name**: TrueNAS Connection Failed
- **HTTP Status**: 502
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: Failed to connect to TrueNAS API
- **Recovery**: Check TrueNAS API connection and credentials
- **Common Causes**:
  - TrueNAS server unreachable
  - Network issues
  - Firewall blocking connection
  - Invalid API URL

### ERR_TRUENAS_2001

- **Name**: TrueNAS Authentication Failed
- **HTTP Status**: 502
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: TrueNAS API authentication failed
- **Recovery**: Verify API key/credentials
- **Common Causes**:
  - Invalid API key
  - Expired credentials
  - Insufficient permissions

### ERR_TRUENAS_2002

- **Name**: TrueNAS Pool Not Found
- **HTTP Status**: 404
- **Severity**: MEDIUM
- **Recoverable**: Yes
- **Description**: Requested ZFS pool does not exist
- **Recovery**: Verify pool name
- **Common Causes**:
  - Typo in pool name
  - Pool was deleted
  - Pool not imported

### ERR_TRUENAS_2003

- **Name**: TrueNAS API Error
- **HTTP Status**: 502
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: TrueNAS API returned an error
- **Recovery**: Check TrueNAS API connection and credentials
- **Common Causes**:
  - Invalid API request
  - TrueNAS internal error
  - API version mismatch

### ERR_TRUENAS_2004

- **Name**: TrueNAS Timeout
- **HTTP Status**: 504
- **Severity**: MEDIUM
- **Recoverable**: Yes
- **Description**: TrueNAS API request timed out
- **Recovery**: Check network connectivity and TrueNAS performance
- **Common Causes**:
  - Slow network
  - TrueNAS under heavy load
  - Long-running operation

---

## Docker/Portainer Errors (3000-3999)

### ERR_PORTAINER_3000

- **Name**: Portainer Connection Failed
- **HTTP Status**: 502
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: Failed to connect to Portainer API
- **Recovery**: Check Portainer/Docker API connection and credentials
- **Common Causes**:
  - Portainer server unreachable
  - Network issues
  - Docker daemon not running

### ERR_PORTAINER_3001

- **Name**: Portainer Authentication Failed
- **HTTP Status**: 502
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: Portainer API authentication failed
- **Recovery**: Verify API credentials
- **Common Causes**:
  - Invalid API token
  - Expired credentials
  - Insufficient permissions

### ERR_CONTAINER_3002

- **Name**: Container Not Found
- **HTTP Status**: 404
- **Severity**: MEDIUM
- **Recoverable**: Yes
- **Description**: Requested container does not exist
- **Recovery**: Verify container ID or name
- **Common Causes**:
  - Typo in container name
  - Container was removed
  - Wrong Docker host

### ERR_CONTAINER_3003

- **Name**: Container Start Failed
- **HTTP Status**: 500
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: Failed to start container
- **Recovery**: Check container logs and configuration
- **Common Causes**:
  - Port already in use
  - Volume mount issues
  - Insufficient resources
  - Image not found

### ERR_CONTAINER_3004

- **Name**: Container Stop Failed
- **HTTP Status**: 500
- **Severity**: MEDIUM
- **Recoverable**: Yes
- **Description**: Failed to stop container
- **Recovery**: Try force stop or check container status
- **Common Causes**:
  - Container already stopped
  - Container frozen/unresponsive
  - Docker daemon issues

### ERR_DOCKER_3005

- **Name**: Docker API Error
- **HTTP Status**: 502
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: Docker API returned an error
- **Recovery**: Check Portainer/Docker API connection and credentials
- **Common Causes**:
  - Invalid API request
  - Docker daemon error
  - API version mismatch

---

## ZFS Errors (4000-4999)

### ERR_ZFS_4000

- **Name**: ZFS Snapshot Failed
- **HTTP Status**: 500
- **Severity**: HIGH
- **Recoverable**: No
- **Description**: Failed to create ZFS snapshot
- **Recovery**: Check ZFS pool status and system logs
- **Common Causes**:
  - Insufficient space
  - Pool in degraded state
  - Permission issues
  - Snapshot name conflict

### ERR_ZFS_4001

- **Name**: ZFS Scrub Failed
- **HTTP Status**: 500
- **Severity**: HIGH
- **Recoverable**: No
- **Description**: ZFS scrub operation failed
- **Recovery**: Check ZFS pool health
- **Common Causes**:
  - Pool degraded
  - Disk errors
  - Scrub already running

### ERR_ZFS_4002

- **Name**: ZFS Pool Degraded
- **HTTP Status**: 500
- **Severity**: HIGH
- **Recoverable**: No
- **Description**: ZFS pool is in degraded state
- **Recovery**: Check pool status and replace failed disks
- **Common Causes**:
  - Failed disk
  - Multiple disk errors
  - Hardware issues

### ERR_ZFS_4003

- **Name**: ZFS Dataset Not Found
- **HTTP Status**: 404
- **Severity**: MEDIUM
- **Recoverable**: Yes
- **Description**: Requested ZFS dataset does not exist
- **Recovery**: Verify dataset name
- **Common Causes**:
  - Typo in dataset name
  - Dataset was deleted
  - Dataset not mounted

### ERR_ZFS_4004

- **Name**: ZFS Operation Failed
- **HTTP Status**: 500
- **Severity**: HIGH
- **Recoverable**: No
- **Description**: General ZFS operation failed
- **Recovery**: Check ZFS pool status and system logs
- **Common Causes**:
  - Various ZFS errors
  - Permission issues
  - Resource constraints

---

## Validation Errors (5000-5999)

### ERR_VALIDATION_5000

- **Name**: Validation Error
- **HTTP Status**: 400
- **Severity**: LOW
- **Recoverable**: Yes
- **Description**: Request validation failed
- **Recovery**: Check the request format and ensure all required fields are provided
- **Common Causes**:
  - Missing required fields
  - Invalid data types
  - Schema validation failure

### ERR_VALIDATION_5001

- **Name**: Invalid Input
- **HTTP Status**: 400
- **Severity**: LOW
- **Recoverable**: Yes
- **Description**: Input data is invalid
- **Recovery**: Provide valid input data
- **Common Causes**:
  - Invalid format
  - Out of range values
  - Unsupported characters

### ERR_VALIDATION_5002

- **Name**: Missing Required Field
- **HTTP Status**: 400
- **Severity**: LOW
- **Recoverable**: Yes
- **Description**: Required field is missing
- **Recovery**: Include all required fields
- **Common Causes**:
  - Incomplete request body
  - Missing query parameters
  - Empty required fields

### ERR_VALIDATION_5003

- **Name**: Invalid Format
- **HTTP Status**: 400
- **Severity**: LOW
- **Recoverable**: Yes
- **Description**: Data format is invalid
- **Recovery**: Use correct format
- **Common Causes**:
  - Invalid date format
  - Invalid email format
  - Invalid URL format

### ERR_VALIDATION_5004

- **Name**: Schema Validation Failed
- **HTTP Status**: 400
- **Severity**: LOW
- **Recoverable**: Yes
- **Description**: Data does not match schema
- **Recovery**: Ensure data matches expected schema
- **Common Causes**:
  - Type mismatch
  - Additional properties not allowed
  - Constraint violations

---

## Authentication/Authorization Errors (6000-6999)

### ERR_AUTH_6000

- **Name**: Unauthorized
- **HTTP Status**: 401
- **Severity**: MEDIUM
- **Recoverable**: Yes
- **Description**: Authentication required
- **Recovery**: Provide valid authentication credentials
- **Common Causes**:
  - Missing credentials
  - Invalid credentials
  - Session expired

### ERR_AUTH_6001

- **Name**: Forbidden
- **HTTP Status**: 403
- **Severity**: MEDIUM
- **Recoverable**: No
- **Description**: Insufficient permissions
- **Recovery**: Contact your administrator to request necessary permissions
- **Common Causes**:
  - Insufficient role/permissions
  - Resource access denied
  - IP address blocked

### ERR_AUTH_6002

- **Name**: Invalid API Key
- **HTTP Status**: 401
- **Severity**: MEDIUM
- **Recoverable**: Yes
- **Description**: API key is invalid
- **Recovery**: Provide valid API key
- **Common Causes**:
  - Wrong API key
  - Revoked API key
  - Expired API key

### ERR_AUTH_6003

- **Name**: Token Expired
- **HTTP Status**: 401
- **Severity**: MEDIUM
- **Recoverable**: Yes
- **Description**: Authentication token has expired
- **Recovery**: Refresh token or re-authenticate
- **Common Causes**:
  - Token TTL exceeded
  - Clock skew
  - Token revoked

### ERR_AUTH_6004

- **Name**: Insufficient Permissions
- **HTTP Status**: 403
- **Severity**: MEDIUM
- **Recoverable**: No
- **Description**: User lacks required permissions
- **Recovery**: Request necessary permissions from administrator
- **Common Causes**:
  - Missing role assignment
  - Resource-level permissions
  - Organization access

---

## Resource Errors (7000-7999)

### ERR_RESOURCE_7000

- **Name**: Not Found
- **HTTP Status**: 404
- **Severity**: LOW
- **Recoverable**: Yes
- **Description**: Resource not found
- **Recovery**: Verify the resource identifier and try again
- **Common Causes**:
  - Invalid ID
  - Resource deleted
  - Wrong endpoint

### ERR_RESOURCE_7001

- **Name**: Already Exists
- **HTTP Status**: 409
- **Severity**: MEDIUM
- **Recoverable**: Yes
- **Description**: Resource already exists
- **Recovery**: Use different identifier or update existing resource
- **Common Causes**:
  - Duplicate name
  - Unique constraint violation
  - Race condition

### ERR_RESOURCE_7002

- **Name**: Conflict
- **HTTP Status**: 409
- **Severity**: MEDIUM
- **Recoverable**: Yes
- **Description**: Resource state conflict
- **Recovery**: The resource already exists or conflicts with the current state
- **Common Causes**:
  - Concurrent modifications
  - State transition violation
  - Business rule violation

---

## External Service Errors (8000-8999)

### ERR_EXTERNAL_8000

- **Name**: External Service Error
- **HTTP Status**: 502
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: External service failed
- **Recovery**: Check external service connectivity
- **Common Causes**:
  - Service down
  - Network issues
  - API rate limiting
  - Invalid response

### ERR_EXTERNAL_8001

- **Name**: Service Unavailable
- **HTTP Status**: 503
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: Service temporarily unavailable
- **Recovery**: The service is temporarily unavailable, please try again later
- **Common Causes**:
  - Maintenance window
  - Circuit breaker open
  - Overloaded service
  - Deployment in progress

### ERR_EXTERNAL_8002

- **Name**: Timeout
- **HTTP Status**: 504
- **Severity**: MEDIUM
- **Recoverable**: Yes
- **Description**: Request timeout
- **Recovery**: Try again or increase timeout
- **Common Causes**:
  - Slow network
  - Overloaded service
  - Long-running operation
  - Network congestion

### ERR_EXTERNAL_8003

- **Name**: Rate Limit Exceeded
- **HTTP Status**: 429
- **Severity**: LOW
- **Recoverable**: Yes
- **Description**: Too many requests
- **Recovery**: Reduce request rate and try again
- **Common Causes**:
  - Too many requests
  - API quota exceeded
  - Burst limit reached

---

## Security Errors (9000-9999)

### ERR_SECURITY_9000

- **Name**: Security Scan Failed
- **HTTP Status**: 500
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: Security scan operation failed
- **Recovery**: Review security configuration and logs
- **Common Causes**:
  - Scanner unavailable
  - Invalid scan configuration
  - Scan timeout

### ERR_SECURITY_9001

- **Name**: Fail2ban Error
- **HTTP Status**: 500
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: Fail2ban operation failed
- **Recovery**: Check Fail2ban configuration and status
- **Common Causes**:
  - Fail2ban not running
  - Invalid configuration
  - Permission issues

### ERR_SECURITY_9002

- **Name**: Tunnel Error
- **HTTP Status**: 500
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: Cloudflare Tunnel operation failed
- **Recovery**: Check tunnel configuration and connectivity
- **Common Causes**:
  - Tunnel not connected
  - Invalid configuration
  - Network issues

### ERR_SECURITY_9003

- **Name**: Vulnerability Detected
- **HTTP Status**: 500
- **Severity**: HIGH
- **Recoverable**: Yes
- **Description**: Security vulnerability detected
- **Recovery**: Review security scan results and remediate
- **Common Causes**:
  - Insecure configuration
  - Outdated software
  - Security misconfiguration

---

## Troubleshooting Guide

### General Steps

1. **Check Error Code**: Identify the error code and refer to this document
2. **Review Severity**: Determine urgency based on severity level
3. **Check Recoverability**: Determine if user action can resolve the issue
4. **Follow Recovery Suggestion**: Apply the recommended recovery steps
5. **Check Logs**: Review application logs for detailed context
6. **Monitor Metrics**: Check Prometheus metrics for error patterns

### Common Issues

#### Database Errors

- Verify database file permissions
- Check available disk space
- Verify database is not corrupted
- Check for locked transactions

#### External Service Errors

- Verify service is running
- Check network connectivity
- Verify credentials are valid
- Check for rate limiting

#### Authentication Errors

- Verify credentials are correct
- Check token expiration
- Verify user has required permissions
- Check API key validity

### Monitoring Error Metrics

Error metrics are available via Prometheus at `/metrics`:

- `app_errors_total` - Total errors by code and severity
- `app_errors_by_severity_total` - Errors grouped by severity
- `app_errors_by_domain_total` - Errors grouped by domain
- `app_errors_by_recoverability_total` - Recoverable vs non-recoverable
- `app_error_handling_duration_seconds` - Error handling latency

### Getting Help

If you encounter an error that:

- Is not documented here
- Persists after following recovery steps
- Has CRITICAL or HIGH severity

Contact your system administrator with:

- Error code
- Correlation ID (from error response)
- Timestamp
- Request details (method, path, parameters)
- Any relevant logs or screenshots
