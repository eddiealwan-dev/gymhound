@echo off
rem Runs scripts\phone-check.ps1 without changing PowerShell's script policy. See that file.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0phone-check.ps1" %*
