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
