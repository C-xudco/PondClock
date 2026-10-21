; This extension replaces electron-builder 26.15.3's directory-prefix process
; search. The upstream search also matches Setup/Uninstall and sibling folders.
; No PowerShell, WMI/CIM, shell command, or process termination is used here.
!include "LogicLib.nsh"

Var PCCheckResult ; 0 = clear, 1 = exact target running, 2 = cannot verify safely
Var PCCheckReason

!macro PC_DECLARE_FIND_PROCESS PREFIX
Function ${PREFIX}PCFindTargetProcess
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9

  StrCpy $PCCheckResult 0
  StrCpy $PCCheckReason ""
  GetFullPathName $8 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  System::Call 'kernel32::CreateToolhelp32Snapshot(i 2, i 0) p.r0'
  ${If} $0 == -1
    StrCpy $PCCheckResult 2
    StrCpy $PCCheckReason "Windows could not enumerate processes."
    Goto pc_find_done
  ${EndIf}

  ; NSIS's installer engine is x86 even when it installs the x64 app.
  ; PROCESSENTRY32W is 36 bytes of fields followed by WCHAR szExeFile[260].
  System::Alloc 556
  Pop $3
  ${If} $3 == 0
    StrCpy $PCCheckResult 2
    StrCpy $PCCheckReason "Windows could not allocate process information."
    Goto pc_close_snapshot
  ${EndIf}
  System::Call '*$3(i 556)'
  System::Call 'kernel32::Process32FirstW(p r0, p r3) i.r1 ?e'
  Pop $2

  pc_find_next:
  ${If} $1 == 0
    ; ERROR_NO_MORE_FILES is the normal end of a snapshot.
    ${If} $2 != 18
      StrCpy $PCCheckResult 2
      StrCpy $PCCheckReason "Windows could not finish enumerating processes."
    ${EndIf}
    Goto pc_free_entry
  ${EndIf}
  System::Call '*$3(i, i, i.r4, p, i, i, i, i, i, &w260.r5)'
  ; Basename filter excludes both the installer and uninstaller by construction.
  ${If} $5 == "${APP_EXECUTABLE_FILENAME}"
    ; PROCESS_QUERY_LIMITED_INFORMATION works across x86/x64 without CIM.
    System::Call 'kernel32::OpenProcess(i 0x1000, i 0, i r4) p.r9 ?e'
    Pop $2
    ${If} $9 == 0
      ; A process may exit between snapshot and query. ERROR_INVALID_PARAMETER
      ; means this PID has already gone; access denied must not mean "clear".
      ${If} $2 != 87
        StrCpy $PCCheckResult 2
        StrCpy $PCCheckReason "A PondClock process could not be inspected."
      ${EndIf}
    ${Else}
      StrCpy $7 ${NSIS_MAX_STRLEN}
      System::Call 'kernel32::QueryFullProcessImageNameW(p r9, i 0, w .r5, *i r7) i.r6'
      System::Call 'kernel32::CloseHandle(p r9)'
      ${If} $6 == 0
        StrCpy $PCCheckResult 2
        StrCpy $PCCheckReason "A PondClock process path could not be inspected."
      ${Else}
        ; Compare whole paths, never directory prefixes or only image names.
        System::Call 'kernel32::CompareStringOrdinal(w r5, i -1, w r8, i -1, i 1) i.r6'
        ${If} $6 == 2
          StrCpy $PCCheckResult 1
          Goto pc_free_entry
        ${ElseIf} $6 == 0
          StrCpy $PCCheckResult 2
          StrCpy $PCCheckReason "Windows could not compare the executable path."
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
  System::Call 'kernel32::Process32NextW(p r0, p r3) i.r1 ?e'
  Pop $2
  Goto pc_find_next

  pc_free_entry:
  System::Free $3
  pc_close_snapshot:
  System::Call 'kernel32::CloseHandle(p r0)'
  pc_find_done:
  Pop $9
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!macroend

; electron-builder's documented include/customHeader/customCheckAppRunning hooks
; compile the same implementation into the installer and the NEW uninstaller.
!macro customHeader
  !ifdef BUILD_UNINSTALLER
    !insertmacro PC_DECLARE_FIND_PROCESS "un."
  !else
    !insertmacro PC_DECLARE_FIND_PROCESS ""
  !endif
!macroend

!macro customCheckAppRunning
  pc_check_again:
  !ifdef BUILD_UNINSTALLER
    Call un.PCFindTargetProcess
  !else
    Call PCFindTargetProcess
  !endif
  ${If} $PCCheckResult == 1
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "水塘时钟正在此目录运行：$\r$\n$INSTDIR$\r$\n$\r$\n请先退出水塘时钟，再点击重试。" /SD IDCANCEL IDRETRY pc_check_again
    SetErrorLevel 2
    Quit
  ${ElseIf} $PCCheckResult == 2
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "无法安全检查水塘时钟的运行状态。$\r$\n$PCCheckReason$\r$\n$\r$\n请关闭已运行的水塘时钟后重试。安装程序不会强制结束其他进程。" /SD IDCANCEL IDRETRY pc_check_again
    SetErrorLevel 2
    Quit
  ${EndIf}
  !ifndef BUILD_UNINSTALLER
    !ifdef UNINSTALL_FILENAME
      Var /GLOBAL PCUninstallWriteHandle
      ; Detect the separate "cannot write Uninstall ...exe" failure before
      ; extracting new files. OPEN_EXISTING probes access without changing data.
      ${If} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
        System::Call 'kernel32::CreateFileW(w "$INSTDIR\${UNINSTALL_FILENAME}", i 0x40000000, i 7, p 0, i 3, i 0x80, p 0) p.s'
        Pop $PCUninstallWriteHandle
        ${If} $PCUninstallWriteHandle == -1
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "无法更新此目录中的卸载程序：$\r$\n$INSTDIR\${UNINSTALL_FILENAME}$\r$\n$\r$\n请关闭旧的安装和卸载窗口后重试，并确认此目录可以写入。仍失败时，重启电脑后从下载目录运行新安装包。" /SD IDCANCEL IDRETRY pc_check_again
          SetErrorLevel 2
          Quit
        ${EndIf}
        System::Call 'kernel32::CloseHandle(p $PCUninstallWriteHandle)'
      ${EndIf}
    !endif
  !endif
!macroend
