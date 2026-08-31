@echo off
REM ------------------------------------------------------------------
REM  Deploy ONLY the iApply Prime Institutions app.
REM  Works inside this folder only: D:\Devloment\Iapply website\iapply-prime-app
REM  It never touches any other project, repo or Vercel deployment.
REM ------------------------------------------------------------------
setlocal
cd /d "%~dp0"

echo.
echo === iApply Prime Institutions - deploy ===
echo Folder: %CD%
echo.

REM Safety: refuse to run anywhere except the Prime app folder.
if not exist "lib\prime-data.json" (
  echo ERROR: this is not the iapply-prime-app folder. Nothing was done.
  pause & exit /b 1
)
findstr /c:"\"projectName\":\"iapply-prime-app\"" ".vercel\project.json" >nul 2>&1
if errorlevel 1 (
  echo ERROR: .vercel\project.json is not linked to iapply-prime-app. Nothing was done.
  pause & exit /b 1
)
REM Safety: this folder must itself be the git repository root (not a copy
REM sitting inside another project's repo), and its remote must be iapply-prime.
for /f "delims=" %%r in ('git rev-parse --show-toplevel 2^>nul') do set "GITROOT=%%r"
set "HERE=%CD:\=/%"
if /i not "%GITROOT%"=="%HERE%" (
  echo ERROR: git root is "%GITROOT%" but this folder is "%HERE%".
  echo        This looks like a COPY inside another repository. Run the .bat from
  echo        D:\Devloment\Iapply website\iapply-prime-app only. Nothing was done.
  pause & exit /b 1
)
REM Find the remote that points to aaairajesh-ops/iapply-prime (this folder has
REM 'origin' = rtsolutiontesting fork and 'upstream' = aaairajesh-ops).
set "PRIME_REMOTE="
for /f "delims=" %%n in ('git remote 2^>nul') do (
  git remote get-url %%n 2>nul | findstr /i "aaairajesh-ops/iapply-prime" >nul && if not defined PRIME_REMOTE set "PRIME_REMOTE=%%n"
)
if not defined PRIME_REMOTE (
  echo ERROR: no git remote points to aaairajesh-ops/iapply-prime. Nothing was done.
  pause & exit /b 1
)
echo Git remote for aaairajesh-ops/iapply-prime: %PRIME_REMOTE%

echo [1/4] Installing dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 ( echo npm install failed. & pause & exit /b 1 )

echo.
echo [2/4] Committing to git (repo: aaairajesh-ops/iapply-prime)...
git add -A
git commit -m "Shareable programme URLs: /destination/university/programme + Copy link" >nul 2>&1
if errorlevel 1 echo (nothing new to commit - continuing)

echo.
echo [3/4] Pushing to GitHub aaairajesh-ops/iapply-prime (remote %PRIME_REMOTE%) main...
git push %PRIME_REMOTE% main
if errorlevel 1 echo WARNING: git push failed (check your GitHub login). Continuing with Vercel deploy.

echo.
echo [4/4] Deploying to Vercel production (project: iapply-prime-app only)...
call npx vercel --prod --yes
if errorlevel 1 ( echo Vercel deploy failed. & pause & exit /b 1 )

echo.
echo === Done. Open https://iapply-prime-app.vercel.app and click "Sync now". ===
pause
endlocal
