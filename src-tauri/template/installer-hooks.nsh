; === 添加插件 Simple Service Plugin 存在的目录 ===
!addplugindir "$%AppData%\Local\NSIS\"

; ----------------------- Hook -----------------------
!macro NSIS_HOOK_PREINSTALL
  ; MessageBox MB_OK "PreInstall"
!macroend

!macro NSIS_HOOK_PREINSTALL_APPSTOPED
  !insertmacro CheckAllVergeProcesses
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro StartVergeService
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CheckAllVergeProcesses
  !insertmacro RemoveVergeService
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro RemoveAutoStartReg
  !insertmacro RemoveOldScheme
!macroend

; ----------------------- 自定义方法 -----------------------
; === 检查并停止所有与 Verge 有关的进程 ===
!macro CheckAllVergeProcesses
  ; Check if clashmorden-service.exe is running
  !if "${INSTALLMODE}" == "currentUser"
    nsis_tauri_utils::FindProcessCurrentUser "clashmorden-service.exe"
  !else
    nsis_tauri_utils::FindProcess "clashmorden-service.exe"
  !endif
  Pop $R0
  ${If} $R0 = 0
    DetailPrint "Kill clashmorden-service.exe..."
    !if "${INSTALLMODE}" == "currentUser"
      nsis_tauri_utils::KillProcessCurrentUser "clashmorden-service.exe"
    !else
      nsis_tauri_utils::KillProcess "clashmorden-service.exe"
    !endif
  ${EndIf}

  ; Check if self-mihomo-alpha.exe is running
  !if "${INSTALLMODE}" == "currentUser"
    nsis_tauri_utils::FindProcessCurrentUser "self-mihomo-alpha.exe"
  !else
    nsis_tauri_utils::FindProcess "self-mihomo-alpha.exe"
  !endif
  Pop $R0
  ${If} $R0 = 0
    DetailPrint "Kill self-mihomo-alpha.exe..."
    !if "${INSTALLMODE}" == "currentUser"
      nsis_tauri_utils::KillProcessCurrentUser "self-mihomo-alpha.exe"
    !else
      nsis_tauri_utils::KillProcess "self-mihomo-alpha.exe"
    !endif
  ${EndIf}

  ; Check if self-mihomo-smart.exe is running
  !if "${INSTALLMODE}" == "currentUser"
    nsis_tauri_utils::FindProcessCurrentUser "self-mihomo-smart.exe"
  !else
    nsis_tauri_utils::FindProcess "self-mihomo-smart.exe"
  !endif
  Pop $R0
  ${If} $R0 = 0
    DetailPrint "Kill self-mihomo-smart.exe..."
    !if "${INSTALLMODE}" == "currentUser"
      nsis_tauri_utils::KillProcessCurrentUser "self-mihomo-smart.exe"
    !else
      nsis_tauri_utils::KillProcess "self-mihomo-smart.exe"
    !endif
  ${EndIf}

  ; Check if self-mihomo.exe is running
  !if "${INSTALLMODE}" == "currentUser"
    nsis_tauri_utils::FindProcessCurrentUser "self-mihomo.exe"
  !else
    nsis_tauri_utils::FindProcess "self-mihomo.exe"
  !endif
  Pop $R0
  ${If} $R0 = 0
    DetailPrint "Kill self-mihomo.exe..."
    !if "${INSTALLMODE}" == "currentUser"
      nsis_tauri_utils::KillProcessCurrentUser "self-mihomo.exe"
    !else
      nsis_tauri_utils::KillProcess "self-mihomo.exe"
    !endif
  ${EndIf}
!macroend

; === 启动 Clash Verge Service ===
!macro StartVergeService
  ; Check if the service exists
  SimpleSC::ExistsService "clashmorden_service"
  Pop $0  ; 0：service exists；other: service not exists
  ; Service exists
  ${If} $0 == 0
    Push $0
    ; Check if the service is running
    SimpleSC::ServiceIsRunning "clashmorden_service"
    Pop $0 ; returns an errorcode (<>0) otherwise success (0)
    Pop $1 ; returns 1 (service is running) - returns 0 (service is not running)
    ${If} $0 == 0
      Push $0
      ${If} $1 == 0
            DetailPrint "Restart ClashMorden Service..."
            SimpleSC::StartService "clashmorden_service" "" 30
      ${EndIf}
    ${ElseIf} $0 != 0
          Push $0
          SimpleSC::GetErrorMessage
          Pop $0
          MessageBox MB_OK|MB_ICONSTOP "Check Service Status Error ($0)"
    ${EndIf}
  ${EndIf}
!macroend

; === 移除 Clash Verge Service ===
!macro RemoveVergeService
  ; Check if the service exists
  SimpleSC::ExistsService "clashmorden_service"
  Pop $0  ; 0：service exists；other: service not exists
  ; Service exists
  ${If} $0 == 0
    Push $0
    ; Check if the service is running
    SimpleSC::ServiceIsRunning "clashmorden_service"
    Pop $0 ; returns an errorcode (<>0) otherwise success (0)
    Pop $1 ; returns 1 (service is running) - returns 0 (service is not running)
    ${If} $0 == 0
      Push $0
      ${If} $1 == 1
            DetailPrint "Stop ClashMorden Service..."
        SimpleSC::StopService "clashmorden_service" 1 30
        Pop $0 ; returns an errorcode (<>0) otherwise success (0)
        ${If} $0 == 0
            DetailPrint "Removing ClashMorden Service..."
              SimpleSC::RemoveService "clashmorden_service"
        ${ElseIf} $0 != 0
                  Push $0
                  SimpleSC::GetErrorMessage
                  Pop $0
                  MessageBox MB_OK|MB_ICONSTOP "ClashMorden Service Stop Error ($0)"
        ${EndIf}
  ${ElseIf} $1 == 0
        DetailPrint "Removing ClashMorden Service..."
        SimpleSC::RemoveService "clashmorden_service"
  ${EndIf}
    ${ElseIf} $0 != 0
          Push $0
          SimpleSC::GetErrorMessage
          Pop $0
          MessageBox MB_OK|MB_ICONSTOP "Check Service Status Error ($0)"
    ${EndIf}
  ${EndIf}
!macroend

; === 移除自启动注册表，仅在明确卸载软件时，非更新软件或覆盖安装时 ===
!macro RemoveAutoStartReg
  ${If} $UpdateMode <> 1
    StrCpy $R0 "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
    StrCpy $R1 "SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
    ; HKEY_LOCAL_MACHINE
    DeleteRegValue HKLM "$R0" "ClashMorden"
    DeleteRegValue HKLM "$R1" "ClashMorden"
    DeleteRegValue HKCU "$R0" "ClashMorden"
    DeleteRegValue HKCU "$R1" "ClashMorden"
    DeleteRegValue HKLM "$R0" "clashmorden"
    DeleteRegValue HKLM "$R1" "clashmorden"
    ; HKEY_CURRENT_USER
    DeleteRegValue HKCU "$R0" "clashmorden"
    DeleteRegValue HKCU "$R1" "clashmorden"
  ${EndIf}
!macroend

; === 删除整个 URL Scheme 注册表树 ===
!macro RemoveOldScheme
  DeleteRegKey HKCU "Software\Classes\Clash"
!macroend
