//! makruk-tb: endgame tables for makruk, built on your own computer.
//!
//!   makruk-tb build KRMMvKR [more …] [--out DIR] [--threads N] [--disk]
//!       Builds the tables (and every smaller one a capture leads to, first) into DIR (default: tablebase-local next
//!       to the repository). Materials: K then the pieces of white, v, K then red's: R rook, N knight, S khon,
//!       M met or promoted pawn, e.g. KRMMvKR = king, rook and two promoted pawns against king and rook.
//!       Finished tables are read back instead of rebuilt, so a stopped run goes on where it was. --disk builds in
//!       memory-mapped files in DIR instead of RAM, for a table bigger than the memory (slower).
//!   makruk-tb export KRvKR [more …] [--out DIR] [--repo DIR] [--to DIR] [--sample N] [--drop-raw]
//!       Writes the tables (from DIR, building them first if needed) for the website into tablebase/rs/ (or --to):
//!       white to move only, split by the kings' squares when big, compressed (see export.rs). --sample checks N
//!       random positions first; --drop-raw deletes the raw files afterwards (keeps disk use low; the local server
//!       reads the exported form too).
//!   makruk-tb serve [--port 8765] [--out DIR]
//!       Answers the website (opened from localhost) about the tables in DIR, at http://127.0.0.1:8765 (serve.rs).
//!   makruk-tb check [--repo DIR] [--big DIR …]
//!       Builds the site's existing tables again and compares every position (tablebase/krk.bin and the one- and
//!       two-piece tables; --big adds a three-piece table folder made by scripts/build-big-tables.cjs).
//!   makruk-tb check KRMMvKR [--sample 1000000] [--out DIR]
//!       A table already built: that many random positions against their moves (for tables too big to check whole).

mod check;
mod export;
mod geom;
mod layout;
mod serve;
mod tables;

use layout::Material;
use std::path::PathBuf;
use std::time::Instant;
use tables::{stats, Registry};

/// Every table a capture leads to from `mat`, down to the smallest, opened (or built) in the registry: the random check
/// of an export looks positions up in them.
fn open_subs(reg: &mut Registry, mat: &Material) {
    for sub in tables::subs(mat) {
        if sub.count() == 0 { continue; }
        reg.get(&sub);
        open_subs(reg, &sub);
    }
}

fn repo_root() -> PathBuf {
    // tools/makruk-tb → the repository.
    let here = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    here.parent().and_then(|p| p.parent()).map(|p| p.to_path_buf()).unwrap_or(here)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut out = repo_root().join("tablebase-local");
    let mut repo = repo_root();
    let mut threads = 0usize;
    let mut port = serve::PORT;
    let mut sample = 1_000_000u64;
    let mut to: Option<PathBuf> = None;
    let (mut drop_raw, mut check_first, mut disk) = (false, 0u64, false);
    let mut words = Vec::new();
    let mut bigs = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--out" => { i += 1; out = PathBuf::from(&args[i]); }
            "--repo" => { i += 1; repo = PathBuf::from(&args[i]); }
            "--threads" => { i += 1; threads = args[i].parse().expect("--threads takes a number"); }
            "--port" => { i += 1; port = args[i].parse().expect("--port takes a number"); }
            "--sample" => { i += 1; sample = args[i].parse().expect("--sample takes a number"); check_first = sample; }
            "--to" => { i += 1; to = Some(PathBuf::from(&args[i])); }
            "--drop-raw" => drop_raw = true,
            "--disk" => disk = true,
            "--big" => { i += 1; bigs.push(PathBuf::from(&args[i])); }
            w => words.push(w.to_string()),
        }
        i += 1;
    }
    if threads > 0 { rayon::ThreadPoolBuilder::new().num_threads(threads).build_global().unwrap(); }
    let t0 = Instant::now();
    match words.first().map(|s| s.as_str()) {
        Some("build") if words.len() > 1 => {
            let mut reg = Registry::new(&out, true);
            reg.disk = disk;
            for w in &words[1..] {
                let mat = Material::parse(w).unwrap_or_else(|| panic!("cannot read the material {} (e.g. KRMMvKR)", w));
                let t = reg.get(&mat);
                let (won, lost, longest) = stats(&t);
                println!("{}: {} wins and {} losses for the side to move, longest mate {} moves, in {}", t.lay.mat.name(), won, lost, longest, out.display());
            }
        }
        Some("probe") if words.len() >= 5 => {
            // probe KRvK <stm w|b> <white king> <red king> <piece squares in slot order…> (squares r*8+c)
            let mat = Material::parse(&words[1]).unwrap();
            let mut reg = Registry::new(&out, true);
            let t = reg.get(&mat);
            let stm = if words[2] == "w" { 0 } else { 1 };
            let nums: Vec<u8> = words[3..].iter().map(|w| w.parse().unwrap()).collect();
            let mut p = layout::Pos { k: [nums[0], nums[1]], sq: [0; layout::MAXP] };
            for j in 0..t.lay.slots.len() { p.sq[j] = nums[2 + j]; }
            let i = t.lay.encode(&reg.geo, &reg.cb, &p);
            println!("value {}", t.v[stm][i as usize]);
            tables::for_moves(&reg, &t.lay, &p, stm, |c| {
                match c { tables::Child::Same(k) => { let q = t.lay.decode(&reg.cb, k); println!("  -> {:?} {:?} value {}", q.k, &q.sq[..t.lay.slots.len()], t.v[1 - stm][k as usize]); }
                          tables::Child::Capture(x) => println!("  -> capture value {}", x) }
                true
            });
        }
        Some("export") if words.len() > 1 => {
            // export KRvKR … : tables from DIR (tablebase-local, built first if needed) to the website's tablebase/rs/
            // (or --to another folder, e.g. tablebase-local/packed for the local server). --sample N checks N random
            // positions first; --drop-raw then deletes the table's raw files (not for a table others capture into).
            let root = to.clone().unwrap_or_else(|| repo.join("tablebase").join("rs"));
            let mut reg = Registry::new(&out, true);
            for w in &words[1..] {
                let mat = Material::parse(w).unwrap_or_else(|| panic!("cannot read the material {}", w));
                let t = reg.get(&mat);
                let name = t.lay.mat.name();
                if check_first > 0 {
                    open_subs(&mut reg, &mat);
                    let n = check::sample(&reg, &mat, check_first, 2026);
                    println!("{}: {} random positions agree with their moves", name, n);
                }
                let (files, bytes) = export::export(&t, &root);
                println!("{}: {} files, {:.1} MB in {}", name, files, bytes as f64 / 1048576.0, root.join(&name).display());
                if drop_raw {
                    drop(t);
                    reg.tables.remove(&name);
                    for ext in ["w.bin", "b.bin", "json"] { let _ = std::fs::remove_file(out.join(format!("{}.{}", name, ext))); }
                }
            }
            export::index(&root);
        }
        Some("serve") => serve::serve(&out, port),
        Some("selftest") => {
            // The long-mate pass, tried on small tables with the exact count cut to 8 moves.
            for name in ["KRvKM", "KNvKM", "KMMvKR"] {
                let t = Instant::now();
                let (n, beyond) = check::long_selftest(&Material::parse(name).unwrap(), 8);
                println!("{}: {} positions the same with the cap at 8 ({} of them beyond it) ({:.1} s)", name, n, beyond, t.elapsed().as_secs_f64());
            }
        }
        Some("check") if words.len() > 1 => {
            // check KRMMvKR … --sample N: a table already built (in DIR), N random positions against their moves.
            let reg = serve::open_all(&out);
            for w in &words[1..] {
                let t = Instant::now();
                let mat = Material::parse(w).unwrap_or_else(|| panic!("cannot read the material {}", w));
                let n = check::sample(&reg, &mat, sample, 2026);
                println!("{}: {} positions agree with their moves ({:.1} s)", mat.name(), n, t.elapsed().as_secs_f64());
            }
        }
        Some("check") => {
            let scratch = std::env::temp_dir().join(format!("makruk-tb-check-{}", std::process::id()));
            let mut reg = Registry::new(&scratch, false);
            let n = check::krk(&mut reg, &repo);
            println!("krk.bin: {} positions agree ({:.1} s)", n, t0.elapsed().as_secs_f64());
            for name in ["knight", "khon", "promoted", "rook-knight", "rook-khon", "rook-promoted", "knight-knight", "knight-khon",
                "knight-promoted", "khon-khon", "khon-promoted", "promoted-promoted"] {
                let t = Instant::now();
                let n = check::small(&mut reg, &repo, name);
                println!("{}.bin: {} positions agree ({:.1} s)", name, n, t.elapsed().as_secs_f64());
            }
            // Tables with pieces on both sides: no older table to compare with, so each position against its moves.
            for name in ["KRvKR", "KMvKR", "KRvKM", "KRMvKR", "KMMvKR", "KRMMvK", "KSvKR", "KNvKM"] {
                let t = Instant::now();
                let n = check::consistent(&mut reg, &Material::parse(name).unwrap());
                println!("{}: {} positions agree with their moves ({:.1} s)", name, n, t.elapsed().as_secs_f64());
            }
            for dir in &bigs {
                let t = Instant::now();
                let n = check::big(&mut reg, dir);
                println!("{}: {} positions agree ({:.1} s)", dir.display(), n, t.elapsed().as_secs_f64());
            }
            let _ = std::fs::remove_dir_all(&scratch);
            println!("All agree, {:.1} s in all.", t0.elapsed().as_secs_f64());
        }
        _ => {
            eprintln!("makruk-tb build KRMMvKR [more …] [--out DIR] [--threads N]");
            eprintln!("makruk-tb export KRvKR [more …] [--out DIR] [--repo DIR] [--to DIR] [--sample N] [--drop-raw]");
            eprintln!("makruk-tb serve [--port 8765] [--out DIR]");
            eprintln!("makruk-tb check [--repo DIR] [--big DIR …]");
            std::process::exit(2);
        }
    }
}
