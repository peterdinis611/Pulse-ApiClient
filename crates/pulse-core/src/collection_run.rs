use std::collections::HashMap;
use std::future::Future;

use serde::{Deserialize, Serialize};

use crate::inherit::{apply_request_inheritance, collect_folder_variables};
use crate::prepare::{interpolate_request, to_http_payload};
use crate::test_runner::{run_http_tests, run_pre_request_script_with_env, TestRunResult};
use crate::types::{
    CollectionDto, EnvVariable, EnvironmentDto, HttpRequestPayload, HttpResponsePayload, SavedRequestDto,
};
use crate::vars::{apply_mutations, merge_variable_layers};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRunInput {
    pub collection_id: String,
    pub collection_name: String,
    pub requests: Vec<SavedRequestDto>,
    pub environment: Option<EnvironmentDto>,
    #[serde(default)]
    pub globals: Vec<EnvVariable>,
    pub collection: Option<CollectionDto>,
    #[serde(default)]
    pub data_rows: Vec<HashMap<String, String>>,
    pub data_file_name: Option<String>,
    pub folder_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRunStep {
    pub saved: SavedRequestDto,
    pub response: Option<HttpResponsePayload>,
    pub error: Option<String>,
    pub test_results: Option<TestRunResult>,
    pub iteration: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRunResult {
    pub collection_id: String,
    pub collection_name: String,
    pub passed: u32,
    pub failed: u32,
    pub total_tests: u32,
    pub steps: Vec<CollectionRunStep>,
    pub folder_path: Option<String>,
    pub data_file_name: Option<String>,
    pub iterations: u32,
}

fn env_json(variables: &[EnvVariable]) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for item in variables {
        if item.enabled && !item.key.trim().is_empty() {
            map.insert(item.key.trim().to_string(), serde_json::Value::String(item.value.clone()));
        }
    }
    serde_json::Value::Object(map)
}

fn with_data_row(base: &[EnvVariable], row: Option<&HashMap<String, String>>) -> Vec<EnvVariable> {
    let mut vars = base.to_vec();
    if let Some(row) = row {
        apply_mutations(
            &mut vars,
            &row.iter().map(|(k, v)| (k.clone(), v.clone())).collect::<Vec<_>>(),
        );
    }
    vars
}

fn needs_sequential(input: &CollectionRunInput) -> bool {
    !input.data_rows.is_empty()
        || input.requests.iter().any(|item| !item.request.pre_request_script.trim().is_empty())
        || input
            .collection
            .as_ref()
            .map(|col| {
                col.pre_request_script.as_deref().unwrap_or("").trim().is_empty() == false
                    || col
                        .folder_configs
                        .iter()
                        .any(|folder| folder.pre_request_script.as_deref().unwrap_or("").trim().is_empty() == false)
            })
            .unwrap_or(false)
}

fn merged_vars(input: &CollectionRunInput, folder: Option<&str>, environment: &[EnvVariable]) -> Vec<EnvVariable> {
    merge_variable_layers(&[
        input.globals.clone(),
        input.collection.as_ref().map(|col| col.variables.clone()).unwrap_or_default(),
        collect_folder_variables(input.collection.as_ref(), folder),
        environment.to_vec(),
    ])
}

fn evaluate_step(saved: SavedRequestDto, response: Option<HttpResponsePayload>, error: Option<String>) -> CollectionRunStep {
    if let Some(message) = error {
        return CollectionRunStep {
            test_results: Some(crate::test_runner::single_failure(&saved.name, &message)),
            saved,
            response,
            error: Some(message),
            iteration: None,
        };
    }
    let Some(response) = response else {
        return CollectionRunStep {
            saved,
            response: None,
            error: None,
            test_results: None,
            iteration: None,
        };
    };
    let tests = saved.request.tests.trim();
    if tests.is_empty() {
        return CollectionRunStep {
            saved,
            response: Some(response),
            error: None,
            test_results: None,
            iteration: None,
        };
    }
    let test_results = run_http_tests(tests, &response);
    CollectionRunStep {
        saved,
        response: Some(response),
        error: None,
        test_results: Some(test_results),
        iteration: None,
    }
}

fn tally(result: &mut CollectionRunResult, step: &CollectionRunStep) {
    if let Some(tests) = &step.test_results {
        result.passed += tests.passed;
        result.failed += tests.failed;
        result.total_tests += tests.total;
    }
}

pub async fn run_collection<S, F, B, BF>(
    input: CollectionRunInput,
    mut send: S,
    mut send_batch: Option<B>,
) -> CollectionRunResult
where
    S: FnMut(HttpRequestPayload) -> F,
    F: Future<Output = Result<HttpResponsePayload, String>>,
    B: FnMut(Vec<HttpRequestPayload>) -> BF,
    BF: Future<Output = Vec<(Option<HttpResponsePayload>, Option<String>)>>,
{
    let rows: Vec<Option<HashMap<String, String>>> = if input.data_rows.is_empty() {
        vec![None]
    } else {
        input.data_rows.iter().cloned().map(Some).collect()
    };
    let mut result = CollectionRunResult {
        collection_id: input.collection_id.clone(),
        collection_name: input.collection_name.clone(),
        passed: 0,
        failed: 0,
        total_tests: 0,
        steps: Vec::new(),
        folder_path: input.folder_path.clone(),
        data_file_name: input.data_file_name.clone(),
        iterations: rows.len() as u32,
    };

    if !needs_sequential(&input) && input.requests.len() > 1 {
        if let Some(batch) = send_batch.as_mut() {
            let env = input.environment.as_ref().map(|item| item.variables.clone()).unwrap_or_default();
            let payloads: Vec<HttpRequestPayload> = input
                .requests
                .iter()
                .map(|saved| {
                    let inherited = apply_request_inheritance(
                        saved.request.clone(),
                        input.collection.as_ref(),
                        saved.folder.as_deref(),
                    );
                    let vars = merged_vars(&input, saved.folder.as_deref(), &env);
                    let prepared = interpolate_request(inherited, &vars);
                    to_http_payload(&prepared, Some(saved.id.clone()))
                })
                .collect();
            let batch_results = batch(payloads).await;
            for (index, saved) in input.requests.into_iter().enumerate() {
                let (response, error) = batch_results.get(index).cloned().unwrap_or((None, Some("missing batch result".into())));
                let step = evaluate_step(saved, response, error);
                tally(&mut result, &step);
                result.steps.push(step);
            }
            return result;
        }
    }

    let mut active_env: Vec<EnvVariable>;
    for (iteration, row) in rows.iter().enumerate() {
        active_env = with_data_row(
            input.environment.as_ref().map(|item| item.variables.as_slice()).unwrap_or(&[]),
            row.as_ref(),
        );
        for saved in &input.requests {
            let inherited = apply_request_inheritance(
                saved.request.clone(),
                input.collection.as_ref(),
                saved.folder.as_deref(),
            );
            let vars = merged_vars(&input, saved.folder.as_deref(), &active_env);
            let script = inherited.pre_request_script.trim().to_string();
            if !script.is_empty() {
                let pre = run_pre_request_script_with_env(&script, &env_json(&vars));
                apply_mutations(
                    &mut active_env,
                    &pre.mutations.iter().map(|item| (item.key.clone(), item.value.clone())).collect::<Vec<_>>(),
                );
            }
            let vars = merged_vars(&input, saved.folder.as_deref(), &active_env);
            let prepared = interpolate_request(inherited, &vars);
            let payload = to_http_payload(&prepared, Some(format!("{}-{}", saved.id, iteration)));
            let outcome = send(payload).await;
            let mut step = match outcome {
                Ok(response) => evaluate_step(saved.clone(), Some(response), None),
                Err(error) => evaluate_step(saved.clone(), None, Some(error)),
            };
            if rows.len() > 1 {
                step.iteration = Some((iteration + 1) as u32);
            }
            tally(&mut result, &step);
            result.steps.push(step);
        }
    }
    result
}
