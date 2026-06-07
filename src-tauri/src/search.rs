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
mod tests {
    use super::*;

    fn sample_documents() -> Vec<SearchDocument> {
        vec![
            SearchDocument {
                id: "1".to_string(),
                title: "Get users".to_string(),
                subtitle: "https://api.example.com/users".to_string(),
                method: "GET".to_string(),
                meta: "Auth".to_string(),
                keywords: String::new(),
            },
            SearchDocument {
                id: "2".to_string(),
                title: "Create order".to_string(),
                subtitle: "https://api.example.com/orders".to_string(),
                method: "POST".to_string(),
                meta: "Checkout".to_string(),
                keywords: String::new(),
            },
            SearchDocument {
                id: "3".to_string(),
                title: "Health check".to_string(),
                subtitle: "https://api.example.com/health".to_string(),
                method: "GET".to_string(),
                meta: "Monitoring".to_string(),
                keywords: String::new(),
            },
        ]
    }

    #[test]
    fn empty_query_returns_all_documents() {
        let documents = sample_documents();
        let results = fuzzy_search_documents("", &documents, None);
        assert_eq!(results.len(), documents.len());
    }

    #[test]
    fn ranks_closest_match_first() {
        let results = fuzzy_search_documents("usrs", &sample_documents(), None);
        assert!(!results.is_empty());
        assert_eq!(results[0].id, "1");
    }

    #[test]
    fn matches_method_and_url_fragments() {
        let results = fuzzy_search_documents("order", &sample_documents(), None);
        assert!(!results.is_empty());
        assert_eq!(results[0].id, "2");
    }

    #[test]
    fn respects_result_limit() {
        let results = fuzzy_search_documents("get", &sample_documents(), Some(1));
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn matches_subtitle_url_fragment() {
        let results = fuzzy_search_documents("health", &sample_documents(), None);
        assert_eq!(results[0].id, "3");
    }
}
