pub fn read_json_path(value: &serde_json::Value, path: &str) -> Option<serde_json::Value> {
    let mut current = value;
    let mut rest = path.trim();

    while !rest.is_empty() {
        if let Some(dot_index) = rest.find('.') {
            let segment = &rest[..dot_index];
            rest = &rest[dot_index + 1..];
            current = descend_segment(current, segment)?;
        } else {
            current = descend_segment(current, rest)?;
            break;
        }
    }

    Some(current.clone())
}

fn descend_segment<'a>(current: &'a serde_json::Value, segment: &str) -> Option<&'a serde_json::Value> {
    let mut value = current;
    let mut part = segment;

    while !part.is_empty() {
        if let Some(bracket_index) = part.find('[') {
            let key = part[..bracket_index].trim();
            if !key.is_empty() {
                value = value.get(key)?;
            }
            let closing = part[bracket_index..].find(']')?;
            let index_str = part[bracket_index + 1..bracket_index + closing].trim();
            let index: usize = index_str.parse().ok()?;
            value = value.get(index)?;
            part = part[bracket_index + closing + 1..].trim_start_matches('.');
        } else {
            return value.get(part);
        }
    }

    Some(value)
}
