//! Bounded Valve KeyValues parser supporting quoted escapes and line comments.
use anyhow::{Result, bail};
use std::collections::BTreeMap;

#[derive(Debug)]
pub enum Value {
    Text(String),
    Object(BTreeMap<String, Value>),
}
impl Value {
    pub fn text(&self) -> Option<&str> {
        match self {
            Self::Text(v) => Some(v),
            _ => None,
        }
    }
    pub fn object(&self) -> Option<&BTreeMap<String, Value>> {
        match self {
            Self::Object(v) => Some(v),
            _ => None,
        }
    }
}

pub fn parse(input: &str) -> Result<BTreeMap<String, Value>> {
    anyhow::ensure!(
        input.len() <= 2 * 1024 * 1024,
        "Steam manifest exceeds the size limit"
    );
    let mut chars = input.chars().peekable();
    let mut tokens = Vec::new();
    while let Some(c) = chars.next() {
        if c.is_whitespace() {
            continue;
        }
        if c == '/' && chars.peek() == Some(&'/') {
            for c in chars.by_ref() {
                if c == '\n' {
                    break;
                }
            }
            continue;
        }
        if c == '{' || c == '}' {
            tokens.push(c.to_string());
            continue;
        }
        let mut s = String::new();
        if c == '"' {
            let mut ended = false;
            while let Some(c) = chars.next() {
                if c == '"' {
                    ended = true;
                    break;
                }
                if c == '\\' {
                    let next = chars
                        .next()
                        .ok_or_else(|| anyhow::anyhow!("Truncated quoted escape"))?;
                    if next != '\\' && next != '"' {
                        s.push('\\');
                    }
                    s.push(next);
                } else {
                    s.push(c);
                }
            }
            anyhow::ensure!(ended, "Unclosed quoted string");
        } else {
            s.push(c);
            while chars
                .peek()
                .is_some_and(|c| !c.is_whitespace() && *c != '{' && *c != '}')
            {
                s.push(chars.next().unwrap());
            }
        }
        // Braces are structural tokens only when unquoted.
        tokens.push(format!("s{s}"));
    }
    fn object(
        tokens: &[String],
        pos: &mut usize,
        nested: bool,
        depth: usize,
    ) -> Result<BTreeMap<String, Value>> {
        anyhow::ensure!(depth < 32, "Steam manifest nesting exceeds the limit");
        let mut result = BTreeMap::new();
        while *pos < tokens.len() {
            let key = &tokens[*pos];
            *pos += 1;
            if key == "}" {
                if nested {
                    return Ok(result);
                }
                bail!("Unexpected closing brace");
            }
            let key = key
                .strip_prefix('s')
                .ok_or_else(|| anyhow::anyhow!("Expected manifest key"))?
                .to_owned();
            let token = tokens
                .get(*pos)
                .ok_or_else(|| anyhow::anyhow!("Missing manifest value"))?;
            *pos += 1;
            let value = if token == "{" {
                Value::Object(object(tokens, pos, true, depth + 1)?)
            } else {
                Value::Text(
                    token
                        .strip_prefix('s')
                        .ok_or_else(|| anyhow::anyhow!("Invalid manifest value"))?
                        .to_owned(),
                )
            };
            result.insert(key, value);
        }
        anyhow::ensure!(!nested, "Unclosed manifest object");
        Ok(result)
    }
    object(&tokens, &mut 0, false, 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn escaped_windows_paths_comments_and_malformed_input() {
        let parsed = parse(
            r#"// comment
        "libraryfolders" { "0" { "path" "D:\\SteamLibrary" } }"#,
        )
        .unwrap();
        let v = parsed["libraryfolders"].object().unwrap()["0"]
            .object()
            .unwrap()["path"]
            .text()
            .unwrap();
        assert_eq!(v, r"D:\SteamLibrary");
        assert!(parse("\"app\" { \"id\" }").is_err());
        assert!(parse("\"app\" { \"id\" \"1\"").is_err());
        assert!(parse("\"unfinished").is_err());
    }
}
