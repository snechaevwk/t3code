# fork/

Tooling that belongs to this fork, not to T3 Code upstream.

Everything here is deliberately kept out of `scripts/`, which upstream owns and
wires into `package.json` and `knip.jsonc`. Keeping fork-local files in their
own top-level directory means upstream can never collide with them.

These files live on `work` and must never be committed to `main`, which is a
byte-for-byte mirror of `upstream/main`.

- `sync-fork.sh` — fast-forward `main` from upstream, then advance `work` on
  top of it. Run `fork/sync-fork.sh --help` for options.
