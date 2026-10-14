use anyhow::{Context, Result, bail};
use serde::Serialize;
use serde_yaml::{Mapping, Value};
use tokio::sync::Mutex;

use crate::{
    cmds::{CommandResult, into_command_result},
    config::{Config, ConfigType},
    core::{CoreManager, handle::Handle},
};

static DNS_SAVE_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Serialize)]
pub struct DnsSettings {
    saved: Mapping,
    effective: Mapping,
    hosts: Option<Value>,
}

#[tauri::command]
pub fn get_dns_settings() -> DnsSettings {
    let saved = Config::clash()
        .latest()
        .0
        .get("dns")
        .and_then(Value::as_mapping)
        .cloned()
        .unwrap_or_default();
    let effective = Config::runtime()
        .latest()
        .config
        .as_ref()
        .and_then(|config| config.get("dns"))
        .and_then(Value::as_mapping)
        .cloned()
        .unwrap_or_default();
    let hosts = Config::clash().latest().0.get("hosts").cloned();
    DnsSettings {
        saved,
        effective,
        hosts,
    }
}

/// Null means inherit from the subscription/chains, not disable the field.
pub(crate) fn valid_dns_listen(value: &str) -> bool {
    let address = if value.starts_with(':') {
        format!("tcp://0.0.0.0{value}")
    } else {
        format!("tcp://{value}")
    };
    tauri::Url::parse(&address).is_ok_and(|url| {
        url.host_str().is_some()
            && url.port().is_some_and(|port| port > 0)
            && url.username().is_empty()
            && url.password().is_none()
            && matches!(url.path(), "" | "/")
            && url.query().is_none()
            && url.fragment().is_none()
            && !value.contains('/')
            && !value.chars().any(char::is_whitespace)
    })
}

fn valid_fake_ip_range(value: &str, ipv6: bool) -> bool {
    let Some((address, prefix)) = value.split_once('/') else {
        return false;
    };
    let Ok(address) = address.parse::<std::net::IpAddr>() else {
        return false;
    };
    let Ok(prefix) = prefix.parse::<u8>() else {
        return false;
    };
    address.is_ipv6() == ipv6 && prefix <= if ipv6 { 128 } else { 32 }
}

fn patch_dns_settings(config: &mut Mapping, patch: Mapping) -> Result<()> {
    let mut dns = match config.get("dns") {
        Some(Value::Mapping(dns)) => dns.clone(),
        Some(_) => bail!("Saved DNS settings must be a mapping"),
        None => Mapping::new(),
    };
    for (key, value) in patch {
        match key.as_str() {
            Some(
                "enable"
                | "ipv6"
                | "use-hosts"
                | "use-system-hosts"
                | "respect-rules"
                | "prefer-h3"
                | "direct-nameserver-follow-policy",
            ) if value.is_null() || value.is_bool() => {}
            Some("listen") if value.is_null() || value.as_str().is_some_and(valid_dns_listen) => {}
            Some("enhanced-mode") if value.is_null() || matches!(value.as_str(), Some("fake-ip" | "redir-host")) => {}
            Some("fake-ip-range")
                if value.is_null() || value.as_str().is_some_and(|v| valid_fake_ip_range(v, false)) => {}
            Some("fake-ip-range6")
                if value.is_null() || value.as_str().is_some_and(|v| valid_fake_ip_range(v, true)) => {}
            Some("fake-ip-filter-mode")
                if value.is_null() || matches!(value.as_str(), Some("blacklist" | "whitelist")) => {}
            Some(
                "fake-ip-filter"
                | "default-nameserver"
                | "nameserver"
                | "fallback"
                | "proxy-server-nameserver"
                | "direct-nameserver",
            ) if value.is_null()
                || value.as_sequence().is_some_and(|items| {
                    items
                        .iter()
                        .all(|item| item.as_str().is_some_and(|v| !v.trim().is_empty()))
                }) => {}
            Some("nameserver-policy")
                if value.is_null()
                    || value.as_mapping().is_some_and(|policy| {
                        policy.iter().all(|(key, value)| {
                            key.as_str().is_some_and(|key| !key.trim().is_empty())
                                && (value.as_str().is_some_and(|value| !value.trim().is_empty())
                                    || value.as_sequence().is_some_and(|items| {
                                        !items.is_empty()
                                            && items
                                                .iter()
                                                .all(|item| item.as_str().is_some_and(|v| !v.trim().is_empty()))
                                    }))
                        })
                    }) => {}
            Some("fallback-filter")
                if value.is_null()
                    || value.as_mapping().is_some_and(|filter| {
                        filter.iter().all(|(key, value)| match key.as_str() {
                            Some("geoip") => value.is_bool(),
                            Some("geoip-code") => value
                                .as_str()
                                .is_some_and(|v| v.len() == 2 && v.bytes().all(|c| c.is_ascii_alphabetic())),
                            Some("ipcidr") => value.as_sequence().is_some_and(|items| {
                                items.iter().all(|item| {
                                    item.as_str()
                                        .is_some_and(|v| valid_fake_ip_range(v, false) || valid_fake_ip_range(v, true))
                                })
                            }),
                            Some("domain" | "geosite") => value.as_sequence().is_some_and(|items| {
                                items
                                    .iter()
                                    .all(|item| item.as_str().is_some_and(|v| !v.trim().is_empty()))
                            }),
                            _ => false,
                        })
                    }) => {}
            _ => bail!("Invalid DNS field or value: {key:?}"),
        }
        if value.is_null() {
            dns.remove(&key);
        } else {
            dns.insert(key, value);
        }
    }
    if dns.is_empty() {
        config.remove("dns");
    } else {
        config.insert("dns".into(), dns.into());
    }
    Ok(())
}

fn patch_hosts_settings(config: &mut Mapping, hosts: Value) -> Result<()> {
    if hosts.is_null() {
        config.remove("hosts");
        return Ok(());
    }
    let mapping = hosts.as_mapping().context("Hosts must be a mapping")?;
    for (key, value) in mapping {
        if key.as_str().is_none_or(|key| key.trim().is_empty()) {
            bail!("Hosts domain must be a nonempty string");
        }
        let valid = |v: &Value| v.as_str().is_some_and(|v| !v.trim().is_empty());
        if !valid(value)
            && !value
                .as_sequence()
                .is_some_and(|items| !items.is_empty() && items.iter().all(valid))
        {
            bail!("Hosts value must be an address, alias, or nonempty list");
        }
    }
    config.insert("hosts".into(), hosts);
    Ok(())
}

#[tauri::command]
pub async fn save_dns_settings(patch: Mapping, hosts: Value) -> CommandResult<()> {
    into_command_result(
        async {
            let _guard = DNS_SAVE_LOCK.lock().await;
            let previous = Config::clash().data().clone();
            let mut next = previous.clone();
            patch_dns_settings(&mut next.0, patch)?;
            patch_hosts_settings(&mut next.0, hosts)?;
            if next.0 == previous.0 {
                return Ok(());
            }
            if Config::clash().latest().0 != previous.0 {
                // Do not overwrite an edit in progress in another settings dialog.
                bail!("Another configuration edit is in progress; retry after it completes");
            }
            Config::clash().draft().0 = next.0;
            let core = CoreManager::global();
            // Validate before touching the running core or writing settings to disk.
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
                Config::clash().latest().save_config()
            })
            .await
            {
                Config::clash().discard();
                Config::runtime().discard();
                let recovery = core.update_config().await;
                Handle::refresh_clash();
                recovery.context(format!(
                    "DNS settings failed ({error}); restoring previous configuration also failed"
                ))?;
                Config::runtime().apply();
                previous.save_config().context(format!(
                    "DNS settings failed ({error}); restoring saved configuration also failed"
                ))?;
                return Err(error);
            }
            Config::clash().apply();
            Config::runtime().apply();
            Handle::refresh_clash();
            Ok(())
        }
        .await,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removing_override_preserves_other_dns_fields() {
        let mut config: Mapping =
            serde_yaml::from_str("dns:\n  enable: false\n  nameserver: [1.1.1.1]\nmode: rule\n").unwrap();
        patch_dns_settings(&mut config, serde_yaml::from_str("enable: null\nipv6: false").unwrap()).unwrap();
        let dns = config.get("dns").unwrap().as_mapping().unwrap();
        assert!(!dns.contains_key("enable"));
        assert_eq!(dns.get("ipv6"), Some(&Value::Bool(false)));
        assert!(dns.contains_key("nameserver"));
        assert_eq!(config.get("mode").unwrap().as_str(), Some("rule"));
    }

    #[test]
    fn rejects_invalid_values_without_modifying_configuration() {
        for patch in [
            "enable: yes",
            "listen: ''",
            "listen: invalid-address",
            "listen: ':0'",
            "listen: ':65536'",
            "enhanced-mode: invalid",
            "nameserver: [42]",
        ] {
            let mut config = Mapping::new();
            assert!(patch_dns_settings(&mut config, serde_yaml::from_str(patch).unwrap()).is_err());
            assert!(config.is_empty());
        }
        let mut config: Mapping = serde_yaml::from_str("dns:\n  enable: false").unwrap();
        patch_dns_settings(&mut config, serde_yaml::from_str("enable: null").unwrap()).unwrap();
        assert!(!config.contains_key("dns"));
    }

    #[test]
    fn listen_supports_ipv4_ipv6_hostname_and_unspecified_host() {
        for address in [":53", "0.0.0.0:1053", "127.0.0.1:65535", "[::1]:53", "localhost:53"] {
            assert!(valid_dns_listen(address), "{address}");
        }
        for address in [
            "invalid",
            "::1:53",
            "host:abc",
            "host:0",
            "user@host:53",
            "host:53/path",
            "host:53?query",
        ] {
            assert!(!valid_dns_listen(address), "{address}");
        }
    }
}

#[cfg(test)]
mod fake_ip_tests {
    use super::*;

    #[test]
    fn validates_range_family_and_prefix() {
        for (range, ipv6, valid) in [
            ("198.18.0.1/16", false, true),
            ("fdfe:dcba:9876::1/64", true, true),
            ("198.18.0.1/33", false, false),
            ("::1/129", true, false),
            ("::1/64", false, false),
            ("198.18.0.1/16", true, false),
            ("example.com/16", false, false),
            ("198.18.0.1", false, false),
        ] {
            assert_eq!(valid_fake_ip_range(range, ipv6), valid, "{range}");
        }
    }

    #[test]
    fn filter_replaces_old_list_and_empty_list_differs_from_inherit() {
        let mut config: Mapping =
            serde_yaml::from_str("dns:\n  fake-ip-filter: [old.example]\n  nameserver: [1.1.1.1]").unwrap();
        patch_dns_settings(
            &mut config,
            serde_yaml::from_str("fake-ip-filter: ['*.lan', '+.example.com']\nfake-ip-filter-mode: whitelist").unwrap(),
        )
        .unwrap();
        let dns = config.get("dns").unwrap().as_mapping().unwrap();
        assert_eq!(dns.get("fake-ip-filter").unwrap().as_sequence().unwrap().len(), 2);
        assert!(dns.contains_key("nameserver"));
        patch_dns_settings(&mut config, serde_yaml::from_str("fake-ip-filter: []").unwrap()).unwrap();
        assert_eq!(config["dns"]["fake-ip-filter"], Value::Sequence(vec![]));
        patch_dns_settings(&mut config, serde_yaml::from_str("fake-ip-filter: null").unwrap()).unwrap();
        assert!(!config["dns"].as_mapping().unwrap().contains_key("fake-ip-filter"));
        for patch in [
            "fake-ip-filter: [1]",
            "fake-ip-filter: ['']",
            "fake-ip-filter-mode: invalid",
        ] {
            let before = config.clone();
            assert!(patch_dns_settings(&mut config, serde_yaml::from_str(patch).unwrap()).is_err());
            assert_eq!(config, before);
        }
    }
}

#[cfg(test)]
mod server_list_tests {
    use super::*;

    #[test]
    fn server_lists_replace_clear_and_inherit_independently() {
        for key in [
            "default-nameserver",
            "nameserver",
            "fallback",
            "proxy-server-nameserver",
            "direct-nameserver",
        ] {
            let mut config: Mapping = serde_yaml::from_str(&format!(
                "dns:\n  {key}: [old]\n  ipv6: false\n  nameserver-policy: {{example.com: [1.1.1.1]}}\n"
            ))
            .unwrap();
            let patch = Mapping::from_iter([(
                key.into(),
                Value::Sequence(vec![
                    "https://example.com/dns-query#proxy&h3=true".into(),
                    "tls://1.1.1.1".into(),
                ]),
            )]);
            patch_dns_settings(&mut config, patch).unwrap();
            assert_eq!(config["dns"][key].as_sequence().unwrap().len(), 2);
            assert_eq!(
                config["dns"][key][0].as_str(),
                Some("https://example.com/dns-query#proxy&h3=true")
            );
            assert_eq!(config["dns"]["ipv6"], Value::Bool(false));
            assert!(config["dns"].as_mapping().unwrap().contains_key("nameserver-policy"));
            patch_dns_settings(&mut config, Mapping::from_iter([(key.into(), Value::Sequence(vec![]))])).unwrap();
            assert_eq!(config["dns"][key], Value::Sequence(vec![]));
            patch_dns_settings(&mut config, Mapping::from_iter([(key.into(), Value::Null)])).unwrap();
            assert!(!config["dns"].as_mapping().unwrap().contains_key(key));
        }
    }
}

#[cfg(test)]
mod policy_tests {
    use super::*;
    #[test]
    fn policy_replaces_old_entries_and_preserves_other_fields() {
        let mut config: Mapping =
            serde_yaml::from_str("dns:\n  nameserver-policy: {old.example: [1.1.1.1]}\n  nameserver: [1.1.1.1]")
                .unwrap();
        patch_dns_settings(&mut config, serde_yaml::from_str("nameserver-policy: {'+.example.com': ['https://example.com/dns-query#proxy'], 'geosite:cn': '223.5.5.5'}\nrespect-rules: false\nprefer-h3: true\ndirect-nameserver-follow-policy: false").unwrap()).unwrap();
        assert!(
            !config["dns"]["nameserver-policy"]
                .as_mapping()
                .unwrap()
                .contains_key("old.example")
        );
        assert_eq!(config["dns"]["respect-rules"], Value::Bool(false));
        assert!(config["dns"].as_mapping().unwrap().contains_key("nameserver"));
        patch_dns_settings(&mut config, serde_yaml::from_str("nameserver-policy: {}").unwrap()).unwrap();
        assert!(config["dns"]["nameserver-policy"].as_mapping().unwrap().is_empty());
        patch_dns_settings(&mut config, serde_yaml::from_str("nameserver-policy: null").unwrap()).unwrap();
        assert!(!config["dns"].as_mapping().unwrap().contains_key("nameserver-policy"));
    }
    #[test]
    fn rejects_malformed_policy_without_mutating_config() {
        for patch in [
            "nameserver-policy: []",
            "nameserver-policy: {'': '1.1.1.1'}",
            "nameserver-policy: {example.com: 42}",
            "nameserver-policy: {example.com: []}",
            "respect-rules: invalid",
        ] {
            let mut config = Mapping::new();
            assert!(patch_dns_settings(&mut config, serde_yaml::from_str(patch).unwrap()).is_err());
            assert!(config.is_empty());
        }
    }
}

#[cfg(test)]
mod fallback_tests {
    use super::*;
    #[test]
    fn fallback_replaces_old_entries_and_can_clear_or_inherit() {
        let mut config: Mapping =
            serde_yaml::from_str("dns:\n  fallback-filter: {domain: [old.example]}\n  nameserver: [1.1.1.1]").unwrap();
        patch_dns_settings(&mut config, serde_yaml::from_str("fallback-filter: {geoip: false, geoip-code: CN, ipcidr: ['240.0.0.0/4', '::1/128'], domain: ['+.example.com']}").unwrap()).unwrap();
        assert_eq!(config["dns"]["fallback-filter"]["geoip"], Value::Bool(false));
        assert_eq!(
            config["dns"]["fallback-filter"]["domain"][0].as_str(),
            Some("+.example.com")
        );
        assert!(config["dns"].as_mapping().unwrap().contains_key("nameserver"));
        patch_dns_settings(&mut config, serde_yaml::from_str("fallback-filter: {}").unwrap()).unwrap();
        assert!(config["dns"]["fallback-filter"].as_mapping().unwrap().is_empty());
        patch_dns_settings(&mut config, serde_yaml::from_str("fallback-filter: null").unwrap()).unwrap();
        assert!(!config["dns"].as_mapping().unwrap().contains_key("fallback-filter"));
    }
    #[test]
    fn malformed_filters_are_rejected_atomically() {
        for patch in [
            "fallback-filter: []",
            "fallback-filter: {geoip: yes}",
            "fallback-filter: {geoip-code: CHINA}",
            "fallback-filter: {ipcidr: ['::1/129']}",
            "fallback-filter: {domain: [42]}",
        ] {
            let mut config = Mapping::new();
            assert!(patch_dns_settings(&mut config, serde_yaml::from_str(patch).unwrap()).is_err());
            assert!(config.is_empty());
        }
    }
}

#[cfg(test)]
mod hosts_tests {
    use super::*;
    #[test]
    fn hosts_are_top_level_replaced_cleared_and_inherited() {
        let mut config: Mapping = serde_yaml::from_str("hosts: {old.example: 127.0.0.1}\ndns: {enable: true}").unwrap();
        patch_hosts_settings(
            &mut config,
            serde_yaml::from_str("example.com: [127.0.0.1, '::1']\nalias.example: example.com").unwrap(),
        )
        .unwrap();
        assert!(!config["hosts"].as_mapping().unwrap().contains_key("old.example"));
        assert_eq!(config["hosts"]["example.com"].as_sequence().unwrap().len(), 2);
        assert!(!config["dns"].as_mapping().unwrap().contains_key("hosts"));
        patch_hosts_settings(&mut config, Value::Mapping(Mapping::new())).unwrap();
        assert!(config["hosts"].as_mapping().unwrap().is_empty());
        patch_hosts_settings(&mut config, Value::Null).unwrap();
        assert!(!config.contains_key("hosts"));
    }
    #[test]
    fn invalid_hosts_do_not_change_existing_settings() {
        for input in ["[]", "example.com: 42", "example.com: []", "'': 127.0.0.1"] {
            let mut config: Mapping = serde_yaml::from_str("hosts: {keep.example: 127.0.0.1}").unwrap();
            let before = config.clone();
            assert!(patch_hosts_settings(&mut config, serde_yaml::from_str(input).unwrap()).is_err());
            assert_eq!(config, before);
        }
    }
}
