use anyhow::{Context, Result};
use serde_yaml::{Mapping, Value};

/// Only structured app-owned fields merge; policy/hosts maps remain explicit replacements.
pub fn merge_settings(config: &mut Mapping, settings: Mapping) -> Result<()> {
    for (key, value) in settings {
        match key.as_str() {
            Some("dns") => {
                let mut dns = value.as_mapping().context("DNS settings must be a mapping")?.clone();
                if let Some(filter) = dns.get("fallback-filter").and_then(Value::as_mapping)
                    && !filter.is_empty()
                {
                    let mut merged = config
                        .get("dns")
                        .and_then(Value::as_mapping)
                        .and_then(|dns| dns.get("fallback-filter"))
                        .and_then(Value::as_mapping)
                        .cloned()
                        .unwrap_or_default();
                    merged.extend(filter.clone());
                    dns.insert("fallback-filter".into(), merged.into());
                }
                super::dns::merge_dns_settings(config, dns.into())?;
            }
            Some("tun" | "profile" | "sniffer") => {
                let mut base = config
                    .get(&key)
                    .and_then(Value::as_mapping)
                    .cloned()
                    .unwrap_or_default();
                merge_group(
                    &mut base,
                    value.as_mapping().context("Kernel settings must be a mapping")?,
                    key.as_str().unwrap(),
                );
                config.insert(key, base.into());
            }
            _ => {
                config.insert(key, value);
            }
        }
    }
    let mode = config.remove("app-quic-block");
    let rule = match mode.as_ref().and_then(Value::as_str) {
        Some("all") => Some("AND,((NETWORK,UDP),(DST-PORT,443)),REJECT"),
        Some("foreign") => Some("AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((OR,((GEOIP,CN),(GEOIP,LAN)))))),REJECT"),
        _ => None,
    };
    if let Some(rule) = rule {
        let mut rules = config
            .get("rules")
            .and_then(Value::as_sequence)
            .cloned()
            .unwrap_or_default();
        rules.insert(0, rule.into());
        config.insert("rules".into(), rules.into());
    }
    Ok(())
}

fn merge_group(base: &mut Mapping, patch: &Mapping, path: &str) {
    for (key, value) in patch {
        let next_path = format!("{path}.{}", key.as_str().unwrap_or_default());
        if matches!(
            next_path.as_str(),
            "sniffer.sniff" | "sniffer.sniff.HTTP" | "sniffer.sniff.TLS" | "sniffer.sniff.QUIC"
        ) && let Some(patch) = value.as_mapping()
        {
            let mut child = base.get(key).and_then(Value::as_mapping).cloned().unwrap_or_default();
            merge_group(&mut child, patch, &next_path);
            base.insert(key.clone(), child.into());
        } else {
            base.insert(key.clone(), value.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_merge_preserves_subscription_fields_and_protocols() {
        let mut config: Mapping = serde_yaml::from_str("tun: {mtu: 1500, route-exclude-address: [192.168.0.0/16]}\nprofile: {custom: keep}\nsniffer: {enable: true, sniff: {HTTP: {ports: ['80']}, TLS: {ports: ['443'], override-destination: true}}}\ndns: {nameserver: [1.1.1.1], fallback-filter: {geoip: true, domain: [example.com]}}").unwrap();
        let settings = serde_yaml::from_str("tun: {enable: false}\nprofile: {store-selected: false}\nsniffer: {sniff: {TLS: {override-destination: false}}}\ndns: {ipv6: false, fallback-filter: {geoip: false}}").unwrap();
        merge_settings(&mut config, settings).unwrap();
        assert_eq!(config["tun"]["mtu"], Value::from(1500));
        assert_eq!(config["profile"]["custom"], Value::from("keep"));
        assert_eq!(
            config["sniffer"]["sniff"]["TLS"]["ports"],
            Value::Sequence(vec!["443".into()])
        );
        assert_eq!(
            config["sniffer"]["sniff"]["TLS"]["override-destination"],
            Value::Bool(false)
        );
        assert!(config["dns"].as_mapping().unwrap().contains_key("nameserver"));
        assert_eq!(config["dns"]["fallback-filter"]["geoip"], Value::Bool(false));
        assert_eq!(
            config["dns"]["fallback-filter"]["domain"],
            Value::Sequence(vec!["example.com".into()])
        );
    }
    #[test]
    fn quic_precedes_rules_and_does_not_export_app_metadata() {
        for mode in ["all", "foreign", "off"] {
            let mut config: Mapping = serde_yaml::from_str("rules: [MATCH,DIRECT]").unwrap();
            merge_settings(
                &mut config,
                Mapping::from_iter([("app-quic-block".into(), mode.into())]),
            )
            .unwrap();
            assert!(!config.contains_key("app-quic-block"));
            let rules = config["rules"].as_sequence().unwrap();
            assert_eq!(rules.len(), if mode == "off" { 2 } else { 3 });
            if mode != "off" {
                assert!(rules[0].as_str().unwrap().ends_with(",REJECT"));
            }
        }
    }
}
