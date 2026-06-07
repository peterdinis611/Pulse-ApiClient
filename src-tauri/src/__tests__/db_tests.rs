use super::*;

#[test]
fn hashes_password_consistently() {
    assert_eq!(hash_password("secret"), hash_password("secret"));
}
