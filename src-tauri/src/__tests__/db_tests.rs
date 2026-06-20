use super::*;

#[test]
fn hashes_password_consistently() {
    assert_eq!(hash_password("secret"), hash_password("secret"));
}

#[test]
fn normalizes_email() {
    assert_eq!(normalize_email("  User@Example.COM "), "user@example.com");
}

#[test]
fn builds_initials_from_name() {
    assert_eq!(initials("Peter Dinis"), "PD");
    assert_eq!(initials("Ada"), "AD");
}
