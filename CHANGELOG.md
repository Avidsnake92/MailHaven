# Changelog

## [0.0.11] - 2026-05-07
### Fixed
- Missing columns in init.sql for fresh installations (compressed_size_bytes, is_deleted, is_restored, av_status)
- Copy button works on HTTP (not only HTTPS)
- Installer default mode with automatic configuration
- Installer creates Docker volumes before startup

## [0.0.10] - 2026-05-06
### Added
- Password strength indicator (weak/medium/strong bar)
- Automatic password generator button
- Show/hide password toggle
- Password policy validation (min 8 chars, uppercase, number, special char)

## [0.0.9] - 2026-05-06
### Added
- Block UI during update to prevent navigation and crashes
- Automatic check-update every 30 minutes in background
### Fixed
- Post-update git-status alignment with 30s delay
