@echo off
setlocal enabledelayedexpansion

rem Configuration
set "OUTPUT=license\THIRD-PARTY-NOTICES.md"
set "NODEMODULES=node_modules"

if not exist "%NODEMODULES%" (
  echo Node modules directory "%NODEMODULES%" not found. Run "npm install" first.
  exit /b 1
)

rem Initialize output with header (overwrite)
>"%OUTPUT%" (
  echo # Third-Party Notices
  echo.
  echo This file aggregates NOTICE files provided by dependencies ^(e.g., Apache-2.0^) discovered in "%NODEMODULES%".
  echo.
  echo ---
  echo.
  echo ## Apache-2.0 NOTICE files, if any
)

rem Find NOTICE files recursively
for /r "%NODEMODULES%" %%F in (NOTICE*) do (
  set "FULL=%%~fF"
  rem Derive path after node_modules\
  set "RELNM=!FULL:*node_modules\=!"
  rem Extract first segment, and second if scoped
  for /f "tokens=1-2 delims=\" %%A in ("!RELNM!") do (
    set "SEG1=%%A"
    set "SEG2=%%B"
  )
  if "!SEG1:~0,1!"=="@" (
    set "PKG=!SEG1!\!SEG2!"
  ) else (
    set "PKG=!SEG1!"
  )

  >>"%OUTPUT%" echo.
  >>"%OUTPUT%" echo ### !PKG!
  type "!FULL!" >> "%OUTPUT%"
  >>"%OUTPUT%" echo.
)

echo NOTICE files appended to "%OUTPUT%".
exit /b 0
