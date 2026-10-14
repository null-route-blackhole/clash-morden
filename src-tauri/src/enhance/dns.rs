use anyhow::{Context, Result};
use serde_yaml::{Mapping, Value};

/// Apply only explicitly configured app fields after the user's enhancement chains.
/// Other subscription/script DNS fields remain intact; false is an explicit value.
pub(super) fn merge_dns_settings(config: &mut Mapping, settings: Value) -> Result<()> {
    let settings = settings.as_mapping().context("DNS settings must be a mapping")?;
    let mut dns = match config.get("dns") {
        Some(Value::Mapping(dns)) => dns.clone(),
        Some(Value::Null) | None => Mapping::new(),
        Some(_) => anyhow::bail!("Subscription DNS must be a mapping"),
    };
    for (key, value) in settings {
        dns.insert(key.clone(), value.clone());
    }
    config.insert("dns".into(), dns.into());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_fields_preserve_subscription_and_script_dns() {
        let mut config: Mapping = serde_yaml::from_str(
            "dns:\n  enable: true\n  nameserver: [https://example.com/dns-query]\n  nameserver-policy:\n    example.com: [1.1.1.1]\n  custom-field: keep\nhosts:\n  example.com: 127.0.0.1\n",
        ).unwrap();
        let original_hosts = config.get("hosts").cloned();
        merge_dns_settings(&mut config, serde_yaml::from_str("enable: false\nipv6: false").unwrap()).unwrap();
        let dns = config.get("dns").unwrap().as_mapping().unwrap();
        assert_eq!(dns.get("enable"), Some(&Value::Bool(false)));
        assert_eq!(dns.get("ipv6"), Some(&Value::Bool(false)));
        assert!(dns.contains_key("nameserver"));
        assert!(dns.contains_key("nameserver-policy"));
        assert_eq!(dns.get("custom-field").unwrap().as_str(), Some("keep"));
        assert_eq!(config.get("hosts"), original_hosts.as_ref());
    }

    #[test]
    fn malformed_subscription_dns_is_not_silently_discarded() {
        let mut config: Mapping = serde_yaml::from_str("dns: invalid").unwrap();
        assert!(merge_dns_settings(&mut config, Value::Mapping(Mapping::new())).is_err());
    }
}
