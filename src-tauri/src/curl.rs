//! Desktop re-export of shared cURL helpers in pulse-core.

pub use pulse_core::curl::{curl_to_payload, payload_to_curl};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reexports_parse() {
        let payload = curl_to_payload("curl https://example.com").expect("parse");
        assert_eq!(payload.url, "https://example.com");
    }
}
