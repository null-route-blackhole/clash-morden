use std::{collections::HashMap, fs, path::PathBuf, time::Duration};

use anyhow::{Context, Result};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_yaml::Mapping;
use sysproxy::Sysproxy;
use tauri::Manager;

use super::Config;
use crate::{
    AppState,
    core::handle,
    enhance::chain::ScopeType,
    utils::{dirs, help, tmpl},
};

/// reqwest omits URL authentication when the password is absent. Explicitly
/// support `https://user@host` and decode escaped credentials before sending.
fn subscription_request(client: &reqwest::Client, url: &str) -> Result<reqwest::RequestBuilder> {
    let mut parsed = reqwest::Url::parse(url)?;
    let credentials = if parsed.username().is_empty() {
        None
    } else {
        Some((
            percent_encoding::percent_decode_str(parsed.username())
                .decode_utf8()?
                .into_owned(),
            percent_encoding::percent_decode_str(parsed.password().unwrap_or_default())
                .decode_utf8()?
                .into_owned(),
        ))
    };
    let _ = parsed.set_username("");
    let _ = parsed.set_password(None);
    let request = client.get(parsed);
    Ok(match credentials {
        Some((username, password)) => request.basic_auth(username, Some(password)),
        None => request,
    })
}

#[derive(Debug, Default, Clone, Deserialize, Serialize)]
pub struct PrfItem {
    pub uid: Option<String>,

    /// profile item type
    /// enum value: remote | local | script | merge
    #[serde(rename = "type")]
    pub itype: Option<ProfileType>,

    /// profile name
    pub name: Option<String>,

    /// profile description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,

    /// profile file
    pub file: Option<String>,

    /// the file data
    #[serde(skip)]
    pub file_data: Option<String>,

    // =========== chain ===========
    /// this chain is belong to profile
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,

    /// enable chain
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable: Option<bool>,

    /// scope of chain  (GLOBAL / SPECIFIC)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<ScopeType>,
    // =========== chain ===========

    // =========== profile ===========
    /// selected information
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected: Option<Vec<PrfSelected>>,

    /// profile rule providers path
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_providers_path: Option<HashMap<String, PathBuf>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub chain: Option<Vec<String>>,
    // =========== profile ===========

    // =========== remote profile ===========
    /// source url
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,

    /// subscription user info
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<PrfExtra>,

    /// some options of the item
    #[serde(skip_serializing_if = "Option::is_none")]
    pub option: Option<PrfOption>,

    /// profile web page url
    #[serde(skip_serializing_if = "Option::is_none")]
    pub home: Option<String>,

    /// updated time
    pub updated: Option<usize>,
    // =========== remote profile ===========
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProfileType {
    #[default]
    Local,
    Remote,
    Merge,
    Script,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum EnableFilter {
    All,
    Enable,
    Disable,
}

#[derive(Debug, Default, Clone, Deserialize, Serialize)]
pub struct PrfSelected {
    pub name: Option<String>,
    pub now: Option<String>,
}

#[derive(Debug, Default, Clone, Copy, Deserialize, Serialize)]
pub struct PrfExtra {
    pub upload: u64,
    pub download: u64,
    pub total: u64,
    pub expire: u64,
}

#[derive(Debug, Default, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct PrfOption {
    /// for `remote` profile's http request
    /// see issue #13
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,

    /// for `remote` profile
    /// use system proxy
    #[serde(skip_serializing_if = "Option::is_none")]
    pub with_proxy: Option<bool>,

    /// for `remote` profile
    /// use self proxy
    #[serde(skip_serializing_if = "Option::is_none")]
    pub self_proxy: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_interval: Option<u64>,

    /// HTTP request timeout in seconds; absent or zero uses the default.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u64>,

    /// for `remote` profile
    /// disable certificate validation
    /// default is `false`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub danger_accept_invalid_certs: Option<bool>,
}

impl PrfOption {
    pub fn merge(one: Option<Self>, other: Option<Self>) -> Option<Self> {
        match (one, other) {
            (Some(mut a), Some(b)) => {
                a.user_agent = b.user_agent.or(a.user_agent);
                a.with_proxy = b.with_proxy.or(a.with_proxy);
                a.self_proxy = b.self_proxy.or(a.self_proxy);
                a.danger_accept_invalid_certs = b.danger_accept_invalid_certs.or(a.danger_accept_invalid_certs);
                a.update_interval = b.update_interval.or(a.update_interval);
                a.timeout_seconds = b.timeout_seconds.or(a.timeout_seconds);
                Some(a)
            }
            t => t.0.or(t.1),
        }
    }
}

impl PrfItem {
    /// From partial item
    /// must contain `itype`
    pub async fn from(item: PrfItem, file_data: Option<String>) -> Result<PrfItem> {
        match item.itype {
            None => Err(anyhow::anyhow!("type should not be null")),
            Some(ProfileType::Remote) => match item.url {
                None => Err(anyhow::anyhow!("url should not be null")),
                Some(url) => {
                    let name = item.name;
                    let desc = item.desc;
                    PrfItem::from_url(&url, name, desc, item.option).await
                }
            },
            Some(ProfileType::Local) => {
                let name = item.name.unwrap_or("Local File".into());
                let desc = item.desc.unwrap_or_default();
                PrfItem::from_local(name, desc, file_data)
            }
            Some(ProfileType::Merge) => {
                let name = item.name.unwrap_or("Merge".into());
                let desc = item.desc.unwrap_or_default();
                let parent = item.parent;
                let scope = item.scope.unwrap_or_default();
                PrfItem::from_merge(parent, scope, name, desc)
            }
            Some(ProfileType::Script) => {
                if let Some(url) = item.url.as_deref().filter(|url| !url.trim().is_empty()) {
                    let mut remote = Self::from_script_url(url, item.name, item.desc, item.option).await?;
                    remote.parent = item.parent;
                    remote.scope = item.scope;
                    return Ok(remote);
                }
                let name = item.name.unwrap_or("Script".into());
                let desc = item.desc.unwrap_or_default();
                let parent = item.parent;
                let scope = item.scope.unwrap_or_default();
                PrfItem::from_script(parent, scope, name, desc)
            }
        }
    }

    /// ## Local type
    /// create a new item from name/desc
    pub fn from_local(name: String, desc: String, file_data: Option<String>) -> Result<PrfItem> {
        let uid = help::get_uid("l");
        let file = format!("{uid}.yaml");

        Ok(PrfItem {
            uid: Some(uid),
            itype: Some(ProfileType::Local),
            name: Some(name),
            desc: Some(desc),
            file: Some(file),
            file_data: Some(file_data.unwrap_or(tmpl::ITEM_LOCAL.into())),
            updated: Some(chrono::Local::now().timestamp() as usize),
            ..Default::default()
        })
    }

    /// ## Remote type
    /// create a new item from url
    pub async fn from_url(
        url: &str,
        name: Option<String>,
        desc: Option<String>,
        option: Option<PrfOption>,
    ) -> Result<PrfItem> {
        Self::from_url_kind(url, name, desc, option, false).await
    }

    pub async fn from_script_url(
        url: &str,
        name: Option<String>,
        desc: Option<String>,
        option: Option<PrfOption>,
    ) -> Result<PrfItem> {
        let item = Self::from_url_kind(url, name, desc, option, true).await?;
        validate_script(item.file_data.as_deref().unwrap_or_default())?;
        Ok(item)
    }

    pub async fn from_url_kind(
        url: &str,
        name: Option<String>,
        desc: Option<String>,
        option: Option<PrfOption>,
        script: bool,
    ) -> Result<PrfItem> {
        let opt_ref = option.as_ref();
        let with_proxy = opt_ref.is_some_and(|o| o.with_proxy.unwrap_or_default());
        let self_proxy = opt_ref.is_some_and(|o| o.self_proxy.unwrap_or_default());
        let accept_invalid_certs = opt_ref.is_some_and(|o| o.danger_accept_invalid_certs.unwrap_or_default());
        let user_agent = opt_ref.and_then(|o| o.user_agent.as_deref());
        let update_interval = opt_ref.and_then(|o| o.update_interval);

        let mut builder = reqwest::ClientBuilder::new()
            .timeout(Duration::from_secs(
                opt_ref
                    .and_then(|o| o.timeout_seconds)
                    .filter(|&seconds| seconds > 0)
                    .unwrap_or(10),
            ))
            .gzip(true)
            .use_rustls_tls()
            .no_proxy();

        if self_proxy {
            // 使用软件自己的代理
            let port = Config::clash().latest().get_mixed_port();

            let proxy_scheme = format!("http://127.0.0.1:{port}");

            if let Ok(proxy) = reqwest::Proxy::http(&proxy_scheme) {
                builder = builder.proxy(proxy);
            }
            if let Ok(proxy) = reqwest::Proxy::https(&proxy_scheme) {
                builder = builder.proxy(proxy);
            }
            if let Ok(proxy) = reqwest::Proxy::all(&proxy_scheme) {
                builder = builder.proxy(proxy);
            }
        } else if with_proxy {
            // 使用系统代理
            if let Ok(Sysproxy {
                enable: true,
                host,
                port,
                ..
            }) = Sysproxy::get_system_proxy()
            {
                let proxy_scheme = format!("http://{host}:{port}");

                if let Ok(proxy) = reqwest::Proxy::http(&proxy_scheme) {
                    builder = builder.proxy(proxy);
                }
                if let Ok(proxy) = reqwest::Proxy::https(&proxy_scheme) {
                    builder = builder.proxy(proxy);
                }
                if let Ok(proxy) = reqwest::Proxy::all(&proxy_scheme) {
                    builder = builder.proxy(proxy);
                }
            }
        }

        builder = builder.danger_accept_invalid_certs(accept_invalid_certs);

        // NOTE: use `clash-verge` user-agent to request subscription
        let app_version = handle::Handle::app_handle().state::<AppState>().app_version.clone();
        let ua = &format!("clash-verge/v{app_version}");
        builder = builder.user_agent(user_agent.unwrap_or(ua));

        let mut resp = subscription_request(&builder.build()?, url)?.send().await?;

        let status_code = resp.status();
        if !StatusCode::is_success(&status_code) {
            anyhow::bail!("failed to fetch remote profile with status {status_code}");
        }

        let header = resp.headers();

        // parse the Subscription UserInfo
        let extra = match header.get("Subscription-Userinfo") {
            Some(value) => {
                let sub_info = value.to_str().unwrap_or_default();
                Some(PrfExtra {
                    upload: help::parse_str(sub_info, "upload").unwrap_or_default(),
                    download: help::parse_str(sub_info, "download").unwrap_or_default(),
                    total: help::parse_str(sub_info, "total").unwrap_or_default(),
                    expire: help::parse_str(sub_info, "expire").unwrap_or_default(),
                })
            }
            None => None,
        };

        // parse the Content-Disposition
        let filename = match header.get("Content-Disposition") {
            Some(value) => {
                let filename = value.to_str().context("parse filename error")?.to_string();
                let filename = filename.trim_matches('"');
                match help::parse_str::<String>(filename, "filename*") {
                    Some(filename) => {
                        let iter = percent_encoding::percent_decode(filename.as_bytes());
                        let filename = iter.decode_utf8().unwrap_or_default();
                        filename.split("''").last().map(|s| s.to_string())
                    }
                    None => match help::parse_str::<String>(filename, "filename") {
                        Some(filename) => {
                            let filename = filename.trim_matches('"');
                            Some(filename.to_string())
                        }
                        None => None,
                    },
                }
            }
            None => Some(help::get_last_part_and_decode(url).unwrap_or("Remote File".into())),
        };
        let interval_option = match update_interval {
            Some(val) => Some(PrfOption {
                update_interval: Some(val),
                ..PrfOption::default()
            }),
            None => match header.get("profile-update-interval") {
                Some(value) => {
                    match value.to_str().unwrap_or_default().parse::<u64>() {
                        Ok(val) => Some(PrfOption {
                            update_interval: Some(val * 60), // hour -> min
                            ..PrfOption::default()
                        }),
                        Err(_) => None,
                    }
                }
                None => None,
            },
        };
        let option = PrfOption::merge(option, interval_option);

        let home = match header.get("profile-web-page-url") {
            Some(value) => {
                let str_value = value.to_str().unwrap_or_default();
                Some(str_value.to_string())
            }
            None => None,
        };

        let uid = help::get_uid(if script { "s" } else { "r" });
        let file = format!("{uid}.{}", if script { "js" } else { "yaml" });
        let name = name.unwrap_or(filename.unwrap_or("Remote File".into()));
        let data = if script {
            let mut bytes = Vec::new();
            while let Some(chunk) = resp.chunk().await? {
                anyhow::ensure!(bytes.len() + chunk.len() <= 8 * 1024 * 1024, "script exceeds 8 MiB");
                bytes.extend_from_slice(&chunk);
            }
            String::from_utf8(bytes).context("script must use UTF-8")?
        } else {
            resp.text_with_charset("utf-8").await?
        };

        // process the charset "UTF-8 with BOM"
        let data = data.trim_start_matches('\u{feff}');

        if !script {
            // check the data whether the valid yaml format
            let yaml = serde_yaml::from_str::<Mapping>(data)?;

            if !yaml.contains_key("proxies") && !yaml.contains_key("proxy-providers") {
                anyhow::bail!("invalid clash config: profile does not contain `proxies` or `proxy-providers`");
            }
        }

        Ok(PrfItem {
            uid: Some(uid),
            itype: Some(if script {
                ProfileType::Script
            } else {
                ProfileType::Remote
            }),
            enable: script.then_some(false),
            name: Some(name),
            desc,
            file: Some(file),
            file_data: Some(data.into()),
            url: Some(url.into()),
            extra,
            option,
            home,
            updated: Some(chrono::Local::now().timestamp() as usize),
            ..Default::default()
        })
    }

    /// ## Merge type (enhance)
    /// create the enhanced item by using `merge` rule
    pub fn from_merge(parent: Option<String>, scope: ScopeType, name: String, desc: String) -> Result<PrfItem> {
        let uid = help::get_uid("m");
        let file = format!("{uid}.yaml");

        Ok(PrfItem {
            uid: Some(uid),
            itype: Some(ProfileType::Merge),
            name: Some(name),
            desc: Some(desc),
            file_data: Some(tmpl::ITEM_MERGE.into()),
            file: Some(file),
            parent,
            enable: Some(false),
            scope: Some(scope),
            updated: Some(chrono::Local::now().timestamp() as usize),
            ..Default::default()
        })
    }

    /// ## Script type (enhance)
    /// create the enhanced item by using javascript quick.js
    pub fn from_script(parent: Option<String>, scope: ScopeType, name: String, desc: String) -> Result<PrfItem> {
        let uid = help::get_uid("s");
        let file = format!("{uid}.js"); // js ext

        Ok(PrfItem {
            uid: Some(uid),
            itype: Some(ProfileType::Script),
            name: Some(name),
            desc: Some(desc),
            file: Some(file),
            file_data: Some(tmpl::ITEM_SCRIPT.into()),
            parent,
            enable: Some(false),
            scope: Some(scope),
            updated: Some(chrono::Local::now().timestamp() as usize),
            ..Default::default()
        })
    }

    /// get the file data
    pub fn read_file(&self) -> Result<String> {
        let file = self.file.as_ref().context("could not find the file")?;
        let path = dirs::app_profiles_dir()?.join(file);
        let data = fs::read_to_string(path)?;
        Ok(data)
    }

    /// save the file data
    pub fn save_file(&self, data: String) -> Result<()> {
        let file = self.file.as_ref().context("could not find the file")?;
        let path = dirs::app_profiles_dir()?.join(file);
        fs::write(path, data.as_bytes())?;
        Ok(())
    }

    pub fn delete_file(&self) -> Result<()> {
        let file = self.file.as_ref().context("could not find the file")?;
        tracing::debug!("delete profile [{:?}({:?})]", self.name, self.uid);
        let path = dirs::app_profiles_dir()?.join(file);
        fs::remove_file(path)?;
        Ok(())
    }
}

#[cfg(test)]
mod upstream_regression_tests {
    use super::*;

    #[test]
    fn subscription_auth_supports_empty_and_escaped_credentials() {
        let client = reqwest::Client::new();
        for (url, auth) in [
            ("https://user@example.com/profile", "Basic dXNlcjo="),
            ("https://user:@example.com/profile", "Basic dXNlcjo="),
            ("https://u%40ser:p%3Ass@example.com/profile", "Basic dUBzZXI6cDpzcw=="),
        ] {
            let request = subscription_request(&client, url).unwrap().build().unwrap();
            assert_eq!(request.headers()[reqwest::header::AUTHORIZATION], auth);
            assert!(request.url().username().is_empty());
            assert_eq!(request.url().password(), None);
        }
        let request = subscription_request(&client, "https://example.com/profile?token=abc")
            .unwrap()
            .build()
            .unwrap();
        assert!(!request.headers().contains_key(reqwest::header::AUTHORIZATION));
        assert_eq!(request.url().query(), Some("token=abc"));
    }

    #[test]
    fn subscription_options_survive_response_interval_and_manual_overrides() {
        let existing = PrfOption {
            user_agent: Some("custom-agent".into()),
            self_proxy: Some(true),
            timeout_seconds: Some(60),
            ..Default::default()
        };
        let header = PrfOption {
            update_interval: Some(120),
            ..Default::default()
        };
        let result = PrfOption::merge(Some(existing), Some(header)).unwrap();
        let result = PrfOption::merge(
            Some(result),
            Some(PrfOption {
                timeout_seconds: Some(30),
                ..Default::default()
            }),
        )
        .unwrap();
        assert_eq!(result.timeout_seconds, Some(30));
        assert_eq!(result.update_interval, Some(120));
        assert_eq!(result.user_agent.as_deref(), Some("custom-agent"));
        assert_eq!(result.self_proxy, Some(true));
        let legacy: PrfOption = serde_yaml::from_str("with_proxy: true").unwrap();
        assert_eq!(legacy.timeout_seconds, None);
    }
}

fn validate_script(code: &str) -> Result<()> {
    let runtime = rquickjs::Runtime::new()?;
    let context = rquickjs::Context::full(&runtime)?;
    context.with(|ctx| {
        let constructor: rquickjs::Function = ctx.globals().get("Function")?;
        constructor
            .call::<_, rquickjs::Function>((code,))
            .map(|_| ())
            .map_err(|error| anyhow::anyhow!("invalid script syntax: {error}"))
    })
}

#[cfg(test)]
mod remote_script_tests {
    use super::validate_script;
    #[test]
    fn validates_without_executing_script() {
        assert!(
            validate_script("throw new Error('must not execute'); function main(config) { return config; }").is_ok()
        );
        assert!(validate_script("function main( {").is_err());
        assert!(validate_script("<html>error</html>").is_err());
    }
}
