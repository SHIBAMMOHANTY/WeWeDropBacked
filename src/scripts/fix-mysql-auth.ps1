# Script: fix-mysql-auth.ps1
# Attempts to create a MySQL user using mysql_native_password, update src/.env, and run Prisma migrate

$ErrorActionPreference = 'Stop'

# Configuration: change these if your current DB credentials differ
$dbHost = 'localhost'
$dbPort = 3306
$dbName = 'wepick'
$currentUser = 'user'
$currentPass = '754219'
$newUser = 'prisma'
$newPass = 'Prisma123!'

Write-Host "Creating/ensuring MySQL user '$newUser'@'localhost' with mysql_native_password..."

$createSql = "CREATE USER IF NOT EXISTS '$newUser'@'localhost' IDENTIFIED WITH mysql_native_password BY '$newPass'; GRANT ALL PRIVILEGES ON ${dbName}.* TO '$newUser'@'localhost'; FLUSH PRIVILEGES;"

# Run mysql client command using argument list to avoid quoting issues
Write-Host "Writing SQL to temporary file and executing via mysql client..."
$tmpFile = Join-Path $env:TEMP "prisma_create_user.sql"
Set-Content -Path $tmpFile -Value $createSql -Encoding UTF8
Write-Host "Temp SQL file: $tmpFile"

Get-Content $tmpFile | & mysql --host $dbHost --port $dbPort --user $currentUser --password=$currentPass
$exit = $LASTEXITCODE
if ($exit -ne 0) {
    Write-Error "MySQL command failed with exit code $exit. Ensure MySQL client is installed and credentials are correct."
    exit $exit
}
Remove-Item $tmpFile -ErrorAction SilentlyContinue

Write-Host "MySQL user ensured. Updating src/.env..."

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDir '..' '.env' | Resolve-Path -Relative
$envFilePath = Join-Path $scriptDir '..' '.env'
$envContent = "DATABASE_URL=mysql://${newUser}:${newPass}@${dbHost}:${dbPort}/${dbName}`n"
Set-Content -Path $envFilePath -Value $envContent -Encoding UTF8
Write-Host "Updated $envFilePath"

Write-Host "Running Prisma migrate..."
Push-Location (Join-Path $scriptDir '..')
try {
    npx prisma migrate dev --name init
} finally {
    Pop-Location
}

Write-Host "Done."
