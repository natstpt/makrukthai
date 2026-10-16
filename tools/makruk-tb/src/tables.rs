//! Building tables by retrograde analysis, layer by layer, on all threads, and reading them back.
//!
//! Layer n: (a) every position where the side to move is mated after n-1 moves makes all positions one move before it
//! (found by moving the other side's pieces back) wins in n; (b) every position that is a win in n makes the positions
//! one move before it candidates for a loss, which a forward check confirms (all its moves lead to the other side's
//! win). A capture goes to a smaller table built before. Memory: one byte a position for each side to move.

use crate::geom::{bit, Geo, Kind, BLACK, WHITE};
use crate::layout::*;
use rayon::prelude::*;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering::Relaxed};
use std::sync::Arc;
use std::time::Instant;

/// A table's bytes: built here, or a finished file mapped from disk (the system reads only the pages used).
pub enum Data { Owned(Vec<u8>), Mapped(memmap2::Mmap) }
impl std::ops::Deref for Data {
    type Target = [u8];
    fn deref(&self) -> &[u8] { match self { Data::Owned(v) => v, Data::Mapped(m) => m } }
}
fn map(path: &Path) -> Data {
    let f = fs::File::open(path).unwrap_or_else(|e| panic!("{}: {}", path.display(), e));
    // SAFETY: the tables are written once and only read afterwards.
    Data::Mapped(unsafe { memmap2::Mmap::map(&f) }.unwrap_or_else(|e| panic!("{}: {}", path.display(), e)))
}

pub struct Table {
    pub lay: Layout,
    /// Final values by side to move [white, red].
    pub v: [Data; 2],
}

pub struct Registry {
    pub geo: Geo,
    pub cb: Combos,
    pub tables: HashMap<String, Arc<Table>>,
    pub dir: PathBuf,
    pub log: bool,
}

/// A piece on the board for lookups: colour, kind, square.
pub type Piece = (usize, Kind, u8);

impl Registry {
    pub fn new(dir: &Path, log: bool) -> Registry {
        Registry { geo: Geo::new(), cb: Combos::new(), tables: HashMap::new(), dir: dir.to_path_buf(), log }
    }

    /// The table for `mat` (canonical side up), from memory, from the folder, or built now (smaller ones first).
    pub fn get(&mut self, mat: &Material) -> Arc<Table> {
        let mat = if mat.canonical() { mat.clone() } else { mat.flipped() };
        let name = mat.name();
        if let Some(t) = self.tables.get(&name) { return t.clone(); }
        let lay = Layout::new(&mat, &self.cb);
        let files = [self.dir.join(format!("{}.w.bin", name)), self.dir.join(format!("{}.b.bin", name))];
        let table = if files.iter().all(|f| fs::metadata(f).map(|m| m.len() == lay.n).unwrap_or(false)) {
            if self.log { eprintln!("{}: read from {}", name, self.dir.display()); }
            Table { v: [map(&files[0]), map(&files[1])], lay }
        } else {
            for sub in subs(&mat) { if sub.count() > 0 { self.get(&sub); } }
            let t = build(self, lay);
            fs::create_dir_all(&self.dir).expect("cannot create the output folder");
            fs::write(&files[0], &*t.v[0]).expect("cannot write the table");
            fs::write(&files[1], &*t.v[1]).expect("cannot write the table");
            t
        };
        let about = self.dir.join(format!("{}.json", name));
        if !about.exists() { fs::write(&about, describe(&table)).expect("cannot write the table's description"); }
        let t = Arc::new(table);
        self.tables.insert(name, t.clone());
        t
    }

    /// Like get(), but the registry is consumed: for a one-off build (the self-test).
    pub fn get_owned(mut self, mat: &Material) -> Arc<Table> { self.get(mat) }

    /// The table for `mat` if its files are in the folder (never builds): for the server.
    pub fn open(&mut self, mat: &Material) -> Option<Arc<Table>> {
        let mat = if mat.canonical() { mat.clone() } else { mat.flipped() };
        let name = mat.name();
        if let Some(t) = self.tables.get(&name) { return Some(t.clone()); }
        let lay = Layout::new(&mat, &self.cb);
        let files = [self.dir.join(format!("{}.w.bin", name)), self.dir.join(format!("{}.b.bin", name))];
        if !files.iter().all(|f| fs::metadata(f).map(|m| m.len() == lay.n).unwrap_or(false)) { return None; }
        let t = Arc::new(Table { v: [map(&files[0]), map(&files[1])], lay });
        self.tables.insert(name, t.clone());
        Some(t)
    }
    /// Like value(), but None when the position's table is not open (or it has a piece no table keeps).
    pub fn try_value(&self, kings: [u8; 2], pieces: &[Piece], stm: usize) -> Option<u8> {
        if pieces.is_empty() { return Some(DRAW); }
        let w: Vec<Kind> = pieces.iter().filter(|p| p.0 == WHITE).map(|p| p.1).collect();
        let b: Vec<Kind> = pieces.iter().filter(|p| p.0 == BLACK).map(|p| p.1).collect();
        let mat = Material::new(w, b);
        let canon = if mat.canonical() { mat } else { mat.flipped() };
        if !self.tables.contains_key(&canon.name()) { return None; }
        Some(self.value(kings, pieces, stm))
    }

    /// Value with `stm` to move of any position whose table is loaded (kings [white, red], pieces any order).
    pub fn value(&self, kings: [u8; 2], pieces: &[Piece], stm: usize) -> u8 {
        if pieces.is_empty() { return DRAW; }
        let w: Vec<Kind> = pieces.iter().filter(|p| p.0 == WHITE).map(|p| p.1).collect();
        let b: Vec<Kind> = pieces.iter().filter(|p| p.0 == BLACK).map(|p| p.1).collect();
        let mat = Material::new(w, b);
        if mat.canonical() { return self.value_in(&mat, kings, pieces, stm); }
        // Read the colours the other way round: ranks flipped, sides swapped.
        let fl = |s: u8| (7 - (s >> 3)) * 8 + (s & 7);
        let p2: Vec<Piece> = pieces.iter().map(|&(c, k, s)| (1 - c, k, fl(s))).collect();
        self.value_in(&mat.flipped(), [fl(kings[1]), fl(kings[0])], &p2, 1 - stm)
    }
    fn value_in(&self, mat: &Material, kings: [u8; 2], pieces: &[Piece], stm: usize) -> u8 {
        let t = self.tables.get(&mat.name()).unwrap_or_else(|| panic!("table {} is not loaded", mat.name()));
        let mut p = Pos { k: kings, sq: [0; MAXP] };
        let mut used = [false; MAXP];
        for (j, &(c, k)) in t.lay.slots.iter().enumerate() {
            let i = (0..pieces.len()).find(|&i| !used[i] && pieces[i].0 == c && pieces[i].1 == k).unwrap();
            used[i] = true; p.sq[j] = pieces[i].2;
        }
        t.v[stm][t.lay.encode(&self.geo, &self.cb, &p) as usize]
    }
}

/// The materials one capture away.
pub fn subs(mat: &Material) -> Vec<Material> {
    let mut out: Vec<Material> = Vec::new();
    for i in 0..mat.w.len() {
        let mut w = mat.w.clone(); w.remove(i);
        let m = Material::new(w, mat.b.clone()); if !out.contains(&m) { out.push(m); }
    }
    for i in 0..mat.b.len() {
        let mut b = mat.b.clone(); b.remove(i);
        let m = Material::new(mat.w.clone(), b); if !out.contains(&m) { out.push(m); }
    }
    out
}

/// One position seen through its layout: occupancy and attack questions.
pub struct Board<'a> {
    pub geo: &'a Geo,
    pub lay: &'a Layout,
    pub p: Pos,
    pub n: usize,
}

impl<'a> Board<'a> {
    #[inline]
    pub fn occ(&self, skip: usize) -> u64 {
        let mut o = bit(self.p.k[0]) | bit(self.p.k[1]);
        for j in 0..self.n { if j != skip { o |= bit(self.p.sq[j]); } }
        o
    }
    #[inline]
    pub fn side_occ(&self, color: usize, skip: usize) -> u64 {
        let mut o = bit(self.p.k[color]);
        for j in 0..self.n { if j != skip && self.lay.slots[j].0 == color { o |= bit(self.p.sq[j]); } }
        o
    }
    /// Is square `s` attacked by `by` (its king and pieces, but slot `skip`), with `occ` occupied?
    #[inline]
    pub fn attacked(&self, s: u8, by: usize, skip: usize, occ: u64) -> bool {
        if self.geo.king[self.p.k[by] as usize] & bit(s) != 0 { return true; }
        for j in 0..self.n {
            let (c, k) = self.lay.slots[j];
            if c != by || j == skip || self.p.sq[j] == s { continue; }
            if self.geo.attacks(k, c, self.p.sq[j], occ) & bit(s) != 0 { return true; }
        }
        false
    }
    /// Squares distinct and kings apart.
    pub fn sane(&self) -> bool {
        let mut seen = bit(self.p.k[0]) | bit(self.p.k[1]);
        if self.p.k[0] == self.p.k[1] || self.geo.king[self.p.k[0] as usize] & bit(self.p.k[1]) != 0 { return false; }
        for j in 0..self.n { let b = bit(self.p.sq[j]); if seen & b != 0 { return false; } seen |= b; }
        true
    }
    /// Legal with `stm` to move: the other king is not attacked.
    pub fn legal(&self, stm: usize) -> bool { self.sane() && !self.attacked(self.p.k[1 - stm], stm, usize::MAX, self.occ(usize::MAX)) }
    pub fn in_check(&self, stm: usize) -> bool { self.attacked(self.p.k[stm], 1 - stm, usize::MAX, self.occ(usize::MAX)) }
}

/// A move's result: a position of the same table, or a capture (into a smaller table, given by its value).
pub enum Child { Same(u64), Capture(u8) }

/// Calls `f` for every legal move of `stm` (until it returns false). Returns how many moves there were.
pub fn for_moves(reg: &Registry, lay: &Layout, p: &Pos, stm: usize, mut f: impl FnMut(Child) -> bool) -> usize {
    let geo = &reg.geo;
    let n = lay.slots.len();
    let b = Board { geo, lay, p: *p, n };
    let occ = b.occ(usize::MAX);
    let own = b.side_occ(stm, usize::MAX);
    let them = 1 - stm;
    let mut count = 0usize;
    let theirs_at = |s: u8| (0..n).find(|&j| lay.slots[j].0 == them && p.sq[j] == s);
    // King moves.
    let mut dests = geo.king[p.k[stm] as usize] & !own & !geo.king[p.k[them] as usize];
    while dests != 0 {
        let t = dests.trailing_zeros() as u8; dests &= dests - 1;
        let cap = theirs_at(t);
        let mut q = *p; q.k[stm] = t;
        let nb = Board { geo, lay, p: q, n };
        let skip = cap.unwrap_or(usize::MAX);
        if nb.attacked(t, them, skip, nb.occ(skip)) { continue; }
        count += 1;
        let go = match cap { None => f(Child::Same(lay.encode(geo, &reg.cb, &q))), Some(j) => f(Child::Capture(capture_value(reg, lay, &q, j, them))) };
        if !go { return count; }
    }
    // Piece moves.
    for j in 0..n {
        let (c, k) = lay.slots[j];
        if c != stm { continue; }
        let mut dests = geo.attacks(k, c, p.sq[j], occ) & !own & !bit(p.k[them]);
        while dests != 0 {
            let t = dests.trailing_zeros() as u8; dests &= dests - 1;
            let cap = theirs_at(t);
            let mut q = *p; q.sq[j] = t;
            let nb = Board { geo, lay, p: q, n };
            let skip = cap.unwrap_or(usize::MAX);
            if nb.attacked(q.k[stm], them, skip, nb.occ(skip)) { continue; }
            count += 1;
            let go = match cap { None => f(Child::Same(lay.encode(geo, &reg.cb, &q))), Some(i) => f(Child::Capture(capture_value(reg, lay, &q, i, them))) };
            if !go { return count; }
        }
    }
    count
}

/// After a capture of slot `j` (q has the capturer on that square): the value with `stm` to move, from the smaller table.
fn capture_value(reg: &Registry, lay: &Layout, q: &Pos, j: usize, stm: usize) -> u8 {
    let mut pieces: Vec<Piece> = Vec::with_capacity(MAXP);
    for i in 0..lay.slots.len() { if i != j { pieces.push((lay.slots[i].0, lay.slots[i].1, q.sq[i])); } }
    reg.value(q.k, &pieces, stm)
}

/// Calls `f` with the index of every legal position, with `mover` to move, one non-capturing move of `mover` before `p`
/// (where the other side is to move).
pub fn for_unmoves(reg: &Registry, lay: &Layout, p: &Pos, mover: usize, mut f: impl FnMut(u64)) {
    let geo = &reg.geo;
    let n = lay.slots.len();
    let b = Board { geo, lay, p: *p, n };
    let occ = b.occ(usize::MAX);
    let them = 1 - mover;
    let back = |q: Pos, f: &mut dyn FnMut(u64)| {
        let nb = Board { geo, lay, p: q, n };
        if nb.attacked(q.k[them], mover, usize::MAX, nb.occ(usize::MAX)) { return; }
        f(lay.encode(geo, &reg.cb, &q));
    };
    let mut from = geo.king[p.k[mover] as usize] & !occ & !geo.king[p.k[them] as usize];
    while from != 0 {
        let s = from.trailing_zeros() as u8; from &= from - 1;
        let mut q = *p; q.k[mover] = s; back(q, &mut f);
    }
    for j in 0..n {
        let (c, k) = lay.slots[j];
        if c != mover { continue; }
        let mut from = geo.sources(k, c, p.sq[j], occ);
        while from != 0 {
            let s = from.trailing_zeros() as u8; from &= from - 1;
            let mut q = *p; q.sq[j] = s; back(q, &mut f);
        }
    }
}

fn atomic(v: Vec<u8>) -> Vec<AtomicU8> {
    let mut v = std::mem::ManuallyDrop::new(v);
    // SAFETY: AtomicU8 has the same size and alignment as u8.
    unsafe { Vec::from_raw_parts(v.as_mut_ptr() as *mut AtomicU8, v.len(), v.capacity()) }
}
fn plain(v: Vec<AtomicU8>) -> Vec<u8> {
    let mut v = std::mem::ManuallyDrop::new(v);
    unsafe { Vec::from_raw_parts(v.as_mut_ptr() as *mut u8, v.len(), v.capacity()) }
}

const CHUNK: u64 = 1 << 16;

pub fn build(reg: &Registry, lay: Layout) -> Table {
    let t0 = Instant::now();
    let n = lay.n;
    let name = lay.mat.name();
    if reg.log { eprintln!("{}: {} positions a side to move, {:.1} GB of memory", name, n, 2.0 * n as f64 / 1e9); }
    let v: [Vec<AtomicU8>; 2] = [atomic(vec![UNKNOWN; n as usize]), atomic(vec![UNKNOWN; n as usize])];
    let chunks = (n + CHUNK - 1) / CHUNK;
    let far = AtomicU64::new(0); // the longest distance set ahead of its layer (captures)
    let bump = |d: u8| { far.fetch_max(d as u64, Relaxed); };
    // Set-up: illegal positions, mates and stalemates, wins by capture, and losses where every move captures into a loss.
    (0..chunks).into_par_iter().for_each(|ch| {
        for i in ch * CHUNK..((ch + 1) * CHUNK).min(n) {
            let p = lay.decode(&reg.cb, i);
            let b = Board { geo: &reg.geo, lay: &lay, p, n: lay.slots.len() };
            // A mirror image of a position kept under a smaller index: copied from there at the end.
            let mirror = b.sane() && lay.encode(&reg.geo, &reg.cb, &p) != i;
            for stm in 0..2 {
                if mirror || !b.legal(stm) { v[stm][i as usize].store(ILLEGAL, Relaxed); continue; }
                let (mut best_win, mut worst_loss, mut escape, mut quiet) = (u8::MAX, 0u8, false, 0usize);
                let moves = for_moves(reg, &lay, &p, stm, |c| {
                    match c {
                        Child::Same(_) => quiet += 1,
                        Child::Capture(x) => {
                            if is_loss(x) { best_win = best_win.min(x - 128 + 1); }
                            else if is_win(x) { worst_loss = worst_loss.max(x); }
                            else { escape = true; }
                        }
                    }
                    true
                });
                let out = if moves == 0 { if b.in_check(stm) { loss(0) } else { DRAW } }
                    else if best_win != u8::MAX { bump(best_win); win(best_win) }
                    else if quiet == 0 && !escape { bump(worst_loss); loss(worst_loss) }
                    else { UNKNOWN };
                v[stm][i as usize].store(out, Relaxed);
            }
        }
    });
    if reg.log { eprintln!("  set up in {:.0} s", t0.elapsed().as_secs_f64()); }
    let mut layer: u8 = 1;
    loop {
        let (wins, losses) = (AtomicU64::new(0), AtomicU64::new(0));
        // (a) losses in layer-1 make wins in `layer` one move back.
        (0..chunks).into_par_iter().for_each(|ch| {
            for stm in 0..2 {
                for i in ch * CHUNK..((ch + 1) * CHUNK).min(n) {
                    if v[stm][i as usize].load(Relaxed) != loss(layer - 1) { continue; }
                    let p = lay.decode(&reg.cb, i);
                    let back = &v[1 - stm];
                    for_unmoves(reg, &lay, &p, 1 - stm, |j| {
                        let cell = &back[j as usize];
                        let mut cur = cell.load(Relaxed);
                        while cur == UNKNOWN || (is_win(cur) && cur > layer) {
                            match cell.compare_exchange(cur, win(layer), Relaxed, Relaxed) {
                                Ok(_) => { if cur == UNKNOWN { wins.fetch_add(1, Relaxed); } break; }
                                Err(x) => cur = x,
                            }
                        }
                    });
                }
            }
        });
        // (b) wins in `layer` make the positions one move back candidates for a loss; check them forward.
        (0..chunks).into_par_iter().for_each(|ch| {
            for stm in 0..2 {
                for i in ch * CHUNK..((ch + 1) * CHUNK).min(n) {
                    if v[stm][i as usize].load(Relaxed) != win(layer) { continue; }
                    let p = lay.decode(&reg.cb, i);
                    let mover = 1 - stm;
                    for_unmoves(reg, &lay, &p, mover, |j| {
                        if v[mover][j as usize].load(Relaxed) != UNKNOWN { return; }
                        let q = lay.decode(&reg.cb, j);
                        let mut worst = 0u8;
                        let mut ok = true;
                        for_moves(reg, &lay, &q, mover, |c| {
                            // A win in this table is final once its layer is reached (one found by a capture may
                            // still get shorter); a smaller table's values are final.
                            let x = match c { Child::Same(k) => v[stm][k as usize].load(Relaxed), Child::Capture(x) => x };
                            let fin = match c { Child::Same(_) => x <= layer, Child::Capture(_) => true };
                            if !is_win(x) || !fin { ok = false; return false; }
                            worst = worst.max(x); true
                        });
                        if ok && v[mover][j as usize].compare_exchange(UNKNOWN, loss(worst), Relaxed, Relaxed).is_ok() {
                            losses.fetch_add(1, Relaxed); bump(worst);
                        }
                    });
                }
            }
        });
        let (a, b) = (wins.load(Relaxed), losses.load(Relaxed));
        if reg.log { eprintln!("  layer {}: {} wins, {} losses, {:.1} min", layer, a, b, t0.elapsed().as_secs_f64() / 60.0); }
        if a == 0 && b == 0 && layer as u64 > far.load(Relaxed) { break; }
        if layer >= max_dtm() { long_mates(reg, &lay, &v, &name, t0); break; }
        layer += 1;
    }
    let [w, b] = v;
    let (mut w, mut b) = (plain(w), plain(b));
    w.par_iter_mut().chain(b.par_iter_mut()).for_each(|x| { if *x == UNKNOWN || *x == ILLEGAL { *x = DRAW; } });
    // Mirror images get their position's value, so a reader may number positions either way.
    let lr = &lay;
    for side in [&mut w, &mut b] {
        let copies: Vec<(u64, u8)> = (0..chunks).into_par_iter().flat_map_iter(|ch| {
            let (side, lay) = (&*side, lr);
            (ch * CHUNK..((ch + 1) * CHUNK).min(n)).filter_map(move |i| {
                let p = lay.decode(&reg.cb, i);
                let b = Board { geo: &reg.geo, lay: &lay, p, n: lay.slots.len() };
                if !b.sane() { return None; }
                let c = lay.encode(&reg.geo, &reg.cb, &p);
                if c != i { Some((i, side[c as usize])) } else { None }
            })
        }).collect();
        for (i, x) in copies { side[i as usize] = x; }
    }
    if reg.log { eprintln!("{}: done in {:.1} min", name, t0.elapsed().as_secs_f64() / 60.0); }
    Table { lay, v: [Data::Owned(w), Data::Owned(b)] }
}

/// Mates longer than max_dtm() moves: still found (win or loss), kept as long(). Losses newly known make the positions one
/// move back wins; wins newly known make them loss candidates, checked forward; until nothing more is found. Which
/// positions are new is kept in two bit sets a side.
fn long_mates(reg: &Registry, lay: &Layout, v: &[Vec<AtomicU8>; 2], name: &str, t0: Instant) {
    let n = lay.n;
    let words = ((n + 63) / 64) as usize;
    let bits = || (0..words).map(|_| AtomicU64::new(0)).collect::<Vec<_>>();
    let set = |b: &Vec<AtomicU64>, i: u64| { b[(i / 64) as usize].fetch_or(1 << (i % 64), Relaxed); };
    let each = |b: &Vec<AtomicU64>, f: &(dyn Fn(u64) + Sync)| {
        b.par_iter().enumerate().for_each(|(w, x)| {
            let mut m = x.load(Relaxed);
            while m != 0 { let t = m.trailing_zeros() as u64; m &= m - 1; f(w as u64 * 64 + t); }
        });
    };
    // Start from the losses of the last counted layer, and the long wins and losses set up from captures.
    let mut lost = [bits(), bits()];
    let mut first = [bits(), bits()];
    let chunks = (n + CHUNK - 1) / CHUNK;
    for stm in 0..2 {
        (0..chunks).into_par_iter().for_each(|ch| {
            for i in ch * CHUNK..((ch + 1) * CHUNK).min(n) {
                let x = v[stm][i as usize].load(Relaxed);
                if x == loss(max_dtm()) || x == loss(long()) { set(&lost[stm], i); }
                if x == long() { set(&first[stm], i); }
            }
        });
    }
    let mut round = 0;
    loop {
        round += 1;
        let (wins, losses) = (AtomicU64::new(0), AtomicU64::new(0));
        let won = std::mem::replace(&mut first, [bits(), bits()]);
        for stm in 0..2 {
            let back = &v[1 - stm];
            each(&lost[stm], &|i| {
                let p = lay.decode(&reg.cb, i);
                for_unmoves(reg, lay, &p, 1 - stm, |j| {
                    if back[j as usize].compare_exchange(UNKNOWN, long(), Relaxed, Relaxed).is_ok() { set(&won[1 - stm], j); wins.fetch_add(1, Relaxed); }
                });
            });
        }
        let next = [bits(), bits()];
        for stm in 0..2 {
            let mover = 1 - stm;
            each(&won[stm], &|i| {
                let p = lay.decode(&reg.cb, i);
                for_unmoves(reg, lay, &p, mover, |j| {
                    if v[mover][j as usize].load(Relaxed) != UNKNOWN { return; }
                    let q = lay.decode(&reg.cb, j);
                    let mut ok = true;
                    for_moves(reg, lay, &q, mover, |c| {
                        let x = match c { Child::Same(k) => v[stm][k as usize].load(Relaxed), Child::Capture(x) => x };
                        if !is_win(x) { ok = false; return false; }
                        true
                    });
                    if ok && v[mover][j as usize].compare_exchange(UNKNOWN, loss(long()), Relaxed, Relaxed).is_ok() { set(&next[mover], j); losses.fetch_add(1, Relaxed); }
                });
            });
        }
        let (a, b) = (wins.load(Relaxed), losses.load(Relaxed));
        if reg.log { eprintln!("  beyond {} moves, round {}: {} wins, {} losses, {:.1} min", max_dtm(), round, a, b, t0.elapsed().as_secs_f64() / 60.0); }
        if a == 0 && b == 0 { break; }
        lost = next;
    }
    if reg.log { eprintln!("{}: mates of {} moves or more are kept as {} (win or loss, moves not counted)", name, long(), long()); }
}

/// <name>.json next to the table: how it numbers positions (for readers in other languages) and what it holds.
pub fn describe(t: &Table) -> String {
    let (won, lost, longest) = stats(t);
    let side = |v: &Vec<crate::geom::Kind>| v.iter().map(|k| format!("\"{}\"", k.letter())).collect::<Vec<_>>().join(",");
    let groups = t.lay.groups.iter().map(|g| format!("{{\"start\":{},\"count\":{},\"size\":{}}}", g.start, g.count, g.size)).collect::<Vec<_>>().join(",");
    let kings = t.lay.kings.iter().map(|k| k.to_string()).collect::<Vec<_>>().join(",");
    let sym = t.lay.sym.iter().map(|k| k.to_string()).collect::<Vec<_>>().join(",");
    format!("{{\"name\":\"{}\",\"white\":[{}],\"black\":[{}],\"positions\":{},\"symmetries\":[{}],\"kings\":[{}],\"comb\":{},\"groups\":[{}],\"files\":[\"{}.w.bin\",\"{}.b.bin\"],\"wins\":{},\"losses\":{},\"longest\":{}}}
",
        t.lay.mat.name(), side(&t.lay.mat.w), side(&t.lay.mat.b), t.lay.n, sym, kings, t.lay.comb, groups, t.lay.mat.name(), t.lay.mat.name(), won, lost, longest)
}

/// Counts for the report: wins and losses with each side to move, and the longest mate.
pub fn stats(t: &Table) -> (u64, u64, u8) {
    let (mut won, mut lost, mut longest) = (0u64, 0u64, 0u8);
    for side in &t.v { for &x in side.iter() { if is_win(x) { won += 1; longest = longest.max(x); } else if is_loss(x) { lost += 1; } } }
    (won, lost, longest)
}
