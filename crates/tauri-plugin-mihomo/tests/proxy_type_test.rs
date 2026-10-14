use tauri_plugin_mihomo::models::ProxyType;

#[test]
fn smart_proxy_type_survives_api_round_trip() {
    for wire_type in ["Smart", "smart"] {
        let proxy_type: ProxyType = serde_json::from_value(serde_json::json!(wire_type)).unwrap();
        assert!(matches!(proxy_type, ProxyType::Smart));
        assert_eq!(serde_json::to_value(proxy_type).unwrap(), "Smart");
    }
}

#[test]
fn unrecognized_proxy_type_still_uses_unknown() {
    let proxy_type: ProxyType = serde_json::from_value(serde_json::json!("FutureProxy")).unwrap();
    assert!(matches!(proxy_type, ProxyType::Unknown));
}

#[test]
fn lowercase_group_types_survive_api_round_trip() {
    for (wire_type, expected) in [
        ("selector", "Selector"),
        ("select", "Selector"),
        ("fallback", "Fallback"),
        ("url-test", "URLTest"),
        ("urltest", "URLTest"),
        ("load-balance", "LoadBalance"),
        ("loadbalance", "LoadBalance"),
        ("smart", "Smart"),
    ] {
        let proxy_type: ProxyType = serde_json::from_value(serde_json::json!(wire_type)).unwrap();
        assert_eq!(serde_json::to_value(proxy_type).unwrap(), expected);
    }
}
