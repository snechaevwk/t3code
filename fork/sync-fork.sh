#!/usr/bin/env bash
#
# Sync this fork with the upstream repository.
#
#   `main` is a pure mirror of upstream and never carries local commits, so it
#   always fast-forwards. `work` is the trunk where this fork's own changes
#   live, including this script.
#
#   The script fast-forwards `main`, then tries to advance `work` on top of it:
#   a clean fast-forward is applied and pushed; a real merge is left unpushed so
#   it can be tested first; a conflicting merge is aborted and handed back.
#
# Usage: fork/sync-fork.sh [--no-push] [--work-branch <name>]
#
set -euo pipefail

UPSTREAM_REMOTE="upstream"
UPSTREAM_URL="https://github.com/pingdotgg/t3code.git"
UPSTREAM_BRANCH="main"
MIRROR_BRANCH="main"
WORK_BRANCH="work"
PUSH=1

while [ $# -gt 0 ]; do
  case "$1" in
    --no-push) PUSH=0; shift ;;
    --work-branch) WORK_BRANCH="${2:?--work-branch needs a value}"; shift 2 ;;
    --mirror-branch) MIRROR_BRANCH="${2:?--mirror-branch needs a value}"; shift 2 ;;
    --upstream-branch) UPSTREAM_BRANCH="${2:?--upstream-branch needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

cd "$(git rev-parse --show-toplevel)"

[ -z "$(git status --porcelain)" ] || die "working tree is dirty; commit or stash first."

# Return to wherever the caller started, whatever happens after this point.
START_REF="$(git symbolic-ref --short -q HEAD || git rev-parse HEAD)"
restore() { git checkout --quiet "$START_REF" 2>/dev/null || true; }
trap restore EXIT

if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  say "adding '$UPSTREAM_REMOTE' remote -> $UPSTREAM_URL"
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
  git remote set-url --push "$UPSTREAM_REMOTE" DISABLED
fi

say "fetching $UPSTREAM_REMOTE and origin"
git fetch --quiet --prune "$UPSTREAM_REMOTE"
git fetch --quiet --prune origin

UPSTREAM_REF="$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
git rev-parse --verify --quiet "$UPSTREAM_REF" >/dev/null || die "$UPSTREAM_REF does not exist."

# `git branch --force` refuses to move a checked-out branch, so step off it.
if [ "$START_REF" = "$MIRROR_BRANCH" ]; then
  git checkout --quiet --detach
fi

# --- mirror branch: always a strict fast-forward of upstream ---------------
if ! git rev-parse --verify --quiet "$MIRROR_BRANCH" >/dev/null; then
  say "creating '$MIRROR_BRANCH' from $UPSTREAM_REF"
  git branch --no-track "$MIRROR_BRANCH" "$UPSTREAM_REF"
  git branch --quiet --set-upstream-to "origin/$MIRROR_BRANCH" "$MIRROR_BRANCH" 2>/dev/null || true
elif git merge-base --is-ancestor "$MIRROR_BRANCH" "$UPSTREAM_REF"; then
  if [ "$(git rev-parse "$MIRROR_BRANCH")" = "$(git rev-parse "$UPSTREAM_REF")" ]; then
    say "'$MIRROR_BRANCH' already matches $UPSTREAM_REF"
  else
    say "fast-forwarding '$MIRROR_BRANCH' to $UPSTREAM_REF"
    # update-ref, not `git branch --force`: the latter would retarget the
    # branch's tracking config to upstream, whose push URL is disabled.
    git update-ref "refs/heads/$MIRROR_BRANCH" "$UPSTREAM_REF"
  fi
else
  die "'$MIRROR_BRANCH' has commits that $UPSTREAM_REF does not. It mirrors upstream
   and is not where your work belongs. Move those commits to '$WORK_BRANCH', then:
     git branch --force $MIRROR_BRANCH $UPSTREAM_REF"
fi

if [ "$PUSH" = 1 ]; then
  say "pushing '$MIRROR_BRANCH' to origin"
  git push --quiet --force-with-lease origin "$MIRROR_BRANCH:$MIRROR_BRANCH"
fi

# --- work branch: fast-forward when possible, merge when it has diverged ----
git rev-parse --verify --quiet "$WORK_BRANCH" >/dev/null \
  || die "work branch '$WORK_BRANCH' does not exist."

read -r BEHIND AHEAD < <(git rev-list --left-right --count "$MIRROR_BRANCH...$WORK_BRANCH")

if [ "$BEHIND" = 0 ]; then
  say "'$WORK_BRANCH' already has everything from '$MIRROR_BRANCH'"
  exit 0
fi

git checkout --quiet "$WORK_BRANCH"

if [ "$AHEAD" = 0 ]; then
  say "fast-forwarding '$WORK_BRANCH' ($BEHIND new upstream commit(s))"
  git merge --quiet --ff-only "$MIRROR_BRANCH"
  if [ "$PUSH" = 1 ]; then
    say "pushing '$WORK_BRANCH' to origin"
    git push --quiet origin "$WORK_BRANCH"
  fi
  exit 0
fi

say "'$WORK_BRANCH' is $AHEAD ahead / $BEHIND behind — attempting a merge"
if git merge --no-edit "$MIRROR_BRANCH"; then
  warn "merged upstream into '$WORK_BRANCH' locally. Not pushed: test it, then run
   git push origin $WORK_BRANCH"
else
  git merge --abort
  die "merge conflicts. Resolve them on a branch instead:
     git checkout -b sync/upstream-$(date +%Y%m%d) $WORK_BRANCH
     git merge $MIRROR_BRANCH"
fi
