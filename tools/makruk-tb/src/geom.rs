//! Board geometry for makruk pieces, as bitboards. Squares are r*8 + c as in makruk-rules.js (r 0 = rank 8, c 0 = file ก).
//! White moves "forward" towards r - 1, red (black) towards r + 1; only the khon cares.

pub const WHITE: usize = 0;
pub const BLACK: usize = 1;

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Debug)]
pub enum Kind {
    Rook = 0,
    Knight = 1,
    Khon = 2,
    Met = 3, // a met or a promoted pawn: they move alike
}

impl Kind {
    pub fn letter(self) -> char {
        match self { Kind::Rook => 'R', Kind::Knight => 'N', Kind::Khon => 'S', Kind::Met => 'M' }
    }
    pub fn from_letter(c: char) -> Option<Kind> {
        match c.to_ascii_uppercase() { 'R' => Some(Kind::Rook), 'N' => Some(Kind::Knight), 'S' => Some(Kind::Khon), 'M' | 'F' => Some(Kind::Met), _ => None }
    }
}

#[inline] pub fn bit(s: u8) -> u64 { 1u64 << s }
#[inline] pub fn row(s: u8) -> i32 { (s >> 3) as i32 }
#[inline] pub fn col(s: u8) -> i32 { (s & 7) as i32 }

pub struct Geo {
    pub king: [u64; 64],
    pub knight: [u64; 64],
    pub met: [u64; 64],
    /// Squares a khon of that colour on the square attacks (and moves to).
    pub khon: [[u64; 64]; 2],
    /// Squares a khon of that colour may have come from to reach the square.
    pub khon_from: [[u64; 64]; 2],
    /// The 8 symmetries as square maps: t&1 mirrors files, t&2 flips ranks, t&4 swaps rank and file.
    pub tf: [[u8; 64]; 8],
}

fn steps(list: &[(i32, i32)]) -> [u64; 64] {
    let mut out = [0u64; 64];
    for s in 0..64u8 {
        for &(dr, dc) in list {
            let (r, c) = (row(s) + dr, col(s) + dc);
            if (0..8).contains(&r) && (0..8).contains(&c) { out[s as usize] |= bit((r * 8 + c) as u8); }
        }
    }
    out
}

impl Geo {
    pub fn new() -> Geo {
        let diag = [(-1, -1), (-1, 1), (1, -1), (1, 1)];
        let king = steps(&[(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]);
        let knight = steps(&[(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]);
        let met = steps(&diag);
        let khon = [steps(&[(-1, -1), (-1, 1), (1, -1), (1, 1), (-1, 0)]), steps(&[(-1, -1), (-1, 1), (1, -1), (1, 1), (1, 0)])];
        let khon_from = [steps(&[(-1, -1), (-1, 1), (1, -1), (1, 1), (1, 0)]), steps(&[(-1, -1), (-1, 1), (1, -1), (1, 1), (-1, 0)])];
        let mut tf = [[0u8; 64]; 8];
        for t in 0..8 {
            for s in 0..64u8 {
                let (mut r, mut c) = (row(s), col(s));
                if t & 1 != 0 { c = 7 - c; }
                if t & 2 != 0 { r = 7 - r; }
                if t & 4 != 0 { std::mem::swap(&mut r, &mut c); }
                tf[t][s as usize] = (r * 8 + c) as u8;
            }
        }
        Geo { king, knight, met, khon, khon_from, tf }
    }

    /// Squares a rook on `s` reaches with `occ` occupied (it stops on, and includes, the first occupied square).
    #[inline]
    pub fn rook(&self, s: u8, occ: u64) -> u64 {
        let mut out = 0u64;
        let (r0, c0) = (row(s), col(s));
        for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
            let (mut r, mut c) = (r0 + dr, c0 + dc);
            while (0..8).contains(&r) && (0..8).contains(&c) {
                let b = bit((r * 8 + c) as u8);
                out |= b;
                if occ & b != 0 { break; }
                r += dr; c += dc;
            }
        }
        out
    }

    /// Squares a piece of `kind` and colour `color` on `s` attacks (= where it may move, if not blocked by its own side).
    #[inline]
    pub fn attacks(&self, kind: Kind, color: usize, s: u8, occ: u64) -> u64 {
        match kind {
            Kind::Rook => self.rook(s, occ),
            Kind::Knight => self.knight[s as usize],
            Kind::Khon => self.khon[color][s as usize],
            Kind::Met => self.met[s as usize],
        }
    }

    /// Squares the piece may have come from to stand on `s` (a move that did not capture), with `occ` occupied.
    #[inline]
    pub fn sources(&self, kind: Kind, color: usize, s: u8, occ: u64) -> u64 {
        match kind {
            Kind::Rook => self.rook(s, occ) & !occ,
            Kind::Knight => self.knight[s as usize] & !occ,
            Kind::Khon => self.khon_from[color][s as usize] & !occ,
            Kind::Met => self.met[s as usize] & !occ,
        }
    }
}

