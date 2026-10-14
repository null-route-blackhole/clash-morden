//! Validated edits for settings that require a full core reload (not REST PATCH).
use std::{net::IpAddr, time::Duration};

use anyhow::{Context, Result, bail};
use serde::Serialize;
use serde_yaml::{Mapping, Value};
use tokio::sync::Mutex;

use crate::{
    cmds::{CommandResult, into_command_result},
    config::{Config, ConfigType},
    core::{CoreManager, handle::Handle, sysopt::Sysopt},
    utils::{dirs, help},
};

static KERNEL_SAVE_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Serialize)]
pub struct KernelSettings {
    saved: Mapping,
    effective: Mapping,
}

#[tauri::command]
pub fn get_kernel_settings() -> KernelSettings {
    KernelSettings {
        saved: Config::clash().data().0.clone(),
        effective: Config::runtime().data().config.clone().unwrap_or_default(),
    }
}

fn cidr(value: &str) -> bool {
    value.split_once('/').is_some_and(|(ip, bits)| {
        ip.parse::<IpAddr>().is_ok_and(|ip| {
            bits.parse::<u8>()
                .is_ok_and(|bits| bits <= if ip.is_ipv6() { 128 } else { 32 })
        })
    })
}

fn strings(value: &Value, valid: impl Fn(&str) -> bool) -> bool {
    value
        .as_sequence()
        .is_some_and(|items| items.iter().all(|item| item.as_str().is_some_and(&valid)))
}

fn port_range(value: &str) -> bool {
    let port = |p: &str| p.parse::<u16>().is_ok_and(|p| p > 0);
    match value.split_once('-') {
        Some((start, end)) => port(start) && port(end) && start.parse::<u16>().unwrap() <= end.parse::<u16>().unwrap(),
        None => port(value),
    }
}

fn validate(path: &str, value: &Value) -> Result<()> {
    let boolean = matches!(
        path,
        "tcp-concurrent"
            | "unified-delay"
            | "disable-keep-alive"
            | "etag-support"
            | "ipv6"
            | "tcp-fast-open"
            | "mptcp"
            | "allow-lan"
            | "profile.store-selected"
            | "profile.store-fake-ip"
            | "dns.enable"
            | "dns.ipv6"
            | "dns.respect-rules"
            | "dns.prefer-h3"
            | "dns.use-hosts"
            | "dns.use-system-hosts"
            | "dns.direct-nameserver-follow-policy"
            | "dns.fallback-filter.geoip"
            | "tun.enable"
            | "tun.auto-route"
            | "tun.auto-detect-interface"
            | "tun.strict-route"
            | "tun.endpoint-independent-nat"
            | "tun.disable-icmp-forwarding"
            | "tun.recvmsgx"
            | "tun.sendmsgx"
            | "sniffer.enable"
            | "sniffer.override-destination"
            | "sniffer.force-dns-mapping"
            | "sniffer.parse-pure-ip"
            | "sniffer.sniff.HTTP.override-destination"
            | "sniffer.sniff.TLS.override-destination"
            | "sniffer.sniff.QUIC.override-destination"
    );
    let integer = match path {
        "keep-alive-interval" | "keep-alive-idle" => Some((1, 86400)),
        "dns.ipv6-timeout" | "dns.fake-ip-ttl" | "dns.cache-max-size" => Some((0, 1_000_000)),
        "tun.mtu" => Some((576, 65535)),
        "tun.udp-timeout" => Some((1, 86400)),
        "port" | "socks-port" | "redir-port" | "tproxy-port" | "mixed-port" => Some((0, 65535)),
        _ => None,
    };
    let valid = if boolean {
        value.is_null() || value.is_bool()
    } else if let Some((min, max)) = integer {
        value.is_null() || value.as_u64().is_some_and(|v| (min..=max).contains(&v))
    } else {
        match path {
            "find-process-mode" => value.is_null() || matches!(value.as_str(), Some("always" | "strict" | "off")),
            "dns.enhanced-mode" => value.is_null() || matches!(value.as_str(), Some("fake-ip" | "redir-host")),
            "dns.fake-ip-filter-mode" => value.is_null() || matches!(value.as_str(), Some("blacklist" | "whitelist")),
            "dns.cache-algorithm" => value.is_null() || matches!(value.as_str(), Some("arc" | "lru")),
            "tun.stack" => value.is_null() || matches!(value.as_str(), Some("system" | "gvisor" | "mixed" | "mips")),
            "app-quic-block" => value.is_null() || matches!(value.as_str(), Some("off" | "foreign" | "all")),
            "interface-name" | "global-ua" | "tun.device" | "dns.listen" => value.is_null() || value.is_string(),
            "lgbm-url" => value.is_null() || value.as_str().is_some_and(valid_http_url),
            "dns.fake-ip-range" => {
                value.is_null()
                    || value.as_str().is_some_and(|v| {
                        cidr(v)
                            && v.split('/')
                                .next()
                                .is_some_and(|ip| ip.parse::<std::net::Ipv4Addr>().is_ok())
                    })
            }
            "dns.fake-ip-range6" => {
                value.is_null()
                    || value.as_str().is_some_and(|v| {
                        cidr(v)
                            && v.split('/')
                                .next()
                                .is_some_and(|ip| ip.parse::<std::net::Ipv6Addr>().is_ok())
                    })
            }
            "lan-allowed-ips"
            | "lan-disallowed-ips"
            | "skip-auth-prefixes"
            | "tun.route-exclude-address"
            | "tun.route-address"
            | "dns.fallback-filter.ipcidr"
            | "sniffer.skip-src-address"
            | "sniffer.skip-dst-address" => value.is_null() || strings(value, cidr),
            "authentication" => {
                value.is_null()
                    || strings(value, |v| {
                        v.split_once(':')
                            .is_some_and(|(user, password)| !user.is_empty() && !password.is_empty())
                    })
            }
            "tun.exclude-src-port" | "tun.exclude-dst-port" => {
                value.is_null()
                    || value.as_sequence().is_some_and(|items| {
                        items
                            .iter()
                            .all(|v| v.as_u64().is_some_and(|v| (1..=65535).contains(&v)))
                    })
            }
            "sniffer.sniff.HTTP.ports" | "sniffer.sniff.TLS.ports" | "sniffer.sniff.QUIC.ports" => {
                value.is_null() || strings(value, port_range)
            }
            "dns.fake-ip-filter"
            | "dns.default-nameserver"
            | "dns.nameserver"
            | "dns.fallback"
            | "dns.proxy-server-nameserver"
            | "dns.direct-nameserver"
            | "dns.fallback-filter.domain"
            | "dns.fallback-filter.geosite"
            | "tun.dns-hijack"
            | "tun.include-interface"
            | "tun.exclude-interface"
            | "sniffer.force-domain"
            | "sniffer.skip-domain" => value.is_null() || strings(value, |v| !v.trim().is_empty()),
            "dns.fallback-filter.geoip-code" => {
                value.is_null()
                    || value
                        .as_str()
                        .is_some_and(|v| v.len() == 2 && v.bytes().all(|c| c.is_ascii_alphabetic()))
            }
            "dns.nameserver-policy" | "dns.proxy-server-nameserver-policy" | "hosts" => {
                value.is_null()
                    || value.as_mapping().is_some_and(|map| {
                        map.iter().all(|(key, val)| {
                            key.as_str().is_some_and(|v| !v.trim().is_empty())
                                && (val.as_str().is_some_and(|v| !v.trim().is_empty())
                                    || val.as_sequence().is_some_and(|v| !v.is_empty())
                                        && strings(val, |v| !v.trim().is_empty()))
                        })
                    })
            }
            _ => false,
        }
    };
    if !valid {
        bail!("Invalid kernel setting: {path}");
    }
    #[cfg(target_os = "macos")]
    if path == "tun.device"
        && !value.is_null()
        && value
            .as_str()
            .is_none_or(|v| !v.starts_with("utun") || v[4..].parse::<u32>().is_err())
    {
        bail!("macOS TUN device must be utun followed by a number");
    }
    if path == "dns.listen" && value.as_str().is_some_and(|v| !super::dns::valid_dns_listen(v)) {
        bail!("Invalid DNS listen address");
    }
    Ok(())
}

fn group(path: &str) -> bool {
    matches!(
        path,
        "profile"
            | "dns"
            | "dns.fallback-filter"
            | "tun"
            | "sniffer"
            | "sniffer.sniff"
            | "sniffer.sniff.HTTP"
            | "sniffer.sniff.TLS"
            | "sniffer.sniff.QUIC"
    )
}

fn apply_fields(config: &mut Mapping, patch: Mapping, prefix: &str) -> Result<()> {
    for (key, value) in patch {
        let name = key.as_str().context("Kernel keys must be strings")?;
        let path = if prefix.is_empty() {
            name.into()
        } else {
            format!("{prefix}.{name}")
        };
        if group(&path) {
            let mut child = config
                .get(&key)
                .and_then(Value::as_mapping)
                .cloned()
                .unwrap_or_default();
            apply_fields(
                &mut child,
                value.as_mapping().context("Kernel group must be a mapping")?.clone(),
                &path,
            )?;
            if child.is_empty() {
                config.remove(&key);
            } else {
                config.insert(key, child.into());
            }
        } else {
            validate(&path, &value)?;
            if value.is_null() {
                config.remove(&key);
            } else {
                config.insert(key, value);
            }
        }
    }
    Ok(())
}

fn patch_settings(config: &mut Mapping, patch: Mapping) -> Result<()> {
    let mut next = config.clone();
    apply_fields(&mut next, patch, "")?;
    let mut ports = std::collections::HashSet::new();
    for key in ["port", "socks-port", "redir-port", "tproxy-port", "mixed-port"] {
        if let Some(port) = next.get(key).and_then(Value::as_u64)
            && port != 0
            && !ports.insert(port)
        {
            bail!("Proxy ports must not overlap ({port})");
        }
    }
    *config = next;
    Ok(())
}

#[tauri::command]
pub async fn save_kernel_settings(patch: Mapping) -> CommandResult<()> {
    into_command_result(
        async {
            let _guard = KERNEL_SAVE_LOCK.lock().await;
            let previous = Config::clash().data().clone();
            let mut next = previous.clone();
            patch_settings(&mut next.0, patch)?;
            if previous.0 == next.0 {
                return Ok(());
            }
            if Config::clash().latest().0 != previous.0 {
                bail!("Another configuration edit is in progress");
            }
            // A saved port may differ from the port that is actually listening.
            let runtime = Handle::mihomo().get_base_config().await.ok();
            let in_use: Vec<u32> = runtime
                .map(|v| vec![v.port, v.socks_port, v.redir_port, v.tproxy_port, v.mixed_port])
                .unwrap_or_default();
            for key in ["port", "socks-port", "redir-port", "tproxy-port", "mixed-port"] {
                if next.0.get(key) != previous.0.get(key)
                    && let Some(port) = next.0.get(key).and_then(Value::as_u64)
                    && port > 0
                    && !in_use.contains(&(port as u32))
                    && !help::local_port_available(port as u16)
                {
                    bail!("Port {port} is already in use");
                }
            }
            Config::clash().draft().0 = next.0;
            let core = CoreManager::global();
            if let Err(error) = (async {
                Config::generate()?;
                core.check_config(ConfigType::RuntimeCheck).await
            })
            .await
            {
                Config::clash().discard();
                Config::runtime().discard();
                return Err(error);
            }
            if let Err(error) = (async {
                core.run_core().await?;
                Sysopt::global().update_sysproxy()?;
                Config::clash().latest().save_config()
            })
            .await
            {
                Config::clash().discard();
                Config::runtime().discard();
                core.update_config()
                    .await
                    .context(format!("Saving kernel settings failed ({error}); recovery failed"))?;
                Config::runtime().apply();
                Sysopt::global().update_sysproxy()?;
                previous.save_config()?;
                Handle::refresh_clash();
                return Err(error);
            }
            Config::clash().apply();
            Config::runtime().apply();
            Handle::refresh_clash();
            Handle::update_systray_part()?;
            Ok(())
        }
        .await,
    )
}

fn valid_http_url(value: &str) -> bool {
    reqwest::Url::parse(value).is_ok_and(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some())
}

#[tauri::command]
pub async fn sync_smart_model(url: String) -> CommandResult<()> {
    into_command_result(
        async {
            if !valid_http_url(&url) {
                bail!("Model URL must use HTTP or HTTPS");
            }
            let _guard = KERNEL_SAVE_LOCK.lock().await;
            let client = reqwest::Client::builder().timeout(Duration::from_secs(180)).build()?;
            let mut response = client.get(&url).send().await?.error_for_status()?;
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await? {
                if bytes.len() + chunk.len() > 300 * 1024 * 1024 {
                    bail!("Model exceeds 300 MiB");
                }
                bytes.extend_from_slice(&chunk);
            }
            if !bytes.starts_with(b"tree\n") && !bytes.starts_with(b"tree\r\n") {
                bail!("Downloaded file is not a model");
            }
            let destination = dirs::app_home_dir()?.join("Model.bin");
            let temp = destination.with_extension("bin.download");
            tokio::fs::write(&temp, bytes).await?;
            tokio::fs::rename(&temp, &destination).await?;
            Ok(())
        }
        .await,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn mapping(yaml: &str) -> Mapping {
        serde_yaml::from_str(yaml).unwrap()
    }
    #[test]
    fn edits_preserve_unrelated_nested_fields_and_explicit_empty_values() {
        let mut config = mapping(
            "dns: {enable: true, nameserver: [1.1.1.1], nameserver-policy: {old: 1.1.1.1}, custom: keep}\ntun: {enable: false, custom: 1}\nhosts: {old: 127.0.0.1}",
        );
        patch_settings(
            &mut config,
            mapping("dns: {enable: false, nameserver: [], nameserver-policy: {}}\ntun: {mtu: 1500}\nhosts: {}"),
        )
        .unwrap();
        assert_eq!(config["dns"]["enable"], Value::Bool(false));
        assert_eq!(config["dns"]["custom"], Value::from("keep"));
        assert_eq!(config["dns"]["nameserver"], Value::Sequence(vec![]));
        assert_eq!(config["dns"]["nameserver-policy"], Value::Mapping(Mapping::new()));
        assert_eq!(config["tun"]["custom"], Value::from(1));
        patch_settings(&mut config, mapping("dns: {enable: null}\nhosts: null")).unwrap();
        assert!(config["dns"].as_mapping().unwrap().get("enable").is_none());
        assert!(config.get("hosts").is_none());
    }
    #[test]
    fn invalid_patch_is_atomic_and_duplicate_ports_rejected() {
        let original = mapping("mixed-port: 7890\ntun: {enable: false}");
        for patch in [
            "tcp-concurrent: true\ntun: {mtu: -1}",
            "socks-port: 7890",
            "dns: {enable: 'false'}",
            "sniffer: {sniff: {TLS: {ports: [9000-8000]}}}",
            "lan-allowed-ips: [invalid]",
            "hosts: {domain: []}",
            "rules: []",
            "tun: {stack: invalid}",
        ] {
            let mut config = original.clone();
            assert!(patch_settings(&mut config, mapping(patch)).is_err(), "{patch}");
            assert_eq!(config, original);
        }
    }
    #[test]
    fn policy_replace_and_sniff_protocols_remain_isolated() {
        let mut config = mapping(
            "dns: {nameserver-policy: {old: 1.1.1.1}}\nsniffer: {sniff: {HTTP: {ports: ['80']}, TLS: {ports: ['443'], override-destination: true}}}",
        );
        patch_settings(
            &mut config,
            mapping(
                "dns: {nameserver-policy: {new: [223.5.5.5]}}\nsniffer: {sniff: {TLS: {override-destination: false}}}",
            ),
        )
        .unwrap();
        assert!(
            config["dns"]["nameserver-policy"]
                .as_mapping()
                .unwrap()
                .get("old")
                .is_none()
        );
        assert_eq!(
            config["sniffer"]["sniff"]["HTTP"]["ports"],
            Value::Sequence(vec!["80".into()])
        );
        assert_eq!(
            config["sniffer"]["sniff"]["TLS"]["override-destination"],
            Value::Bool(false)
        );
    }
}
