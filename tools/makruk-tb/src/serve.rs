//! makruk-tb serve: answers the website's questions about the tables in tablebase-local/ on this computer only
//! (127.0.0.1). GET /status lists the tables; GET /probe?fen=<FEN> gives the position's result for the side to move
//! and every legal move's result for the mover:
//!   {"covered":true,"table":"KRMMvKR","result":{"res":"win","n":12},
//!    "moves":[{"from":[r,c],"to":[r,c],"res":"win|loss|draw","n":…}, …]}
//! (win: the mover mates in n of its moves, this one included; loss: it is mated after n of the other side's moves).
//! Squares are [r, c] as in makruk-rules.js (r 0 = rank 8). A position no open table covers (a pawn on the board, or
//! a table that is not built) answers {"covered":false}. Only pages opened from localhost / 127.0.0.1 may read the
//! answers (CORS); nothing is written and no other file is read.

use crate::geom::{bit, Geo, Kind, BLACK, WHITE};
use crate::layout::*;
use crate::tables::{Piece, Registry};
use flate2::read::DeflateDecoder;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

pub const PORT: u16 = 8765;

/// A position: kings [white, red], the other pieces, the side to move.
#[derive(Clone, Debug)]
pub struct Board { pub kings: [u8; 2], pub pieces: Vec<Piece>, pub stm: usize }

/// Reads the site's FEN (makruk letters: k king, r rook, n knight, s khon, m met, m~ promoted pawn, p pawn).
pub fn parse_fen(fen: &str) -> Result<Board, String> {
    let mut fields = fen.split_whitespace();
    let rows: Vec<&str> = fields.next().ok_or("empty FEN")?.split('/').collect();
    if rows.len() != 8 { return Err("a FEN has 8 rows".into()); }
    let stm = match fields.next() { Some("w") => WHITE, Some("b") => BLACK, _ => return Err("the side to move is w or b".into()) };
    let mut kings = [255u8; 2];
    let mut pieces = Vec::new();
    for (r, row) in rows.iter().enumerate() {
        let mut c = 0u8;
        for ch in row.chars() {
            if let Some(d) = ch.to_digit(10) { c += d as u8; continue; }
            if ch == '~' { continue; }
            if c > 7 { return Err("a row has more than 8 squares".into()); }
            let color = if ch.is_ascii_uppercase() { WHITE } else { BLACK };
            let s = r as u8 * 8 + c;
            match ch.to_ascii_lowercase() {
                'k' => { if kings[color] != 255 { return Err("two kings of one colour".into()); } kings[color] = s; }
                'p' => return Err("pawn".into()),
                l => pieces.push((color, Kind::from_letter(l).ok_or(format!("unknown piece {}", ch))?, s)),
            }
            c += 1;
        }
        if c != 8 { return Err("a row must have 8 squares".into()); }
    }
    if kings.contains(&255) { return Err("both kings are needed".into()); }
    if pieces.len() > MAXP { return Err("more pieces than any table keeps".into()); }
    Ok(Board { kings, pieces, stm })
}

fn occupied(b: &Board, skip: Option<usize>) -> u64 {
    let mut o = bit(b.kings[0]) | bit(b.kings[1]);
    for (i, p) in b.pieces.iter().enumerate() { if Some(i) != skip { o |= bit(p.2); } }
    o
}
/// Is square `s` attacked by `by` (piece `skip` left out, as if taken)?
fn attacked(geo: &Geo, b: &Board, s: u8, by: usize, skip: Option<usize>) -> bool {
    if geo.king[b.kings[by] as usize] & bit(s) != 0 { return true; }
    let occ = occupied(b, skip);
    b.pieces.iter().enumerate().any(|(i, p)| Some(i) != skip && p.0 == by && p.2 != s && geo.attacks(p.1, p.0, p.2, occ) & bit(s) != 0)
}
/// Every legal move of the side to move, as (from, to, the position after).
pub fn legal_moves(geo: &Geo, b: &Board) -> Vec<(u8, u8, Board)> {
    let (me, them) = (b.stm, 1 - b.stm);
    let own = b.pieces.iter().filter(|p| p.0 == me).fold(bit(b.kings[me]), |o, p| o | bit(p.2));
    let occ = occupied(b, None);
    let mut out = Vec::new();
    let mut make = |from: u8, to: u8, king: bool, slot: usize| {
        let mut n = b.clone();
        let taken = n.pieces.iter().position(|p| p.0 == them && p.2 == to);
        if king { n.kings[me] = to; } else { n.pieces[slot].2 = to; }
        if let Some(t) = taken { n.pieces.remove(t); }
        n.stm = them;
        if !attacked(geo, &n, n.kings[me], them, None) { out.push((from, to, n)); }
    };
    let mut dests = geo.king[b.kings[me] as usize] & !own;
    while dests != 0 { let t = dests.trailing_zeros() as u8; dests &= dests - 1; make(b.kings[me], t, true, 0); }
    for (i, p) in b.pieces.iter().enumerate() {
        if p.0 != me { continue; }
        let mut dests = geo.attacks(p.1, p.0, p.2, occ) & !own & !bit(b.kings[them]);
        while dests != 0 { let t = dests.trailing_zeros() as u8; dests &= dests - 1; make(p.2, t, false, i); }
    }
    out
}

fn res(v: u8) -> (&'static str, u8) {
    if is_win(v) { ("win", v) } else if is_loss(v) { ("loss", v - 128) } else { ("draw", 0) }
}

/// A table kept in the exported form (tablebase-local/packed/<name>/, from `makruk-tb export --to`): white to move
/// only, compressed parts read when first needed and kept; red to move is worked out one move ahead.
pub struct Packed { lay: Layout, part: u64, single: bool, zero: HashSet<u64>, dir: PathBuf }

/// The tables the server answers from: raw ones (memory-mapped) and packed ones.
pub struct Server {
    pub reg: Registry,
    packed: HashMap<String, Packed>,
    cache: Mutex<(HashMap<(String, u64), Arc<Vec<u8>>>, usize)>,
}

const CACHE_LIMIT: usize = 1 << 30;

impl Server {
    pub fn open(dir: &Path) -> Server {
        let reg = open_all(dir);
        let mut packed = HashMap::new();
        if let Ok(d) = std::fs::read_dir(dir.join("packed")) {
            for e in d.filter_map(|e| e.ok()) {
                let name = e.file_name().to_string_lossy().to_string();
                let Some(mat) = Material::parse(&name) else { continue };
                let Ok(text) = std::fs::read_to_string(e.path().join("info.json")) else { continue };
                let Ok(info) = serde_json::from_str::<serde_json::Value>(&text) else { continue };
                let lay = Layout::new(&mat, &reg.cb);
                let zero = info["zero"].as_array().map(|z| z.iter().filter_map(|x| x.as_u64()).collect()).unwrap_or_default();
                let part = info["part"].as_u64().unwrap_or(lay.n);
                packed.insert(name, Packed { part, single: info["single"].as_bool().unwrap_or(false), zero, dir: e.path(), lay });
            }
        }
        Server { reg, packed, cache: Mutex::new((HashMap::new(), 0)) }
    }
    pub fn names(&self) -> Vec<String> {
        let mut v: Vec<String> = self.reg.tables.keys().cloned().chain(self.packed.keys().cloned()).collect();
        v.sort();
        v.dedup();
        v
    }
    fn part(&self, name: &str, p: &Packed, k: u64) -> Option<Arc<Vec<u8>>> {
        let key = (name.to_string(), k);
        if let Some(b) = self.cache.lock().unwrap().0.get(&key) { return Some(b.clone()); }
        let file = p.dir.join(if p.single { "all.bin".to_string() } else { format!("{}.bin", k) });
        let mut out = Vec::new();
        DeflateDecoder::new(std::fs::File::open(file).ok()?).read_to_end(&mut out).ok()?;
        let out = Arc::new(out);
        let mut c = self.cache.lock().unwrap();
        if c.1 + out.len() > CACHE_LIMIT { c.0.clear(); c.1 = 0; }
        c.1 += out.len();
        c.0.insert(key, out.clone());
        Some(out)
    }
    /// The value with the side to move (one byte, as in the tables), or None when no table covers the position.
    pub fn value_of(&self, b: &Board, depth: u8) -> Option<u8> {
        if b.pieces.is_empty() { return Some(DRAW); }
        if let Some(v) = self.reg.try_value(b.kings, &b.pieces, b.stm) { return Some(v); }
        let w: Vec<Kind> = b.pieces.iter().filter(|p| p.0 == WHITE).map(|p| p.1).collect();
        let bl: Vec<Kind> = b.pieces.iter().filter(|p| p.0 == BLACK).map(|p| p.1).collect();
        let mat = Material::new(w, bl);
        let flip = !mat.canonical();
        let name = if flip { mat.flipped().name() } else { mat.name() };
        let p = self.packed.get(&name)?;
        if (b.stm == WHITE) == flip {
            // Red to move in the table's colours: from its moves, one step on.
            if depth > 3 { return None; }
            let moves = legal_moves(&self.reg.geo, b);
            if moves.is_empty() {
                return Some(if attacked(&self.reg.geo, b, b.kings[b.stm], 1 - b.stm, None) { loss(0) } else { DRAW });
            }
            let (mut best, mut worst, mut held) = (u8::MAX, 0u8, false);
            for (_, _, n) in &moves {
                let v = self.value_of(n, depth + 1)?;
                if is_loss(v) { best = best.min(v - 128 + 1); } else if is_win(v) { worst = worst.max(v); } else { held = true; }
            }
            return Some(if best != u8::MAX { win(best) } else if held { DRAW } else { loss(worst) });
        }
        let fl = |s: u8| if flip { (7 - (s >> 3)) * 8 + (s & 7) } else { s };
        let kings = if flip { [fl(b.kings[1]), fl(b.kings[0])] } else { b.kings };
        let pieces: Vec<Piece> = b.pieces.iter().map(|&(c, k, s)| (if flip { 1 - c } else { c }, k, fl(s))).collect();
        let mut pos = Pos { k: kings, sq: [0; MAXP] };
        let mut used = [false; MAXP];
        for (j, &(c, k)) in p.lay.slots.iter().enumerate() {
            let i = (0..pieces.len()).find(|&i| !used[i] && pieces[i].0 == c && pieces[i].1 == k)?;
            used[i] = true;
            pos.sq[j] = pieces[i].2;
        }
        let idx = p.lay.encode(&self.reg.geo, &self.reg.cb, &pos);
        let k = idx / p.part;
        if p.zero.contains(&k) { return Some(DRAW); }
        Some(self.part(&name, p, k)?[(idx - k * p.part) as usize])
    }
}

/// The JSON answer for /probe.
pub fn probe(srv: &Server, fen: &str) -> String {
    let b = match parse_fen(fen) { Ok(b) => b, Err(e) => return format!("{{\"covered\":false,\"why\":\"{}\"}}", e.replace('"', "'")) };
    let root = match srv.value_of(&b, 0) { Some(v) => v, None => return "{\"covered\":false}".into() };
    let mut moves = Vec::new();
    for (from, to, n) in legal_moves(&srv.reg.geo, &b) {
        let v = match srv.value_of(&n, 0) { Some(v) => v, None => return "{\"covered\":false}".into() };
        // The child's value is for the other side: its loss is the mover's win one move longer.
        let (r, k) = match res(v) { ("loss", k) => ("win", k + 1), ("win", k) => ("loss", k), _ => ("draw", 0) };
        moves.push(format!("{{\"from\":[{},{}],\"to\":[{},{}],\"res\":\"{}\",\"n\":{}}}", from >> 3, from & 7, to >> 3, to & 7, r, k));
    }
    let w: Vec<Kind> = b.pieces.iter().filter(|p| p.0 == WHITE).map(|p| p.1).collect();
    let bl: Vec<Kind> = b.pieces.iter().filter(|p| p.0 == BLACK).map(|p| p.1).collect();
    let mat = Material::new(w, bl);
    let name = if mat.canonical() { mat.name() } else { mat.flipped().name() };
    let (r, k) = res(root);
    format!("{{\"covered\":true,\"table\":\"{}\",\"result\":{{\"res\":\"{}\",\"n\":{}}},\"moves\":[{}]}}", name, r, k, moves.join(","))
}

/// Opens every table in `dir` (by its <name>.json), mapped from disk.
pub fn open_all(dir: &Path) -> Registry {
    let mut reg = Registry::new(dir, false);
    let mut names: Vec<String> = std::fs::read_dir(dir).map(|d| d.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|f| f.ends_with(".json")).map(|f| f.trim_end_matches(".json").to_string()).collect()).unwrap_or_default();
    names.sort();
    for n in names { if let Some(m) = Material::parse(&n) { reg.open(&m); } }
    reg
}

fn decode_query(q: &str) -> String {
    let b = q.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < b.len() => {
                let h = std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok());
                match h { Some(x) => { out.push(x); i += 2; } None => out.push(b'%') }
            }
            x => out.push(x),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// Pages that may read the answers: opened from this computer.
pub fn allowed(origin: &str) -> bool {
    ["http://localhost", "http://127.0.0.1", "http://[::1]"].iter().any(|p| origin == *p || origin.starts_with(&format!("{}:", p)))
}

fn handle(srv: &Server, names: &str, stream: TcpStream) {
    let mut reader = BufReader::new(&stream);
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() { return; }
    let mut origin = String::new();
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h).is_err() || h.trim().is_empty() { break; }
        if let Some((k, v)) = h.split_once(':') { if k.trim().eq_ignore_ascii_case("origin") { origin = v.trim().to_string(); } }
    }
    let mut parts = line.split_whitespace();
    let (method, target) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    let cors = if allowed(&origin) { format!("Access-Control-Allow-Origin: {}\r\nVary: Origin\r\n", origin) } else { String::new() };
    let mut out = &stream;
    if method == "OPTIONS" {
        let _ = write!(out, "HTTP/1.1 204 No Content\r\n{}Access-Control-Allow-Methods: GET\r\nAccess-Control-Allow-Private-Network: true\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", cors);
        return;
    }
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let (status, body) = match (method, path) {
        ("GET", "/status") => ("200 OK", format!("{{\"ok\":true,\"version\":\"{}\",\"tables\":[{}]}}", env!("CARGO_PKG_VERSION"), names)),
        ("GET", "/probe") => {
            let fen = query.split('&').find_map(|kv| kv.strip_prefix("fen=")).map(decode_query).unwrap_or_default();
            ("200 OK", probe(srv, &fen))
        }
        _ => ("404 Not Found", "{\"error\":\"GET /status or /probe?fen=…\"}".to_string()),
    };
    let _ = write!(out, "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{}Cache-Control: no-store\r\nConnection: close\r\n\r\n{}", status, body.len(), cors, body);
}

pub fn serve(dir: &Path, port: u16) {
    let srv = Arc::new(Server::open(dir));
    let list = srv.names();
    let names = Arc::new(list.iter().map(|n| format!("\"{}\"", n)).collect::<Vec<_>>().join(","));
    // Only this computer: 127.0.0.1, never 0.0.0.0.
    let listener = TcpListener::bind(("127.0.0.1", port)).unwrap_or_else(|e| panic!("cannot listen on 127.0.0.1:{}: {}", port, e));
    println!("makruk-tb: {} tables from {} at http://127.0.0.1:{} (Ctrl+C to stop)", list.len(), dir.display(), port);
    for n in &list { println!("  {}", n); }
    for stream in listener.incoming().flatten() {
        let (srv, names) = (srv.clone(), names.clone());
        std::thread::spawn(move || handle(&srv, &names, stream));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_sites_fen() {
        let b = parse_fen("7r/4k3/8/8/8/3M~4/R7/4K3 b - - 0 1").unwrap();
        assert_eq!(b.kings, [60, 12]);
        assert_eq!(b.stm, BLACK);
        assert_eq!(b.pieces.len(), 3);
        assert!(b.pieces.contains(&(WHITE, Kind::Met, 43)));
        assert!(b.pieces.contains(&(BLACK, Kind::Rook, 7)));
        assert!(parse_fen("8/8/8/8/8/3P4/8/4K2k w - - 0 1").is_err(), "pawns are not in any table");
        assert!(parse_fen("8/8/8 w").is_err());
    }

    #[test]
    fn only_local_pages() {
        assert!(allowed("http://localhost:8000") && allowed("http://127.0.0.1:8000") && allowed("http://localhost"));
        assert!(!allowed("https://natstpt.github.io") && !allowed("http://localhost.evil.com") && !allowed(""));
    }

    #[test]
    fn answers_a_skewer() {
        let dir = std::env::temp_dir().join(format!("makruk-tb-serve-test-{}", std::process::id()));
        let mut reg = Registry::new(&dir, false);
        reg.get(&Material::parse("KRvKR").unwrap());
        let reg = Server::open(&dir);
        // White: king ก1, rook ญ1; red: king ง4, rook ง8. ร.ญ1-ง1+ wins the rook (then king + rook against king).
        let a = probe(&reg, "3r4/8/8/8/3k4/8/8/K6R w - - 0 1");
        assert!(a.starts_with("{\"covered\":true,\"table\":\"KRvKR\",\"result\":{\"res\":\"win\""), "{}", a);
        assert!(a.contains("{\"from\":[7,7],\"to\":[7,3],\"res\":\"win\""), "{}", a);
        assert_eq!(probe(&reg, "8/8/8/8/3k4/8/8/K5N1 w - - 0 1"), "{\"covered\":false}", "no knight table in the folder");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn packed_answers_like_raw() {
        let dir = std::env::temp_dir().join(format!("makruk-tb-packed-test-{}", std::process::id()));
        let mut reg = Registry::new(&dir, false);
        let t = reg.get(&Material::parse("KRvKN").unwrap());
        // Positions with white and with red to move, the knight's side holding either colour.
        let fens = ["8/7R/2n5/4k3/8/8/8/1K6 w - - 0 1", "8/7R/2n5/4k3/8/8/8/1K6 b - - 0 1", "1k6/8/8/8/4K3/2N5/7r/8 w - - 0 1",
            "1k6/8/8/8/4K3/2N5/7r/8 b - - 0 1", "4k3/8/8/2n5/8/8/R7/4K3 w - - 0 1", "r3k3/8/8/8/8/8/3N4/4K3 b - - 0 1"];
        let raw = Server::open(&dir);
        let want: Vec<String> = fens.iter().map(|f| probe(&raw, f)).collect();
        drop(raw);
        crate::export::export(&t, &dir.join("packed"));
        drop(t);
        for ext in ["w.bin", "b.bin", "json"] { std::fs::remove_file(dir.join(format!("KRvKN.{}", ext))).unwrap(); }
        let packed = Server::open(&dir);
        assert!(packed.packed.contains_key("KRvKN") && !packed.reg.tables.contains_key("KRvKN"));
        for (f, w) in fens.iter().zip(&want) {
            assert!(w.starts_with("{\"covered\":true"), "{}", w);
            assert_eq!(&probe(&packed, f), w, "{}", f);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
