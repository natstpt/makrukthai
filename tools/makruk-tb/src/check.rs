//! Checks this builder against the tables the site already has (built by the JavaScript scripts):
//! tablebase/krk.bin (king + rook), tablebase/<pieces>.bin (one or two of rook, knight, khon, promoted pawn), and any
//! tablebase/<pieces>/ big-format table (three pieces). They keep, with the strong side (white) to move, the moves to
//! mate (0: none); every legal position must agree.

use crate::geom::{Kind, WHITE};
use crate::layout::*;
use crate::tables::{for_moves, Board, Child, Piece, Registry};
use rayon::prelude::*;
use flate2::read::DeflateDecoder;
use std::fs;
use std::io::Read;
use std::path::Path;

fn inflate(path: &Path) -> Vec<u8> {
    let mut out = Vec::new();
    DeflateDecoder::new(fs::File::open(path).unwrap_or_else(|e| panic!("{}: {}", path.display(), e))).read_to_end(&mut out).unwrap();
    out
}
fn kind_of(js: &str) -> Kind {
    match js { "rook" => Kind::Rook, "knight" => Kind::Knight, "khon" => Kind::Khon, "promoted" => Kind::Met, _ => panic!("unknown piece {}", js) }
}
fn ours(reg: &Registry, wk: u8, bk: u8, pieces: &[Piece]) -> u8 {
    let v = reg.value([wk, bk], pieces, WHITE);
    if is_win(v) { v } else { 0 }
}
fn sane(squares: &[u8]) -> bool {
    let near = |a: u8, b: u8| ((a >> 3) as i32 - (b >> 3) as i32).abs() <= 1 && ((a & 7) as i32 - (b & 7) as i32).abs() <= 1;
    (0..squares.len()).all(|i| (i + 1..squares.len()).all(|j| squares[i] != squares[j])) && !near(squares[0], squares[1])
}

/// tablebase/krk.bin: squares 0..63 from ก1 (a1) along each rank, the strong king on a1 b1 c1 d1 b2 c2 d2 c3 d3 d4.
pub fn krk(reg: &mut Registry, repo: &Path) -> u64 {
    let old = fs::read(repo.join("tablebase/krk.bin")).expect("tablebase/krk.bin");
    reg.get(&Material::new(vec![Kind::Rook], vec![]));
    let tri = [0u8, 1, 2, 3, 9, 10, 11, 18, 19, 27];
    let ours_sq = |s: u8| (7 - (s >> 3)) * 8 + (s & 7);
    let mut n = 0;
    for (k, &wk) in tri.iter().enumerate() {
        for wr in 0..64u8 { for bk in 0..64u8 {
            let (a, r, b) = (ours_sq(wk), ours_sq(wr), ours_sq(bk));
            if !sane(&[a, b, r]) { continue; }
            let mine = ours(reg, a, b, &[(WHITE, Kind::Rook, r)]);
            let theirs = old[k * 4096 + wr as usize * 64 + bk as usize];
            assert_eq!(mine, theirs, "krk: king {} rook {} lone king {}", a, r, b);
            n += 1;
        } }
    }
    n
}

/// tablebase/<a-b>.bin: value[((r*4 + c of the strong king) * 64 + loneKing) * 64 + piece1 (* 64 + piece2)], c < 4.
pub fn small(reg: &mut Registry, repo: &Path, name: &str) -> u64 {
    let kinds: Vec<Kind> = name.split('-').map(kind_of).collect();
    reg.get(&Material::new(kinds.clone(), vec![]));
    let old = inflate(&repo.join(format!("tablebase/{}.bin", name)));
    let np = kinds.len();
    let mut n = 0;
    for (i, &theirs) in old.iter().enumerate() {
        let mut x = i;
        let mut sq = [0u8; 2];
        for j in (0..np).rev() { sq[j] = (x % 64) as u8; x /= 64; }
        let bk = (x % 64) as u8; let h = x / 64;
        let wk = ((h >> 2) * 8 + (h & 3)) as u8;
        let mut all = vec![wk, bk]; all.extend_from_slice(&sq[..np]);
        if !sane(&all) { continue; }
        let pieces: Vec<Piece> = (0..np).map(|j| (WHITE, kinds[j], sq[j])).collect();
        let mine = ours(reg, wk, bk, &pieces);
        assert_eq!(mine, theirs, "{}: king {} lone king {} pieces {:?}", name, wk, bk, &sq[..np]);
        n += 1;
    }
    n
}

/// A big-format table (scripts/build-big-tables.cjs): info.json and one file per strong-king square.
pub fn big(reg: &mut Registry, dir: &Path) -> u64 {
    let info: serde_json::Value = serde_json::from_str(&fs::read_to_string(dir.join("info.json")).expect("info.json")).unwrap();
    let kinds: Vec<Kind> = info["types"].as_array().unwrap().iter().map(|t| kind_of(t.as_str().unwrap())).collect();
    let kings: Vec<u8> = info["kings"].as_array().unwrap().iter().map(|k| k.as_u64().unwrap() as u8).collect();
    let comb = info["comb"].as_u64().unwrap();
    let mat = Material::new(kinds.clone(), vec![]);
    reg.get(&mat);
    let lay = Layout::new(&mat, &reg.cb);
    assert_eq!(lay.comb, comb, "same numbering of the pieces");
    let mut n = 0;
    for (k, &wk) in kings.iter().enumerate() {
        let old = inflate(&dir.join(format!("{}.bin", k)));
        for (i, &theirs) in old.iter().enumerate() {
            let bk = (i as u64 / comb) as u8;
            let mut p = lay.decode(&reg.cb, (lay.kidx[wk as usize] as u64 * 64 + bk as u64) * comb + i as u64 % comb);
            p.k = [wk, bk];
            let mut all = vec![wk, bk]; all.extend_from_slice(&p.sq[..kinds.len()]);
            if !sane(&all) { continue; }
            let pieces: Vec<Piece> = (0..kinds.len()).map(|j| (WHITE, lay.slots[j].1, p.sq[j])).collect();
            let mine = ours(reg, wk, bk, &pieces);
            assert_eq!(mine, theirs, "{}: king {} lone king {} pieces {:?}", dir.display(), wk, bk, &p.sq[..kinds.len()]);
            n += 1;
        }
    }
    n
}

/// Every legal position of a table agrees with its moves one step on: a move into a loss for the other side makes it a
/// win one move longer than the shortest such; otherwise all moves into the other side's wins make it a loss as long
/// as the longest; mate and stalemate as the rules say; anything else is a draw. Works for tables of any material
/// (also both sides with pieces), which have no older table to compare with. Returns the positions checked.
pub fn consistent(reg: &mut Registry, mat: &Material) -> u64 {
    let t = reg.get(mat);
    let reg = &*reg;
    let lay = &t.lay;
    (0..lay.n).into_par_iter().map(|i| {
        let p = lay.decode(&reg.cb, i);
        let b = Board { geo: &reg.geo, lay, p, n: lay.slots.len() };
        let mut checked = 0u64;
        for stm in 0..2 {
            if !b.legal(stm) { continue; }
            let (mut best_win, mut worst_loss, mut all_lose) = (u8::MAX, 0u8, true);
            let moves = for_moves(reg, lay, &p, stm, |c| {
                let x = match c { Child::Same(k) => t.v[1 - stm][k as usize], Child::Capture(x) => x };
                if is_loss(x) { best_win = best_win.min(x - 128 + 1); }
                if is_win(x) { worst_loss = worst_loss.max(x); } else { all_lose = false; }
                true
            });
            let want = if moves == 0 { if b.in_check(stm) { loss(0) } else { DRAW } }
                else if best_win != u8::MAX { win(best_win) } else if all_lose { loss(worst_loss) } else { DRAW };
            let got = t.v[stm][i as usize];
            assert_eq!(got, want, "{} index {} side {}: {} in the table, {} from its moves (kings {:?} pieces {:?})", mat.name(), i, stm, got, want, p.k, &p.sq[..lay.slots.len()]);
            checked += 1;
        }
        checked
    }).sum()
}

/// Like consistent(), on `count` positions drawn at random (for tables too big to go through whole), with the
/// tables already in the registry (opened, not built). Returns the positions checked.
pub fn sample(reg: &Registry, mat: &Material, count: u64, seed: u64) -> u64 {
    let canon = if mat.canonical() { mat.clone() } else { mat.flipped() };
    let t = reg.tables.get(&canon.name()).unwrap_or_else(|| panic!("table {} is not in the folder", canon.name())).clone();
    let lay = &t.lay;
    (0..count).into_par_iter().map(|k| {
        // splitmix64: a position number from the sample number.
        let mut z = seed.wrapping_add(k.wrapping_mul(0x9E3779B97F4A7C15));
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9); z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB); z ^= z >> 31;
        let i = z % lay.n;
        let p = lay.decode(&reg.cb, i);
        let b = Board { geo: &reg.geo, lay, p, n: lay.slots.len() };
        let mut checked = 0u64;
        for stm in 0..2 {
            if !b.legal(stm) { continue; }
            let (mut best_win, mut worst_loss, mut all_lose) = (u8::MAX, 0u8, true);
            let moves = for_moves(reg, lay, &p, stm, |c| {
                let x = match c { Child::Same(k) => t.v[1 - stm][k as usize], Child::Capture(x) => x };
                if is_loss(x) { best_win = best_win.min(x - 128 + 1); }
                if is_win(x) { worst_loss = worst_loss.max(x); } else { all_lose = false; }
                true
            });
            let want = if moves == 0 { if b.in_check(stm) { loss(0) } else { DRAW } }
                else if best_win != u8::MAX { win(best_win) } else if all_lose { loss(worst_loss) } else { DRAW };
            let got = t.v[stm][i as usize];
            assert_eq!(got, want, "{} index {} side {}: {} in the table, {} from its moves (kings {:?} pieces {:?})", canon.name(), i, stm, got, want, p.k, &p.sq[..lay.slots.len()]);
            checked += 1;
        }
        checked
    }).sum()
}

/// Checks the pass for mates longer than the exact cap: builds `mat` (and its smaller tables) twice in scratch folders,
/// as usual and with mates counted only up to `cap` moves. Every position must be the same win, loss or draw, with the
/// same moves when they are within `cap` (and "long" beyond). Returns (positions compared, positions beyond the cap).
pub fn long_selftest(mat: &Material, cap: u8) -> (u64, u64) {
    let base = std::env::temp_dir().join(format!("makruk-tb-long-{}", std::process::id()));
    set_cap(124);
    let full = Registry::new(&base.join("full"), false).get_owned(mat);
    set_cap(cap);
    let short = Registry::new(&base.join("cap"), false).get_owned(mat);
    set_cap(124);
    let class = |x: u8, long: u8| if x >= 1 && x <= long { 1 } else if x >= 128 && x <= 128 + long { 2 } else { 0 };
    let (mut n, mut beyond) = (0u64, 0u64);
    for stm in 0..2 {
        for (i, (&x, &y)) in full.v[stm].iter().zip(short.v[stm].iter()).enumerate() {
            let (cx, cy) = (class(x, 125), class(y, cap + 1));
            assert_eq!(cx, cy, "{} index {} side {}: {} built as usual, {} with the cap at {}", mat.name(), i, stm, x, y, cap);
            let moves = if cx == 1 { x } else if cx == 2 { x - 128 } else { 0 };
            if cx != 0 && moves > cap {
                beyond += 1;
                assert_eq!(y, if cx == 1 { cap + 1 } else { 128 + cap + 1 }, "{} index {}: a long mate is kept as long", mat.name(), i);
            } else {
                assert_eq!(x, y, "{} index {} side {}: same moves within the cap", mat.name(), i, stm);
            }
            n += 1;
        }
    }
    let _ = std::fs::remove_dir_all(&base);
    (n, beyond)
}
