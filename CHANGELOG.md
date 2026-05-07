# Changelog

## [0.0.12] - 2026-05-07
### Fixed
- Email date fallback from Date header when parsed.date is null (1970 date bug)
- check-update now runs in Node.js inside container (no more bash dependency)
- Missing DB columns for fresh installations

## [0.0.11] - 2026-05-07
### Fixed
- Missing columns in init.sql (compressed_size_bytes, is_deleted, is_restored, av_status)
- Copy button works on HTTP
- Installer base/advanced mode with Docker volumes creation

## [0.0.10] - 2026-05-06
### Added
- Password strength indicator and generator
- Password policy validation backend and frontend
