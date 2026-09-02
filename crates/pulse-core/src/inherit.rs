use crate::types::{ApiRequestDto, CollectionDto, FolderConfigDto, RequestAuthDto};

fn folder_path_chain(folder: Option<&str>) -> Vec<String> {
    let Some(normalized) = folder.map(str::trim).filter(|value| !value.is_empty()) else {
        return Vec::new();
    };
    let parts: Vec<&str> = normalized.split('/').filter(|part| !part.is_empty()).collect();
    parts
        .iter()
        .enumerate()
        .map(|(index, _)| parts[..=index].join("/"))
        .collect()
}

fn folder_config_for<'a>(collection: &'a CollectionDto, path: &str) -> Option<&'a FolderConfigDto> {
    collection.folder_configs.iter().find(|item| item.path == path)
}

fn join_scripts(scripts: impl IntoIterator<Item = Option<String>>) -> String {
    scripts
        .into_iter()
        .flatten()
        .map(|script| script.trim().to_string())
        .filter(|script| !script.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

pub fn resolve_inherited_auth(
    request_auth: &RequestAuthDto,
    collection: Option<&CollectionDto>,
    folder: Option<&str>,
) -> RequestAuthDto {
    if request_auth.auth_type != "inherit" {
        return request_auth.clone();
    }
    let Some(collection) = collection else {
        return RequestAuthDto {
            auth_type: "none".into(),
            ..RequestAuthDto::default()
        };
    };
    let chain = folder_path_chain(folder);
    for path in chain.into_iter().rev() {
        if let Some(config) = folder_config_for(collection, &path) {
            if let Some(auth) = &config.auth {
                if auth.auth_type == "inherit" {
                    continue;
                }
                return auth.clone();
            }
        }
    }
    if let Some(auth) = &collection.auth {
        if auth.auth_type != "inherit" {
            return auth.clone();
        }
    }
    RequestAuthDto {
        auth_type: "none".into(),
        ..RequestAuthDto::default()
    }
}

pub fn collect_folder_variables(
    collection: Option<&CollectionDto>,
    folder: Option<&str>,
) -> Vec<crate::types::EnvVariable> {
    let Some(collection) = collection else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for path in folder_path_chain(folder) {
        if let Some(config) = folder_config_for(collection, &path) {
            rows.extend(config.variables.clone());
        }
    }
    rows
}

pub fn apply_request_inheritance(
    mut request: ApiRequestDto,
    collection: Option<&CollectionDto>,
    folder: Option<&str>,
) -> ApiRequestDto {
    request.auth = resolve_inherited_auth(&request.auth, collection, folder);
    let folder_pre = folder_path_chain(folder)
        .into_iter()
        .map(|path| {
            collection
                .and_then(|col| folder_config_for(col, &path))
                .and_then(|config| config.pre_request_script.clone())
        });
    request.pre_request_script = join_scripts(
        std::iter::once(collection.and_then(|col| col.pre_request_script.clone()))
            .chain(folder_pre)
            .chain(std::iter::once(Some(request.pre_request_script))),
    );
    let folder_tests = folder_path_chain(folder)
        .into_iter()
        .rev()
        .map(|path| {
            collection
                .and_then(|col| folder_config_for(col, &path))
                .and_then(|config| config.tests.clone())
        });
    request.tests = join_scripts(
        std::iter::once(Some(request.tests))
            .chain(folder_tests)
            .chain(std::iter::once(collection.and_then(|col| col.tests.clone()))),
    );
    request
}
