use super::*;

#[test]
fn builds_body_with_operation_name() {
    let body = build_body_raw(
        "query Example { user { id } }",
        r#"{"id":"abc"}"#,
        Some("Example"),
    )
    .expect("body");
    let value: Value = serde_json::from_str(&body).expect("json");
    assert_eq!(value["query"], "query Example { user { id } }");
    assert_eq!(value["variables"]["id"], "abc");
    assert_eq!(value["operationName"], "Example");
}

#[test]
fn omits_empty_operation_name() {
    let body = build_body("query { ping }", Some(&json!({})), Some("  ")).expect("body");
    let value: Value = serde_json::from_str(&body).expect("json");
    assert!(value.get("operationName").is_none());
}

#[test]
fn rejects_non_object_variables() {
    let err = build_body_raw("query { ping }", r#""bad""#, None).expect_err("vars");
    assert!(err.contains("JSON object"));
    assert_eq!(
        validate("", "{}", None).as_deref(),
        Some("GraphQL query is required.")
    );
}

#[test]
fn formats_errors_and_data() {
    let raw = r#"{"data":{"user":{"id":"1"}},"errors":[{"message":"Field missing","path":["user","email"]}]}"#;
    let parsed = parse_response(raw).expect("parse");
    assert_eq!(parsed.data.unwrap()["user"]["id"], "1");
    let formatted = format_response(raw);
    assert!(formatted.contains("Field missing"));
    assert!(formatted.contains("path: user.email"));
    assert!(parse_response("not-json").is_none());
}

#[test]
fn summarizes_introspection() {
    let raw = r#"{
      "data": {
        "__schema": {
          "queryType": { "name": "Query" },
          "subscriptionType": { "name": "Subscription" },
          "types": [
            {
              "kind": "OBJECT",
              "name": "Query",
              "fields": [{ "name": "user", "type": { "kind": "OBJECT", "name": "User" } }]
            },
            { "kind": "OBJECT", "name": "__Schema", "fields": [{ "name": "types" }] }
          ]
        }
      }
    }"#;
    let summary = summarize_schema(raw).expect("summary");
    assert_eq!(summary.query_type.as_deref(), Some("Query"));
    assert_eq!(summary.subscription_type.as_deref(), Some("Subscription"));
    assert_eq!(summary.types.len(), 1);
    assert_eq!(summary.types[0].name, "Query");
    assert_eq!(summary.types[0].fields, vec!["user".to_string()]);
}

#[test]
fn type_refs_and_stubs() {
    let list = GraphqlTypeRef {
        kind: Some("NON_NULL".into()),
        name: None,
        of_type: Some(Box::new(GraphqlTypeRef {
            kind: Some("LIST".into()),
            name: None,
            of_type: Some(Box::new(GraphqlTypeRef {
                kind: Some("SCALAR".into()),
                name: Some("String".into()),
                of_type: None,
            })),
        })),
    };
    assert_eq!(format_type_ref(Some(&list)), "[String]!");

    let schema = GraphqlSchema {
        query_type: Some(NamedType {
            name: Some("Query".into()),
        }),
        mutation_type: Some(NamedType {
            name: Some("Mutation".into()),
        }),
        subscription_type: Some(NamedType {
            name: Some("Subscription".into()),
        }),
        types: vec![],
    };
    assert_eq!(
        operation_kind_for_type(&schema, Some("Subscription")),
        "subscription"
    );
    assert!(build_field_stub("subscription", "Subscription", "messageAdded")
        .contains("subscription Subscription"));
}

#[test]
fn lists_document_operations() {
    let ops = list_operations(
        r#"
        query GetUser { user { id } }
        mutation UpdateUser { updateUser { id } }
        subscription OnMessage { messageAdded }
        "#,
    );
    assert_eq!(ops.len(), 3);
    assert_eq!(ops[0].kind, "query");
    assert_eq!(ops[0].name.as_deref(), Some("GetUser"));
    assert_eq!(ops[2].kind, "subscription");
    let shorthand = list_operations("{ ping }");
    assert_eq!(shorthand[0].kind, "query");
}

#[test]
fn summarize_accepts_bare_schema_object() {
    let raw = r#"{
      "queryType": { "name": "Query" },
      "mutationType": { "name": "Mutation" },
      "types": [
        { "kind": "OBJECT", "name": "Query", "fields": [{ "name": "ping" }] },
        { "kind": "OBJECT", "name": "Mutation", "fields": [{ "name": "update" }] }
      ]
    }"#;
    let summary = summarize_schema(raw).expect("summary");
    assert_eq!(summary.query_type.as_deref(), Some("Query"));
    assert_eq!(summary.mutation_type.as_deref(), Some("Mutation"));
    assert_eq!(summary.types.len(), 2);
}

#[test]
fn empty_variables_string_becomes_object() {
    let body = build_body_raw("query { ping }", "   ", None).expect("body");
    let value: Value = serde_json::from_str(&body).expect("json");
    assert_eq!(value["variables"], json!({}));
}

#[test]
fn format_response_without_graphql_shape_returns_raw() {
    assert_eq!(format_response("plain text"), "plain text");
    assert_eq!(format_response("{\"ok\":true}"), "{\"ok\":true}");
}
