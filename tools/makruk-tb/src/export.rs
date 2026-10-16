//! Writes tables for the website (tablebase/rs/, read by tablebase.js), white to move only: the page works out red to
//! move one move ahead. A table of up to 8 MB is one file (all.bin); a bigger one is split by the two kings' squares,
//! one file per (white king's square number, red king's square) pair, `comb` positions each, so a page loads only the
//! few it needs. Files are deflate-compressed; a part that is all draws (0) has no file and is listed in `zero`.
//!   tablebase/rs/index.json          the names
//!   tablebase/rs/<name>/info.json    numbering (as <name>.json of the builder) and how the parts are kept
//!   tablebase/rs/<name>/all.bin | <part>.bin

use crate::tables::{describe, Table};
use flate2::write::DeflateEncoder;
use flate2::Compression;
use rayon::prelude::*;
use std::fs;
use std::io::Write;
use std::path::Path;

const SINGLE: u64 = 8 << 20;

fn pack(bytes: &[u8]) -> Vec<u8> {
    let mut e = DeflateEncoder::new(Vec::new(), Compression::best());
    e.write_all(bytes).unwrap();
    e.finish().unwrap()
}

/// Exports one table; returns (files written, bytes written).
pub fn export(t: &Table, root: &Path) -> (usize, u64) {
    let name = t.lay.mat.name();
    let dir = root.join(&name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("cannot create the export folder");
    let w = &t.v[0];
    let single = t.lay.n <= SINGLE;
    let (part, parts) = if single { (t.lay.n, 1) } else { (t.lay.comb, t.lay.n / t.lay.comb) };
    let results: Vec<(u64, Option<Vec<u8>>)> = (0..parts).into_par_iter().map(|k| {
        let slice = &w[(k * part) as usize..((k + 1) * part) as usize];
        if slice.iter().all(|&x| x == 0) { (k, None) } else { (k, Some(pack(slice))) }
    }).collect();
    let mut zero = Vec::new();
    let (mut files, mut bytes) = (0usize, 0u64);
    for (k, packed) in results {
        match packed {
            None => zero.push(k),
            Some(p) => {
                let file = if single { "all.bin".to_string() } else { format!("{}.bin", k) };
                bytes += p.len() as u64; files += 1;
                fs::write(dir.join(file), p).expect("cannot write a part");
            }
        }
    }
    let about = describe(t);
    let about = about.trim_end().trim_end_matches('}');
    let zero = zero.iter().map(|k| k.to_string()).collect::<Vec<_>>().join(",");
    fs::write(dir.join("info.json"), format!("{},\"part\":{},\"single\":{},\"zero\":[{}]}}\n", about, part, single, zero)).expect("cannot write info.json");
    (files, bytes)
}

/// Rewrites tablebase/rs/index.json from the folders there.
pub fn index(root: &Path) {
    let mut names: Vec<String> = fs::read_dir(root).map(|d| d.filter_map(|e| e.ok()).filter(|e| e.path().join("info.json").exists())
        .map(|e| e.file_name().to_string_lossy().to_string()).collect()).unwrap_or_default();
    names.sort();
    let list = names.iter().map(|n| format!("\"{}\"", n)).collect::<Vec<_>>().join(",");
    fs::write(root.join("index.json"), format!("[{}]\n", list)).expect("cannot write index.json");
}
