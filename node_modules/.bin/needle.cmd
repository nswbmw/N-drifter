@IF EXIST "%~dp0\node.exe" (
  "%~dp0\node.exe"  "%~dp0\..\needle\bin\needle" %*
) ELSE (
  node  "%~dp0\..\needle\bin\needle" %*
)