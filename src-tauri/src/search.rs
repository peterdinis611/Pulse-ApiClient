use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchDocument {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub method: String,
    pub meta: String,
    #[serde(default)]
    pub keywords: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub id: String,
    pub score: i64,
}

pub fn fuzzy_search_documents(
    query: &str,
    documents: &[SearchDocument],
    limit: Option<usize>,
) -> Vec<SearchMatch> {
    let query = query.trim();
    if query.is_empty() {
        return documents
            .iter()
            .map(|document| SearchMatch {
                id: document.id.clone(),
                score: 0,
            })
            .collect();
    }

    let matcher = SkimMatcherV2::default();
    let mut matches: Vec<SearchMatch> = documents
        .iter()
        .filter_map(|document| {
            let fields = [
                document.title.as_str(),
                document.subtitle.as_str(),
                document.method.as_str(),
                document.meta.as_str(),
                document.keywords.as_str(),
            ];

            let score = fields
                .iter()
                .filter_map(|field| matcher.fuzzy_match(field, query))
                .max();

            score.map(|score| SearchMatch {
                id: document.id.clone(),
                score,
            })
        })
        .collect();

    matches.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.id.cmp(&right.id))
    });

    if let Some(limit) = limit {
        matches.truncate(limit);
    }

    matches
}

#[cfg(test)]
#[path = "__tests__/search_tests.rs"]
mod tests;
