param([string]$Path,[switch]$Server)   # -Server: stay alive and read one image path per line from stdin (fast: the Windows OCR engine is loaded once)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime]
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]
function Await($op,$type){$t=$asTask.MakeGenericMethod($type).Invoke($null,@($op));$t.Wait(-1)|Out-Null;$t.Result}
function Read-Image([string]$p){
  $file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($p)) ([Windows.Storage.StorageFile])
  $stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $dec=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bmp=Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res=Await ($eng.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  $res.Text
}
$eng=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
[Console]::OutputEncoding=[Text.Encoding]::UTF8
if(-not $Server){
  if(-not $eng){ Write-Error 'No OCR language installed'; exit 2 }
  Read-Image $Path
  exit
}
while(($line=[Console]::In.ReadLine()) -ne $null){
  $q=$line.Trim(); if(-not $q){ continue }
  try{
    if(-not $eng){ throw 'No OCR language installed' }
    $o='OK:'+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string](Read-Image $q)))
  }catch{ $o='ERR:'+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$_.Exception.Message)) }
  [Console]::Out.WriteLine($o); [Console]::Out.Flush()
}
