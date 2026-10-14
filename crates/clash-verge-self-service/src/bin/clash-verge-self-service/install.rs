#[cfg(target_os = "macos")]
use clash_verge_self_service::MACOS_HELPER_ID;
use clash_verge_self_service::{DEFAULT_SERVER_ID, Result, ServiceError};

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn process(_server_id: Option<String>) -> Result<()> {
    log::error!("Unsupported platform");
    Err(ServiceError::General(
        "This program is not intended to run on this platform.".into(),
    ))
}

#[cfg(target_os = "macos")]
pub fn process(server_id: Option<String>) -> Result<()> {
    use std::{fs::File, io::Write, path::Path};

    let server_id = server_id.unwrap_or(DEFAULT_SERVER_ID.to_string());

    log::debug!("Start install ClashMorden Service.");

    // uninstall old service
    crate::uninstall::process()?;

    // The installer is the service executable itself. Use its actual path so
    // installs also work when the app bundle/resource was renamed.
    let service_binary_path = std::env::current_exe()?;
    let target_binary_path = format!("/Library/PrivilegedHelperTools/{MACOS_HELPER_ID}");
    log::debug!("Generate service file at {}", target_binary_path);
    let target_binary_dir = Path::new("/Library/PrivilegedHelperTools");
    if !service_binary_path.exists() {
        log::error!("The clash-verge-self-service binary not found.");
        return Err(ServiceError::General(format!(
            "The clash-verge-self-service binary was not found at {}",
            service_binary_path.display()
        )));
    }
    if !target_binary_dir.exists() {
        log::debug!("Create directory for service file [{}].", target_binary_dir.display());
        std::fs::create_dir(target_binary_dir)
            .map_err(|e| ServiceError::General(format!("Unable to create directory for service file: {e}")))?;
    }

    log::debug!(
        "Copy service file from {} to {}",
        service_binary_path.display(),
        target_binary_path
    );
    std::fs::copy(service_binary_path, &target_binary_path)
        .map_err(|e| ServiceError::General(format!("Unable to copy service file: {e}")))?;
    log::debug!("Copy service file done.");

    let plist_file = format!("/Library/LaunchDaemons/{MACOS_HELPER_ID}.plist");
    log::debug!("Create plist file at {}", plist_file);
    let plist_file = Path::new(&plist_file);
    let plist_file_content = format!(
        include_str!("../../../tmpl/io.github.clashmorden.clashmorden.helper.plist"),
        server_id
    );
    let mut file = File::create(plist_file)
        .map_err(|e| ServiceError::General(format!("Failed to create file for writing: {e}")))?;
    log::debug!("Create plist file done.");

    log::debug!("Write plist file content.");
    file.write_all(plist_file_content.as_bytes())
        .map_err(|e| ServiceError::General(format!("Unable to write plist file: {e}")))?;
    log::debug!("Write plist file content done.");

    log::debug!("Chmod and chown plist file.");
    run_checked(
        std::process::Command::new("chmod").arg("644").arg(plist_file),
        "chmod plist file",
    )?;
    run_checked(
        std::process::Command::new("chown").arg("root:wheel").arg(plist_file),
        "chown plist file",
    )?;
    log::debug!("Chmod and chown plist file done.");

    log::debug!("Chmod and chown service file.");
    run_checked(
        std::process::Command::new("chmod").arg("544").arg(&target_binary_path),
        "chmod service file",
    )?;
    run_checked(
        std::process::Command::new("chown")
            .arg("root:wheel")
            .arg(&target_binary_path),
        "chown service file",
    )?;
    log::debug!("Chmod and chown service file done.");

    // Remove any previous launchd registration. `load/unload` is deprecated on
    // modern macOS and can fail with exit code 2 even when the plist is valid.
    log::debug!("Bootout service before bootstrap.");
    let output = std::process::Command::new("launchctl")
        .arg("bootout")
        .arg("system")
        .arg(plist_file)
        .output()
        .map_err(|e| ServiceError::General(format!("Failed to unload service: {e}")))?;
    if !output.status.success() {
        log::debug!(
            "launchctl unload returned {:?}; continuing because the service may not be loaded: {}",
            output.status.code(),
            command_output_detail(&output)
        );
    }
    // Register and start the daemon in the system launchd domain.
    log::debug!("Bootstrap service.");
    run_checked(
        std::process::Command::new("launchctl")
            .arg("bootstrap")
            .arg("system")
            .arg(plist_file),
        "bootstrap service",
    )?;

    log::debug!("Service installed successfully.");
    Ok(())
}

#[cfg(target_os = "macos")]
fn run_checked(command: &mut std::process::Command, action: &str) -> Result<()> {
    let output = command
        .output()
        .map_err(|e| ServiceError::General(format!("Failed to {action}: {e}")))?;
    if output.status.success() {
        return Ok(());
    }

    Err(ServiceError::General(format!(
        "Failed to {action} with status {:?}: {}",
        output.status.code(),
        command_output_detail(&output)
    )))
}

#[cfg(target_os = "macos")]
fn command_output_detail(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return stderr;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return stdout;
    }
    "no command output".to_string()
}

#[cfg(target_os = "linux")]
pub fn process(server_id: Option<String>) -> Result<()> {
    use std::{fs::File, io::Write, path::Path};

    use clash_verge_self_service::SERVICE_NAME;

    let server_id = server_id.unwrap_or(DEFAULT_SERVER_ID.to_string());

    log::debug!("Start install ClashMorden Service.");

    let service_binary_path = std::env::current_exe().unwrap().with_file_name(SERVICE_EXECUTABLE);
    if !service_binary_path.exists() {
        log::error!("The clash-verge-self-service binary not found.");
        std::process::exit(2);
    }

    // Peek the status of the service.
    log::debug!("Checking the status of the service.");
    let status_code = std::process::Command::new("systemctl")
        .arg("status")
        .arg(format!("{SERVICE_NAME}.service"))
        .arg("--no-pager")
        .output()
        .map_err(|e| ServiceError::General(format!("Failed to execute 'systemctl status' command: {e}")))?
        .status
        .code();

    /*
     * https://www.freedesktop.org/software/systemd/man/latest/systemctl.html#Exit%20status
     */
    match status_code {
        Some(code) => match code {
            0..=3 => {
                log::debug!("The service is already installed, uninstall it first");
                crate::uninstall::process()?;
            }
            4 => {
                log::debug!("The service status is unknown, continue to install. (status code: 4)")
            }
            _ => {
                log::error!("Unexpected status code from systemctl status");
                return Err(ServiceError::General(
                    "Unexpected status code from systemctl status".into(),
                ));
            }
        },
        None => {
            log::error!("systemctl was improperly terminated.");
            return Err(ServiceError::General("systemctl was improperly terminated.".into()));
        }
    }

    let unit_file = format!("/etc/systemd/system/{SERVICE_NAME}.service");

    log::debug!("Generating service file [{unit_file}].");
    let unit_file = Path::new(&unit_file);
    let unit_file_content = format!(
        include_str!("../../../tmpl/systemd_service_unit.tmpl"),
        service_binary_path.to_str().unwrap(),
        server_id
    );
    let mut file = File::create(unit_file)
        .map_err(|e| ServiceError::General(format!("Failed to create file for writing: {e}")))?;
    file.write_all(unit_file_content.as_bytes())
        .map_err(|e| ServiceError::General(format!("Failed to write to file: {e}")))?;
    log::debug!("Generated service file done.");

    // Reload unit files and start service.
    log::debug!("Reloading unit files and start service.");
    std::process::Command::new("systemctl")
        .arg("daemon-reload")
        .output()
        .map_err(|e| ServiceError::General(format!("Failed to reload unit files: {e}")))?;
    std::process::Command::new("systemctl")
        .arg("enable")
        .arg(SERVICE_NAME)
        .arg("--now")
        .output()
        .map_err(|e| ServiceError::General(format!("Failed to start service: {e}")))?;

    log::debug!("Service installed successfully.");
    Ok(())
}

/// install and start the service
#[cfg(windows)]
pub fn process(server_id: Option<String>) -> Result<()> {
    use std::ffi::{OsStr, OsString};

    use clash_verge_self_service::SERVICE_NAME;
    use windows_service::{
        service::{ServiceAccess, ServiceErrorControl, ServiceInfo, ServiceStartType, ServiceState, ServiceType},
        service_manager::{ServiceManager, ServiceManagerAccess},
    };

    let server_id = server_id.unwrap_or(DEFAULT_SERVER_ID.to_string());

    log::debug!("Start installing ClashMorden Service.");

    log::debug!("Connecting to the service manager.");
    let manager_access = ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE;
    let service_manager = ServiceManager::local_computer(None::<&str>, manager_access)
        .map_err(|e| ServiceError::General(e.to_string()))?;

    log::debug!("Checking if the service is installed and active，delete it if exists");
    let service_access = ServiceAccess::QUERY_STATUS | ServiceAccess::STOP | ServiceAccess::DELETE;
    if let Ok(service) = service_manager.open_service(SERVICE_NAME, service_access) {
        log::debug!("The service is installed, stop and delete it first");
        if let Ok(status) = service.query_status() {
            if status.current_state != ServiceState::Stopped {
                log::debug!("Service status is not stopped, stopping it first.");
                if let Err(err) = service.stop() {
                    log::error!("Failed to stop service: {err}");
                }
                // Wait for service to stop
                std::thread::sleep(std::time::Duration::from_secs(1));
            }

            log::debug!("Deleting service");
            service.delete().map_err(|e| ServiceError::General(e.to_string()))?;
        }
    }

    let service_binary_path = std::env::current_exe().unwrap().with_file_name(SERVICE_EXECUTABLE);

    if !service_binary_path.exists() {
        log::error!("clash-verge-self-service.exe not found");
        std::process::exit(2);
    }

    let service_info = ServiceInfo {
        name: OsString::from(SERVICE_NAME),
        display_name: OsString::from("ClashMorden Service"),
        service_type: ServiceType::OWN_PROCESS,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: service_binary_path,
        launch_arguments: vec![OsString::from("--server-id"), OsString::from(server_id)],
        dependencies: vec![],
        account_name: None, // run as System
        account_password: None,
    };

    log::debug!("Creating service: {service_info:?}");
    let start_access = ServiceAccess::CHANGE_CONFIG | ServiceAccess::START;
    let service = service_manager
        .create_service(&service_info, start_access)
        .map_err(|e| ServiceError::General(e.to_string()))?;

    log::debug!("Setting service description.");
    service
        .set_description("ClashMorden Service helps to launch clash core")
        .map_err(|e| ServiceError::General(e.to_string()))?;
    log::debug!("Starting service.");
    service
        .start(&Vec::<&OsStr>::new())
        .map_err(|e| ServiceError::General(e.to_string()))?;

    log::debug!("Service installed successfully.");
    Ok(())
}
