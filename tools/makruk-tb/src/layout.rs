//! Materials (which pieces each side has) and how a table numbers its positions.
//!
//! A position is the two kings plus up to four pieces, kept per "slot": the slots are the white pieces then the red
//! ones, each side's in the order rook, knight, khon, met. Pieces of one colour and type form a group and are kept as
//! a set (any order), numbered by the combinatorial number system.
//! Index = (white king's square number * 64 + red king) * COMB + pieces, with the white king on one of the squares the
//! board's symmetries leave: all 8 symmetries when no khon is on the board (10 squares: r <= 3, c <= 3, r <= c), else
//! only the left-right mirror (32 squares: c <= 3). With the white king on a diagonal of the triangle a position and
//! its mirror image have two indices: the smaller one is computed, the other gets a copy of its value at the end.

use crate::geom::{Geo, Kind, BLACK, WHITE};

#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub struct Material {
    pub w: Vec<Kind>,
    pub b: Vec<Kind>,
}

impl Material {
    pub fn new(mut w: Vec<Kind>, mut b: Vec<Kind>) -> Material { w.sort(); b.sort(); Material { w, b } }
    /// "KRMMvKR": king, rook, two mets against king and rook. S is a khon, N a knight, M a met or promoted pawn.
    pub fn parse(text: &str) -> Option<Material> {
        let t = text.trim().to_ascii_uppercase();
        let (a, b) = t.split_once('V')?;
        let side = |s: &str| -> Option<Vec<Kind>> {
            let s = s.strip_prefix('K')?;
            s.chars().map(Kind::from_letter).collect()
        };
        Some(Material::new(side(a)?, side(b)?))
    }
    pub fn name(&self) -> String {
        let s = |v: &Vec<Kind>| v.iter().map(|k| k.letter()).collect::<String>();
        format!("K{}vK{}", s(&self.w), s(&self.b))
    }
    pub fn count(&self) -> usize { self.w.len() + self.b.len() }
    pub fn flipped(&self) -> Material { Material { w: self.b.clone(), b: self.w.clone() } }
    /// Tables keep the side with more (or stronger) pieces as white; the other way round is read by flipping.
    pub fn canonical(&self) -> bool {
        self.w.len() > self.b.len() || (self.w.len() == self.b.len() && self.w <= self.b)
    }
    pub fn has_khon(&self) -> bool { self.w.contains(&Kind::Khon) || self.b.contains(&Kind::Khon) }
    pub fn slots(&self) -> Vec<(usize, Kind)> {
        self.w.iter().map(|&k| (WHITE, k)).chain(self.b.iter().map(|&k| (BLACK, k))).collect()
    }
}

pub const MAXP: usize = 4;

/// A position: kings [white, red] and the pieces' squares by slot.
#[derive(Clone, Copy, Debug)]
pub struct Pos {
    pub k: [u8; 2],
    pub sq: [u8; MAXP],
}

#[derive(Clone, Debug)]
pub struct Group { pub start: usize, pub count: usize, pub size: u64 }

pub struct Combos {
    pub binom: [[u64; 5]; 65],
    pub unrank: [Vec<[u8; 4]>; 5],
}

impl Combos {
    pub fn new() -> Combos {
        let mut binom = [[0u64; 5]; 65];
        for n in 0..65 { binom[n][0] = 1; for k in 1..5 { binom[n][k] = if n == 0 { 0 } else { binom[n - 1][k - 1] + binom[n - 1][k] }; } }
        let mut unrank: [Vec<[u8; 4]>; 5] = Default::default();
        for k in 1..5 {
            let mut v = vec![[0u8; 4]; binom[64][k] as usize];
            let mut cur = [0u8; 4];
            fn rec(k: usize, at: usize, lo: u8, cur: &mut [u8; 4], v: &mut Vec<[u8; 4]>, binom: &[[u64; 5]; 65]) {
                if at == k {
                    let mut r = 0u64;
                    for j in 0..k { r += binom[cur[j] as usize][j + 1]; }
                    v[r as usize] = *cur; return;
                }
                for s in lo..64 { cur[at] = s; rec(k, at + 1, s + 1, cur, v, binom); }
            }
            rec(k, 0, 0, &mut cur, &mut v, &binom);
            unrank[k] = v;
        }
        Combos { binom, unrank }
    }
    #[inline]
    pub fn rank(&self, sorted: &[u8]) -> u64 {
        let mut r = 0u64;
        for (j, &s) in sorted.iter().enumerate() { r += self.binom[s as usize][j + 1]; }
        r
    }
}

pub struct Layout {
    pub mat: Material,
    pub slots: Vec<(usize, Kind)>,
    pub groups: Vec<Group>,
    pub sym: Vec<usize>,
    pub kings: Vec<u8>,
    pub kidx: [i8; 64],
    pub comb: u64,
    pub n: u64,
}

impl Layout {
    pub fn new(mat: &Material, cb: &Combos) -> Layout {
        let slots = mat.slots();
        let mut groups: Vec<Group> = Vec::new();
        for (i, s) in slots.iter().enumerate() {
            match groups.last_mut() {
                Some(g) if slots[g.start] == *s => g.count += 1,
                _ => groups.push(Group { start: i, count: 1, size: 0 }),
            }
        }
        for g in groups.iter_mut() { g.size = cb.binom[64][g.count]; }
        let eight = !mat.has_khon();
        let sym = if eight { (0..8).collect() } else { vec![0, 1] };
        let kings: Vec<u8> = (0..64u8).filter(|&s| { let (r, c) = (s >> 3, s & 7); if eight { r <= 3 && c <= 3 && r <= c } else { c <= 3 } }).collect();
        let mut kidx = [-1i8; 64];
        for (i, &s) in kings.iter().enumerate() { kidx[s as usize] = i as i8; }
        let comb: u64 = groups.iter().map(|g| g.size).product();
        let n = kings.len() as u64 * 64 * comb;
        Layout { mat: mat.clone(), slots, groups, sym, kings, kidx, comb, n }
    }

    /// The index of a position: of the symmetries that bring the white king onto its squares (two when it stands on
    /// a diagonal of the 8-symmetry triangle), the smallest index, so every position and its mirror images share one.
    #[inline]
    pub fn encode(&self, geo: &Geo, cb: &Combos, p: &Pos) -> u64 {
        let mut best = u64::MAX;
        for &t in &self.sym {
            let f = &geo.tf[t];
            let k = self.kidx[f[p.k[0] as usize] as usize];
            if k < 0 { continue; }
            let i = self.encode_with(cb, p, f, k as u64);
            if i < best { best = i; }
        }
        best
    }
    #[inline]
    fn encode_with(&self, cb: &Combos, p: &Pos, f: &[u8; 64], k: u64) -> u64 {
        let mut m = 0u64;
        let mut buf = [0u8; 4];
        for g in &self.groups {
            for j in 0..g.count { buf[j] = f[p.sq[g.start + j] as usize]; }
            buf[..g.count].sort_unstable();
            m = m * g.size + cb.rank(&buf[..g.count]);
        }
        (k * 64 + f[p.k[1] as usize] as u64) * self.comb + m
    }

    #[inline]
    pub fn decode(&self, cb: &Combos, i: u64) -> Pos {
        let mut m = i % self.comb;
        let rest = i / self.comb;
        let mut p = Pos { k: [self.kings[(rest / 64) as usize], (rest % 64) as u8], sq: [0; MAXP] };
        for g in self.groups.iter().rev() {
            let r = m % g.size; m /= g.size;
            let set = &cb.unrank[g.count][r as usize];
            for j in 0..g.count { p.sq[g.start + j] = set[j]; }
        }
        p
    }
}

/// Values, one byte with the side to move: 0 a draw, 1..=127 it mates in that many of its moves, 128 + n it is mated
/// after n of the other side's moves (128: mated now). While building, UNKNOWN and ILLEGAL are used too.
pub const DRAW: u8 = 0;
pub const UNKNOWN: u8 = 255;
pub const ILLEGAL: u8 = 254;
pub const MAX_DTM: u8 = 125;
#[inline] pub fn win(n: u8) -> u8 { n }
#[inline] pub fn loss(n: u8) -> u8 { 128 + n }
#[inline] pub fn is_win(v: u8) -> bool { (1..=127).contains(&v) }
#[inline] pub fn is_loss(v: u8) -> bool { (128..=128 + MAX_DTM).contains(&v) }
