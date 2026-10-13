#!/bin/sh
# Builds engine/lite/stockfish-lite.js and .wasm: Fairy-Stockfish on one thread, plain WebAssembly (no SIMD, no
# SharedArrayBuffer), classical evaluation, for old phones and light browsers. Needs emsdk 3.1.45 (newer releases
# no longer target Safari before 15) and git.
#   sh scripts/build-engine-lite.sh /path/to/work-dir
set -e
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=${1:-/tmp/fairy-lite}
mkdir -p "$WORK" && cd "$WORK"
[ -d fsw ] || git clone https://github.com/fairy-stockfish/fairy-stockfish.wasm fsw
cd fsw && git checkout 4d4b393 && git checkout -- src && git apply "$REPO/engine/lite/single-thread.patch" && cd src
em++ -O3 -std=c++17 -mcpu=mvp -DNDEBUG -DUSE_POPCNT -DSINGLE_THREAD -DNNUE_EMBEDDING_OFF \
  -DEM_COMMIT=4d4b393 -DEM_UPSTREAM=lite -DEM_EMSCRIPTEN=3.1.45 \
  benchmark.cpp bitbase.cpp bitboard.cpp endgame.cpp evaluate.cpp main.cpp material.cpp misc.cpp movegen.cpp \
  movepick.cpp pawns.cpp position.cpp psqt.cpp search.cpp thread.cpp timeman.cpp tt.cpp uci.cpp ucioption.cpp \
  tune.cpp syzygy/tbprobe.cpp nnue/evaluate_nnue.cpp nnue/features/half_ka_v2.cpp partner.cpp parser.cpp piece.cpp \
  variant.cpp xboard.cpp nnue/features/half_ka_v2_variants.cpp \
  --pre-js "$REPO/engine/lite/preamble.js" -s MODULARIZE=1 -s EXPORT_NAME=Stockfish -s ENVIRONMENT=web,worker,node \
  -s ASYNCIFY=1 -s "ASYNCIFY_IMPORTS=['emscripten_utils_getline_impl']" \
  -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=33554432 -s MAXIMUM_MEMORY=268435456 -s STACK_SIZE=4194304 \
  -s ALLOW_UNIMPLEMENTED_SYSCALLS=1 -s MIN_SAFARI_VERSION=110000 -s MIN_CHROME_VERSION=58 -s MIN_FIREFOX_VERSION=60 \
  -s MIN_EDGE_VERSION=79 -o "$REPO/engine/lite/stockfish-lite.js"
